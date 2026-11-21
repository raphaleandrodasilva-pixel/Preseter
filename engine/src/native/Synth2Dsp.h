#pragma once

// Adaptador do motor do Oxo Synth2 (MIT, ver third_party/oxo-synth2) para o
// NativeProcessor. Mantém o EngineCore fora dos cabeçalhos do motor do
// Preseter e concentra aqui o estado que muda na thread de áudio.

#include <array>
#include <cstdint>
#include <memory>
#include <string>

namespace preseter
{
namespace native
{
/** Os 99 parâmetros de patch do Synth1/Synth2 (o volume é separado). */
inline constexpr int kSynth2ParamCount = 99;
using Synth2PatchValues = std::array<int32_t, kSynth2ParamCount>;

/**
    Motor de áudio do Preseter Synth2.

    Não é seguro chamar os métodos de áudio (beginPatchIfNeeded, beginBlock,
    render, setParam, setVolume e os de MIDI) fora da thread de áudio. O que a
    thread de mensagem pode chamar com segurança: prepare (antes do áudio),
    requestPatchReload, activeVoices, parseSy1 e writeSy1.
*/
class Synth2Dsp
{
public:
    Synth2Dsp();
    ~Synth2Dsp();

    Synth2Dsp (const Synth2Dsp&) = delete;
    Synth2Dsp& operator= (const Synth2Dsp&) = delete;

    void prepare (double sampleRate);

    /** Aplica o fade/limpeza de um patch novo, se pedido pela thread de mensagem. */
    void beginPatchIfNeeded();
    /** Início do bloco do host (chamar antes do primeiro render). */
    void beginBlock (int frames);
    void render (float* left, float* right, int frames);

    void setParam (int id, int32_t value);
    void setVolume (int32_t value);
    void setTransport (double bpm, double ppq, bool playing);

    void noteOn (int note, int velocity);
    void noteOff (int note);
    void pitchBend (int value14);
    void controlChange (int cc, int value);
    void channelPressure (int value);
    void allNotesOff (bool immediate);
    void panic();

    int activeVoices() const;

    /** Pede, na thread de mensagem, que o próximo bloco trate uma troca de patch. */
    void requestPatchReload();

    /** Lê um arquivo .sy1 (texto) e devolve os 99 valores nativos. */
    static bool parseSy1 (const std::string& text, Synth2PatchValues& values,
                          std::string* name = nullptr);
    /** Escreve um .sy1 compatível com o Synth1 (ver=112). */
    static std::string writeSy1 (const std::string& name, const Synth2PatchValues& values);

private:
    struct Impl;
    std::unique_ptr<Impl> impl;
};
} // namespace native
} // namespace preseter
