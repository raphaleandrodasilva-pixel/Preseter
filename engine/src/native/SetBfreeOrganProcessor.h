#pragma once

#include <array>
#include <cstdint>
#include <memory>

namespace preseter
{
namespace native
{
/** Evento MIDI já normalizado (canal 0 = manual superior). */
struct SetBfreeMidiEvent
{
    int samplePosition = 0;
    std::uint8_t data[3] {};
    std::uint8_t size = 0;
};

/**
    Wrapper do DSP original do setBfree (tonegen + vibrato/chorus + preamp +
    reverb + Leslie). Reproduz a mesma ordem de inicialização e de
    processamento do `b_synth/lv2.c` do setBfree.

    Nada aqui implementa síntese própria: todo o áudio vem do código GPL do
    setBfree importado em `engine/third_party/setbfree`.
*/
class SetBfreeOrgan
{
public:
    SetBfreeOrgan();
    ~SetBfreeOrgan();

    SetBfreeOrgan (const SetBfreeOrgan&) = delete;
    SetBfreeOrgan& operator= (const SetBfreeOrgan&) = delete;

    /** Recria o instrumento para a taxa de amostragem informada. */
    void prepare (double sampleRate);
    void release();

    /** Desliga todas as notas sem recriar o instrumento. */
    void panic();

    void setDrawbars (const std::array<int, 9>& values);
    void setPercussion (bool enabled, bool soft, bool fast, bool thirdHarmonic);

    /** 0 = desligado, 1..3 = V1..V3, 4..6 = C1..C3. */
    void setVibrato (int mode);

    /** 0 = parado, 1 = lento, 2 = rápido, 3 = freio. */
    void setLeslie (int mode);

    void setOverdrive (float amount);
    void setReverb (float mix);
    void setKeyClick (float amount);

    /** 0..1, aplicado no pedal de expressão (swell) do setBfree. */
    void setVolume (float amount);

    void process (float* left,
                  float* right,
                  int numSamples,
                  const SetBfreeMidiEvent* events,
                  int numEvents);

private:
    struct Impl;
    std::unique_ptr<Impl> impl;
};
} // namespace native
} // namespace preseter
