#include "Engine.h"

#include "Output.h"

namespace preseter
{
namespace
{
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

    deviceManager.addChangeListener (this);
}

Engine::~Engine()
{
    *aliveFlag = false;
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

    for (auto* type : deviceManager.getAvailableDeviceTypes())
    {
        type->scanForDevices();

        juce::Array<juce::var> outputs, inputs;
        for (const auto& name : type->getDeviceNames (false)) outputs.add (name);
        for (const auto& name : type->getDeviceNames (true))  inputs.add (name);

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
        .set ("midiInputs", juce::var (midiInputs));
}

juce::String Engine::setMidiInputEnabled (const juce::String& identifier, bool enabled)
{
    if (! isAudioRunning())
        return "Inicie o áudio antes (comando audioStart).";

    for (const auto& device : juce::MidiInput::getAvailableDevices())
    {
        if (device.identifier == identifier || device.name == identifier)
        {
            deviceManager.setMidiInputDeviceEnabled (device.identifier, enabled);
            return {};
        }
    }

    return "Dispositivo MIDI não encontrado: " + identifier;
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
        done ({}, "Já existe uma varredura em andamento.");
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

juce::AudioPluginInstance* Engine::getPlugin() const
{
    if (pluginNode == nullptr)
        return nullptr;

    return dynamic_cast<juce::AudioPluginInstance*> (pluginNode->getProcessor());
}

void Engine::loadPlugin (const juce::String& idOrPath, Done done)
{
    juce::PluginDescription description;
    if (! findDescription (idOrPath, description))
    {
        done ({}, "Plugin não encontrado: " + idOrPath);
        return;
    }

    const double sampleRate = graph.getSampleRate() > 0 ? graph.getSampleRate() : 44100.0;
    const int blockSize     = graph.getBlockSize() > 0 ? graph.getBlockSize() : 512;

    std::weak_ptr<bool> alive = aliveFlag;

    formatManager.createPluginInstanceAsync (
        description, sampleRate, blockSize,
        [this, alive, done] (std::unique_ptr<juce::AudioPluginInstance> instance, const juce::String& error)
        {
            const auto stillAlive = alive.lock();
            if (stillAlive == nullptr || ! *stillAlive)
                return;

            if (instance == nullptr)
            {
                done ({}, error.isNotEmpty() ? error : juce::String ("Falha ao criar a instância do plugin."));
                return;
            }

            unloadPlugin();
            pluginNode = graph.addNode (std::move (instance));
            rebuildConnections();

            done (describeLoadedPlugin(), {});
        });
}

bool Engine::unloadPlugin()
{
    if (pluginNode == nullptr)
        return false;

    graph.removeNode (pluginNode->nodeID);
    pluginNode = nullptr;
    return true;
}

juce::var Engine::describeLoadedPlugin() const
{
    auto* plugin = getPlugin();
    if (plugin == nullptr)
        return {};

    const auto description = plugin->getPluginDescription();

    return Obj()
        .set ("id", description.createIdentifierString())
        .set ("name", description.name)
        .set ("manufacturer", description.manufacturerName)
        .set ("format", description.pluginFormatName)
        .set ("path", description.fileOrIdentifier)
        .set ("isInstrument", description.isInstrument)
        .set ("inputs", plugin->getTotalNumInputChannels())
        .set ("outputs", plugin->getTotalNumOutputChannels())
        .set ("parameterCount", plugin->getParameters().size());
}

juce::var Engine::listParameters() const
{
    juce::Array<juce::var> list;

    if (auto* plugin = getPlugin())
    {
        const auto& params = plugin->getParameters();
        for (int i = 0; i < params.size(); ++i)
            list.add (parameterToVar (*params[i], i));
    }

    return juce::var (list);
}

juce::String Engine::setParameter (int index, float normalizedValue, juce::var& result)
{
    auto* plugin = getPlugin();
    if (plugin == nullptr)
        return "Nenhum plugin carregado.";

    const auto& params = plugin->getParameters();
    if (! juce::isPositiveAndBelow (index, params.size()))
        return "Índice de parâmetro inválido: " + juce::String (index);

    auto* parameter = params[index];
    parameter->setValueNotifyingHost (juce::jlimit (0.0f, 1.0f, normalizedValue));

    result = parameterToVar (*parameter, index);
    return {};
}

juce::String Engine::getParameter (int index, juce::var& result) const
{
    auto* plugin = getPlugin();
    if (plugin == nullptr)
        return "Nenhum plugin carregado.";

    const auto& params = plugin->getParameters();
    if (! juce::isPositiveAndBelow (index, params.size()))
        return "Índice de parâmetro inválido: " + juce::String (index);

    result = parameterToVar (*params[index], index);
    return {};
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

    auto* plugin = getPlugin();
    if (plugin == nullptr)
        return;

    const int graphIn  = graph.getMainBusNumInputChannels();
    const int graphOut = graph.getMainBusNumOutputChannels();
    const int plugIn   = plugin->getMainBusNumInputChannels();
    const int plugOut  = plugin->getMainBusNumOutputChannels();

    // Saída: plugin -> dispositivo (mono é duplicado nos dois lados).
    for (int ch = 0; ch < juce::jmin (plugOut, graphOut); ++ch)
        graph.addConnection ({ { pluginNode->nodeID, ch }, { audioOutNode->nodeID, ch } });

    if (plugOut == 1 && graphOut >= 2)
        graph.addConnection ({ { pluginNode->nodeID, 0 }, { audioOutNode->nodeID, 1 } });

    // Efeitos recebem o áudio de entrada; instrumentos não (evita microfonia).
    if (! plugin->getPluginDescription().isInstrument)
        for (int ch = 0; ch < juce::jmin (plugIn, graphIn); ++ch)
            graph.addConnection ({ { audioInNode->nodeID, ch }, { pluginNode->nodeID, ch } });

    // MIDI dos dispositivos -> plugin.
    graph.addConnection ({ { midiInNode->nodeID, Graph::midiChannelIndex },
                           { pluginNode->nodeID, Graph::midiChannelIndex } });
}

// ---- MIDI manual -----------------------------------------------------------------
juce::String Engine::sendMidi (const juce::MidiMessage& message)
{
    if (! isAudioRunning())
        return "Inicie o áudio antes (comando audioStart).";

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
