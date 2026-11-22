#pragma once

#include "sampler/SamplerInstrument.h"

#include <juce_audio_basics/juce_audio_basics.h>

#include <array>
#include <atomic>
#include <memory>
#include <vector>

namespace preseter
{
namespace drums
{
/**
 * Motor de pads do Preseter Drums (D3).
 *
 * Lê as regiões de um `sampler::Instrument` (SF2/SFZ) e toca 16 pads mapeados
 * nas notas GM 36..51. Velocity, volume/mudo por pad, pan/filtro/envelope da
 * região, loop e grupos de exclusão (chimbal e `group`/`off_by` do SFZ).
 *
 * Bateria é "one-shot": note-off é ignorado (a amostra toca até o fim ou até
 * outro pad do mesmo grupo). Nada de alocação na thread de áudio: as vozes são
 * pré-alocadas em `prepare`.
 */
class DrumKitEngine
{
public:
    static constexpr int kPadCount = 16;
    static constexpr int kFirstPadNote = 36;
    static constexpr int kMaxVoices = 64;

    DrumKitEngine();
    ~DrumKitEngine() = default;

    /** Carrega o kit (SF2/SFZ) pelo cache do sampler. Thread de mensagem. */
    bool load (const juce::File& file, int bank, int program, juce::String& error);

    /** Fonte própria de um pad: arquivo SF2/SFZ, programa e nota tocada. */
    struct PadSourceInfo
    {
        bool active = false;
        juce::String path;
        int bank = 128;
        int program = 0;
        int note = 60;
    };

    /**
     * Carrega um SF2/SFZ só para um pad (thread de mensagem). O pad passa a usar
     * `note` desse arquivo; os demais continuam no kit do layer. Vazio = kit.
     */
    bool loadPadSource (int pad, const juce::File& file, int bank, int program, int note,
                        juce::String& error);
    void clearPadSource (int pad);
    bool hasPadSource (int pad) const noexcept;
    PadSourceInfo getPadSourceInfo (int pad) const;

    void prepare (double sampleRate, int samplesPerBlock);
    void reset() noexcept;

    bool isLoaded() const noexcept;
    juce::String describe() const;
    juce::String getSourcePath() const { return sourcePath; }
    int getBank() const noexcept { return bank; }
    int getProgram() const noexcept { return program; }

    /** Pad (0..15) da nota MIDI, ou -1 fora da faixa 36..51. */
    static int padForNote (int note) noexcept;
    /** Nome em PT-BR do pad (0..15). */
    static const char* padName (int pad) noexcept;

    /** Dispara uma nota. `velocity` 0..1. Ignora note-off (one-shot). */
    void noteOn (int note, float velocity) noexcept;
    /** Corta todas as vozes (panic). */
    void allNotesOff() noexcept;

    /** Thread de áudio: aplica um reset pedido por uma troca de kit. */
    void beginBlock() noexcept;

    /** Soma as vozes no buffer do motor, a partir de `startSample`. */
    void render (juce::AudioBuffer<float>& buffer, int startSample, int numSamples) noexcept;

    int getActiveVoices() const noexcept { return activeVoices.load(); }

    /** Volume do pad em dB (-60..12; 0 = nominal). */
    void setPadLevelDb (int pad, float db) noexcept;
    void setPadMuted (int pad, bool muted) noexcept;
    float getPadLevelDb (int pad) const noexcept;
    bool getPadMuted (int pad) const noexcept;
    /** Solo (transitório): com algum pad em solo, só ele(s) tocam. */
    void setPadSolo (int pad, bool solo) noexcept;
    bool getPadSolo (int pad) const noexcept;

    /** Volume geral do kit em dB (-60..12). */
    void setOutputGainDb (float db) noexcept;
    float getOutputGainDb() const noexcept;

private:
    struct Envelope
    {
        enum class Stage { idle, attack, decay, sustain, release };
        Stage stage = Stage::idle;
        float level = 0.0f;
        float attackDelta = 1.0f;
        float decayCoef = 0.0f;
        float sustainLevel = 1.0f;
        float releaseCoef = 0.0f;

        void start (float attackTime, float decayTime, float sustainValue, float releaseTime,
                    double sampleRate);
        float next() noexcept;
        bool isActive() const noexcept { return stage != Stage::idle; }
    };

    struct Svf
    {
        float ic1 = 0.0f, ic2 = 0.0f;
        float a1 = 0.0f, a2 = 0.0f, a3 = 0.0f;
        void set (float cutoffHz, float q, double sampleRate);
        float process (float input) noexcept;
        void reset() noexcept { ic1 = 0.0f; ic2 = 0.0f; }
    };

    struct Voice
    {
        bool active = false;
        /** Kit usado nesta voz (mantém a amostra/região válidas mesmo após uma troca). */
        const sampler::Instrument* source = nullptr;
        int regionIndex = -1;
        int pad = -1;
        int note = 60;
        double position = 0.0;
        double ratio = 1.0;
        float gain = 1.0f;
        float gainLeft = 0.707f;
        float gainRight = 0.707f;
        float cutoff = 20000.0f;
        float resonance = 0.0f;
        bool filterActive = false;
        Envelope envelope;
        Svf filter;
        juce::uint32 order = 0;
    };

    const sampler::Instrument* currentInstrument() const noexcept
    {
        return activeInstrument.load (std::memory_order_acquire);
    }

    Voice* allocateVoice() noexcept;
    void startVoice (const sampler::Instrument* source, const sampler::Region& region,
                     int regionIndex, int pad, int note, float velocity) noexcept;
    void chokeHats() noexcept;
    void chokeOffBy (int group) noexcept;

    /**
     * Kit ativo (thread de áudio) e donos mantidos vivos enquanto o processador
     * existir. Trocar o kit na thread de mensagem é seguro: as vozes antigas
     * continuam usando o instrumento em que nasceram.
     */
    std::atomic<sampler::Instrument*> activeInstrument { nullptr };
    std::vector<std::shared_ptr<sampler::Instrument>> instrumentKeepAlive;
    /** Fonte própria por pad (nullptr = kit do layer). */
    std::array<std::atomic<sampler::Instrument*>, kPadCount> padInstruments {};
    std::array<std::atomic<int>, kPadCount> padSourceNotes {};
    std::array<PadSourceInfo, kPadCount> padSourceInfo;
    juce::String sourcePath;
    int bank = 0;
    int program = 0;
    double sampleRate = 44100.0;
    std::array<Voice, kMaxVoices> voices;
    std::array<std::atomic<float>, kPadCount> padGain {};
    std::array<std::atomic<bool>, kPadCount> padMuted {};
    std::array<std::atomic<bool>, kPadCount> padSolo {};
    std::atomic<float> outputGain { 1.0f };
    juce::uint32 voiceOrder = 0;
    std::atomic<int> activeVoices { 0 };
    /** Pedido de reset (troca de kit) consumido pela thread de áudio. */
    std::atomic<bool> resetRequested { false };
};
} // namespace drums
} // namespace preseter
