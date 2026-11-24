#include "ZynFactory.h"

#include "Misc/Part.h"
#include "Misc/Allocator.h"
#include "Misc/Microtonal.h"
#include "Misc/Time.h"
#include "Misc/Sync.h"
#include "Misc/XMLwrapper.h"
#include "DSP/FFTwrapper.h"
#include "Params/Controller.h"

#include <algorithm>
#include <atomic>
#include <cmath>
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
/** Alocador simples para o Part (o Zyn usa o mesmo tipo no Master). */
class MallocAllocator final : public zyn::Allocator
{
public:
    void* alloc_mem (size_t size) override { return std::malloc (size); }
    void dealloc_mem (void* memory) override { std::free (memory); }
    void addMemory (void*, size_t) override {}
    bool lowMemory (unsigned, size_t) const override { return false; }
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
    std::unique_ptr<MallocAllocator> allocator;
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
        auto fresh = createInstance (44100.0);
        finishInstance (*fresh);
        install (std::move (fresh));
    }

    ~ZynProcessor() override = default;

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
        if (instance != nullptr && rate == currentSampleRate)
            return;

        // A taxa mudou: monta o mesmo instrumento na taxa nova.
        const auto saved = captureInstrument();
        auto fresh = createInstance (rate);
        if (saved.isNotEmpty())
            readInstrument (*fresh->part, saved);
        finishInstance (*fresh);
        install (std::move (fresh));
    }

    void releaseResources() override
    {
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
            for (int i = 0; i < count; ++i)
            {
                left[position + i] += pendingL[pendingPos + i] * gainL;
                if (right != nullptr)
                    right[position + i] += pendingR[pendingPos + i] * gainR;
            }
            pendingPos += count;
            position += count;
        }

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
        if (! loadPreset (programs[(size_t) target].path))
        {
            // Mantém o programa anterior se o arquivo não puder ser lido.
            return;
        }

        currentProgram = target;
        currentPath = programs[(size_t) target].path;
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

        bool operator== (const MacroState& other) const
        {
            return volume == other.volume && pan == other.pan && voices == other.voices
                && keyShift == other.keyShift && mono == other.mono
                && fx[0] == other.fx[0] && fx[1] == other.fx[1] && fx[2] == other.fx[2];
        }
    };

    juce::AudioProcessorValueTreeState apvts;

    /** Instrumento que está tocando. Troca só sob `instanceLock`. */
    std::unique_ptr<ZynInstance> instance;
    juce::SpinLock instanceLock;

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
        return state;
    }

    static void writeMacros (zyn::Part& part, const MacroState& macros)
    {
        part.setVolumedB (macros.volume);
        part.setPpanning ((char) juce::jlimit (0, 127, (int) std::lround ((macros.pan + 1.0f) * 63.5f)));
        part.setvoicelimit ((unsigned char) juce::jlimit (0, 64, macros.voices));
        part.Pkeyshift = (unsigned char) juce::jlimit (0, 127, 64 + macros.keyShift);
        part.Ppolymode = ! macros.mono;
        part.Plegatomode = false;
        for (int i = 0; i < 3; ++i)
            part.Pefxbypass[i] = macros.fx[i];
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

        fresh->allocator = std::make_unique<MallocAllocator>();
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
    void finishInstance (ZynInstance& fresh)
    {
        fresh.part->applyparameters();
        fresh.part->initialize_rt();
        writeMacros (*fresh.part, currentMacros());
        fresh.part->ctl.setpitchwheel (pitchWheel.load());
    }

    /** Coloca o instrumento novo para tocar; o antigo é destruído fora da trava. */
    void install (std::unique_ptr<ZynInstance> fresh)
    {
        {
            const juce::SpinLock::ScopedLockType lock (instanceLock);
            std::swap (instance, fresh);
            lastMacros = currentMacros();
            pendingPos = kZynBlockSize;
        }
        fresh.reset();
    }

    bool loadPreset (const juce::String& path)
    {
        auto fresh = createInstance (currentSampleRate);
        if (fresh->part->loadXMLinstrument (path.toRawUTF8()) != 0)
            return false;

        finishInstance (*fresh);
        install (std::move (fresh));
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
            part.NoteOn (message.getNoteNumber(), (unsigned char) message.getVelocity(), 0);
        else if (message.isNoteOff())
            part.NoteOff (message.getNoteNumber());
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
                part.AllNotesOff();
            else
            {
                if (controller == 121)
                    pitchWheel.store (0);
                part.SetController ((unsigned int) controller, message.getControllerValue());
            }
        }
        else if (message.isAllNotesOff() || message.isAllSoundOff())
            part.AllNotesOff();
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
} // namespace native
} // namespace preseter
