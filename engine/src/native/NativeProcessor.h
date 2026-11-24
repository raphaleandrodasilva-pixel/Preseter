#pragma once

#include "MdaEPianoDsp.h"
#include "SetBfreeOrganProcessor.h"
#include "Synth2Dsp.h"
#include "WurliProcessor.h"
#include "drums/DrumPattern.h"

#include <juce_audio_processors/juce_audio_processors.h>

#include <array>
#include <atomic>
#include <memory>
#include <vector>

namespace preseter
{
class MasterClock;

namespace drums
{
class DrumKitEngine;
class DrumSequencer;
}

namespace native
{
enum class NativeKind
{
    organ,
    tines,
    reeds,
    mdaPiano,
    mdaDx10,
    mdaJx10,
    dexed,
    zyn,
    synth2,
    drums
};

class NativeProcessor;

/** Cria o processador nativo correspondente ao id (preseter.organ, ...). */
std::unique_ptr<NativeProcessor> createNativeProcessor (const juce::String& id);

/** Instrumentos embutidos do Preseter: órgão, Tines e Wurly. */
class NativeProcessor final : public juce::AudioProcessor, private juce::AsyncUpdater
{
public:
    NativeProcessor (NativeKind kindToUse, juce::String stableId, juce::String displayName);
    ~NativeProcessor() override;

    const juce::String& getStableId() const noexcept { return stableId; }
    NativeKind getNativeKind() const noexcept { return kind; }

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;
    void processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override;

    /** Processador delegado (MDA): fonte dos parâmetros reais, se houver. */
    juce::AudioProcessor* getParameterProcessor() const noexcept { return delegatedProcessor.get(); }

    /** Vozes em uso no instrumento delegado (0 nos instrumentos próprios). */
    int getActiveVoices() const noexcept;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return displayName; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override;

    int getNumPrograms() override;
    int getCurrentProgram() override;
    void setCurrentProgram (int index) override;
    const juce::String getProgramName (int index) override;
    void changeProgramName (int index, const juce::String& newName) override;

    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    void applyProgram (int index);

    /** Synth2: carrega um patch .sy1 (texto). Chamar na thread de mensagem. */
    bool loadSynth2Patch (const juce::String& text, const juce::String& name = {});
    /** Synth2: carrega os programas de fábrica (.sy1) de uma pasta. */
    void loadSynth2FactoryPrograms (const juce::String& directory);
    /** Synth2: exporta os valores atuais como .sy1 (ver=112). */
    juce::String exportSynth2Patch (const juce::String& name) const;

    /** Preseter Drums: carrega o kit (SF2/SFZ). Chamar na thread de mensagem. */
    bool loadDrumKit (const juce::File& file, int bank, int program, juce::String& error);
    /** Preseter Drums: SF2/SFZ próprio de um pad; caminho vazio volta ao kit. */
    bool setDrumPadSource (int pad, const juce::File& file, int bank, int program, int note,
                           juce::String& error);
    void clearDrumPadSource (int pad);
    /** Preseter Drums: descrição do kit carregado (para logs/interface). */
    juce::String describeDrumKit() const;

    /** Preseter Dexed: relê os cartuchos .syx do disco. */
    bool reloadDexedBank();

    /** Preseter Zyn: define as pastas de presets e relê o banco. */
    void setZynBankDirs (const juce::String& factoryDir, const juce::String& userDir);
    bool reloadZynBank();

    /** D4: liga o sequenciador ao relógio mestre. */
    void setMasterClock (const MasterClock* clockToUse);

    /** Preseter Drums: publica o padrão e liga/desliga o sequenciador (thread de mensagem). */
    bool setDrumPattern (const juce::var& options, juce::String& error);
    void setDrumSequencerEnabled (bool shouldBeEnabled);
    bool isDrumSequencerEnabled() const;
    /** Preseter Drums: padrão, passo atual e pads (para a interface/estado). */
    juce::var describeDrums() const;
    /** Preseter Drums: solo transitório (-1 = nenhum) e volume geral. */
    void setDrumSolo (int pad);
    void setDrumGainDb (float db);
    int getDrumCurrentStep() const;
    /** Nome do patch .sy1 atualmente carregado (vazio nos outros nativos). */
    juce::String getSynth2PatchName() const;

private:
    struct Voice
    {
        bool active = false;
        bool released = false;
        int note = 60;
        float velocity = 1.0f;
        double frequency = 440.0;
        double age = 0.0;
        float envelope = 0.0f;
        float clickEnvelope = 0.0f;
        float percussionEnvelope = 0.0f;
        float pan = 0.0f;
        std::array<double, 9> phase {};
        std::array<double, 4> modePhase {};
        std::array<float, 4> modeEnvelope {};
    };

    static juce::AudioProcessorValueTreeState::ParameterLayout createLayout (NativeKind kind);
    Voice* findVoiceForNote (int note);
    Voice* allocateVoice();
    void startNote (int note, float velocity);
    void stopNote (int note);
    /** D4/D6: aplica volume/mudo das trilhas aos pads do kit. */
    void applyDrumPatternPadSettings (const drums::DrumPattern& pattern);
    void updateOrganParameters();
    void processSynth2 (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi);
    void renderModal (juce::AudioBuffer<float>& buffer, int numSamples);
    void handleAsyncUpdate() override;
    float parameter (const char* id) const;
    void setParameterValue (const char* id, float value);
    void resetDsp();

    NativeKind kind;
    juce::String stableId;
    juce::String displayName;
    juce::AudioProcessorValueTreeState apvts;
    std::unique_ptr<SetBfreeOrgan> setBfree;
    std::unique_ptr<MdaEPianoDsp> mdaEPiano;
    std::unique_ptr<WurliProcessor> wurli;
    std::unique_ptr<Synth2Dsp> synth2;
    struct Synth2Program
    {
        juce::String name;
        Synth2PatchValues values {};
    };
    std::vector<Synth2Program> synth2Programs;
    std::atomic<int> synth2PendingProgram { -1 };
    std::array<int32_t, kSynth2ParamCount> synth2Values {};
    int32_t synth2Volume = -1;
    /** Força a releitura dos 100 parâmetros no próximo bloco (estado/patch novo). */
    std::atomic<bool> synth2ForceParams { true };
    /** Pede o fade/limpeza de delay antes de aplicar um patch novo. */
    std::atomic<bool> synth2PatchReload { false };
    /** Instrumentos do MDA/Dexed rodam o AudioProcessor original do porte. */
    std::unique_ptr<juce::AudioProcessor> delegatedProcessor;
    /** Preseter Drums: motor de pads (D3). */
    std::unique_ptr<drums::DrumKitEngine> drumKit;
    /** Preseter Drums: sequenciador (D4) e relógio mestre. */
    std::unique_ptr<drums::DrumSequencer> drumSequencer;
    const MasterClock* masterClock = nullptr;
    drums::DrumPattern drumPattern;
    /** MIDI de entrada do bloco, copiado para um array fixo (sem alocar na thread de áudio). */
    struct DrumInputEvent
    {
        int position = 0;
        juce::MidiMessage message;
    };
    std::array<DrumInputEvent, 128> drumInputEvents {};
    /** Estado do kit (caminho/nome) para salvar no patch (D6). */
    juce::String drumKitPath;
    int drumKitBank = 128;
    int drumKitProgram = 0;
    /** Volume geral do Drums (dB), salvo no estado. */
    float drumGainDb = 0.0f;
    /** prepareToPlay já rodou no delegado (contador de vozes confiável). */
    bool delegatedPrepared = false;
    std::array<SetBfreeMidiEvent, 1024> organEvents {};
    int organEventCount = 0;
    std::atomic<int> lastLeslieParam { -1 };
    std::atomic<int> pendingLeslieFromMidi { -1 };
    float organOutputGain = 1.0f;
    float modWheel = -1.0f;
    float lastTinesModulation = -1.0f;
    float tremoloDepthSmoothed = 0.0f;
    bool tremoloDepthInitialized = false;
    juce::AudioBuffer<float> organScratch;
    std::array<Voice, 64> voices;
    int currentProgram = 0;
    double sampleRate = 44100.0;
    double lfoPhase = 0.0;
    double tremoloPhase = 0.0;
    float toneStateL = 0.0f;
    float toneStateR = 0.0f;
    float reverbL = 0.0f;
    float reverbR = 0.0f;
    juce::Random random;
};
} // namespace native
} // namespace preseter
