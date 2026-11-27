#include "ZynFactory.h"

#include "Misc/Part.h"
#include "Misc/Allocator.h"
#include "Misc/Microtonal.h"
#include "Misc/Time.h"
#include "Misc/Sync.h"
#include "Misc/XMLwrapper.h"
#include "DSP/FFTwrapper.h"
#include "Params/Controller.h"
#include "Output.h"
#include "tlsf.h"

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <vector>

namespace preseter
{
namespace native
{
namespace
{
/** Contadores do Z0/Z2. Tudo atômico e sem I/O; o alocador do Part passa por aqui. */
struct ZynDiagnosticsCounters
{
    std::atomic<uint64_t> allocCount { 0 };
    std::atomic<uint64_t> allocBytes { 0 };
    std::atomic<uint64_t> freeCount { 0 };
    std::atomic<uint64_t> allocInAudio { 0 };
    std::atomic<uint64_t> freeInAudio { 0 };
    /** Só conta se o pool falhar e algo cair no heap (o normal é 0). */
    std::atomic<uint64_t> heapAllocCount { 0 };
    std::atomic<uint64_t> heapAllocInAudio { 0 };
    std::atomic<uint64_t> allocFailures { 0 };
    std::atomic<bool> inAudioBlock { false };
};

/** Perfil de uma carga de preset (só na message thread). */
struct ZynLoadProfile
{
    juce::String path;
    int index = -1;
    bool ok = false;
    int64_t fileBytes = 0;
    bool gzip = false;
    int loadXmlResult = 0;
    double createMs = 0.0;
    double loadXmlMs = 0.0;
    double applyParametersMs = 0.0;
    double initializeRtMs = 0.0;
    double prewarmMs = 0.0;
    double installMs = 0.0;
    double destroyOldMs = 0.0;
    double totalMs = 0.0;
};

static uint64_t diagTicksNow() noexcept
{
    return (uint64_t) juce::Time::getHighResolutionTicks();
}

static double diagTicksToMs (uint64_t ticks) noexcept
{
    const auto perSecond = juce::Time::getHighResolutionTicksPerSecond();
    return perSecond > 0 ? (double) ticks * 1000.0 / (double) perSecond : 0.0;
}

static double diagElapsedMs (uint64_t startTicks) noexcept
{
    return diagTicksToMs (diagTicksNow() - startTicks);
}

static bool isGzipFile (const juce::String& path)
{
    const juce::File file (path);
    juce::FileInputStream stream (file);
    if (! stream.openedOk())
        return false;

    char magic[2] {};
    return stream.read (magic, 2) == 2
        && (juce::uint8) magic[0] == 0x1f
        && (juce::uint8) magic[1] == 0x8b;
}

static juce::var profileToVar (const ZynLoadProfile& profile)
{
    return Obj()
        .set ("path", profile.path)
        .set ("index", profile.index)
        .set ("ok", profile.ok)
        .set ("fileBytes", (juce::int64) profile.fileBytes)
        .set ("gzip", profile.gzip)
        .set ("loadXmlResult", profile.loadXmlResult)
        .set ("createMs", profile.createMs)
        .set ("loadXmlMs", profile.loadXmlMs)
        .set ("applyParametersMs", profile.applyParametersMs)
        .set ("initializeRtMs", profile.initializeRtMs)
        .set ("prewarmMs", profile.prewarmMs)
        .set ("installMs", profile.installMs)
        .set ("destroyOldMs", profile.destroyOldMs)
        .set ("totalMs", profile.totalMs);
}

/** Marca o callback de áudio para os contadores do alocador. */
struct AudioBlockFlag
{
    explicit AudioBlockFlag (std::atomic<bool>& flagToUse) : flag (flagToUse)
    {
        flag.store (true, std::memory_order_relaxed);
    }

    ~AudioBlockFlag()
    {
        flag.store (false, std::memory_order_relaxed);
    }

    std::atomic<bool>& flag;
};

/**
 * Alocador do Part sobre uma arena TLSF pré-reservada.
 *
 * O Zyn aloca cada nota (AD/SUB/PAD) no NoteOn. Com malloc, isso acontece na
 * thread de áudio (Z0 mediu 1600 alocações em 20 notas). A arena de 8 MB é
 * criada junto com o instrumento, fora do áudio; o NoteOn só fatia o pool.
 * Se o pool acabar, a alocação falha e a nota é descartada — nunca cai no heap.
 */
class ZynPoolAllocator final : public zyn::Allocator
{
public:
    static constexpr size_t kArenaBytes = 8 * 1024 * 1024;

    explicit ZynPoolAllocator (ZynDiagnosticsCounters& countersToUse)
        : counters (countersToUse),
          arena (std::make_unique<char[]> (kArenaBytes)),
          tlsf (tlsf_create_with_pool (arena.get(), kArenaBytes))
    {
    }

    ~ZynPoolAllocator() override
    {
        if (tlsf != nullptr)
            tlsf_destroy (tlsf);
    }

    void* alloc_mem (size_t size) override
    {
        counters.allocCount.fetch_add (1, std::memory_order_relaxed);
        if (counters.inAudioBlock.load (std::memory_order_relaxed))
            counters.allocInAudio.fetch_add (1, std::memory_order_relaxed);

        void* memory = tlsf != nullptr ? tlsf_malloc (tlsf, size) : nullptr;
        if (memory == nullptr)
        {
            counters.allocFailures.fetch_add (1, std::memory_order_relaxed);
            return nullptr;
        }

        counters.allocBytes.fetch_add ((uint64_t) size, std::memory_order_relaxed);
        return memory;
    }

    void dealloc_mem (void* memory) override
    {
        counters.freeCount.fetch_add (1, std::memory_order_relaxed);
        if (counters.inAudioBlock.load (std::memory_order_relaxed))
            counters.freeInAudio.fetch_add (1, std::memory_order_relaxed);

        if (memory != nullptr && tlsf != nullptr)
            tlsf_free (tlsf, memory);
    }

    void addMemory (void*, size_t) override {}
    bool lowMemory (unsigned, size_t) const override { return false; }

private:
    ZynDiagnosticsCounters& counters;
    std::unique_ptr<char[]> arena;
    tlsf_t tlsf = nullptr;
};

constexpr int kZynBlockSize = 32;

/**
 * Um instrumento completo do Zyn, com tudo de que o Part depende.
 *
 * Como no MiddleWare do Zyn original, um preset novo é montado fora da thread
 * de áudio (carregar o XML, gerar as tabelas do PADsynth) e só depois troca de
 * lugar com o instrumento que está tocando. Assim a thread de áudio nunca lê
 * um Part pela metade. O Part é o último membro: é destruído primeiro.
 */
struct ZynInstance
{
    std::unique_ptr<zyn::SYNTH_T> synth;
    std::unique_ptr<ZynPoolAllocator> allocator;
    std::unique_ptr<zyn::FFTwrapper> fft;
    std::unique_ptr<zyn::Microtonal> microtonal;
    std::unique_ptr<zyn::AbsTime> absTime;
    std::unique_ptr<zyn::Sync> sync;
    std::unique_ptr<zyn::Part> part;
};

class ZynProcessor final : public juce::AudioProcessor
{
public:
    ZynProcessor()
        : AudioProcessor (BusesProperties().withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
          apvts (*this, nullptr, "ZYN", createLayout())
    {
        setRateAndBufferSizeDetails (44100.0, 256);
        for (auto& word : heldNotes)
            word.store (0, std::memory_order_relaxed);
        for (auto& velocity : heldVelocity)
            velocity.store (100, std::memory_order_relaxed);

        auto fresh = createInstance (44100.0);
        finishInstance (*fresh);
        install (std::move (fresh));

        loader = std::make_unique<Loader> (*this);
        if (! loader->startThread (juce::Thread::Priority::low))
            loader.reset();
    }

    ~ZynProcessor() override
    {
        if (loader != nullptr)
            loader->stopThread (5000);
    }

    void setBankDirs (const juce::String& factory, const juce::String& user)
    {
        factoryDir = factory;
        userDir = user;
        scanPrograms();
    }

    void reloadBank()
    {
        const auto path = currentPath;
        scanPrograms();
        int found = -1;
        for (int i = 0; i < (int) programs.size(); ++i)
            if (programs[(size_t) i].path == path)
                found = i;
        if (found >= 0)
        {
            currentProgram = found;
            return;
        }
        currentProgram = juce::jlimit (0, juce::jmax (0, (int) programs.size() - 1), currentProgram);
    }

    int activeVoices() const { return voiceCount.load(); }

    void prepareToPlay (double sampleRate, int samplesPerBlock) override
    {
        juce::ignoreUnused (samplesPerBlock);
        const double rate = sampleRate > 0.0 ? sampleRate : 44100.0;
        fadeSampleRate = rate;
        audioRunning.store (false, std::memory_order_relaxed);
        fadeState.store (0, std::memory_order_relaxed);
        fadeGain = 1.0f;

        if (instance != nullptr && rate == currentSampleRate)
        {
            audioRunning.store (true, std::memory_order_relaxed);
            return;
        }

        // A taxa mudou: monta o mesmo instrumento na taxa nova.
        const auto saved = captureInstrument();
        auto fresh = createInstance (rate);
        if (saved.isNotEmpty())
            readInstrument (*fresh->part, saved);
        finishInstance (*fresh);
        prewarmInstance (*fresh);
        applyHeldNotes (*fresh);
        install (std::move (fresh));
        audioRunning.store (true, std::memory_order_relaxed);
    }

    void releaseResources() override
    {
        audioRunning.store (false, std::memory_order_relaxed);
        fadeState.store (0, std::memory_order_relaxed);
        fadeGain = 1.0f;
        const juce::SpinLock::ScopedLockType lock (instanceLock);
        if (instance != nullptr)
            instance->part->AllNotesOff();
    }

    bool isBusesLayoutSupported (const BusesLayout& layouts) const override
    {
        return layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo()
            && layouts.getMainInputChannelSet() == juce::AudioChannelSet::disabled();
    }

    void processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override
    {
        // Z0: só uma flag atômica por bloco; nenhum log/alocação aqui.
        AudioBlockFlag audioFlag (diagCounters.inAudioBlock);
        juce::ScopedNoDenormals noDenormals;
        buffer.clear();

        // Durante a troca de preset (só a troca de ponteiro) este bloco sai mudo.
        const juce::SpinLock::ScopedTryLockType lock (instanceLock);
        if (! lock.isLocked() || instance == nullptr)
        {
            midi.clear();
            return;
        }

        auto& part = *instance->part;
        applyMacros (part, false);

        auto* left = buffer.getWritePointer (0);
        auto* right = buffer.getNumChannels() > 1 ? buffer.getWritePointer (1) : nullptr;
        const int numSamples = buffer.getNumSamples();
        const float gain = part.gain;
        const float pan = juce::jlimit (0.0f, 1.0f, part.panning);
        const float gainL = gain * std::sqrt (1.0f - pan);
        const float gainR = gain * std::sqrt (pan);

        int position = 0;
        auto it = midi.begin();
        const auto end = midi.end();

        // Fade de 8 ms: o worker espera a saída chegar a zero antes de trocar o
        // ponteiro e o preset novo entra subindo; sem isso a troca pode estalar.
        const int fade = fadeState.load (std::memory_order_relaxed);
        const float fadeStep = (float) (1.0 / juce::jmax (1.0, 0.008 * fadeSampleRate));

        // O Zyn sempre calcula blocos de 32 amostras. O que sobra de um bloco
        // fica guardado para o próximo buffer, então qualquer tamanho de buffer
        // da placa funciona sem estalos.
        while (position < numSamples)
        {
            if (pendingPos >= kZynBlockSize)
            {
                for (; it != end; ++it)
                {
                    const auto metadata = *it;
                    if (metadata.samplePosition >= position + kZynBlockSize)
                        break;
                    handleMidi (part, metadata.getMessage());
                }

                part.ComputePartSmps();
                ++(*instance->absTime); // o relógio do Zyn (LFOs com atraso e fade)
                std::memcpy (pendingL, part.partoutl, sizeof (pendingL));
                std::memcpy (pendingR, part.partoutr, sizeof (pendingR));
                pendingPos = 0;
            }

            const int count = juce::jmin (kZynBlockSize - pendingPos, numSamples - position);
            if (fade == 0)
            {
                for (int i = 0; i < count; ++i)
                {
                    left[position + i] += pendingL[pendingPos + i] * gainL;
                    if (right != nullptr)
                        right[position + i] += pendingR[pendingPos + i] * gainR;
                }
            }
            else
            {
                for (int i = 0; i < count; ++i)
                {
                    if (fade == 1)
                        fadeGain = juce::jmax (0.0f, fadeGain - fadeStep);
                    else
                        fadeGain = juce::jmin (1.0f, fadeGain + fadeStep);

                    left[position + i] += pendingL[pendingPos + i] * gainL * fadeGain;
                    if (right != nullptr)
                        right[position + i] += pendingR[pendingPos + i] * gainR * fadeGain;
                }
            }
            pendingPos += count;
            position += count;
        }

        if (fade == 1 && fadeGain <= 0.0f)
            fadeState.store (0, std::memory_order_relaxed);
        else if (fade == 2 && fadeGain >= 1.0f)
            fadeState.store (0, std::memory_order_relaxed);

        // Eventos do fim do buffer valem para o próximo bloco do Zyn.
        for (; it != end; ++it)
            handleMidi (part, (*it).getMessage());

        voiceCount.store (part.activeVoices());
        midi.clear();
    }

    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }
    const juce::String getName() const override { return "Preseter Zyn"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 2.0; }

    int getNumPrograms() override { return juce::jmax (1, (int) programs.size()); }
    int getCurrentProgram() override { return currentProgram; }

    void setCurrentProgram (int index) override
    {
        if (programs.empty())
            return;

        const int target = juce::jlimit (0, (int) programs.size() - 1, index);
        if (loader != nullptr)
        {
            // O worker carrega e instala; esta thread espera o resultado para
            // manter o erro síncrono que o engine devolve ao renderer.
            loader->request (target);
            return;
        }

        loadProgramOnWorker (target);
    }

    /** Executa na thread do Loader (ou na message thread, sem loader). */
    bool loadProgramOnWorker (int target)
    {
        if (target < 0 || target >= (int) programs.size())
            return false;

        if (! loadPreset (programs[(size_t) target].path, target))
            return false;

        currentProgram = target;
        currentPath = programs[(size_t) target].path;
        return true;
    }

    void setHeldNote (int note, int velocity, bool held)
    {
        if (note < 0 || note > 127)
            return;

        const size_t word = (size_t) (note / 64);
        const uint64_t bit = 1ull << (note % 64);
        if (held)
        {
            heldNotes[word].fetch_or (bit, std::memory_order_relaxed);
            heldVelocity[(size_t) note].store ((uint8_t) juce::jlimit (0, 127, velocity),
                                               std::memory_order_relaxed);
        }
        else
        {
            heldNotes[word].fetch_and (~bit, std::memory_order_relaxed);
        }
    }

    void clearHeldNotes()
    {
        heldNotes[0].store (0, std::memory_order_relaxed);
        heldNotes[1].store (0, std::memory_order_relaxed);
    }

    const juce::String getProgramName (int index) override
    {
        if (programs.empty())
            return "Init";
        const int target = juce::jlimit (0, (int) programs.size() - 1, index);
        return programs[(size_t) target].display;
    }

    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock& destData) override
    {
        juce::ValueTree root ("PreseterZyn");
        root.setProperty ("program", currentProgram, nullptr);
        root.setProperty ("programPath", currentPath, nullptr);
        root.appendChild (apvts.copyState(), nullptr);

        const auto instrument = captureInstrument();
        root.setProperty ("instrument", instrument, nullptr);

        if (auto xml = root.createXml())
            copyXmlToBinary (*xml, destData);
    }

    void setStateInformation (const void* data, int sizeInBytes) override
    {
        auto xml = getXmlFromBinary (data, sizeInBytes);
        if (xml == nullptr)
            return;

        auto root = juce::ValueTree::fromXml (*xml);
        if (! root.hasType ("PreseterZyn"))
            return;

        auto parameters = root.getChildWithName (apvts.state.getType());
        if (parameters.isValid())
            apvts.replaceState (parameters);

        const auto instrument = root.getProperty ("instrument").toString();
        if (instrument.isNotEmpty())
        {
            auto fresh = createInstance (currentSampleRate);
            if (readInstrument (*fresh->part, instrument))
            {
                finishInstance (*fresh);
                prewarmInstance (*fresh);
                applyHeldNotes (*fresh);
                install (std::move (fresh));
            }
        }

        const auto path = root.getProperty ("programPath").toString();
        int found = -1;
        for (int i = 0; i < (int) programs.size(); ++i)
            if (programs[(size_t) i].path == path)
                found = i;
        currentPath = path;
        currentProgram = found >= 0 ? found
                                    : juce::jlimit (0, juce::jmax (0, (int) programs.size() - 1),
                                                    (int) root.getProperty ("program", 0));
        macrosDirty.store (true);
    }

    // ---- Diagnóstico Z0 (message thread) ---------------------------------
    bool loadPresetForDiagnostics (const juce::String& path, juce::var& result)
    {
        const bool ok = loadPreset (path);
        result = Obj().set ("ok", ok).set ("profile", profileToVar (lastProfile));
        return ok;
    }

    juce::var describePrograms() const
    {
        juce::Array<juce::var> list;
        for (size_t i = 0; i < programs.size(); ++i)
        {
            const auto& program = programs[i];
            list.add (Obj()
                          .set ("index", (int) i)
                          .set ("display", program.display)
                          .set ("path", program.path)
                          .set ("fileBytes", (juce::int64) juce::File (program.path).getSize())
                          .set ("gzip", isGzipFile (program.path)));
        }
        return juce::var (list);
    }

    juce::var describeDiagnostics()
    {
        juce::var partInfo;
        {
            const juce::SpinLock::ScopedTryLockType lock (instanceLock);
            if (lock.isLocked() && instance != nullptr)
            {
                const auto& part = *instance->part;
                juce::Array<juce::var> kit;
                for (int n = 0; n < NUM_KIT_ITEMS; ++n)
                    kit.add (Obj()
                                 .set ("enabled", part.kit[n].Penabled)
                                 .set ("add", part.kit[n].Padenabled)
                                 .set ("sub", part.kit[n].Psubenabled)
                                 .set ("pad", part.kit[n].Ppadenabled));

                partInfo = Obj()
                    .set ("volume", part.Volume)
                    .set ("panning", (int) part.Ppanning)
                    .set ("velSensitivity", (int) part.Pvelsns)
                    .set ("velOffset", (int) part.Pveloffs)
                    .set ("keyLimit", (int) part.Pkeylimit)
                    .set ("minKey", (int) part.Pminkey)
                    .set ("maxKey", (int) part.Pmaxkey)
                    .set ("legato", part.Plegatomode)
                    .set ("portamento", part.ctl.portamento.portamento)
                    .set ("portamentoTime", (int) part.ctl.portamento.time)
                    .set ("bendRangeCents", (int) part.ctl.pitchwheel.bendrange)
                    .set ("modWheelDepth", (int) part.ctl.modwheel.depth)
                    .set ("filterCutoffDepth", (int) part.ctl.filtercutoff.depth)
                    .set ("filterQDepth", (int) part.ctl.filterq.depth)
                    .set ("expressionReceive", part.ctl.expression.receive)
                    .set ("sustainReceive", part.ctl.sustain.receive)
                    .set ("kit", juce::var (kit));
            }
        }

        return Obj()
            .set ("last", profileToVar (lastProfile))
            .set ("allocCount", (juce::int64) diagCounters.allocCount.load())
            .set ("allocBytes", (juce::int64) diagCounters.allocBytes.load())
            .set ("freeCount", (juce::int64) diagCounters.freeCount.load())
            .set ("allocInAudio", (juce::int64) diagCounters.allocInAudio.load())
            .set ("freeInAudio", (juce::int64) diagCounters.freeInAudio.load())
            .set ("heapAllocCount", (juce::int64) diagCounters.heapAllocCount.load())
            .set ("heapAllocInAudio", (juce::int64) diagCounters.heapAllocInAudio.load())
            .set ("allocFailures", (juce::int64) diagCounters.allocFailures.load())
            .set ("arenaBytes", (juce::int64) ZynPoolAllocator::kArenaBytes)
            .set ("programCount", (int) programs.size())
            .set ("currentProgram", currentProgram)
            .set ("activeVoices", activeVoices())
            .set ("blockSize", kZynBlockSize)
            .set ("sampleRate", currentSampleRate)
            .set ("part", partInfo);
    }

    void resetDiagnostics()
    {
        diagCounters.allocCount.store (0);
        diagCounters.allocBytes.store (0);
        diagCounters.freeCount.store (0);
        diagCounters.allocInAudio.store (0);
        diagCounters.freeInAudio.store (0);
        diagCounters.heapAllocCount.store (0);
        diagCounters.heapAllocInAudio.store (0);
        diagCounters.allocFailures.store (0);
        lastProfile = ZynLoadProfile {};
    }

private:
    struct Program
    {
        juce::String path;
        juce::String display;
    };

    struct MacroState
    {
        float volume = 0.0f;
        float pan = 0.0f;
        int voices = 32;
        int keyShift = 0;
        bool mono = false;
        bool fx[3] = { false, false, false };

        int velSensitivity = 64;
        int velOffset = 64;
        int keyLimit = 15;
        int minKey = 0;
        int maxKey = 127;
        bool portamento = false;
        int portamentoTime = 64;
        bool legato = false;

        int bendRange = 2; // semitons
        int modWheelDepth = 80;
        int filterCutoffDepth = 64;
        int filterQDepth = 64;
        bool expressionReceive = true;
        bool sustainReceive = true;

        /** -1 = manter o que veio no preset; 0 = desligar; 1 = ligar. */
        int adEngine = -1;
        int subEngine = -1;

        bool operator== (const MacroState& other) const
        {
            return volume == other.volume && pan == other.pan && voices == other.voices
                && keyShift == other.keyShift && mono == other.mono
                && fx[0] == other.fx[0] && fx[1] == other.fx[1] && fx[2] == other.fx[2]
                && velSensitivity == other.velSensitivity && velOffset == other.velOffset
                && keyLimit == other.keyLimit && minKey == other.minKey && maxKey == other.maxKey
                && portamento == other.portamento && portamentoTime == other.portamentoTime
                && legato == other.legato && bendRange == other.bendRange
                && modWheelDepth == other.modWheelDepth
                && filterCutoffDepth == other.filterCutoffDepth
                && filterQDepth == other.filterQDepth
                && expressionReceive == other.expressionReceive
                && sustainReceive == other.sustainReceive
                && adEngine == other.adEngine && subEngine == other.subEngine;
        }
    };

    /** Carrega presets numa thread de baixa prioridade; a message thread
        espera o resultado para manter o erro síncrono do Z1. */
    class Loader final : public juce::Thread
    {
    public:
        explicit Loader (ZynProcessor& ownerToUse)
            : juce::Thread ("Zyn preset loader"), owner (ownerToUse)
        {
        }

        ~Loader() override
        {
            stopThread (5000);
        }

        bool request (int index)
        {
            pending.store (index, std::memory_order_relaxed);
            done.reset();
            wake.signal();
            if (! done.wait (120000))
                return false;
            return result.load (std::memory_order_relaxed);
        }

        void run() override
        {
            setPriority (juce::Thread::Priority::low); // longe do áudio

            while (! threadShouldExit())
            {
                if (! wake.wait (100))
                    continue;
                wake.reset();

                const int index = pending.exchange (-1, std::memory_order_relaxed);
                if (index < 0)
                    continue;

                result.store (owner.loadProgramOnWorker (index), std::memory_order_relaxed);
                done.signal();
            }
        }

    private:
        ZynProcessor& owner;
        std::atomic<int> pending { -1 };
        std::atomic<bool> result { false };
        juce::WaitableEvent wake { false };
        juce::WaitableEvent done { false };
    };

    /** Declarado antes de `instance` para sobreviver à destruição do Part,
        que devolve memória pelo mesmo alocador. */
    ZynDiagnosticsCounters diagCounters;
    /** Só a message thread escreve/lê. */
    ZynLoadProfile lastProfile;

    juce::AudioProcessorValueTreeState apvts;

    /** Instrumento que está tocando. Troca só sob `instanceLock`. */
    std::unique_ptr<ZynInstance> instance;
    juce::SpinLock instanceLock;
    std::unique_ptr<Loader> loader;

    /** Fade de 8 ms na troca: 0 = parado, 1 = saindo, 2 = entrando. */
    std::atomic<int> fadeState { 0 };
    std::atomic<bool> audioRunning { false };
    float fadeGain = 1.0f;          // só a thread de áudio escreve
    double fadeSampleRate = 44100.0;

    /** Notas seguradas (128 bits) e última velocity, para re-articular no preset novo. */
    std::array<std::atomic<uint64_t>, 2> heldNotes;
    std::array<std::atomic<uint8_t>, 128> heldVelocity;

    int gzipCompression = 1;
    int interpolation = 0;
    double currentSampleRate = 44100.0;

    std::vector<Program> programs;
    juce::String factoryDir;
    juce::String userDir;
    int currentProgram = 0;
    juce::String currentPath;

    // Só a thread de áudio usa (sob instanceLock).
    MacroState lastMacros;
    float pendingL[kZynBlockSize] {};
    float pendingR[kZynBlockSize] {};
    int pendingPos = kZynBlockSize;

    std::atomic<bool> macrosDirty { true };
    std::atomic<int> voiceCount { 0 };
    /** Posição atual da alavanca (-8192..8191), levada para o próximo preset. */
    std::atomic<int> pitchWheel { 0 };

    static juce::AudioProcessorValueTreeState::ParameterLayout createLayout()
    {
        juce::AudioProcessorValueTreeState::ParameterLayout layout;
        layout.add (std::make_unique<juce::AudioParameterFloat> (
            juce::ParameterID { "volume", 1 }, "Volume",
            juce::NormalisableRange<float> (-40.0f, 13.3f, 0.1f), 0.0f));
        layout.add (std::make_unique<juce::AudioParameterFloat> (
            juce::ParameterID { "pan", 1 }, "Pan",
            juce::NormalisableRange<float> (-1.0f, 1.0f, 0.01f), 0.0f));
        layout.add (std::make_unique<juce::AudioParameterInt> (
            juce::ParameterID { "voices", 1 }, "Voices", 0, 64, 32));
        layout.add (std::make_unique<juce::AudioParameterInt> (
            juce::ParameterID { "keyShift", 1 }, "Key Shift", -24, 24, 0));
        layout.add (std::make_unique<juce::AudioParameterBool> (
            juce::ParameterID { "mono", 1 }, "Mono", false));
        layout.add (std::make_unique<juce::AudioParameterBool> (
            juce::ParameterID { "fx1", 1 }, "FX1 Bypass", false));
        layout.add (std::make_unique<juce::AudioParameterBool> (
            juce::ParameterID { "fx2", 1 }, "FX2 Bypass", false));
        layout.add (std::make_unique<juce::AudioParameterBool> (
            juce::ParameterID { "fx3", 1 }, "FX3 Bypass", false));

        const auto addInt = [&layout] (const char* id, const char* name,
                                       int min, int max, int defaultValue)
        {
            layout.add (std::make_unique<juce::AudioParameterInt> (
                juce::ParameterID { id, 1 }, name, min, max, defaultValue));
        };
        const auto addBool = [&layout] (const char* id, const char* name, bool defaultValue)
        {
            layout.add (std::make_unique<juce::AudioParameterBool> (
                juce::ParameterID { id, 1 }, name, defaultValue));
        };

        addInt ("velSensitivity", "Vel Sensitivity", 0, 127, 64);
        addInt ("velOffset", "Vel Offset", 0, 127, 64);
        addInt ("keyLimit", "Key Limit", 0, 127, 15);
        addInt ("minKey", "Min Key", 0, 127, 0);
        addInt ("maxKey", "Max Key", 0, 127, 127);
        addBool ("portamento", "Portamento", false);
        addInt ("portamentoTime", "Portamento Time", 0, 127, 64);
        addBool ("legato", "Legato", false);
        addInt ("bendRange", "Bend Range", -24, 24, 2);
        addInt ("modWheelDepth", "Mod Wheel Depth", 0, 127, 80);
        addInt ("filterCutoffDepth", "Filter Cutoff Depth", 0, 127, 64);
        addInt ("filterQDepth", "Filter Q Depth", 0, 127, 64);
        addBool ("expressionReceive", "Expression Receive", true);
        addBool ("sustainReceive", "Sustain Receive", true);
        addInt ("adEngine", "AD Engine", -1, 1, -1);
        addInt ("subEngine", "SUB Engine", -1, 1, -1);
        return layout;
    }

    float value (const char* id) const
    {
        const auto* parameter = apvts.getRawParameterValue (id);
        return parameter != nullptr ? parameter->load() : 0.0f;
    }

    MacroState currentMacros() const
    {
        MacroState state;
        state.volume = value ("volume");
        state.pan = value ("pan");
        state.voices = (int) std::lround (value ("voices"));
        state.keyShift = (int) std::lround (value ("keyShift"));
        state.mono = value ("mono") >= 0.5f;
        state.fx[0] = value ("fx1") >= 0.5f;
        state.fx[1] = value ("fx2") >= 0.5f;
        state.fx[2] = value ("fx3") >= 0.5f;

        state.velSensitivity = (int) std::lround (value ("velSensitivity"));
        state.velOffset = (int) std::lround (value ("velOffset"));
        state.keyLimit = (int) std::lround (value ("keyLimit"));
        state.minKey = (int) std::lround (value ("minKey"));
        state.maxKey = (int) std::lround (value ("maxKey"));
        state.portamento = value ("portamento") >= 0.5f;
        state.portamentoTime = (int) std::lround (value ("portamentoTime"));
        state.legato = value ("legato") >= 0.5f;
        state.bendRange = (int) std::lround (value ("bendRange"));
        state.modWheelDepth = (int) std::lround (value ("modWheelDepth"));
        state.filterCutoffDepth = (int) std::lround (value ("filterCutoffDepth"));
        state.filterQDepth = (int) std::lround (value ("filterQDepth"));
        state.expressionReceive = value ("expressionReceive") >= 0.5f;
        state.sustainReceive = value ("sustainReceive") >= 0.5f;
        state.adEngine = (int) std::lround (value ("adEngine"));
        state.subEngine = (int) std::lround (value ("subEngine"));
        return state;
    }

    void writeMacros (zyn::Part& part, const MacroState& macros)
    {
        part.setVolumedB (macros.volume);
        part.setPpanning ((char) juce::jlimit (0, 127, (int) std::lround ((macros.pan + 1.0f) * 63.5f)));
        part.setvoicelimit ((unsigned char) juce::jlimit (0, 64, macros.voices));
        part.Pkeyshift = (unsigned char) juce::jlimit (0, 127, 64 + macros.keyShift);
        part.Ppolymode = ! macros.mono;
        part.Plegatomode = macros.legato;
        for (int i = 0; i < 3; ++i)
            part.Pefxbypass[i] = macros.fx[i];

        part.Pvelsns = (unsigned char) juce::jlimit (0, 127, macros.velSensitivity);
        part.Pveloffs = (unsigned char) juce::jlimit (0, 127, macros.velOffset);
        part.setkeylimit ((unsigned char) juce::jlimit (0, 127, macros.keyLimit));

        const int lowKey = juce::jlimit (0, 127, macros.minKey);
        const int highKey = juce::jlimit (0, 127, macros.maxKey);
        part.Pminkey = (unsigned char) juce::jmin (lowKey, highKey);
        part.Pmaxkey = (unsigned char) juce::jmax (lowKey, highKey);

        part.ctl.portamento.time = (unsigned char) juce::jlimit (0, 127, macros.portamentoTime);
        part.ctl.portamento.portamento = macros.portamento;
        part.ctl.setportamento (macros.portamento ? 127 : 0);

        part.ctl.pitchwheel.bendrange = (short) juce::jlimit (-6400, 6400, macros.bendRange * 100);
        part.ctl.setpitchwheel (pitchWheel.load());

        part.ctl.modwheel.depth = (unsigned char) juce::jlimit (0, 127, macros.modWheelDepth);
        part.ctl.setmodwheel();

        part.ctl.filtercutoff.depth = (unsigned char) juce::jlimit (0, 127, macros.filterCutoffDepth);
        part.ctl.setfiltercutoff();
        part.ctl.filterq.depth = (unsigned char) juce::jlimit (0, 127, macros.filterQDepth);
        part.ctl.setfilterq();

        part.ctl.expression.receive = macros.expressionReceive;
        part.ctl.setexpression();
        part.ctl.sustain.receive = macros.sustainReceive;

        // -1 = preserva o que veio no preset; 0/1 desliga/liga o motor no kit inteiro.
        if (macros.adEngine >= 0)
            for (int n = 0; n < NUM_KIT_ITEMS; ++n)
                part.kit[n].Padenabled = macros.adEngine == 1;
        if (macros.subEngine >= 0)
            for (int n = 0; n < NUM_KIT_ITEMS; ++n)
                part.kit[n].Psubenabled = macros.subEngine == 1;
    }

    /** Thread de áudio: aplica os knobs do painel quando eles mudam. */
    void applyMacros (zyn::Part& part, bool force)
    {
        const auto macros = currentMacros();
        if (! force && ! macrosDirty.exchange (false) && macros == lastMacros)
            return;
        lastMacros = macros;
        writeMacros (part, macros);
    }

    /** Monta um instrumento novo (padrão do Zyn) fora da thread de áudio. */
    std::unique_ptr<ZynInstance> createInstance (double sampleRate)
    {
        auto fresh = std::make_unique<ZynInstance>();

        fresh->synth = std::make_unique<zyn::SYNTH_T>();
        fresh->synth->samplerate = (unsigned int) std::lround (sampleRate);
        fresh->synth->buffersize = kZynBlockSize;
        fresh->synth->oscilsize = 1024;
        fresh->synth->alias();

        fresh->allocator = std::make_unique<ZynPoolAllocator> (diagCounters);
        // FFT própria: a área de trabalho da FFT nunca é dividida com a thread de áudio.
        fresh->fft = std::make_unique<zyn::FFTwrapper> (fresh->synth->oscilsize);
        fresh->microtonal = std::make_unique<zyn::Microtonal> (gzipCompression);
        fresh->absTime = std::make_unique<zyn::AbsTime> (*fresh->synth);
        fresh->sync = std::make_unique<zyn::Sync>();
        fresh->part = std::make_unique<zyn::Part> (*fresh->allocator, *fresh->synth, *fresh->absTime,
                                                   fresh->sync.get(), gzipCompression, interpolation,
                                                   fresh->microtonal.get(), fresh->fft.get(),
                                                   nullptr, nullptr);
        fresh->part->Penabled = true;
        fresh->part->Pnoteon = true;
        fresh->part->defaultsinstrument();
        currentSampleRate = sampleRate;
        return fresh;
    }

    /**
     * Deixa o instrumento pronto para tocar, como o MiddleWare do Zyn faz ao
     * carregar um preset: gera as tabelas do PADsynth (sem elas o PADsynth
     * fica mudo), inicia os efeitos, aplica os knobs e a alavanca atual.
     */
    void finishInstance (ZynInstance& fresh, ZynLoadProfile* profile = nullptr)
    {
        const auto applyStart = diagTicksNow();
        fresh.part->applyparameters();
        if (profile != nullptr)
            profile->applyParametersMs = diagElapsedMs (applyStart);

        const auto initStart = diagTicksNow();
        fresh.part->initialize_rt();
        if (profile != nullptr)
            profile->initializeRtMs = diagElapsedMs (initStart);

        writeMacros (*fresh.part, currentMacros());
        fresh.part->ctl.setpitchwheel (pitchWheel.load());
    }

    /** Roda alguns blocos silenciosos para as tabelas/efeitos ficarem quentes. */
    void prewarmInstance (ZynInstance& fresh, ZynLoadProfile* profile = nullptr)
    {
        const auto start = diagTicksNow();
        for (int i = 0; i < 8; ++i)
        {
            fresh.part->ComputePartSmps();
            ++(*fresh.absTime);
        }
        if (profile != nullptr)
            profile->prewarmMs = diagElapsedMs (start);
    }

    /** Re-articula no preset novo as notas que o usuário está segurando. */
    void applyHeldNotes (ZynInstance& fresh)
    {
        for (int note = 0; note < 128; ++note)
        {
            const auto word = heldNotes[(size_t) (note / 64)].load (std::memory_order_relaxed);
            if ((word & (1ull << (note % 64))) == 0)
                continue;

            const auto velocity = heldVelocity[(size_t) note].load (std::memory_order_relaxed);
            fresh.part->NoteOn ((zyn::note_t) note, velocity, 0);
        }
    }

    /** Coloca o instrumento novo para tocar; o antigo é destruído fora da trava. */
    void install (std::unique_ptr<ZynInstance> fresh, ZynLoadProfile* profile = nullptr)
    {
        const bool fade = audioRunning.load (std::memory_order_relaxed);
        if (fade)
        {
            // Pede ao áudio para descer até zero antes de trocar o ponteiro.
            fadeState.store (1, std::memory_order_relaxed);
            for (int i = 0; i < 200; ++i)
            {
                if (fadeState.load (std::memory_order_relaxed) == 0)
                    break;
                juce::Thread::sleep (1);
            }
        }

        const auto swapStart = diagTicksNow();
        {
            const juce::SpinLock::ScopedLockType lock (instanceLock);
            std::swap (instance, fresh);
            lastMacros = currentMacros();
            pendingPos = kZynBlockSize;
            if (fade)
            {
                fadeGain = 0.0f;
                fadeState.store (2, std::memory_order_relaxed);
            }
            else
            {
                fadeGain = 1.0f;
                fadeState.store (0, std::memory_order_relaxed);
            }
        }
        if (profile != nullptr)
            profile->installMs = diagElapsedMs (swapStart);

        const auto destroyStart = diagTicksNow();
        fresh.reset();
        if (profile != nullptr)
            profile->destroyOldMs = diagElapsedMs (destroyStart);
    }

    bool loadPreset (const juce::String& path, int index = -1)
    {
        ZynLoadProfile profile;
        profile.path = path;
        profile.index = index;
        profile.fileBytes = juce::File (path).getSize();
        profile.gzip = isGzipFile (path);

        const auto totalStart = diagTicksNow();
        const auto createStart = totalStart;
        auto fresh = createInstance (currentSampleRate);
        profile.createMs = diagElapsedMs (createStart);

        const auto loadStart = diagTicksNow();
        profile.loadXmlResult = fresh->part->loadXMLinstrument (path.toRawUTF8());
        profile.loadXmlMs = diagElapsedMs (loadStart);

        if (profile.loadXmlResult != 0)
        {
            profile.totalMs = diagElapsedMs (totalStart);
            profile.ok = false;
            lastProfile = profile;
            return false;
        }

        finishInstance (*fresh, &profile);
        prewarmInstance (*fresh, &profile);
        applyHeldNotes (*fresh);
        install (std::move (fresh), &profile);
        profile.totalMs = diagElapsedMs (totalStart);
        profile.ok = true;
        lastProfile = profile;
        return true;
    }

    juce::String captureInstrument() const
    {
        if (instance == nullptr)
            return {};

        zyn::XMLwrapper xml;
        xml.beginbranch ("PRESETER_INSTRUMENT");
        instance->part->add2XMLinstrument (xml);
        xml.endbranch();

        char* data = xml.getXMLdata();
        if (data == nullptr)
            return {};

        const auto text = juce::String::fromUTF8 (data);
        std::free (data);
        return text;
    }

    static bool readInstrument (zyn::Part& part, const juce::String& text)
    {
        if (text.isEmpty())
            return false;

        zyn::XMLwrapper xml;
        if (! xml.putXMLdata (text.toRawUTF8()))
            return false;

        if (! xml.enterbranch ("PRESETER_INSTRUMENT"))
            return false;

        part.getfromXMLinstrument (xml);
        xml.exitbranch();
        return true;
    }

    static juce::String bankLabel (const juce::File& root, const juce::File& file,
                                   const juce::String& fallback)
    {
        auto relative = file.getParentDirectory().getRelativePathFrom (root)
                            .replaceCharacter ('\\', '/');
        if (relative.isEmpty() || relative == ".")
            return fallback;
        return fallback + "/" + relative;
    }

    void scanInto (const juce::String& rootPath, const juce::String& fallback)
    {
        if (rootPath.isEmpty())
            return;

        const juce::File root (rootPath);
        if (! root.isDirectory())
            return;

        juce::Array<juce::File> files;
        root.findChildFiles (files, juce::File::findFiles, true, "*.xiz");
        juce::File::NaturalFileComparator comparator (true);
        files.sort (comparator);

        for (const auto& file : files)
        {
            const auto bank = bankLabel (root, file, fallback);
            programs.push_back ({
                file.getFullPathName(),
                bank + " · " + file.getFileNameWithoutExtension()
            });
        }
    }

    void scanPrograms()
    {
        programs.clear();
        scanInto (factoryDir, juce::String::fromUTF8 ("Fábrica"));
        scanInto (userDir, "Meus presets");

        // Evita duplicar o mesmo arquivo se as pastas se sobrepuserem.
        std::sort (programs.begin(), programs.end(), [] (const Program& a, const Program& b)
        {
            if (a.display != b.display) return a.display.compareNatural (b.display) < 0;
            return a.path < b.path;
        });
        programs.erase (std::unique (programs.begin(), programs.end(), [] (const Program& a, const Program& b)
        {
            return a.path == b.path;
        }), programs.end());
    }

    void handleMidi (zyn::Part& part, const juce::MidiMessage& message)
    {
        if (message.isNoteOn())
        {
            setHeldNote (message.getNoteNumber(), message.getVelocity(), true);
            part.NoteOn (message.getNoteNumber(), (unsigned char) message.getVelocity(), 0);
        }
        else if (message.isNoteOff())
        {
            setHeldNote (message.getNoteNumber(), 0, false);
            part.NoteOff (message.getNoteNumber());
        }
        else if (message.isPitchWheel())
        {
            // O MIDI vai de 0 a 16383 com centro em 8192; o Zyn espera -8192..8191.
            const int bend = message.getPitchWheelValue() - 8192;
            pitchWheel.store (bend);
            part.SetController (zyn::C_pitchwheel, bend);
        }
        else if (message.isController())
        {
            const int controller = message.getControllerNumber();
            if (controller == 120 || controller == 123)
            {
                clearHeldNotes();
                part.AllNotesOff();
            }
            else
            {
                if (controller == 121)
                    pitchWheel.store (0);
                part.SetController ((unsigned int) controller, message.getControllerValue());
            }
        }
        else if (message.isAllNotesOff() || message.isAllSoundOff())
        {
            clearHeldNotes();
            part.AllNotesOff();
        }
    }

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ZynProcessor)
};
} // namespace

std::unique_ptr<juce::AudioProcessor> createZyn()
{
    return std::make_unique<ZynProcessor>();
}

int zynActiveVoices (juce::AudioProcessor* processor)
{
    if (auto* zyn = dynamic_cast<ZynProcessor*> (processor))
        return zyn->activeVoices();
    return 0;
}

void setZynBankDirs (juce::AudioProcessor* processor,
                     const juce::String& factoryDir,
                     const juce::String& userDir)
{
    if (auto* zyn = dynamic_cast<ZynProcessor*> (processor))
        zyn->setBankDirs (factoryDir, userDir);
}

bool reloadZynBank (juce::AudioProcessor* processor)
{
    if (auto* zyn = dynamic_cast<ZynProcessor*> (processor))
    {
        zyn->reloadBank();
        return true;
    }
    return false;
}

juce::var describeZynPrograms (juce::AudioProcessor* processor)
{
    if (auto* zyn = dynamic_cast<ZynProcessor*> (processor))
        return zyn->describePrograms();
    return {};
}

bool loadZynPresetForDiagnostics (juce::AudioProcessor* processor,
                                  const juce::String& path,
                                  juce::var& result)
{
    if (auto* zyn = dynamic_cast<ZynProcessor*> (processor))
        return zyn->loadPresetForDiagnostics (path, result);
    return false;
}

juce::var describeZynDiagnostics (juce::AudioProcessor* processor)
{
    if (auto* zyn = dynamic_cast<ZynProcessor*> (processor))
        return zyn->describeDiagnostics();
    return {};
}

void resetZynDiagnostics (juce::AudioProcessor* processor)
{
    if (auto* zyn = dynamic_cast<ZynProcessor*> (processor))
        zyn->resetDiagnostics();
}
} // namespace native
} // namespace preseter
