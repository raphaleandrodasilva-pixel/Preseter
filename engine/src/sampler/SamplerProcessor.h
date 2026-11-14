#pragma once

#include "SamplerInstrument.h"

#include <juce_audio_processors/juce_audio_processors.h>

#include <atomic>
#include <memory>
#include <vector>

namespace preseter
{
/** Instrumento nativo do Preseter: toca SF2/SFZ sem depender de plugin externo. */
class SamplerProcessor final : public juce::AudioProcessor
{
public:
    enum ParamIndex
    {
        attack = 0,
        decay,
        sustain,
        release,
        cutoff,
        resonance,
        velocity,
        transpose,
        fineTune,
        polyphony,
        outputGain,
        paramCount
    };

    SamplerProcessor();
    ~SamplerProcessor() override = default;

    const juce::String getName() const override { return "Preseter Sampler"; }

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;
    void processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi) override;

    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }

    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 6.0; }

    int getNumPrograms() override;
    int getCurrentProgram() override;
    void setCurrentProgram (int index) override;
    const juce::String getProgramName (int index) override;
    void changeProgramName (int index, const juce::String& newName) override;
    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    bool loadFile (const juce::File& file, int bank, int program, juce::String& error);
    bool isLoaded() const noexcept { return instrument.isLoaded(); }
    juce::String getSourcePath() const { return instrument.getSourcePath(); }
    juce::String describe() const;
    juce::var describeRegions() const;
    int getActiveVoices() const noexcept { return activeVoices.load(); }
    int getMaxVoices() const noexcept { return maxVoices.load(); }
    void setPolyphonyLimit (int voices) noexcept;
    void setLoopsEnabled (bool enabled) noexcept { loopsEnabled.store (enabled); }
    bool areLoopsEnabled() const noexcept { return loopsEnabled.load(); }

private:
    class SamplerParameter;

    struct Envelope
    {
        enum class Stage { idle, attack, decay, sustain, release };
        Stage stage = Stage::idle;
        float level = 0.0f;
        float attackDelta = 1.0f;
        float decayCoef = 0.0f;
        float sustainLevel = 1.0f;
        float releaseCoef = 0.0f;

        void start (float attackTime, float decayTime, float sustainValue, float releaseTime, double sampleRate);
        void noteOff (float releaseTime, double sampleRate);
        float next() noexcept;
        bool isActive() const noexcept { return stage != Stage::idle; }
    };

    struct Svf
    {
        float ic1 = 0.0f, ic2 = 0.0f;
        float a1 = 0.0f, a2 = 0.0f, a3 = 0.0f;
        void set (float cutoffHz, float q, double sampleRate);
        float process (float input) noexcept;
        void reset() noexcept { ic1 = ic2 = 0.0f; }
    };

    struct Voice
    {
        bool active = false;
        int note = 60;
        int channel = 1;
        int regionIndex = -1;
        double position = 0.0;
        double ratio = 1.0;
        float gain = 1.0f;
        float gainLeft = 0.707f;
        float gainRight = 0.707f;
        float cutoff = 20000.0f;
        float resonance = 0.0f;
        Envelope envelope;
        Svf filter;
        bool sustained = false;
        juce::uint32 order = 0;
    };

    void handleMidi (const juce::MidiMessage& message);
    void startNote (int note, int channel, float velocity);
    void releaseNote (int note, int channel);
    void releaseAll (bool sustainedOnly);
    void syncParameters();
    int findFreeVoice();
    void resetVoices();
    const sampler::Sample* voiceRegionSample (const Voice& voice) const;

    sampler::Instrument instrument;
    std::vector<Voice> voices;
    juce::uint32 voiceOrder = 0;

    std::atomic<float> values[paramCount];
    double currentSampleRate = 44100.0;
    int blockSize = 512;
    int currentProgram = 0;
    int currentBank = 0;
    bool sustainPedal = false;
    std::atomic<int> activeVoices { 0 };
    std::atomic<int> maxVoices { 64 };
    std::atomic<bool> loopsEnabled { true };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SamplerProcessor)
};
} // namespace preseter
