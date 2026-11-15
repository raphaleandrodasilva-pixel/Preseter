#pragma once

#include <juce_audio_basics/juce_audio_basics.h>

#include <memory>

namespace preseter
{
namespace native
{
/** Parâmetros do Wurlitzer 200A (OpenWurli) usados pela janela do Preseter. */
struct WurliParameters
{
    float volume = 0.8f;       // 0..1 (potenciômetro do amplificador)
    float tremolo = 0.5f;      // 0..1 (CC1 pode assumir)
    float speaker = 0.0f;      // 0..1 (0 = flat, 1 = gabinete 200A)
    bool mlp = false;          // correções neurais por nota
    float hammer = 1.0f;       // 0.5..2.0
    float damper = 1.0f;       // 0.25..4.0
    float reedTrim = 17200.0f; // ohms (R11), 0..25000
    bool noise = false;
    float noiseGain = 0.0f;
};

/**
    Wrapper C++ do WurliEngine (OpenWurli) via C ABI.
    O DSP é o código Rust original; aqui só traduzimos JUCE <-> C.
*/
class WurliProcessor
{
public:
    WurliProcessor();
    ~WurliProcessor();

    WurliProcessor (const WurliProcessor&) = delete;
    WurliProcessor& operator= (const WurliProcessor&) = delete;

    void prepare (double sampleRate, int maxBlock);
    void reset();
    void setParameters (const WurliParameters& parameters);
    void process (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi);

    int activeVoices() const;

private:
    struct Impl;
    std::unique_ptr<Impl> impl;
};
} // namespace native
} // namespace preseter
