#include "Engine.h"

#include "Output.h"

#include <array>
#include <atomic>
#include <cmath>

namespace preseter
{
namespace
{
class NoteRangeFilter final : public juce::AudioProcessor
{
public:
    NoteRangeFilter()
        : juce::AudioProcessor (BusesProperties())
    {
        for (auto& channel : noteMap) channel.fill (-1);
    }

    const juce::String getName() const override { return "Preseter Note Range"; }
    void prepareToPlay (double, int) override {}
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout&) const override { return true; }
    void processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi) override
    {
        juce::ignoreUnused (audio);
        juce::MidiBuffer accepted;
        const int transpose = transposeSemitones.load();
        const int velocityLow = velocityMinimum.load();
        const int velocityHigh = velocityMaximum.load();
        for (const auto metadata : midi)
        {
            const auto message = metadata.getMessage();
            bool pass = true;
            if (message.isNoteOn())
            {
                const int inputNote = message.getNoteNumber();
                const int note = inputNote + transpose;
                const int velocity = message.getVelocity();
                pass = note >= minimum.load()
                    && note <= maximum.load()
                    && note >= 0
                    && note <= 127
                    && velocity >= velocityLow
                    && velocity <= velocityHigh;
                if (pass)
                {
                    noteMap[(size_t) message.getChannel() - 1][(size_t) inputNote] = note;
                    ++activeNotes[(size_t) message.getChannel() - 1][(size_t) note];
                    accepted.addEvent (juce::MidiMessage::noteOn (message.getChannel(), note, (juce::uint8) velocity),
                                       metadata.samplePosition);
                }
                continue;
            }
            if (message.isNoteOff())
            {
                const int inputNote = message.getNoteNumber();
                const auto channelIndex = (size_t) message.getChannel() - 1;
                int note = noteMap[channelIndex][(size_t) inputNote];
                if (note < 0)
                    note = inputNote + transpose;
                pass = note >= 0 && note <= 127;
                if (pass)
                {
                    auto& count = activeNotes[channelIndex][(size_t) note];
                    pass = count > 0;
                    if (pass) --count;
                    noteMap[channelIndex][(size_t) inputNote] = -1;
                }
                if (pass)
                    accepted.addEvent (juce::MidiMessage::noteOff (message.getChannel(), note,
                                                                   (juce::uint8) message.getVelocity()),
                                       metadata.samplePosition);
                continue;
            }
            if (message.isAllNotesOff() || message.isAllSoundOff())
            {
                activeNotes = {};
                for (auto& channel : noteMap) channel.fill (-1);
            }

            if (pass)
                accepted.addEvent (message, metadata.samplePosition);
        }
        midi.swapWith (accepted);
    }
    bool hasEditor() const override { return false; }
    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return true; }
    double getTailLengthSeconds() const override { return 0.0; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}
    void getStateInformation (juce::MemoryBlock&) override {}
    void setStateInformation (const void*, int) override {}

    void setRange (int minNote, int maxNote)
    {
        minimum.store (minNote);
        maximum.store (maxNote);
    }

    void setVelocityRange (int minVelocity, int maxVelocity)
    {
        velocityMinimum.store (juce::jlimit (1, 127, minVelocity));
        velocityMaximum.store (juce::jlimit (1, 127, maxVelocity));
    }

    void setTranspose (int semitones)
    {
        transposeSemitones.store (semitones);
    }

private:
    std::atomic<int> minimum { 0 };
    std::atomic<int> maximum { 127 };
    std::atomic<int> velocityMinimum { 1 };
    std::atomic<int> velocityMaximum { 127 };
    std::atomic<int> transposeSemitones { 0 };
    std::array<std::array<unsigned int, 128>, 16> activeNotes {};
    /** Nota de entrada → nota transposta do note-on ainda ativo (-1 = nenhuma). */
    std::array<std::array<int, 128>, 16> noteMap {};
};

/** Strip de entrada de áudio (guitarra/microfone) do patch (Fase 3.5). */
class AudioInputProcessor final : public juce::AudioProcessor
{
public:
    AudioInputProcessor()
        : juce::AudioProcessor (BusesProperties()
                                    .withInput ("Input", juce::AudioChannelSet::stereo(), true)
                                    .withOutput ("Output", juce::AudioChannelSet::stereo(), true))
    {
    }

    const juce::String getName() const override { return "Preseter Audio Input"; }
    void prepareToPlay (double rate, int) override { sampleRate = rate > 0 ? rate : 44100.0; }
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout& layout) const override
    {
        return layout.getMainInputChannelSet() == juce::AudioChannelSet::stereo()
            && layout.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
    }

    void processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi) override
    {
        juce::ignoreUnused (midi);
        const int samples = audio.getNumSamples();
        const int channels = audio.getNumChannels();
        if (samples <= 0 || channels <= 0)
            return;

        const float gain = juce::Decibels::decibelsToGain (volumeDb.load());
        const float panValue = pan.load();
        const float leftGain = panValue <= 0.0f ? 1.0f : 1.0f - panValue;
        const float rightGain = panValue >= 0.0f ? 1.0f : 1.0f + panValue;
        const bool isMono = mono.load();
        const bool silent = muted.load() || feedbackDetected.load();
        float peak = 0.0f;

        for (int sample = 0; sample < samples; ++sample)
        {
            const float left = audio.getSample (0, sample);
            const float right = (! isMono && channels > 1) ? audio.getSample (1, sample) : left;
            const float outLeft = left * gain * leftGain;
            const float outRight = right * gain * rightGain;
            peak = juce::jmax (peak, juce::jmax (std::abs (outLeft), std::abs (outRight)));

            audio.setSample (0, sample, silent ? 0.0f : outLeft);
            if (channels > 1)
                audio.setSample (1, sample, silent ? 0.0f : outRight);
        }

        peakLevel.store (peak);

        // Detector simples de feedback: nível altíssimo por ~2 s silencia o canal.
        if (feedbackProtection.load() && ! silent)
        {
            if (peak > 0.9f)
                ++loudBlocks;
            else
                loudBlocks = juce::jmax (0, loudBlocks - 2);

            const int blocksForTwoSeconds = juce::jmax (1, (int) std::round (sampleRate * 2.0 / juce::jmax (1, samples)));
            if (loudBlocks > blocksForTwoSeconds)
            {
                loudBlocks = 0;
                feedbackDetected.store (true);
            }
        }
        else
        {
            loudBlocks = 0;
        }
    }

    bool hasEditor() const override { return false; }
    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}
    void getStateInformation (juce::MemoryBlock&) override {}
    void setStateInformation (const void*, int) override {}

    void configure (bool shouldBeEnabled, int channel, bool shouldBeMono, float volume,
                    float panPosition, bool shouldBeMuted, bool protect, int outputBus)
    {
        enabled.store (shouldBeEnabled);
        inputChannel.store (juce::jmax (0, channel));
        mono.store (shouldBeMono);
        volumeDb.store (volume);
        pan.store (panPosition);
        muted.store (shouldBeMuted);
        feedbackProtection.store (protect);
        output.store (juce::jlimit (1, 4, outputBus));
    }

    void resetFeedback()
    {
        feedbackDetected.store (false);
        loudBlocks = 0;
    }

    bool isEnabled() const { return enabled.load(); }
    bool isMono() const { return mono.load(); }
    int getInputChannel() const { return inputChannel.load(); }
    int getOutput() const { return output.load(); }
    bool isMuted() const { return muted.load(); }
    bool isFeedbackProtection() const { return feedbackProtection.load(); }
    bool hasFeedback() const { return feedbackDetected.load(); }
    float getVolumeDb() const { return volumeDb.load(); }
    float getPan() const { return pan.load(); }
    float getPeak() const { return peakLevel.load(); }

private:
    std::atomic<bool> enabled { false };
    std::atomic<int> inputChannel { 0 };
    std::atomic<bool> mono { true };
    std::atomic<float> volumeDb { 0.0f };
    std::atomic<float> pan { 0.0f };
    std::atomic<bool> muted { false };
    std::atomic<bool> feedbackProtection { true };
    std::atomic<bool> feedbackDetected { false };
    std::atomic<float> peakLevel { 0.0f };
    std::atomic<int> output { 1 };
    double sampleRate = 44100.0;
    int loudBlocks = 0;
};

/** Filtro global de MIDI Thru: bloqueia mensagens marcadas como "Don't pass thru" (Fase 4.5). */
class MidiThruFilter final : public juce::AudioProcessor
{
public:
    MidiThruFilter()
        : juce::AudioProcessor (BusesProperties())
    {
        for (auto& type : blocked)
            for (auto& channel : type)
                for (auto& value : channel) value.store (false);
    }

    const juce::String getName() const override { return "Preseter MIDI Thru"; }
    void prepareToPlay (double, int) override {}
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout&) const override { return true; }
    void processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi) override
    {
        juce::ignoreUnused (audio);
        juce::MidiBuffer accepted;
        for (const auto metadata : midi)
        {
            const auto message = metadata.getMessage();
            const int type = typeOf (message);
            const int number = numberOf (message);
            const int channel = juce::jlimit (0, 15, message.getChannel() - 1);
            if (type < 0 || ! blocked[(size_t) type][(size_t) channel][(size_t) number].load())
                accepted.addEvent (message, metadata.samplePosition);
        }
        midi.swapWith (accepted);
    }
    bool hasEditor() const override { return false; }
    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return true; }
    double getTailLengthSeconds() const override { return 0.0; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}
    void getStateInformation (juce::MemoryBlock&) override {}
    void setStateInformation (const void*, int) override {}

    void clear()
    {
        for (auto& type : blocked)
            for (auto& channel : type)
                for (auto& value : channel) value.store (false);
    }

    void setBlocked (int type, int channel, int number, bool value)
    {
        if (type < 0 || type > 4) return;
        blocked[(size_t) type][(size_t) juce::jlimit (0, 15, channel)]
               [(size_t) juce::jlimit (0, 127, number)].store (value);
    }

private:
    static int typeOf (const juce::MidiMessage& message)
    {
        if (message.isController()) return 0;
        if (message.isNoteOnOrOff()) return 1;
        if (message.isPitchWheel()) return 2;
        if (message.isAftertouch() || message.isChannelPressure()) return 3;
        if (message.isProgramChange()) return 4;
        return -1;
    }

    static int numberOf (const juce::MidiMessage& message)
    {
        if (message.isController()) return message.getControllerNumber();
        if (message.isNoteOnOrOff() || message.isAftertouch()) return message.getNoteNumber();
        if (message.isProgramChange()) return message.getProgramChangeNumber();
        return 0;
    }

    std::array<std::array<std::array<std::atomic<bool>, 128>, 16>, 5> blocked {};
};

class ChannelStripProcessor final : public juce::AudioProcessor
{
public:
    explicit ChannelStripProcessor (std::atomic<int>* soloCount = nullptr)
        : juce::AudioProcessor (BusesProperties()
                                    .withInput ("Input", juce::AudioChannelSet::stereo(), true)
                                    .withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
          sharedSoloCount (soloCount)
    {
    }

    const juce::String getName() const override { return "Preseter Channel Strip"; }
    void prepareToPlay (double rate, int blockSize) override
    {
        peakDecay = std::pow (0.5f, (float) blockSize / (float) (juce::jmax (1.0, rate) * 0.35));
    }
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout& layout) const override
    {
        return layout.getMainInputChannelSet() == juce::AudioChannelSet::stereo()
            && layout.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
    }
    void processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi) override
    {
        juce::ignoreUnused (midi);
        const auto isSoloed = solo.load();
        const auto shouldSilence = muted.load()
            || (sharedSoloCount != nullptr && sharedSoloCount->load() > 0 && ! isSoloed);
        const auto gain = juce::Decibels::decibelsToGain (volumeDb.load());
        const auto balance = pan.load();
        const auto leftGain = gain * (balance > 0.0f ? 1.0f - balance : 1.0f);
        const auto rightGain = gain * (balance < 0.0f ? 1.0f + balance : 1.0f);
        float blockPeak = 0.0f;

        if (shouldSilence)
        {
            audio.clear();
        }
        else
        {
            for (int channel = 0; channel < audio.getNumChannels(); ++channel)
            {
                auto* samples = audio.getWritePointer (channel);
                const auto channelGain = channel == 0 ? leftGain : rightGain;
                for (int sample = 0; sample < audio.getNumSamples(); ++sample)
                {
                    samples[sample] *= channelGain;
                    blockPeak = juce::jmax (blockPeak, std::abs (samples[sample]));
                }
            }
        }

        const auto decayedPeak = peak.load() * peakDecay;
        peak.store (juce::jmax (blockPeak, decayedPeak));
    }
    bool hasEditor() const override { return false; }
    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}
    void getStateInformation (juce::MemoryBlock&) override {}
    void setStateInformation (const void*, int) override {}

    void setVolumeDb (float value) { volumeDb.store (value); }
    void setPan (float value) { pan.store (value); }
    void setMuted (bool value) { muted.store (value); }
    void setSolo (bool value) { solo.store (value); }
    float getVolumeDb() const { return volumeDb.load(); }
    float getPan() const { return pan.load(); }
    bool isMuted() const { return muted.load(); }
    bool isSolo() const { return solo.load(); }
    float getPeakDb() const { return juce::Decibels::gainToDecibels (peak.load(), -100.0f); }

private:
    std::atomic<int>* sharedSoloCount = nullptr;
    std::atomic<float> volumeDb { 0.0f };
    std::atomic<float> pan { 0.0f };
    std::atomic<float> peak { 0.0f };
    std::atomic<bool> muted { false };
    std::atomic<bool> solo { false };
    float peakDecay = 0.99f;
};

/** Ganho de um send post-fader: o nível do send é aplicado aqui (Fase 3.2). */
class SendGainProcessor final : public juce::AudioProcessor
{
public:
    SendGainProcessor()
        : juce::AudioProcessor (BusesProperties()
                                    .withInput ("Input", juce::AudioChannelSet::stereo(), true)
                                    .withOutput ("Output", juce::AudioChannelSet::stereo(), true))
    {
    }

    const juce::String getName() const override { return "Preseter Send"; }
    void prepareToPlay (double, int) override {}
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout& layout) const override
    {
        return layout.getMainInputChannelSet() == juce::AudioChannelSet::stereo()
            && layout.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
    }
    void processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi) override
    {
        juce::ignoreUnused (midi);
        audio.applyGain (juce::Decibels::decibelsToGain (gainDb.load()));
    }
    bool hasEditor() const override { return false; }
    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}
    void getStateInformation (juce::MemoryBlock&) override {}
    void setStateInformation (const void*, int) override {}

    void setGainDb (float value) { gainDb.store (value); }

private:
    std::atomic<float> gainDb { 0.0f };
};

juce::var toVarArray (const juce::StringArray& strings)
{
    juce::Array<juce::var> list;
    for (const auto& s : strings)
        list.add (s);
    return juce::var (list);
}

juce::var parameterToVar (juce::AudioProcessorParameter& p, int index)
{
    return Obj()
        .set ("index", index)
        .set ("id", juce::String (index))
        .set ("name", p.getName (128))
        .set ("label", p.getLabel())
        .set ("value", (double) p.getValue())
        .set ("defaultValue", (double) p.getDefaultValue())
        .set ("text", p.getCurrentValueAsText())
        .set ("stepCount", p.isDiscrete() ? p.getNumSteps() : 0)
        .set ("automatable", p.isAutomatable());
}
} // namespace

// ---------------------------------------------------------------------------
Engine::Engine()
{
    formatManager.addDefaultFormats();

    dataDirectory = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                        .getChildFile ("Preseter")
                        .getChildFile ("engine");
    dataDirectory.createDirectory();
    knownPluginsFile = dataDirectory.getChildFile ("known-plugins.xml");
    deadMansFile     = dataDirectory.getChildFile ("scan-deadman.txt");

    if (auto xml = juce::XmlDocument::parse (knownPluginsFile))
        knownPlugins.recreateFromXml (*xml);

    using IO = Graph::AudioGraphIOProcessor;
    audioInNode  = graph.addNode (std::make_unique<IO> (IO::audioInputNode));
    audioOutNode = graph.addNode (std::make_unique<IO> (IO::audioOutputNode));
    midiInNode   = graph.addNode (std::make_unique<IO> (IO::midiInputNode));
    midiThruNode = graph.addNode (std::make_unique<MidiThruFilter>());
    audioInputNode = graph.addNode (std::make_unique<AudioInputProcessor>());
    masterNode   = graph.addNode (std::make_unique<ChannelStripProcessor>());

    // Barramentos do concert: 4 Aux + 4 Output (Fase 3.2). O strip do barramento
    // não participa do solo (soloCount = nullptr), só do seu próprio mute.
    for (int i = 0; i < kAuxBuses; ++i)
    {
        Bus bus;
        bus.id = "aux" + juce::String (i + 1);
        bus.kind = Bus::Kind::aux;
        bus.index = i;
        bus.output = 1;
        bus.stripNode = graph.addNode (std::make_unique<ChannelStripProcessor>());
        buses.push_back (std::move (bus));
    }
    for (int i = 0; i < kOutputBuses; ++i)
    {
        Bus bus;
        bus.id = "output" + juce::String (i + 1);
        bus.kind = Bus::Kind::output;
        bus.index = i;
        bus.stripNode = graph.addNode (std::make_unique<ChannelStripProcessor>());
        buses.push_back (std::move (bus));
    }

    deviceManager.addChangeListener (this);
}

Engine::~Engine()
{
    *aliveFlag = false;
    // Fecha as janelas de edição antes de destruir os plugins (o editor as referencia).
    editorWindows.clear();
    stopTimer();
    deviceManager.removeChangeListener (this);
    stopAudio();
    player.setProcessor (nullptr);
    graph.clear();
}

// ---- Áudio e MIDI -----------------------------------------------------------
juce::String Engine::startAudio (const juce::var& options)
{
    const int numIn  = options.hasProperty ("inputs")  ? (int) options["inputs"]  : 0;
    const int numOut = options.hasProperty ("outputs") ? (int) options["outputs"] : 2;

    if (! deviceInitialised)
    {
        auto error = deviceManager.initialise (numIn, numOut, nullptr, true);
        if (error.isNotEmpty())
            return error;
        deviceInitialised = true;
    }

    if (options.hasProperty ("type"))
        deviceManager.setCurrentAudioDeviceType (options["type"].toString(), true);

    auto setup = deviceManager.getAudioDeviceSetup();

    if (options.hasProperty ("output"))     setup.outputDeviceName = options["output"].toString();
    if (options.hasProperty ("input"))      setup.inputDeviceName  = options["input"].toString();
    if (options.hasProperty ("sampleRate")) setup.sampleRate       = (double) options["sampleRate"];
    if (options.hasProperty ("bufferSize")) setup.bufferSize       = (int) options["bufferSize"];

    setup.useDefaultInputChannels  = false;
    setup.useDefaultOutputChannels = false;
    setup.inputChannels.clear();
    setup.outputChannels.clear();
    setup.inputChannels.setRange (0, numIn, true);
    setup.outputChannels.setRange (0, numOut, true);

    auto error = deviceManager.setAudioDeviceSetup (setup, true);
    if (error.isNotEmpty())
        return error;

    // O JUCE pode devolver "sem erro" mesmo sem nenhum dispositivo aberto.
    if (deviceManager.getCurrentAudioDevice() == nullptr)
        return utf8 ("Nenhum dispositivo de áudio pôde ser aberto. Verifique a placa de som e o driver.");

    if (! audioCallbackAttached)
    {
        player.setProcessor (&graph);
        deviceManager.addAudioCallback (&player);
        audioCallbackAttached = true;
    }

    if (! midiCallbackAttached)
    {
        deviceManager.addMidiInputDeviceCallback ({}, &player);
        midiCallbackAttached = true;
    }

    if (! options.hasProperty ("midi") || (bool) options["midi"])
        for (const auto& device : juce::MidiInput::getAvailableDevices())
            deviceManager.setMidiInputDeviceEnabled (device.identifier, true);

    rebuildConnections();
    return {};
}

void Engine::stopAudio()
{
    if (midiCallbackAttached)
    {
        deviceManager.removeMidiInputDeviceCallback ({}, &player);
        midiCallbackAttached = false;
    }

    if (audioCallbackAttached)
    {
        deviceManager.removeAudioCallback (&player);
        audioCallbackAttached = false;
    }

    deviceManager.closeAudioDevice();
}

bool Engine::isAudioRunning() const
{
    return audioCallbackAttached && deviceManager.getCurrentAudioDevice() != nullptr;
}

juce::var Engine::describeDevices()
{
    juce::Array<juce::var> types;
    bool asioBackendAvailable = false;
    bool asioDriverAvailable = false;

    for (auto* type : deviceManager.getAvailableDeviceTypes())
    {
        type->scanForDevices();

        juce::Array<juce::var> outputs, inputs;
        for (const auto& name : type->getDeviceNames (false)) outputs.add (name);
        for (const auto& name : type->getDeviceNames (true))  inputs.add (name);
        if (type->getTypeName().containsIgnoreCase ("ASIO"))
        {
            asioBackendAvailable = true;
            asioDriverAvailable = ! outputs.isEmpty() || ! inputs.isEmpty();
        }

        types.add (Obj()
                       .set ("type", type->getTypeName())
                       .set ("outputs", juce::var (outputs))
                       .set ("inputs", juce::var (inputs)));
    }

    juce::var current;
    if (auto* device = deviceManager.getCurrentAudioDevice())
    {
        const auto rate = device->getCurrentSampleRate();
        current = Obj()
                      .set ("type", device->getTypeName())
                      .set ("name", device->getName())
                      .set ("sampleRate", rate)
                      .set ("bufferSize", device->getCurrentBufferSizeSamples())
                      .set ("inputChannels", device->getActiveInputChannels().countNumberOfSetBits())
                      .set ("outputChannels", device->getActiveOutputChannels().countNumberOfSetBits())
                      .set ("outputLatencyMs", rate > 0 ? device->getOutputLatencyInSamples() * 1000.0 / rate : 0.0);
    }

    juce::Array<juce::var> midiInputs;
    for (const auto& device : juce::MidiInput::getAvailableDevices())
        midiInputs.add (Obj()
                            .set ("name", device.name)
                            .set ("identifier", device.identifier)
                            .set ("enabled", deviceManager.isMidiInputDeviceEnabled (device.identifier)));

    return Obj()
        .set ("running", isAudioRunning())
        .set ("current", current)
        .set ("audioTypes", juce::var (types))
        .set ("midiInputs", juce::var (midiInputs))
        .set ("asioSupported", asioBackendAvailable)
        .set ("asioDriverAvailable", asioDriverAvailable)
        .set ("asioUnavailableReason", asioBackendAvailable
            ? (asioDriverAvailable ? juce::String() : juce::String ("Backend ASIO compilado, mas nenhum driver ASIO foi encontrado."))
            : audioConfigurationError());
}

juce::var Engine::describeAudioConfiguration()
{
    return describeDevices();
}

juce::String Engine::audioConfigurationError()
{
    for (auto* type : deviceManager.getAvailableDeviceTypes())
        if (type->getTypeName().containsIgnoreCase ("ASIO"))
            return {};
    return utf8 ("ASIO indisponível neste engine. Recompile com PRESETER_ENABLE_ASIO=ON e informe o caminho do ASIO SDK da Steinberg.");
}

juce::var Engine::describeMixState() const
{
    juce::Array<juce::var> layerStates;
    for (const auto& layer : layers)
    {
        auto* strip = layer.stripNode != nullptr
            ? dynamic_cast<ChannelStripProcessor*> (layer.stripNode->getProcessor())
            : nullptr;
        if (strip == nullptr)
            continue;

        juce::Array<juce::var> sends;
        for (int aux = 0; aux < kAuxBuses; ++aux)
            sends.add ((double) layer.sendLevelDb[(size_t) aux]);

        layerStates.add (Obj()
            .set ("layerId", layer.id)
            .set ("volumeDb", strip->getVolumeDb())
            .set ("pan", strip->getPan())
            .set ("muted", strip->isMuted())
            .set ("solo", strip->isSolo())
            .set ("peakDb", strip->getPeakDb())
            .set ("output", layer.output)
            .set ("sends", juce::var (sends)));
    }

    juce::Array<juce::var> auxStates, outputStates;
    for (const auto& bus : buses)
    {
        auto* strip = bus.stripNode != nullptr
            ? dynamic_cast<ChannelStripProcessor*> (bus.stripNode->getProcessor())
            : nullptr;
        if (strip == nullptr)
            continue;

        auto state = Obj()
            .set ("bus", bus.id)
            .set ("volumeDb", strip->getVolumeDb())
            .set ("pan", strip->getPan())
            .set ("muted", strip->isMuted())
            .set ("peakDb", strip->getPeakDb());
        if (bus.kind == Bus::Kind::aux)
            auxStates.add (state.set ("output", bus.output));
        else
            outputStates.add (state);
    }

    auto* master = masterNode != nullptr
        ? dynamic_cast<ChannelStripProcessor*> (masterNode->getProcessor())
        : nullptr;
    auto masterState = Obj()
        .set ("volumeDb", master != nullptr ? master->getVolumeDb() : 0.0f)
        .set ("muted", master != nullptr && master->isMuted())
        .set ("peakDb", master != nullptr ? master->getPeakDb() : -100.0f);

    return Obj()
        .set ("layers", juce::var (layerStates))
        .set ("aux", juce::var (auxStates))
        .set ("outputs", juce::var (outputStates))
        .set ("master", masterState);
}

juce::String Engine::setLayerMix (const juce::String& layerId, const juce::var& options,
                                  juce::var& result)
{
    const int index = findLayer (layerId);
    if (index < 0)
        return utf8 ("Layer de instrumento não encontrado.");
    auto* strip = dynamic_cast<ChannelStripProcessor*> (
        layers[(size_t) index].stripNode->getProcessor());
    if (strip == nullptr)
        return utf8 ("O channel strip deste layer não está disponível.");

    auto volumeDb = strip->getVolumeDb();
    auto pan = strip->getPan();
    auto muted = strip->isMuted();
    auto solo = strip->isSolo();
    if (options.hasProperty ("volumeDb"))
    {
        const auto& value = options["volumeDb"];
        if (! (value.isInt() || value.isInt64() || value.isDouble())
            || ! std::isfinite ((double) value)
            || (double) value < -60.0 || (double) value > 6.0)
            return utf8 ("O volume deve ser um número entre -60 e +6 dB.");
        volumeDb = (float) (double) value;
    }
    if (options.hasProperty ("pan"))
    {
        const auto& value = options["pan"];
        if (! (value.isInt() || value.isInt64() || value.isDouble())
            || ! std::isfinite ((double) value)
            || (double) value < -1.0 || (double) value > 1.0)
            return utf8 ("O pan deve ser um número entre -1 (esquerda) e +1 (direita).");
        pan = (float) (double) value;
    }
    if (options.hasProperty ("muted"))
    {
        const auto& value = options["muted"];
        if (! value.isBool())
            return "O estado muted deve ser booleano.";
        muted = (bool) value;
    }
    if (options.hasProperty ("solo"))
    {
        const auto& value = options["solo"];
        if (! value.isBool())
            return "O estado solo deve ser booleano.";
        solo = (bool) value;
    }

    strip->setVolumeDb (volumeDb);
    strip->setPan (pan);
    strip->setMuted (muted);
    strip->setSolo (solo);
    updateSoloState();
    result = describeMixState();
    return {};
}

juce::String Engine::setAudioInput (const juce::var& options, juce::var& result)
{
    auto* input = audioInputNode != nullptr
        ? dynamic_cast<AudioInputProcessor*> (audioInputNode->getProcessor())
        : nullptr;
    if (input == nullptr)
        return utf8 ("O strip de entrada de áudio não está disponível.");

    const bool enabled = options.hasProperty ("enabled") ? (bool) options["enabled"] : false;
    const int channel = options.hasProperty ("inputChannel")
        ? juce::jlimit (0, 15, (int) options["inputChannel"])
        : 0;
    const bool mono = ! (options.hasProperty ("mode") && options["mode"].toString() == "stereo");
    const float volume = options.hasProperty ("volumeDb")
        ? juce::jlimit (-60.0f, 6.0f, (float) (double) options["volumeDb"])
        : 0.0f;
    const float panPosition = options.hasProperty ("pan")
        ? juce::jlimit (-1.0f, 1.0f, (float) (double) options["pan"])
        : 0.0f;
    const bool muted = options.hasProperty ("muted") && (bool) options["muted"];
    const bool protect = ! options.hasProperty ("feedbackProtection")
        || (bool) options["feedbackProtection"];
    const int output = options.hasProperty ("output")
        ? juce::jlimit (1, 4, (int) options["output"])
        : 1;

    input->configure (enabled, channel, mono, volume, panPosition, muted, protect, output);
    if (options.hasProperty ("resetFeedback") && (bool) options["resetFeedback"])
        input->resetFeedback();

    rebuildConnections();
    result = describeAudioInput();
    return {};
}

juce::var Engine::describeAudioInput() const
{
    auto* input = audioInputNode != nullptr
        ? dynamic_cast<AudioInputProcessor*> (audioInputNode->getProcessor())
        : nullptr;
    if (input == nullptr)
        return Obj().set ("enabled", false);

    return Obj()
        .set ("enabled", input->isEnabled())
        .set ("inputChannel", input->getInputChannel())
        .set ("mode", input->isMono() ? "mono" : "stereo")
        .set ("volumeDb", (double) input->getVolumeDb())
        .set ("pan", (double) input->getPan())
        .set ("muted", input->isMuted())
        .set ("feedbackProtection", input->isFeedbackProtection())
        .set ("output", input->getOutput())
        .set ("peakDb", (double) juce::Decibels::gainToDecibels (input->getPeak(), -100.0f))
        .set ("feedback", input->hasFeedback());
}

juce::String Engine::setMasterMix (const juce::var& options, juce::var& result)
{
    auto* strip = masterNode != nullptr
        ? dynamic_cast<ChannelStripProcessor*> (masterNode->getProcessor())
        : nullptr;
    if (strip == nullptr)
        return utf8 ("O channel strip Master não está disponível.");

    auto volumeDb = strip->getVolumeDb();
    auto muted = strip->isMuted();
    if (options.hasProperty ("volumeDb"))
    {
        const auto& value = options["volumeDb"];
        if (! (value.isInt() || value.isInt64() || value.isDouble())
            || ! std::isfinite ((double) value)
            || (double) value < -60.0 || (double) value > 6.0)
            return utf8 ("O volume Master deve ser um número entre -60 e +6 dB.");
        volumeDb = (float) (double) value;
    }
    if (options.hasProperty ("muted"))
    {
        const auto& value = options["muted"];
        if (! value.isBool())
            return "O estado muted Master deve ser booleano.";
        muted = (bool) value;
    }

    strip->setVolumeDb (volumeDb);
    strip->setMuted (muted);
    result = describeMixState();
    return {};
}

juce::String Engine::setMidiInputEnabled (const juce::String& identifier, bool enabled)
{
    if (! isAudioRunning())
        return utf8 ("Inicie o áudio antes (comando audioStart).");

    for (const auto& device : juce::MidiInput::getAvailableDevices())
    {
        if (device.identifier == identifier || device.name == identifier)
        {
            deviceManager.setMidiInputDeviceEnabled (device.identifier, enabled);
            return {};
        }
    }

    return utf8 ("Dispositivo MIDI não encontrado: ") + identifier;
}

// ---- Plugins -------------------------------------------------------------------
juce::StringArray Engine::getFormatNames() const
{
    juce::StringArray names;
    for (int i = 0; i < formatManager.getNumFormats(); ++i)
        names.add (formatManager.getFormat (i)->getName());
    return names;
}

juce::var Engine::pluginToVar (const juce::PluginDescription& d) const
{
    return Obj()
        .set ("id", d.createIdentifierString())
        .set ("name", d.name)
        .set ("manufacturer", d.manufacturerName)
        .set ("version", d.version)
        .set ("category", d.category)
        .set ("format", d.pluginFormatName)
        .set ("path", d.fileOrIdentifier)
        .set ("isInstrument", d.isInstrument)
        .set ("inputs", d.numInputChannels)
        .set ("outputs", d.numOutputChannels);
}

juce::var Engine::listKnownPlugins() const
{
    juce::Array<juce::var> list;
    for (const auto& description : knownPlugins.getTypes())
        list.add (pluginToVar (description));
    return juce::var (list);
}

bool Engine::beginNextScanFormat()
{
    while (scanState.nextFormatIndex < formatManager.getNumFormats())
    {
        auto* format = formatManager.getFormat (scanState.nextFormatIndex++);

        auto paths = format->getDefaultLocationsToSearch();
        for (const auto& extra : scanState.extraPaths)
            paths.add (juce::File (extra));

        if (paths.getNumPaths() == 0)
            continue;

        scanState.scanner = std::make_unique<juce::PluginDirectoryScanner> (
            knownPlugins, *format, paths, true, deadMansFile, false);
        return true;
    }

    return false;
}

void Engine::scan (const juce::StringArray& extraPaths, bool rescan, Progress progress, Done done)
{
    if (scanState.active)
    {
        done ({}, utf8 ("Já existe uma varredura em andamento."));
        return;
    }

    if (rescan)
        knownPlugins.clear();

    scanState = {};
    scanState.active     = true;
    scanState.extraPaths = extraPaths;
    scanState.progress   = std::move (progress);
    scanState.done       = std::move (done);

    if (beginNextScanFormat())
        startTimer (1);
    else
        finishScan();
}

void Engine::timerCallback()
{
    if (scanState.scanner == nullptr)
    {
        finishScan();
        return;
    }

    juce::String pluginName;
    const bool hasMore = scanState.scanner->scanNextFile (true, pluginName);

    if (pluginName.isNotEmpty() && scanState.progress)
        scanState.progress (pluginName);

    if (! hasMore)
    {
        scanState.failedFiles.addArray (scanState.scanner->getFailedFiles());
        scanState.scanner.reset();

        if (! beginNextScanFormat())
            finishScan();
    }
}

void Engine::finishScan()
{
    stopTimer();
    saveKnownPlugins();

    auto done   = std::move (scanState.done);
    auto failed = scanState.failedFiles;
    scanState = {};

    if (done)
        done (Obj()
                  .set ("count", knownPlugins.getNumTypes())
                  .set ("plugins", listKnownPlugins())
                  .set ("failed", toVarArray (failed))
                  .set ("blacklisted", toVarArray (knownPlugins.getBlacklistedFiles())),
              {});
}

void Engine::saveKnownPlugins()
{
    if (auto xml = knownPlugins.createXml())
        xml->writeTo (knownPluginsFile);
}

bool Engine::findDescription (const juce::String& key, juce::PluginDescription& out)
{
    if (auto d = knownPlugins.getTypeForIdentifierString (key)) { out = *d; return true; }
    if (auto d = knownPlugins.getTypeForFile (key))             { out = *d; return true; }

    // Ainda não passou pelo scan: pergunta direto aos formatos.
    for (int i = 0; i < formatManager.getNumFormats(); ++i)
    {
        auto* format = formatManager.getFormat (i);
        if (! format->fileMightContainThisPluginType (key))
            continue;

        juce::OwnedArray<juce::PluginDescription> found;
        format->findAllTypesForFile (found, key);

        if (! found.isEmpty())
        {
            out = *found.getFirst();
            return true;
        }
    }

    return false;
}

int Engine::findLayer (const juce::String& layerId) const
{
    for (size_t i = 0; i < layers.size(); ++i)
        if (layers[i].id == layerId)
            return (int) i;
    return -1;
}

juce::String Engine::resolveLayerId (const juce::String& layerId) const
{
    if (layerId.isNotEmpty())
        return layerId;
    return layers.empty() ? juce::String() : layers.front().id;
}

juce::AudioPluginInstance* Engine::getPlugin (const juce::String& requestedLayerId,
                                              int insertSlot) const
{
    // Um `id` de barramento ("aux1".."output4") endereça os inserts do barramento.
    if (insertSlot >= 0 && requestedLayerId.isNotEmpty())
    {
        const int busIndex = findBus (requestedLayerId);
        if (busIndex >= 0)
        {
            if (insertSlot >= kMaxInserts)
                return nullptr;
            const auto& node = buses[(size_t) busIndex].insertNodes[(size_t) insertSlot];
            return node != nullptr
                ? dynamic_cast<juce::AudioPluginInstance*> (node->getProcessor())
                : nullptr;
        }
    }

    const auto layerId = resolveLayerId (requestedLayerId);
    const int index = findLayer (layerId);
    if (index < 0)
        return nullptr;

    const auto& layer = layers[(size_t) index];
    Graph::Node::Ptr node;
    if (insertSlot < 0)
    {
        node = layer.pluginNode;
    }
    else if (insertSlot < kMaxInserts)
    {
        node = layer.insertNodes[(size_t) insertSlot];
    }

    if (node == nullptr)
        return nullptr;
    return dynamic_cast<juce::AudioPluginInstance*> (node->getProcessor());
}

int Engine::findBus (const juce::String& busId) const
{
    for (size_t i = 0; i < buses.size(); ++i)
        if (buses[i].id == busId)
            return (int) i;
    return -1;
}

juce::String Engine::outputBusId (int output) const
{
    return "output" + juce::String (juce::jlimit (1, kOutputBuses, output));
}

Engine::Graph::Node::Ptr* Engine::insertSlotNode (const juce::String& ownerId, int slot)
{
    if (slot < 0 || slot >= kMaxInserts)
        return nullptr;

    if (ownerId.isNotEmpty())
        if (const int busIndex = findBus (ownerId); busIndex >= 0)
            return &buses[(size_t) busIndex].insertNodes[(size_t) slot];

    const int layerIndex = findLayer (resolveLayerId (ownerId));
    if (layerIndex < 0)
        return nullptr;
    return &layers[(size_t) layerIndex].insertNodes[(size_t) slot];
}

bool* Engine::insertSlotBypass (const juce::String& ownerId, int slot)
{
    if (slot < 0 || slot >= kMaxInserts)
        return nullptr;

    if (ownerId.isNotEmpty())
        if (const int busIndex = findBus (ownerId); busIndex >= 0)
            return &buses[(size_t) busIndex].insertBypass[(size_t) slot];

    const int layerIndex = findLayer (resolveLayerId (ownerId));
    if (layerIndex < 0)
        return nullptr;
    return &layers[(size_t) layerIndex].insertBypass[(size_t) slot];
}

void Engine::loadPlugin (const juce::String& idOrPath, const juce::String& requestedLayerId,
                         int minNote, int maxNote, Done done, bool staged, bool pinned)
{
    juce::PluginDescription description;
    if (! findDescription (idOrPath, description))
    {
        done ({}, utf8 ("Plugin não encontrado: ") + idOrPath);
        return;
    }
    if (minNote < 0 || maxNote > 127 || minNote > maxNote)
    {
        done ({}, utf8 ("A região do layer deve estar entre as notas 0 e 127, com início menor ou igual ao fim."));
        return;
    }

    const auto layerId = requestedLayerId.isNotEmpty() ? requestedLayerId : juce::Uuid().toString();
    if (findLayer (layerId) >= 0 || loadingLayerIds.contains (layerId))
    {
        done ({}, utf8 ("Já existe um instrumento com este identificador de layer."));
        return;
    }

    const auto pluginId = description.createIdentifierString();

    // Reaproveita a instância do mesmo plugin do patch atual (ou de um que ainda toca).
    // Strips do concert/set (pinned) não são reaproveitados: continuam carregados.
    if (staged)
    {
        for (int i = 0; i < (int) layers.size(); ++i)
        {
            auto& candidate = layers[(size_t) i];
            if (candidate.pluginId != pluginId || candidate.pinned)
                continue;
            if (candidate.role != Layer::Role::active && candidate.role != Layer::Role::lingering)
                continue;

            Layer layer;
            layer.id = layerId;
            layer.pluginId = pluginId;
            layer.minNote = minNote;
            layer.maxNote = maxNote;
            layer.role = Layer::Role::adopted;
            layer.pluginNode = candidate.pluginNode;   // a instância continua viva e soando
            layer.midiFilterNode = graph.addNode (std::make_unique<NoteRangeFilter>());
            layer.stripNode = graph.addNode (std::make_unique<ChannelStripProcessor> (&soloLayerCount));

            if (layer.midiFilterNode == nullptr || layer.stripNode == nullptr)
            {
                if (layer.midiFilterNode != nullptr) graph.removeNode (layer.midiFilterNode->nodeID);
                if (layer.stripNode != nullptr) graph.removeNode (layer.stripNode->nodeID);
                done ({}, utf8 ("Não foi possível adicionar o instrumento ao grafo de áudio."));
                return;
            }
            if (auto* filter = dynamic_cast<NoteRangeFilter*> (layer.midiFilterNode->getProcessor()))
            {
                filter->setRange (minNote, maxNote);
                filter->setTranspose (transposeSemitones.load());
            }

            // Some com o layer antigo, mas preserva o nó do plugin (agora é do novo layer).
            // Os inserts do patch anterior não seguem junto: o patch novo recarrega os seus.
            destroyEditorWindowsFor (candidate.id);
            for (auto& insertNode : candidate.insertNodes)
                if (insertNode != nullptr)
                {
                    graph.removeNode (insertNode->nodeID);
                    insertNode = nullptr;
                }
            for (auto& sendNode : candidate.sendNodes)
                if (sendNode != nullptr)
                {
                    graph.removeNode (sendNode->nodeID);
                    sendNode = nullptr;
                }
            candidate.pluginNode = nullptr;
            if (candidate.midiFilterNode != nullptr) graph.removeNode (candidate.midiFilterNode->nodeID);
            if (candidate.stripNode != nullptr) graph.removeNode (candidate.stripNode->nodeID);
            layers.erase (layers.begin() + i);

            layers.push_back (std::move (layer));
            updateSoloState();
            rebuildConnections();
            done (describeLoadedPlugin (layerId), {});
            return;
        }
    }

    loadingLayerIds.add (layerId);

    const double sampleRate = graph.getSampleRate() > 0 ? graph.getSampleRate() : 44100.0;
    const int blockSize     = graph.getBlockSize() > 0 ? graph.getBlockSize() : 512;
    std::weak_ptr<bool> alive = aliveFlag;

    formatManager.createPluginInstanceAsync (
        description, sampleRate, blockSize,
        [this, alive, done, layerId, pluginId, minNote, maxNote, staged, pinned] (
            std::unique_ptr<juce::AudioPluginInstance> instance, const juce::String& error)
        {
            const auto stillAlive = alive.lock();
            if (stillAlive == nullptr || ! *stillAlive)
                return;

            loadingLayerIds.removeString (layerId);
            if (instance == nullptr)
            {
                done ({}, error.isNotEmpty() ? error : juce::String (utf8 ("Falha ao criar a instância do plugin.")));
                return;
            }

            Layer layer;
            layer.id = layerId;
            layer.pluginId = pluginId;
            layer.minNote = minNote;
            layer.maxNote = maxNote;
            layer.role = staged ? Layer::Role::staged : Layer::Role::active;
            layer.pinned = pinned;
            layer.midiFilterNode = graph.addNode (std::make_unique<NoteRangeFilter>());
            layer.pluginNode = graph.addNode (std::move (instance));
            layer.stripNode = graph.addNode (
                std::make_unique<ChannelStripProcessor> (&soloLayerCount));
            if (layer.midiFilterNode == nullptr || layer.pluginNode == nullptr
                || layer.stripNode == nullptr)
            {
                if (layer.midiFilterNode != nullptr) graph.removeNode (layer.midiFilterNode->nodeID);
                if (layer.pluginNode != nullptr) graph.removeNode (layer.pluginNode->nodeID);
                if (layer.stripNode != nullptr) graph.removeNode (layer.stripNode->nodeID);
                done ({}, utf8 ("Não foi possível adicionar o instrumento ao grafo de áudio."));
                return;
            }
            if (auto* filter = dynamic_cast<NoteRangeFilter*> (layer.midiFilterNode->getProcessor()))
            {
                filter->setRange (minNote, maxNote);
                filter->setTranspose (transposeSemitones.load());
            }

            layers.push_back (std::move (layer));
            updateSoloState();
            rebuildConnections();
            done (describeLoadedPlugin (layerId), {});
        });
}

void Engine::stagePlugin (const juce::String& idOrPath, const juce::String& layerId,
                          int minNote, int maxNote, Done done)
{
    loadPlugin (idOrPath, layerId, minNote, maxNote, std::move (done), true);
}

juce::var Engine::commitPatchSwap (bool silencePrevious)
{
    for (auto& layer : layers)
    {
        // Strips do concert/set não pertencem a nenhum patch: seguem como estão.
        if (layer.pinned)
            continue;
        if (layer.role == Layer::Role::staged || layer.role == Layer::Role::adopted)
            layer.role = Layer::Role::active;
        else if (layer.role == Layer::Role::active)
            layer.role = Layer::Role::lingering;
    }

    // "Silence Previous Patch": corta o patch anterior na hora, sem esperar as caudas.
    if (silencePrevious)
    {
        juce::StringArray toUnload;
        for (const auto& layer : layers)
            if (layer.role == Layer::Role::lingering)
                toUnload.add (layer.id);
        for (const auto& id : toUnload)
            unloadPlugin (id);
    }

    rebuildConnections();
    updateSoloState();
    updateTailTimer();

    juce::Array<juce::var> active, lingering;
    for (const auto& layer : layers)
    {
        if (layer.role == Layer::Role::active)
            active.add (layer.id);
        else if (layer.role == Layer::Role::lingering)
            lingering.add (layer.id);
    }

    return Obj()
        .set ("active", juce::var (active))
        .set ("lingering", juce::var (lingering));
}

bool Engine::unloadPlugin (const juce::String& requestedLayerId)
{
    if (requestedLayerId.isEmpty())
    {
        const bool hadLayers = ! layers.empty();
        while (! layers.empty())
            unloadPlugin (layers.back().id);
        return hadLayers;
    }

    const int index = findLayer (requestedLayerId);
    if (index < 0)
        return false;
    const auto layer = layers[(size_t) index];
    destroyEditorWindowsFor (layer.id);
    for (const auto& insertNode : layer.insertNodes)
        if (insertNode != nullptr)
            graph.removeNode (insertNode->nodeID);
    for (const auto& sendNode : layer.sendNodes)
        if (sendNode != nullptr)
            graph.removeNode (sendNode->nodeID);
    if (layer.pluginNode != nullptr) graph.removeNode (layer.pluginNode->nodeID);
    if (layer.midiFilterNode != nullptr) graph.removeNode (layer.midiFilterNode->nodeID);
    if (layer.stripNode != nullptr) graph.removeNode (layer.stripNode->nodeID);
    for (int slot = 0; slot < kMaxInserts; ++slot)
        loadingInsertKeys.removeString (layer.id + "#" + juce::String (slot));
    layers.erase (layers.begin() + index);
    updateSoloState();
    rebuildConnections();
    return true;
}

juce::String Engine::setLayerRange (const juce::String& layerId, int minNote, int maxNote)
{
    const int index = findLayer (layerId);
    if (index < 0)
        return utf8 ("Layer de instrumento não encontrado.");
    if (minNote < 0 || maxNote > 127 || minNote > maxNote)
        return utf8 ("A região do layer deve estar entre as notas 0 e 127, com início menor ou igual ao fim.");

    auto& layer = layers[(size_t) index];
    layer.minNote = minNote;
    layer.maxNote = maxNote;
    if (auto* filter = dynamic_cast<NoteRangeFilter*> (layer.midiFilterNode->getProcessor()))
        filter->setRange (minNote, maxNote);
    return {};
}

juce::String Engine::setLayerVelocityRange (const juce::String& layerId, int minVelocity, int maxVelocity)
{
    const int index = findLayer (layerId);
    if (index < 0)
        return utf8 ("Layer de instrumento não encontrado.");
    if (minVelocity < 1 || maxVelocity > 127 || minVelocity > maxVelocity)
        return utf8 ("A faixa de velocity deve estar entre 1 e 127, com início menor ou igual ao fim.");

    auto& layer = layers[(size_t) index];
    if (auto* filter = dynamic_cast<NoteRangeFilter*> (layer.midiFilterNode->getProcessor()))
        filter->setVelocityRange (minVelocity, maxVelocity);
    return {};
}

juce::String Engine::setTranspose (int semitones)
{
    if (semitones < -72 || semitones > 72)
        return utf8 ("O transpose deve estar entre -72 e +72 semitons.");

    transposeSemitones.store (semitones);
    for (auto& layer : layers)
        if (auto* filter = dynamic_cast<NoteRangeFilter*> (layer.midiFilterNode->getProcessor()))
            filter->setTranspose (semitones);
    return {};
}

juce::String Engine::setMidiThru (const juce::var& options)
{
    auto* filter = midiThruNode != nullptr
        ? dynamic_cast<MidiThruFilter*> (midiThruNode->getProcessor())
        : nullptr;
    if (filter == nullptr)
        return utf8 ("O filtro de MIDI Thru não está disponível.");

    filter->clear();
    const auto& blocked = options["blocked"];
    if (! blocked.isArray())
        return {};

    auto typeIndex = [] (const juce::String& type) -> int
    {
        if (type == "cc") return 0;
        if (type == "note") return 1;
        if (type == "pitch") return 2;
        if (type == "aftertouch") return 3;
        if (type == "pc") return 4;
        return -1;
    };

    for (int index = 0; index < blocked.size(); ++index)
    {
        const auto& item = blocked[index];
        const int type = typeIndex (item["type"].toString());
        if (type < 0) continue;
        filter->setBlocked (type,
                            (int) item["channel"],
                            (int) item["number"],
                            true);
    }
    return {};
}

// ---- Inserts (efeitos por channel strip, Fase 3.1) ------------------------------

juce::var Engine::describeInsert (const juce::String& ownerId, int slot) const
{
    const bool validSlot = slot >= 0 && slot < kMaxInserts;
    const int busIndex = ownerId.isNotEmpty() ? findBus (ownerId) : -1;
    const int layerIndex = busIndex >= 0 ? -1 : findLayer (resolveLayerId (ownerId));
    const bool ownerExists = busIndex >= 0 || layerIndex >= 0;
    auto* plugin = validSlot ? getPlugin (ownerId, slot) : nullptr;
    const bool loaded = ownerExists && validSlot && plugin != nullptr;
    bool bypass = false;
    if (ownerExists && validSlot)
        bypass = busIndex >= 0 ? buses[(size_t) busIndex].insertBypass[(size_t) slot]
                               : layers[(size_t) layerIndex].insertBypass[(size_t) slot];

    auto out = Obj()
        .set ("layerId", ownerId.isNotEmpty() ? ownerId : resolveLayerId (ownerId))
        .set ("slot", slot)
        .set ("loaded", loaded)
        .set ("bypass", bypass);

    if (! loaded)
        return out.set ("id", juce::String())
                   .set ("name", juce::String())
                   .set ("manufacturer", juce::String())
                   .set ("format", juce::String())
                   .set ("path", juce::String())
                   .set ("inputs", 0)
                   .set ("outputs", 0);

    const auto description = plugin->getPluginDescription();
    return out.set ("id", description.createIdentifierString())
               .set ("name", description.name)
               .set ("manufacturer", description.manufacturerName)
               .set ("format", description.pluginFormatName)
               .set ("path", description.fileOrIdentifier)
               .set ("inputs", plugin->getTotalNumInputChannels())
               .set ("outputs", plugin->getTotalNumOutputChannels());
}

juce::var Engine::describeInserts (const juce::String& layerId) const
{
    juce::Array<juce::var> list;
    for (int slot = 0; slot < kMaxInserts; ++slot)
        list.add (describeInsert (layerId, slot));
    return juce::var (list);
}

void Engine::setInsert (const juce::String& requestedOwnerId, int slot,
                        const juce::String& idOrPath, bool bypass, Done done)
{
    if (insertSlotNode (requestedOwnerId, slot) == nullptr)
    {
        if (slot < 0 || slot >= kMaxInserts)
            done ({}, utf8 ("Slot de insert inválido (use 0 a ") + juce::String (kMaxInserts - 1) + ").");
        else
            done ({}, utf8 ("Channel strip não encontrado para carregar o efeito."));
        return;
    }

    // O host pode ser um layer ou um barramento (aux/output).
    const bool isBus = requestedOwnerId.isNotEmpty() && findBus (requestedOwnerId) >= 0;
    const auto ownerId = isBus ? requestedOwnerId : resolveLayerId (requestedOwnerId);

    juce::PluginDescription description;
    if (! findDescription (idOrPath, description))
    {
        done ({}, utf8 ("Plugin não encontrado: ") + idOrPath);
        return;
    }

    const auto key = ownerId + "#" + juce::String (slot);
    if (loadingInsertKeys.contains (key))
    {
        done ({}, utf8 ("Este slot de insert já está carregando."));
        return;
    }
    loadingInsertKeys.add (key);

    const double sampleRate = graph.getSampleRate() > 0 ? graph.getSampleRate() : 44100.0;
    const int blockSize     = graph.getBlockSize() > 0 ? graph.getBlockSize() : 512;
    std::weak_ptr<bool> alive = aliveFlag;

    formatManager.createPluginInstanceAsync (
        description, sampleRate, blockSize,
        [this, alive, done, ownerId, slot, bypass] (
            std::unique_ptr<juce::AudioPluginInstance> instance, const juce::String& error)
        {
            const auto stillAlive = alive.lock();
            if (stillAlive == nullptr || ! *stillAlive)
                return;

            loadingInsertKeys.removeString (ownerId + "#" + juce::String (slot));
            if (instance == nullptr)
            {
                done ({}, error.isNotEmpty() ? error
                                             : juce::String (utf8 ("Falha ao criar a instância do efeito.")));
                return;
            }

            auto* slotNode = insertSlotNode (ownerId, slot);
            if (slotNode == nullptr)
            {
                // O channel strip foi removido enquanto o efeito carregava.
                done ({}, utf8 ("O channel strip foi removido antes do efeito terminar de carregar."));
                return;
            }

            if (*slotNode != nullptr)
            {
                destroyEditorWindow (editorKey (ownerId, slot));
                graph.removeNode ((*slotNode)->nodeID);
                *slotNode = nullptr;
            }

            auto node = graph.addNode (std::move (instance));
            if (node == nullptr)
            {
                done ({}, utf8 ("Não foi possível adicionar o efeito ao grafo de áudio."));
                return;
            }

            *slotNode = node;
            if (auto* bypassPtr = insertSlotBypass (ownerId, slot))
                *bypassPtr = bypass;
            rebuildConnections();
            done (describeInsert (ownerId, slot), {});
        });
}

juce::String Engine::removeInsert (const juce::String& requestedOwnerId, int slot, juce::var& result)
{
    auto* slotNode = insertSlotNode (requestedOwnerId, slot);
    if (slotNode == nullptr)
        return slot < 0 || slot >= kMaxInserts
            ? juce::String (utf8 ("Slot de insert inválido."))
            : juce::String (utf8 ("Channel strip não encontrado para remover o efeito."));

    const bool isBus = requestedOwnerId.isNotEmpty() && findBus (requestedOwnerId) >= 0;
    const auto ownerId = isBus ? requestedOwnerId : resolveLayerId (requestedOwnerId);
    if (*slotNode != nullptr)
    {
        destroyEditorWindow (editorKey (ownerId, slot));
        graph.removeNode ((*slotNode)->nodeID);
        *slotNode = nullptr;
    }
    if (auto* bypassPtr = insertSlotBypass (ownerId, slot))
        *bypassPtr = false;
    rebuildConnections();
    result = describeInsert (ownerId, slot);
    return {};
}

juce::String Engine::setInsertBypass (const juce::String& requestedOwnerId, int slot, bool bypass,
                                      juce::var& result)
{
    auto* bypassPtr = insertSlotBypass (requestedOwnerId, slot);
    if (bypassPtr == nullptr)
        return slot < 0 || slot >= kMaxInserts
            ? juce::String (utf8 ("Slot de insert inválido."))
            : juce::String (utf8 ("Channel strip não encontrado para o efeito."));

    const bool isBus = requestedOwnerId.isNotEmpty() && findBus (requestedOwnerId) >= 0;
    const auto ownerId = isBus ? requestedOwnerId : resolveLayerId (requestedOwnerId);
    *bypassPtr = bypass;
    rebuildConnections();
    result = describeInsert (ownerId, slot);
    return {};
}

// ---- Sends e Aux/Output (Fase 3.2) ----------------------------------------------

juce::var Engine::describeBuses() const
{
    juce::Array<juce::var> list;
    for (const auto& bus : buses)
    {
        auto* strip = bus.stripNode != nullptr
            ? dynamic_cast<ChannelStripProcessor*> (bus.stripNode->getProcessor())
            : nullptr;
        auto state = Obj()
            .set ("bus", bus.id)
            .set ("kind", bus.kind == Bus::Kind::aux ? "aux" : "output")
            .set ("index", bus.index + 1)
            .set ("volumeDb", strip != nullptr ? strip->getVolumeDb() : 0.0f)
            .set ("pan", strip != nullptr ? strip->getPan() : 0.0f)
            .set ("muted", strip != nullptr && strip->isMuted())
            .set ("peakDb", strip != nullptr ? strip->getPeakDb() : -100.0f);
        if (bus.kind == Bus::Kind::aux)
            state = state.set ("output", bus.output);
        list.add (state);
    }
    return juce::var (list);
}

juce::String Engine::setBusMix (const juce::String& busId, const juce::var& options, juce::var& result)
{
    const int index = findBus (busId);
    if (index < 0)
        return utf8 ("Barramento não encontrado (use aux1..aux4 ou output1..output4).");

    auto& bus = buses[(size_t) index];
    auto* strip = bus.stripNode != nullptr
        ? dynamic_cast<ChannelStripProcessor*> (bus.stripNode->getProcessor())
        : nullptr;
    if (strip == nullptr)
        return utf8 ("O channel strip deste barramento não está disponível.");

    auto volumeDb = strip->getVolumeDb();
    auto pan = strip->getPan();
    auto muted = strip->isMuted();
    auto output = bus.output;
    if (options.hasProperty ("volumeDb"))
    {
        const auto& value = options["volumeDb"];
        if (! (value.isInt() || value.isInt64() || value.isDouble())
            || ! std::isfinite ((double) value)
            || (double) value < -60.0 || (double) value > 6.0)
            return utf8 ("O volume deve ser um número entre -60 e +6 dB.");
        volumeDb = (float) (double) value;
    }
    if (options.hasProperty ("pan"))
    {
        const auto& value = options["pan"];
        if (! (value.isInt() || value.isInt64() || value.isDouble())
            || ! std::isfinite ((double) value)
            || (double) value < -1.0 || (double) value > 1.0)
            return utf8 ("O pan deve ser um número entre -1 (esquerda) e +1 (direita).");
        pan = (float) (double) value;
    }
    if (options.hasProperty ("muted"))
    {
        const auto& value = options["muted"];
        if (! value.isBool())
            return "O estado muted deve ser booleano.";
        muted = (bool) value;
    }
    if (options.hasProperty ("output"))
    {
        const auto& value = options["output"];
        if (! (value.isInt() || value.isInt64())
            || (int) value < 1 || (int) value > kOutputBuses)
            return utf8 ("A saída deve ser um número entre 1 e ") + juce::String (kOutputBuses) + ".";
        output = (int) value;
    }

    strip->setVolumeDb (volumeDb);
    strip->setPan (pan);
    strip->setMuted (muted);

    // Só os Aux redirecionam: mudar a saída altera o roteamento do grafo.
    const bool routingChanged = bus.output != output;
    bus.output = output;
    if (routingChanged)
        rebuildConnections();

    result = describeBuses();
    return {};
}

juce::String Engine::setSend (const juce::String& layerId, int aux, double levelDb)
{
    const int index = findLayer (layerId);
    if (index < 0)
        return utf8 ("Layer de instrumento não encontrado.");
    if (aux < 1 || aux > kAuxBuses)
        return utf8 ("Envie para um Aux entre 1 e ") + juce::String (kAuxBuses) + ".";
    if (! std::isfinite (levelDb) || levelDb < (double) kSendOffDb || levelDb > 6.0)
        return utf8 ("O nível do send deve ser um número entre -60 (desligado) e +6 dB.");

    auto& layer = layers[(size_t) index];
    const int auxIndex = aux - 1;
    layer.sendLevelDb[(size_t) auxIndex] = (float) levelDb;

    if (levelDb > (double) kSendOffDb && layer.sendNodes[(size_t) auxIndex] == nullptr)
    {
        auto node = graph.addNode (std::make_unique<SendGainProcessor>());
        if (node == nullptr)
            return utf8 ("Não foi possível criar o send para o Aux.");
        layer.sendNodes[(size_t) auxIndex] = node;
    }

    if (auto& sendNode = layer.sendNodes[(size_t) auxIndex])
        if (auto* send = dynamic_cast<SendGainProcessor*> (sendNode->getProcessor()))
            send->setGainDb ((float) levelDb);

    rebuildConnections();
    return {};
}

juce::String Engine::setLayerOutput (const juce::String& layerId, int output)
{
    const int index = findLayer (layerId);
    if (index < 0)
        return utf8 ("Layer de instrumento não encontrado.");
    if (output < 1 || output > kOutputBuses)
        return utf8 ("A saída deve ser um número entre 1 e ") + juce::String (kOutputBuses) + ".";

    layers[(size_t) index].output = output;
    rebuildConnections();
    return {};
}

juce::var Engine::describeLoadedPlugin (const juce::String& requestedLayerId) const
{
    const auto layerId = resolveLayerId (requestedLayerId);
    const int index = findLayer (layerId);
    auto* plugin = getPlugin (layerId);
    if (index < 0 || plugin == nullptr)
        return {};

    const auto& layer = layers[(size_t) index];
    const auto description = plugin->getPluginDescription();
    int automatableCount = 0;
    for (auto* parameter : plugin->getParameters())
        if (parameter->isAutomatable()) ++automatableCount;

    return Obj()
        .set ("layerId", layer.id)
        .set ("id", description.createIdentifierString())
        .set ("name", description.name)
        .set ("manufacturer", description.manufacturerName)
        .set ("format", description.pluginFormatName)
        .set ("path", description.fileOrIdentifier)
        .set ("isInstrument", description.isInstrument)
        .set ("inputs", plugin->getTotalNumInputChannels())
        .set ("outputs", plugin->getTotalNumOutputChannels())
        .set ("minNote", layer.minNote)
        .set ("maxNote", layer.maxNote)
        .set ("pinned", layer.pinned)
        .set ("parameterCount", automatableCount)
        .set ("parameterCountTotal", plugin->getParameters().size());
}

juce::var Engine::describeLoadedPlugins() const
{
    juce::Array<juce::var> list;
    for (const auto& layer : layers)
        list.add (describeLoadedPlugin (layer.id));
    return juce::var (list);
}

juce::var Engine::listParameters (const juce::String& requestedLayerId, bool includeNonAutomatable) const
{
    juce::Array<juce::var> list;
    if (auto* plugin = getPlugin (requestedLayerId))
    {
        const auto& params = plugin->getParameters();
        for (int i = 0; i < params.size(); ++i)
            if (includeNonAutomatable || params[i]->isAutomatable())
                list.add (parameterToVar (*params[i], i));
    }
    return juce::var (list);
}

juce::String Engine::setParameter (const juce::String& layerId, int index, float normalizedValue, juce::var& result)
{
    auto* plugin = getPlugin (layerId);
    if (plugin == nullptr) return "Nenhum instrumento carregado neste layer.";
    const auto& params = plugin->getParameters();
    if (! juce::isPositiveAndBelow (index, params.size()))
        return utf8 ("Índice de parâmetro inválido: ") + juce::String (index);
    auto* parameter = params[index];
    parameter->setValueNotifyingHost (juce::jlimit (0.0f, 1.0f, normalizedValue));
    result = parameterToVar (*parameter, index);
    return {};
}

juce::String Engine::getParameter (const juce::String& layerId, int index, juce::var& result) const
{
    auto* plugin = getPlugin (layerId);
    if (plugin == nullptr) return "Nenhum instrumento carregado neste layer.";
    const auto& params = plugin->getParameters();
    if (! juce::isPositiveAndBelow (index, params.size()))
        return utf8 ("Índice de parâmetro inválido: ") + juce::String (index);
    result = parameterToVar (*params[index], index);
    return {};
}

juce::String Engine::getPluginState (const juce::String& layerId, juce::var& result,
                                     int insertSlot) const
{
    auto* plugin = getPlugin (layerId, insertSlot);
    if (plugin == nullptr)
        return insertSlot < 0 ? juce::String (utf8 ("Nenhum instrumento carregado neste layer."))
                              : juce::String (utf8 ("Nenhum efeito carregado neste slot."));

    juce::MemoryBlock state;
    plugin->getStateInformation (state);
    auto out = Obj()
        .set ("layerId", resolveLayerId (layerId))
        .set ("data", juce::Base64::toBase64 (state.getData(), state.getSize()));
    if (insertSlot >= 0)
        out = out.set ("slot", insertSlot);
    result = out;
    return {};
}

juce::String Engine::setPluginState (const juce::String& layerId, const juce::String& base64,
                                     juce::var& result, int insertSlot)
{
    auto* plugin = getPlugin (layerId, insertSlot);
    if (plugin == nullptr)
        return insertSlot < 0 ? juce::String (utf8 ("Nenhum instrumento carregado neste layer."))
                              : juce::String (utf8 ("Nenhum efeito carregado neste slot."));

    juce::MemoryOutputStream decoded;
    if (! juce::Base64::convertFromBase64 (decoded, base64))
        return utf8 ("Estado do plugin inválido (base64).");

    plugin->setStateInformation (decoded.getData(), (int) decoded.getDataSize());
    auto out = Obj()
        .set ("layerId", resolveLayerId (layerId))
        .set ("bytes", (int) decoded.getDataSize());
    if (insertSlot >= 0)
        out = out.set ("slot", insertSlot);
    result = out;
    return {};
}

juce::String Engine::editorKey (const juce::String& layerId, int insertSlot) const
{
    return insertSlot < 0 ? layerId : layerId + "#insert#" + juce::String (insertSlot);
}

juce::String Engine::openPluginEditor (const juce::String& requestedLayerId, juce::var& result,
                                       int insertSlot)
{
    const auto layerId = resolveLayerId (requestedLayerId);
    auto* plugin = getPlugin (layerId, insertSlot);
    if (plugin == nullptr)
        return insertSlot < 0 ? juce::String (utf8 ("Nenhum instrumento carregado neste layer."))
                              : juce::String (utf8 ("Nenhum efeito carregado neste slot."));

    const auto key = editorKey (layerId, insertSlot);

    if (auto existing = editorWindows.find (key); existing != editorWindows.end())
    {
        existing->second->toFront (true);
        auto open = Obj().set ("layerId", layerId).set ("open", true);
        if (insertSlot >= 0) open = open.set ("slot", insertSlot);
        result = open;
        return {};
    }

    auto* editor = plugin->createEditorIfNeeded();
    if (editor == nullptr)
        return utf8 ("Este plugin não tem janela de edição.");

    std::weak_ptr<bool> alive = aliveFlag;
    editorWindows[key] = std::make_unique<PluginEditorWindow> (
        plugin->getName(), editor,
        [this, alive, key]
        {
            if (auto stillAlive = alive.lock(); stillAlive != nullptr && *stillAlive)
                destroyEditorWindow (key);
        });

    auto open = Obj().set ("layerId", layerId).set ("open", true);
    if (insertSlot >= 0) open = open.set ("slot", insertSlot);
    result = open;
    return {};
}

juce::String Engine::closePluginEditor (const juce::String& requestedLayerId, juce::var& result,
                                        int insertSlot)
{
    const auto layerId = resolveLayerId (requestedLayerId);
    destroyEditorWindow (editorKey (layerId, insertSlot));
    auto closed = Obj().set ("layerId", layerId).set ("open", false);
    if (insertSlot >= 0) closed = closed.set ("slot", insertSlot);
    result = closed;
    return {};
}

bool Engine::destroyEditorWindow (const juce::String& key)
{
    const auto it = editorWindows.find (key);
    if (it == editorWindows.end())
        return false;

    editorWindows.erase (it);
    return true;
}

void Engine::destroyEditorWindowsFor (const juce::String& layerId)
{
    const auto prefix = layerId + "#insert#";
    for (auto it = editorWindows.begin(); it != editorWindows.end();)
    {
        if (it->first == layerId || it->first.startsWith (prefix))
            it = editorWindows.erase (it);
        else
            ++it;
    }
}

// ---- Grafo ---------------------------------------------------------------------
void Engine::changeListenerCallback (juce::ChangeBroadcaster*)
{
    // O dispositivo de áudio mudou (nº de canais, taxa...): reconecta o grafo.
    rebuildConnections();
}

void Engine::rebuildConnections()
{
    for (const auto& connection : graph.getConnections())
        graph.removeConnection (connection);

    const int graphIn  = graph.getMainBusNumInputChannels();
    const int graphOut = graph.getMainBusNumOutputChannels();
    if (masterNode != nullptr && audioOutNode != nullptr)
        for (int ch = 0; ch < juce::jmin (2, graphOut); ++ch)
            graph.addConnection ({ { masterNode->nodeID, ch }, { audioOutNode->nodeID, ch } });

    if (midiInNode != nullptr && midiThruNode != nullptr)
        graph.addConnection ({ { midiInNode->nodeID, Graph::midiChannelIndex },
                               { midiThruNode->nodeID, Graph::midiChannelIndex } });

    // Liga `from` → `to` respeitando mono/estéreo: fonte mono duplica no canal
    // direito; destino mono soma os dois canais (canais de insert podem ser mono).
    auto connectAudio = [this] (Graph::Node::Ptr from, Graph::Node::Ptr to)
    {
        if (from == nullptr || to == nullptr)
            return;
        auto* fromProc = from->getProcessor();
        auto* toProc = to->getProcessor();
        if (fromProc == nullptr || toProc == nullptr)
            return;

        const int outCh = juce::jmax (1, fromProc->getMainBusNumOutputChannels());
        const int inCh  = juce::jmax (1, toProc->getMainBusNumInputChannels());

        if (inCh == 1 && outCh >= 2)
        {
            for (int ch = 0; ch < juce::jmin (2, outCh); ++ch)
                graph.addConnection ({ { from->nodeID, ch }, { to->nodeID, 0 } });
            return;
        }

        for (int ch = 0; ch < juce::jmin (2, outCh, inCh); ++ch)
            graph.addConnection ({ { from->nodeID, ch }, { to->nodeID, ch } });
        if (outCh == 1 && inCh >= 2)
            graph.addConnection ({ { from->nodeID, 0 }, { to->nodeID, 1 } });
    };

    // Liga uma fonte ao barramento passando pela cadeia de inserts (pulando os com bypass).
    auto connectToBus = [&connectAudio] (Graph::Node::Ptr source, const Bus& bus)
    {
        if (source == nullptr || bus.stripNode == nullptr)
            return;

        Graph::Node::Ptr previous = source;
        for (int slot = 0; slot < kMaxInserts; ++slot)
        {
            if (bus.insertNodes[(size_t) slot] == nullptr || bus.insertBypass[(size_t) slot])
                continue;
            connectAudio (previous, bus.insertNodes[(size_t) slot]);
            previous = bus.insertNodes[(size_t) slot];
        }
        connectAudio (previous, bus.stripNode);
    };

    // Strip de entrada de áudio (guitarra/microfone, Fase 3.5). O canal do
    // dispositivo escolhido entra no processador; em estéreo usa também o seguinte.
    if (audioInputNode != nullptr && graphIn > 0)
    {
        if (auto* input = dynamic_cast<AudioInputProcessor*> (audioInputNode->getProcessor());
            input != nullptr && input->isEnabled())
        {
            const int start = juce::jlimit (0, graphIn - 1, input->getInputChannel());
            graph.addConnection ({ { audioInNode->nodeID, start }, { audioInputNode->nodeID, 0 } });
            if (! input->isMono() && start + 1 < graphIn)
                graph.addConnection ({ { audioInNode->nodeID, start + 1 }, { audioInputNode->nodeID, 1 } });

            if (const int outIndex = findBus (outputBusId (input->getOutput())); outIndex >= 0)
                connectToBus (audioInputNode, buses[(size_t) outIndex]);
        }
    }

    // Output → Master.
    for (const auto& bus : buses)
        if (bus.kind == Bus::Kind::output && bus.stripNode != nullptr)
            for (int ch = 0; ch < 2; ++ch)
                graph.addConnection ({ { bus.stripNode->nodeID, ch }, { masterNode->nodeID, ch } });

    // Aux → Output escolhido.
    for (const auto& bus : buses)
    {
        if (bus.kind != Bus::Kind::aux || bus.stripNode == nullptr)
            continue;
        if (const int outIndex = findBus (outputBusId (bus.output)); outIndex >= 0)
            connectToBus (bus.stripNode, buses[(size_t) outIndex]);
    }

    for (const auto& layer : layers)
    {
        auto* plugin = getPlugin (layer.id);
        if (plugin == nullptr || layer.stripNode == nullptr)
            continue;

        const bool audible = layer.role != Layer::Role::staged;
        // Strip do concert/set (pinned) vale como atual mesmo fora da troca de patch.
        const bool current = layer.role == Layer::Role::active || layer.pinned;

        // Cadeia de áudio: instrumento → inserts (pulando os com bypass) → channel strip.
        Graph::Node::Ptr previous = layer.pluginNode;
        for (int slot = 0; slot < kMaxInserts; ++slot)
        {
            if (layer.insertNodes[(size_t) slot] == nullptr || layer.insertBypass[(size_t) slot])
                continue;
            connectAudio (previous, layer.insertNodes[(size_t) slot]);
            previous = layer.insertNodes[(size_t) slot];
        }
        connectAudio (previous, layer.stripNode);

        // O channel strip manda o áudio para a saída (Output 1..4) escolhida.
        if (audible)
            if (const int outIndex = findBus (outputBusId (layer.output)); outIndex >= 0)
                connectToBus (layer.stripNode, buses[(size_t) outIndex]);

        // Sends post-fader para os Aux (partem do strip, depois do volume).
        for (int aux = 0; aux < kAuxBuses; ++aux)
        {
            const auto& sendNode = layer.sendNodes[(size_t) aux];
            if (! audible || sendNode == nullptr || layer.sendLevelDb[(size_t) aux] <= kSendOffDb)
                continue;
            connectAudio (layer.stripNode, sendNode);
            if (const int auxBusIndex = findBus ("aux" + juce::String (aux + 1)); auxBusIndex >= 0)
                connectToBus (sendNode, buses[(size_t) auxBusIndex]);
        }

        if (! plugin->getPluginDescription().isInstrument)
            for (int ch = 0; ch < juce::jmin (plugin->getMainBusNumInputChannels(), graphIn); ++ch)
                graph.addConnection ({ { audioInNode->nodeID, ch }, { layer.pluginNode->nodeID, ch } });

        // Só o patch atual (e os strips do concert/set) recebem MIDI; o anterior
        // (lingering) fica só com o áudio das caudas.
        if (current)
        {
            graph.addConnection ({ { midiThruNode->nodeID, Graph::midiChannelIndex },
                                   { layer.midiFilterNode->nodeID, Graph::midiChannelIndex } });
            graph.addConnection ({ { layer.midiFilterNode->nodeID, Graph::midiChannelIndex },
                                   { layer.pluginNode->nodeID, Graph::midiChannelIndex } });
        }
    }
}

void Engine::updateTailTimer()
{
    bool hasLingering = false;
    for (const auto& layer : layers)
        if (layer.role == Layer::Role::lingering)
            hasLingering = true;

    if (hasLingering && ! tailTimer.isTimerRunning())
        tailTimer.startTimerHz (8);
    else if (! hasLingering)
        tailTimer.stopTimer();
}

void Engine::drainLingeringLayers()
{
    juce::StringArray toUnload;
    for (auto& layer : layers)
    {
        if (layer.role != Layer::Role::lingering)
            continue;

        auto* strip = layer.stripNode != nullptr
            ? dynamic_cast<ChannelStripProcessor*> (layer.stripNode->getProcessor())
            : nullptr;
        const float peakDb = strip != nullptr ? strip->getPeakDb() : -100.0f;

        if (peakDb <= -60.0f)
            ++layer.silentChecks;
        else
            layer.silentChecks = 0;

        if (layer.silentChecks >= 4)   // ~0,5 s de silêncio
            toUnload.add (layer.id);
    }

    for (const auto& id : toUnload)
        unloadPlugin (id);

    updateTailTimer();
}

void Engine::updateSoloState()
{
    int count = 0;
    for (const auto& layer : layers)
        if (auto* strip = layer.stripNode != nullptr
                ? dynamic_cast<ChannelStripProcessor*> (layer.stripNode->getProcessor())
                : nullptr)
            count += strip->isSolo() ? 1 : 0;
    soloLayerCount.store (count);
}

// ---- MIDI manual -----------------------------------------------------------------
juce::String Engine::sendMidi (const juce::MidiMessage& message)
{
    if (! isAudioRunning())
        return utf8 ("Inicie o áudio antes (comando audioStart).");

    auto copy = message;
    copy.setTimeStamp (juce::Time::getMillisecondCounterHiRes() * 0.001);
    player.getMidiMessageCollector().addMessageToQueue (copy);
    return {};
}

juce::String Engine::panic()
{
    for (int channel = 1; channel <= 16; ++channel)
    {
        if (auto error = sendMidi (juce::MidiMessage::allNotesOff (channel)); error.isNotEmpty())
            return error;

        sendMidi (juce::MidiMessage::allSoundOff (channel));
    }

    return {};
}
} // namespace preseter
