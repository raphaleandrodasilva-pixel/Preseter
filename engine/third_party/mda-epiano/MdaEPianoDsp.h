#pragma once

#include <juce_audio_basics/juce_audio_basics.h>

#include <vector>

namespace preseter
{
namespace native
{
/**
    Parâmetros do MDA ePiano, nas faixas reais do plugin original.
    A conversão para os valores internos acontece em MdaEPianoDsp::setParameters().
*/
struct MdaEPianoParameters
{
    float decay = 50.0f;       // 0..100 %
    float release = 50.0f;     // 0..100 %
    float hardness = 0.0f;     // -50..50 %
    float treble = 0.0f;       // -50..50 %
    float modulation = 0.5f;   // 0 = auto-pan, 0.5 = desligado, 1 = tremolo
    float lfoRate = 0.65f;     // 0..1 (mapeado para ~0.07..37 Hz)
    float velocity = 25.0f;    // 0..100 %
    float stereo = 100.0f;     // 0..200 %
    float polyphony = 16.0f;   // 1..32
    float fine = 0.0f;         // -50..50 cents
    float random = 0.0f;       // 0..1
    float overdrive = 0.0f;    // 0..100 %
    float volume = 0.8f;       // 0..1 (volume interno do MDA)
};

/**
    DSP do MDA ePiano (base: porte JUCE MIT de M.I. Hollemans, sobre o código
    original de Paul Kellett). Sem VST2, sem UI e sem APVTS: recebe os
    parâmetros já convertidos e processa um AudioBuffer/MidiBuffer do JUCE.

    CC1 (modulação) controla a profundidade do tremolo/auto-pan, como no MDA.
    CC7 controla o volume e CC64/66 o pedal de sustain.
*/
class MdaEPianoDsp
{
public:
    MdaEPianoDsp();

    void prepare (double sampleRate);
    void reset();
    void setParameters (const MdaEPianoParameters& parameters);
    void clearModWheelOverride();

    void process (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi);

    /** Profundidade atual do mod wheel (0..1); -1 = nunca recebido. */
    float modWheelDepth() const noexcept { return modWheel_; }

private:
    struct Voice
    {
        int note = 0;
        int delta = 0;
        int frac = 0;
        int pos = 0;
        int end = 0;
        int loop = 0;
        float env = 0.0f;
        float decay = 0.99f;
        float outl = 0.0f;
        float outr = 0.0f;
    };

    struct Keygroup
    {
        int root = 0;
        int high = 0;
        int pos = 0;
        int end = 0;
        int loop = 0;
    };

    static constexpr int kNumVoices = 32;
    static constexpr int kEventBuffer = 120;
    static constexpr int kEventsDone = 99999999;
    static constexpr int kSustain = 128;

    void resetState();
    void processEvents (juce::MidiBuffer& midi);
    void noteOn (int note, int velocity);

    std::vector<short> waveData_;
    const short* waves_ = nullptr;

    Keygroup keygroups_[33] {};
    Voice voices_[kNumVoices] {};
    int notes_[kEventBuffer + 8] {};

    int numActiveVoices_ = 0;
    int sustain_ = 0;
    int polyphony_ = 16;

    float sampleRate_ = 44100.0f;
    float inverseSampleRate_ = 1.0f / 44100.0f;

    float volume_ = 0.2f;
    float envDecay_ = 0.5f;
    float envRelease_ = 0.5f;
    int hardnessOffset_ = 0;
    float trebleGain_ = 0.0f;
    float filtCoef_ = 0.5f;
    float filtL_ = 0.0f;
    float filtR_ = 0.0f;
    float modulation_ = 0.5f;
    float modWheel_ = -1.0f;
    float lmod_ = 0.0f;
    float rmod_ = 0.0f;
    float lfoRate_ = 0.0f;
    float lfo0_ = 0.0f;
    float lfo1_ = 1.0f;
    float velocitySensitivity_ = 1.5f;
    float fine_ = 0.0f;
    float random_ = 0.0f;
    float width_ = 0.015f;
    float overdrive_ = 0.0f;
};
} // namespace native
} // namespace preseter
