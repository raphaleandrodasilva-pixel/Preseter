// Sintetizador VST3 mínimo, só para testar o motor sem depender de plugins de
// terceiros. Tem 2 parâmetros (Volume e Waveform), 8 vozes e salva o estado.
#include <juce_audio_processors/juce_audio_processors.h>

#include <atomic>
#include <cmath>

namespace
{
struct TestSound : juce::SynthesiserSound
{
    bool appliesToNote (int) override    { return true; }
    bool appliesToChannel (int) override { return true; }
};

class TestVoice : public juce::SynthesiserVoice
{
public:
    TestVoice (std::atomic<float>& gainToUse, std::atomic<float>& waveToUse)
        : gain (gainToUse), wave (waveToUse) {}

    bool canPlaySound (juce::SynthesiserSound* sound) override
    {
        return dynamic_cast<TestSound*> (sound) != nullptr;
    }

    void startNote (int midiNote, float velocity, juce::SynthesiserSound*, int) override
    {
        level     = velocity;
        phase     = 0.0;
        increment = juce::MidiMessage::getMidiNoteInHertz (midiNote) / getSampleRate();
        envelope  = 0.0f;
        releasing = false;
    }

    void stopNote (float, bool allowTailOff) override
    {
        if (allowTailOff)
            releasing = true;
        else
            clearCurrentNote();
    }

    void pitchWheelMoved (int) override {}
    void controllerMoved (int, int) override {}

    void renderNextBlock (juce::AudioBuffer<float>& output, int startSample, int numSamples) override
    {
        if (! isVoiceActive())
            return;

        const float volume = gain.load();
        const int shape    = (int) wave.load();

        for (int i = 0; i < numSamples; ++i)
        {
            if (! releasing)
            {
                envelope = juce::jmin (1.0f, envelope + 0.01f);
            }
            else
            {
                envelope -= 0.0005f;
                if (envelope <= 0.0f)
                {
                    clearCurrentNote();
                    break;
                }
            }

            const float p = (float) phase;
            float sample = 0.0f;
            switch (shape)
            {
                case 0:  sample = std::sin (p * juce::MathConstants<float>::twoPi); break;
                case 1:  sample = 2.0f * p - 1.0f;                                   break;
                default: sample = p < 0.5f ? 1.0f : -1.0f;                           break;
            }

            sample *= volume * level * envelope * 0.5f;

            for (int channel = 0; channel < output.getNumChannels(); ++channel)
                output.addSample (channel, startSample + i, sample);

            phase += increment;
            if (phase >= 1.0)
                phase -= 1.0;
        }
    }

private:
    std::atomic<float>& gain;
    std::atomic<float>& wave;
    double phase = 0.0, increment = 0.0;
    float level = 0.0f, envelope = 0.0f;
    bool releasing = false;
};

class TestSynthProcessor : public juce::AudioProcessor
{
public:
    TestSynthProcessor()
        : AudioProcessor (BusesProperties().withOutput ("Output", juce::AudioChannelSet::stereo(), true))
    {
        addParameter (volume   = new juce::AudioParameterFloat ({ "volume", 1 }, "Volume", 0.0f, 1.0f, 0.5f));
        addParameter (waveform = new juce::AudioParameterChoice ({ "waveform", 1 }, "Waveform",
                                                                 juce::StringArray { "Sine", "Saw", "Square" }, 0));

        for (int i = 0; i < 8; ++i)
            synth.addVoice (new TestVoice (gainValue, waveValue));

        synth.addSound (new TestSound());
    }

    const juce::String getName() const override { return "Preseter Test Synth"; }

    void prepareToPlay (double sampleRate, int) override { synth.setCurrentPlaybackSampleRate (sampleRate); }
    void releaseResources() override {}

    bool isBusesLayoutSupported (const BusesLayout& layouts) const override
    {
        const auto out = layouts.getMainOutputChannelSet();
        return out == juce::AudioChannelSet::mono() || out == juce::AudioChannelSet::stereo();
    }

    void processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override
    {
        juce::ScopedNoDenormals noDenormals;
        buffer.clear();

        gainValue.store (volume->get());
        waveValue.store ((float) waveform->getIndex());

        synth.renderNextBlock (buffer, midi, 0, buffer.getNumSamples());
    }

    bool hasEditor() const override                          { return false; }
    juce::AudioProcessorEditor* createEditor() override      { return nullptr; }
    bool acceptsMidi() const override                        { return true; }
    bool producesMidi() const override                       { return false; }
    double getTailLengthSeconds() const override             { return 0.0; }
    int getNumPrograms() override                            { return 1; }
    int getCurrentProgram() override                         { return 0; }
    void setCurrentProgram (int) override                    {}
    const juce::String getProgramName (int) override         { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock& destData) override
    {
        juce::MemoryOutputStream stream (destData, true);
        stream.writeFloat (volume->get());
        stream.writeInt (waveform->getIndex());
    }

    void setStateInformation (const void* data, int size) override
    {
        juce::MemoryInputStream stream (data, (size_t) size, false);
        *volume   = stream.readFloat();
        *waveform = stream.readInt();
    }

private:
    juce::AudioParameterFloat* volume = nullptr;
    juce::AudioParameterChoice* waveform = nullptr;
    std::atomic<float> gainValue { 0.5f }, waveValue { 0.0f };
    juce::Synthesiser synth;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (TestSynthProcessor)
};
} // namespace

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new TestSynthProcessor();
}
