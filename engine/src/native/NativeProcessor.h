#pragma once

#include "MdaEPianoDsp.h"
#include "SetBfreeOrganProcessor.h"
#include "WurliProcessor.h"

#include <juce_audio_processors/juce_audio_processors.h>

#include <array>
#include <atomic>
#include <memory>

namespace preseter
{
namespace native
{
enum class NativeKind
{
    organ,
    tines,
    reeds,
    mdaPiano,
    mdaDx10,
    mdaJx10
};

class NativeProcessor;

/** Cria o processador nativo correspondente ao id (preseter.organ, ...). */
std::unique_ptr<NativeProcessor> createNativeProcessor (const juce::String& id);

/** Instrumentos embutidos do Preseter: órgão, Tines e Wurly. */
class NativeProcessor final : public juce::AudioProcessor, private juce::AsyncUpdater
{
public:
    NativeProcessor (NativeKind kindToUse, juce::String stableId, juce::String displayName);

    const juce::String& getStableId() const noexcept { return stableId; }
    NativeKind getNativeKind() const noexcept { return kind; }

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;
    void processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override;

    /** Processador delegado (MDA): fonte dos parâmetros reais, se houver. */
    juce::AudioProcessor* getParameterProcessor() const noexcept { return mdaProcessor.get(); }

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
    void updateOrganParameters();
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
    /** Instrumentos do MDA rodam o AudioProcessor original do porte (MIT). */
    std::unique_ptr<juce::AudioProcessor> mdaProcessor;
    /** prepareToPlay já rodou no delegado (contador de vozes confiável). */
    bool mdaPrepared = false;
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
