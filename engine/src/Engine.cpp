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
    }

    const juce::String getName() const override { return "Preseter Note Range"; }
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
            bool pass = true;
            if (message.isNoteOn())
            {
                pass = message.getNoteNumber() >= minimum.load()
                    && message.getNoteNumber() <= maximum.load();
                if (pass)
                    ++activeNotes[(size_t) message.getChannel() - 1][(size_t) message.getNoteNumber()];
            }
            else if (message.isNoteOff())
            {
                auto& count = activeNotes[(size_t) message.getChannel() - 1][(size_t) message.getNoteNumber()];
                pass = count > 0;
                if (pass) --count;
            }
            else if (message.isAllNotesOff() || message.isAllSoundOff())
            {
                activeNotes = {};
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

private:
    std::atomic<int> minimum { 0 };
    std::atomic<int> maximum { 127 };
    std::array<std::array<unsigned int, 128>, 16> activeNotes {};
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
    masterNode   = graph.addNode (std::make_unique<ChannelStripProcessor>());

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

        layerStates.add (Obj()
            .set ("layerId", layer.id)
            .set ("volumeDb", strip->getVolumeDb())
            .set ("pan", strip->getPan())
            .set ("muted", strip->isMuted())
            .set ("solo", strip->isSolo())
            .set ("peakDb", strip->getPeakDb()));
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

void Engine::loadPlugin (const juce::String& idOrPath, const juce::String& requestedLayerId,
                         int minNote, int maxNote, Done done, bool staged)
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
    if (staged)
    {
        for (int i = 0; i < (int) layers.size(); ++i)
        {
            auto& candidate = layers[(size_t) i];
            if (candidate.pluginId != pluginId)
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
                filter->setRange (minNote, maxNote);

            // Some com o layer antigo, mas preserva o nó do plugin (agora é do novo layer).
            // Os inserts do patch anterior não seguem junto: o patch novo recarrega os seus.
            destroyEditorWindowsFor (candidate.id);
            for (auto& insertNode : candidate.insertNodes)
                if (insertNode != nullptr)
                {
                    graph.removeNode (insertNode->nodeID);
                    insertNode = nullptr;
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
        [this, alive, done, layerId, pluginId, minNote, maxNote, staged] (
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
                filter->setRange (minNote, maxNote);

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

// ---- Inserts (efeitos por channel strip, Fase 3.1) ------------------------------

juce::var Engine::describeInsert (const juce::String& layerId, int slot) const
{
    const int index = findLayer (layerId);
    const bool validSlot = slot >= 0 && slot < kMaxInserts;
    auto* plugin = validSlot ? getPlugin (layerId, slot) : nullptr;
    const bool loaded = index >= 0 && validSlot && plugin != nullptr;
    const bool bypass = index >= 0 && validSlot
        ? layers[(size_t) index].insertBypass[(size_t) slot] : false;

    auto out = Obj()
        .set ("layerId", resolveLayerId (layerId))
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

void Engine::setInsert (const juce::String& requestedLayerId, int slot,
                        const juce::String& idOrPath, bool bypass, Done done)
{
    const auto layerId = resolveLayerId (requestedLayerId);
    if (findLayer (layerId) < 0)
    {
        done ({}, utf8 ("Layer não encontrado para carregar o efeito."));
        return;
    }
    if (slot < 0 || slot >= kMaxInserts)
    {
        done ({}, utf8 ("Slot de insert inválido (use 0 a ") + juce::String (kMaxInserts - 1) + ").");
        return;
    }

    juce::PluginDescription description;
    if (! findDescription (idOrPath, description))
    {
        done ({}, utf8 ("Plugin não encontrado: ") + idOrPath);
        return;
    }

    const auto key = layerId + "#" + juce::String (slot);
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
        [this, alive, done, layerId, slot, bypass] (
            std::unique_ptr<juce::AudioPluginInstance> instance, const juce::String& error)
        {
            const auto stillAlive = alive.lock();
            if (stillAlive == nullptr || ! *stillAlive)
                return;

            loadingInsertKeys.removeString (layerId + "#" + juce::String (slot));
            if (instance == nullptr)
            {
                done ({}, error.isNotEmpty() ? error
                                             : juce::String (utf8 ("Falha ao criar a instância do efeito.")));
                return;
            }

            const int layerIndex = findLayer (layerId);
            if (layerIndex < 0)
            {
                // O channel strip foi removido enquanto o efeito carregava.
                done ({}, utf8 ("O channel strip foi removido antes do efeito terminar de carregar."));
                return;
            }

            auto& layer = layers[(size_t) layerIndex];
            if (layer.insertNodes[(size_t) slot] != nullptr)
            {
                destroyEditorWindow (editorKey (layerId, slot));
                graph.removeNode (layer.insertNodes[(size_t) slot]->nodeID);
                layer.insertNodes[(size_t) slot] = nullptr;
            }

            auto node = graph.addNode (std::move (instance));
            if (node == nullptr)
            {
                done ({}, utf8 ("Não foi possível adicionar o efeito ao grafo de áudio."));
                return;
            }

            layer.insertNodes[(size_t) slot] = node;
            layer.insertBypass[(size_t) slot] = bypass;
            rebuildConnections();
            done (describeInsert (layerId, slot), {});
        });
}

juce::String Engine::removeInsert (const juce::String& requestedLayerId, int slot, juce::var& result)
{
    const auto layerId = resolveLayerId (requestedLayerId);
    const int index = findLayer (layerId);
    if (index < 0)
        return utf8 ("Layer não encontrado para remover o efeito.");
    if (slot < 0 || slot >= kMaxInserts)
        return utf8 ("Slot de insert inválido.");

    auto& layer = layers[(size_t) index];
    if (layer.insertNodes[(size_t) slot] != nullptr)
    {
        destroyEditorWindow (editorKey (layerId, slot));
        graph.removeNode (layer.insertNodes[(size_t) slot]->nodeID);
        layer.insertNodes[(size_t) slot] = nullptr;
    }
    layer.insertBypass[(size_t) slot] = false;
    rebuildConnections();
    result = describeInsert (layerId, slot);
    return {};
}

juce::String Engine::setInsertBypass (const juce::String& requestedLayerId, int slot, bool bypass,
                                      juce::var& result)
{
    const auto layerId = resolveLayerId (requestedLayerId);
    const int index = findLayer (layerId);
    if (index < 0)
        return utf8 ("Layer não encontrado para o efeito.");
    if (slot < 0 || slot >= kMaxInserts)
        return utf8 ("Slot de insert inválido.");

    layers[(size_t) index].insertBypass[(size_t) slot] = bypass;
    rebuildConnections();
    result = describeInsert (layerId, slot);
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

    for (const auto& layer : layers)
    {
        auto* plugin = getPlugin (layer.id);
        if (plugin == nullptr || layer.stripNode == nullptr)
            continue;

        const bool audible = layer.role != Layer::Role::staged;

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

        if (audible)
            for (int ch = 0; ch < 2; ++ch)
                graph.addConnection ({ { layer.stripNode->nodeID, ch }, { masterNode->nodeID, ch } });

        if (! plugin->getPluginDescription().isInstrument)
            for (int ch = 0; ch < juce::jmin (plugin->getMainBusNumInputChannels(), graphIn); ++ch)
                graph.addConnection ({ { audioInNode->nodeID, ch }, { layer.pluginNode->nodeID, ch } });

        // Só o patch atual recebe MIDI; o anterior (lingering) fica só com o áudio das caudas.
        if (layer.role == Layer::Role::active)
        {
            graph.addConnection ({ { midiInNode->nodeID, Graph::midiChannelIndex },
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
