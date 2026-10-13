#pragma once

#include <juce_audio_utils/juce_audio_utils.h>

#include <functional>
#include <memory>

namespace preseter
{
/**
 * Núcleo do motor (Fase 1): um dispositivo de áudio, um grafo e UM plugin.
 *
 * Tudo aqui deve ser chamado da message thread do JUCE. As Fases 3/4 vão
 * generalizar para vários plugins (slots/patches).
 */
class Engine : private juce::ChangeListener,
               private juce::Timer
{
public:
    using Graph    = juce::AudioProcessorGraph;
    using Done     = std::function<void (juce::var result, juce::String error)>;
    using Progress = std::function<void (const juce::String& pluginName)>;

    Engine();
    ~Engine() override;

    // ---- Áudio e MIDI ----------------------------------------------------
    /** Opções: inputs, outputs, type, input, output, sampleRate, bufferSize, midi. */
    juce::String startAudio (const juce::var& options);
    void stopAudio();
    bool isAudioRunning() const;

    juce::var describeDevices();
    juce::String setMidiInputEnabled (const juce::String& identifier, bool enabled);

    // ---- Plugins ---------------------------------------------------------
    juce::StringArray getFormatNames() const;
    juce::var listKnownPlugins() const;

    /** Varre os diretórios padrão (+ extras). Roda aos poucos pelo timer. */
    void scan (const juce::StringArray& extraPaths, bool rescan, Progress progress, Done done);

    /** idOrPath é um id retornado por scan/plugins ou o caminho do .vst3. */
    void loadPlugin (const juce::String& idOrPath, Done done);
    bool unloadPlugin();

    juce::var describeLoadedPlugin() const;
    /** Por padrão só os automatizáveis (esconde os ~2000 "MIDI CC" do wrapper VST3). */
    juce::var listParameters (bool includeNonAutomatable = false) const;
    juce::String setParameter (int index, float normalizedValue, juce::var& result);
    juce::String getParameter (int index, juce::var& result) const;

    // ---- MIDI manual -----------------------------------------------------
    juce::String sendMidi (const juce::MidiMessage& message);
    juce::String panic();

private:
    void changeListenerCallback (juce::ChangeBroadcaster*) override;
    void timerCallback() override;

    void rebuildConnections();
    bool findDescription (const juce::String& idOrPath, juce::PluginDescription& out);
    juce::AudioPluginInstance* getPlugin() const;
    juce::var pluginToVar (const juce::PluginDescription& description) const;

    bool beginNextScanFormat();
    void finishScan();
    void saveKnownPlugins();

    juce::AudioDeviceManager deviceManager;
    juce::AudioPluginFormatManager formatManager;
    juce::KnownPluginList knownPlugins;
    Graph graph;
    juce::AudioProcessorPlayer player;

    Graph::Node::Ptr audioInNode, audioOutNode, midiInNode, pluginNode;

    juce::File dataDirectory, knownPluginsFile, deadMansFile;

    bool deviceInitialised = false;
    bool audioCallbackAttached = false;
    bool midiCallbackAttached = false;

    struct ScanState
    {
        bool active = false;
        std::unique_ptr<juce::PluginDirectoryScanner> scanner;
        int nextFormatIndex = 0;
        juce::StringArray extraPaths;
        juce::StringArray failedFiles;
        Progress progress;
        Done done;
    } scanState;

    // Evita chamar callbacks assíncronos depois que o Engine foi destruído.
    std::shared_ptr<bool> aliveFlag = std::make_shared<bool> (true);
};
} // namespace preseter
