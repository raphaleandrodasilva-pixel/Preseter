#pragma once

#include <juce_audio_utils/juce_audio_utils.h>

#include <array>
#include <atomic>
#include <cmath>
#include <functional>
#include <map>
#include <memory>
#include <vector>

namespace preseter
{
/** Playhead do host: entrega tempo, compasso e posição aos plugins (Fase 6.2). */
class HostPlayHead final : public juce::AudioPlayHead
{
public:
    void setTempo (double bpm) { tempo.store (juce::jlimit (20.0, 300.0, bpm)); }
    void setTimeSignature (int numerator, int denominator)
    {
        timeNumerator.store (juce::jmax (1, numerator));
        timeDenominator.store (juce::jmax (1, denominator));
    }
    void setPlaying (bool value)
    {
        if (value && ! playing.load())
            startMs = juce::Time::getMillisecondCounterHiRes();
        playing.store (value);
    }
    double getTempo() const { return tempo.load(); }
    int getNumerator() const { return timeNumerator.load(); }
    int getDenominator() const { return timeDenominator.load(); }
    bool isPlaying() const { return playing.load(); }

    juce::Optional<PositionInfo> getPosition() const override
    {
        PositionInfo info;
        const double bpm = tempo.load();
        info.setBpm (bpm);
        info.setTimeSignature (TimeSignature { timeNumerator.load(), timeDenominator.load() });
        info.setIsPlaying (playing.load());
        if (playing.load())
        {
            const double seconds = (juce::Time::getMillisecondCounterHiRes() - startMs) / 1000.0;
            const double ppq = seconds * bpm / 60.0;
            info.setPpqPosition (ppq);
            const double barLength = juce::jmax (1, timeNumerator.load());
            info.setPpqPositionOfLastBarStart (std::floor (ppq / barLength) * barLength);
        }
        else
        {
            info.setPpqPosition (0.0);
        }
        return info;
    }

private:
    std::atomic<double> tempo { 120.0 };
    std::atomic<int> timeNumerator { 4 };
    std::atomic<int> timeDenominator { 4 };
    std::atomic<bool> playing { false };
    std::atomic<double> startMs { 0.0 };
};

/**
 * Núcleo do motor: um dispositivo de áudio e vários instrumentos em layers.
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

    /** Slots de insert (efeitos) por channel strip (Fase 3.1). */
    static constexpr int kMaxInserts = 4;
    /** Barramentos de Aux e Output do concert (Fase 3.2). */
    static constexpr int kAuxBuses = 4;
    static constexpr int kOutputBuses = 4;
    /** Nível de send a partir do qual ele é considerado desligado. */
    static constexpr float kSendOffDb = -60.0f;

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
    void loadPlugin (const juce::String& idOrPath, const juce::String& layerId,
                     int minNote, int maxNote, Done done, bool staged = false, bool pinned = false);
    /** Carrega um instrumento em modo encadeado, para troca de patch sem corte. */
    void stagePlugin (const juce::String& idOrPath, const juce::String& layerId,
                      int minNote, int maxNote, Done done);
    /** Efetiva a troca de patch: ativa os layers encadeados e silencia (ou drena) o patch anterior. */
    juce::var commitPatchSwap (bool silencePrevious);
    bool unloadPlugin (const juce::String& layerId = {});
    juce::String setLayerRange (const juce::String& layerId, int minNote, int maxNote);
    /** Faixa de velocity aceita pelo layer (1..127), aplicada no filtro MIDI (Fase 3.4). */
    juce::String setLayerVelocityRange (const juce::String& layerId, int minVelocity, int maxVelocity);
    /** Transpose global em semitons aplicado a todas as notas (patch + set + concert). */
    juce::String setTranspose (int semitones);
    /** Bloqueia no motor as mensagens de hardware marcadas como "Don't pass thru" (Fase 4.5). */
    juce::String setMidiThru (const juce::var& options);
    /** Relógio do host: tempo, compasso e play/stop para os plugins (Fase 6.2). */
    juce::String setHostClock (double bpm, int numerator, int denominator, bool playing);
    /** Metrônomo do motor (Fase 6.2). */
    juce::String setMetronome (bool enabled, double volumeDb, bool accentFirstBeat);
    /** Gravação da saída em WAV (Fase 6.4). */
    juce::String startRecording (const juce::String& path);
    void stopRecording();
    bool isRecording() const;
    /** Plugin Playback: carrega/toca um arquivo de áudio (Fase 6.4). */
    juce::String loadPlayback (const juce::String& path);
    void playPlayback();
    void stopPlayback();
    juce::var describePlayback() const;
    /** Pan law do concert (Fase 2.4). */
    void setPanLaw (float db, bool compensated);

    juce::var describeLoadedPlugin (const juce::String& layerId = {}) const;
    juce::var describeLoadedPlugins() const;
    /** Por padrão só os automatizáveis (esconde os ~2000 "MIDI CC" do wrapper VST3). */
    juce::var listParameters (const juce::String& layerId, bool includeNonAutomatable = false) const;
    juce::String setParameter (const juce::String& layerId, int index, float normalizedValue, juce::var& result);
    juce::String getParameter (const juce::String& layerId, int index, juce::var& result) const;

    /** Estado completo do plugin (`getStateInformation`) codificado em base64.
        `insertSlot >= 0` busca o efeito do slot de insert; -1 busca o instrumento. */
    juce::String getPluginState (const juce::String& layerId, juce::var& result,
                                 int insertSlot = -1) const;
    /** Aplica um estado completo (base64) via `setStateInformation`. */
    juce::String setPluginState (const juce::String& layerId, const juce::String& base64,
                                 juce::var& result, int insertSlot = -1);

    /** Lista os programas internos de um plugin, instanciando-o temporariamente.
        Resultado: { programs: [{ index, name }], current }. */
    void scanPluginPrograms (const juce::String& idOrPath, Done done);
    /** Troca o programa interno de um layer já carregado. */
    juce::String setPluginProgram (const juce::String& layerId, int programIndex, juce::var& result);
    /** Aplica um arquivo `.vstpreset` (formato VST3) num layer carregado. */
    juce::String setPluginPresetFile (const juce::String& layerId, const juce::String& filePath,
                                      juce::var& result);

    /** Abre (ou traz para a frente) a janela de edição nativa do plugin do layer/slot. */
    juce::String openPluginEditor (const juce::String& layerId, juce::var& result,
                                   int insertSlot = -1);
    /** Fecha a janela de edição do plugin do layer/slot, se estiver aberta. */
    juce::String closePluginEditor (const juce::String& layerId, juce::var& result,
                                    int insertSlot = -1);

    // ---- Inserts (efeitos por channel strip, Fase 3.1) -------------------
    /** Carrega (substituindo o que houver) um efeito no slot de insert do layer. */
    void setInsert (const juce::String& layerId, int slot, const juce::String& idOrPath,
                    bool bypass, Done done);
    /** Remove o efeito de um slot de insert, se houver. */
    juce::String removeInsert (const juce::String& layerId, int slot, juce::var& result);
    /** Liga/desliga (bypass) o efeito de um slot, sem descarregá-lo. */
    juce::String setInsertBypass (const juce::String& layerId, int slot, bool bypass,
                                  juce::var& result);
    /** Descreve os slots de insert de um layer (sempre os `kMaxInserts` slots). */
    juce::var describeInserts (const juce::String& layerId) const;

    // ---- Sends e Aux/Output (Fase 3.2) -----------------------------------
    /** Estado dos barramentos Aux/Output do concert. */
    juce::var describeBuses() const;
    /** Altera um barramento: "aux1".."aux4" ou "output1".."output4" (volumeDb, pan, muted, output). */
    juce::String setBusMix (const juce::String& bus, const juce::var& options, juce::var& result);
    /** Nível (dB) do send post-fader do layer para o Aux `aux` (1..4); -60 ou menos desliga. */
    juce::String setSend (const juce::String& layerId, int aux, double levelDb);
    /** Saída (Output 1..4) para onde o channel strip do layer manda o áudio. */
    juce::String setLayerOutput (const juce::String& layerId, int output);

    juce::var describeAudioConfiguration();
    juce::String audioConfigurationError();
    juce::var describeMixState() const;
    /** Configura o strip de entrada de áudio do patch (Fase 3.5). */
    juce::String setAudioInput (const juce::var& options, juce::var& result);
    /** Estado do strip de entrada (configuração + peak/feedback). */
    juce::var describeAudioInput() const;
    juce::String setLayerMix (const juce::String& layerId, const juce::var& options,
                              juce::var& result);
    juce::String setMasterMix (const juce::var& options, juce::var& result);

    // ---- MIDI manual -----------------------------------------------------
    juce::String sendMidi (const juce::MidiMessage& message);
    juce::String panic();

private:
    void changeListenerCallback (juce::ChangeBroadcaster*) override;
    void timerCallback() override;

    void rebuildConnections();
    void updateSoloState();
    bool findDescription (const juce::String& idOrPath, juce::PluginDescription& out);
    juce::AudioPluginInstance* getPlugin (const juce::String& layerId = {},
                                          int insertSlot = -1) const;
    /** Ponteiro para o nó do slot de insert do host (layer ou barramento), ou nullptr. */
    Graph::Node::Ptr* insertSlotNode (const juce::String& ownerId, int slot);
    /** Ponteiro para o estado de bypass do slot de insert do host (layer ou barramento). */
    bool* insertSlotBypass (const juce::String& ownerId, int slot);
    /** Todos os sends desligados (`kSendOffDb`), para inicializar um layer. */
    static std::array<float, kAuxBuses> sendLevelsOff()
    {
        std::array<float, kAuxBuses> levels {};
        levels.fill (kSendOffDb);
        return levels;
    }
    int findBus (const juce::String& busId) const;
    /** id do barramento de saída a partir do número (1..4). */
    juce::String outputBusId (int output) const;
    juce::var describeInsert (const juce::String& layerId, int slot) const;
    juce::String resolveLayerId (const juce::String& layerId) const;
    int findLayer (const juce::String& layerId) const;
    juce::var pluginToVar (const juce::PluginDescription& description) const;
    /** Chave da janela de edição: o próprio layer para o instrumento, layer#insert#n para um insert. */
    juce::String editorKey (const juce::String& layerId, int insertSlot) const;
    /** Fecha as janelas de edição do layer (instrumento e inserts). */
    void destroyEditorWindowsFor (const juce::String& layerId);
    bool destroyEditorWindow (const juce::String& key);
    /** Descarrega os layers do patch anterior quando as caudas acabam. */
    void drainLingeringLayers();
    void updateTailTimer();

    bool beginNextScanFormat();
    void finishScan();
    void saveKnownPlugins();

    juce::AudioDeviceManager deviceManager;
    juce::AudioPluginFormatManager formatManager;
    juce::KnownPluginList knownPlugins;
    Graph graph;
    juce::AudioProcessorPlayer player;

    Graph::Node::Ptr audioInNode, audioOutNode, midiInNode, midiThruNode, audioInputNode, metronomeNode, recorderNode, playbackNode, masterNode;
    /** Relógio do host entregue aos plugins (Fase 6.2). */
    HostPlayHead playHead;
    std::atomic<int> soloLayerCount { 0 };
    /** Transpose aplicado no filtro MIDI de cada layer (Fase 3.4). */
    std::atomic<int> transposeSemitones { 0 };
    struct Layer
    {
        /** active = patch atual; staged/adopted = patch que está chegando; lingering = patch anterior (caudas). */
        enum class Role { active, staged, adopted, lingering };

        juce::String id;
        juce::String pluginId;
        Graph::Node::Ptr midiFilterNode;
        Graph::Node::Ptr pluginNode;
        Graph::Node::Ptr stripNode;
        /** Efeitos de insert do channel strip; o índice é o slot (Fase 3.1). */
        std::array<Graph::Node::Ptr, kMaxInserts> insertNodes;
        /** Slot com bypass ligado: o efeito continua carregado, mas fora da cadeia de áudio. */
        std::array<bool, kMaxInserts> insertBypass {};
        int minNote = 0;
        int maxNote = 127;
        Role role = Role::active;
        /** Strip do concert/set (Fase 3.3): fica carregado entre patches e não entra na troca. */
        bool pinned = false;
        /** Leituras seguidas de silêncio usadas para descarregar as caudas do patch anterior. */
        int silentChecks = 0;
        /** Nível dos sends post-fader para cada Aux, em dB (kSendOffDb ou menos = desligado). */
        std::array<float, kAuxBuses> sendLevelDb = sendLevelsOff();
        /** Nós de ganho dos sends, criados quando o send é ligado. */
        std::array<Graph::Node::Ptr, kAuxBuses> sendNodes;
        /** Saída (Output 1..4) para onde o channel strip manda o áudio. */
        int output = 1;
    };
    std::vector<Layer> layers;

    /** Barramentos Aux/Output do concert; criados no construtor (Fase 3.2). */
    struct Bus
    {
        enum class Kind { aux, output };
        juce::String id;
        Kind kind = Kind::aux;
        /** Índice 0..3 (aux1 = 0, output1 = 0). */
        int index = 0;
        /** Destino dos Aux: Output 1..4 (os Output ignoram). */
        int output = 1;
        Graph::Node::Ptr stripNode;
        std::array<Graph::Node::Ptr, kMaxInserts> insertNodes;
        std::array<bool, kMaxInserts> insertBypass {};
    };
    std::vector<Bus> buses;
    juce::StringArray loadingLayerIds;
    /** Slots de insert em carregamento, no formato layerId#slot. */
    juce::StringArray loadingInsertKeys;

    /** Janela nativa de edição de um plugin. Fecha via botão e avisa o Engine. */
    struct PluginEditorWindow final : juce::DocumentWindow
    {
        PluginEditorWindow (const juce::String& title, juce::AudioProcessorEditor* editor,
                            std::function<void()> onCloseCallback)
            : juce::DocumentWindow (title, juce::Colours::black, juce::DocumentWindow::closeButton),
              onClose (std::move (onCloseCallback))
        {
            setUsingNativeTitleBar (true);
            setContentOwned (editor, true);
            setResizable (true, false);
            centreWithSize (getWidth(), getHeight());
            setVisible (true);
        }

        void closeButtonPressed() override
        {
            if (onClose != nullptr)
                juce::MessageManager::callAsync (onClose);
        }

        std::function<void()> onClose;
    };

    /** Declarado depois de `layers` para ser destruído antes dos plugins. */
    std::map<juce::String, std::unique_ptr<PluginEditorWindow>> editorWindows;

    /** Timer separado do scan, só para descarregar as caudas do patch anterior. */
    struct TailTimer final : juce::Timer
    {
        explicit TailTimer (Engine& engineToUse) : owner (engineToUse) {}
        void timerCallback() override { owner.drainLingeringLayers(); }
        Engine& owner;
    };
    TailTimer tailTimer { *this };

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
