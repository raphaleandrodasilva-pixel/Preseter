#pragma once

#include <algorithm>
#include <atomic>

namespace preseter
{
/**
 * Relógio mestre do transporte (D1).
 *
 * Posição em ppq (semínimas desde o início do transporte), avançada **uma vez
 * por bloco na thread de áudio** e publicada por atômicos. Todos os
 * processadores internos (arp, metrônomo e, na D4, o sequenciador de bateria)
 * leem a mesma posição, então ficam em fase.
 *
 * Regras:
 * - trocar o BPM no meio do compasso não salta a posição (a posição acumula
 *   ppq por amostra; o BPM novo vale a partir do próximo bloco);
 * - Play/Stop reinicia o transporte no compasso 1 (posição 0), como um
 *   transporte de gravador. Documentado em `docs/DRUMS.md`;
 * - nada de alocação, bloqueio ou I/O: só `std::atomic` e aritmética.
 *
 * Este arquivo não depende do JUCE de propósito, para o teste de fase
 * (`engine/test/clock-phase`) compilar sozinho e rápido.
 */
class MasterClock
{
public:
    static constexpr double kMinTempo = 20.0;
    static constexpr double kMaxTempo = 300.0;

    /** Taxa de amostragem atual do dispositivo. Chamar em `audioDeviceAboutToStart`. */
    void setSampleRate (double rate) noexcept
    {
        sampleRate.store (rate > 0.0 ? rate : 44100.0, std::memory_order_release);
    }

    void setTempo (double bpm) noexcept
    {
        tempo.store (std::clamp (bpm, kMinTempo, kMaxTempo), std::memory_order_release);
    }

    void setTimeSignature (int numeratorIn, int denominatorIn) noexcept
    {
        numerator.store (std::max (1, numeratorIn), std::memory_order_release);
        denominator.store (std::max (1, denominatorIn), std::memory_order_release);
    }

    /**
     * Play/Stop. Qualquer mudança de estado reinicia a posição (transporte
     * volta ao compasso 1). Chamar `setPlaying(true)` duas vezes seguidas não
     * reinicia de novo.
     */
    void setPlaying (bool value) noexcept
    {
        if (playing.exchange (value, std::memory_order_acq_rel) != value)
            resetPending.store (true, std::memory_order_release);
    }

    /** Pede o reinício da posição no próximo bloco (thread de mensagem). */
    void reset() noexcept { resetPending.store (true, std::memory_order_release); }

    bool isPlaying() const noexcept { return playing.load (std::memory_order_acquire); }

    // ---- Thread de áudio -------------------------------------------------

    /**
     * Marca o início de um bloco: publica a posição/tempo que valem para este
     * bloco e avança a posição por `numSamples`. Chamar **antes** de processar
     * o grafo.
     */
    void beginBlock (int numSamples) noexcept
    {
        const bool playNow = playing.load (std::memory_order_acquire);
        const double bpmNow = tempo.load (std::memory_order_acquire);
        const double rate = sampleRate.load (std::memory_order_acquire);

        if (resetPending.exchange (false, std::memory_order_acq_rel) || playNow != lastPlaying)
            position = 0.0;

        lastPlaying = playNow;

        blockPpq.store (position, std::memory_order_release);
        blockTempo.store (bpmNow, std::memory_order_release);
        blockPlaying.store (playNow, std::memory_order_release);

        if (playNow && rate > 0.0 && numSamples > 0)
            position += (double) numSamples * bpmNow / 60.0 / rate;
    }

    // ---- Leitura (qualquer thread) ---------------------------------------

    /** Posição em ppq no primeiro sample do último bloco processado. */
    double ppqAtBlockStart() const noexcept { return blockPpq.load (std::memory_order_acquire); }

    /** BPM que valeu no último bloco processado (não muda no meio do bloco). */
    double tempoAtBlockStart() const noexcept { return blockTempo.load (std::memory_order_acquire); }

    bool isPlayingAtBlockStart() const noexcept { return blockPlaying.load (std::memory_order_acquire); }

    /** Duração de uma amostra em ppq, com o BPM do último bloco. */
    double ppqPerSample() const noexcept
    {
        const double rate = sampleRate.load (std::memory_order_acquire);
        return rate > 0.0 ? tempoAtBlockStart() / 60.0 / rate : 0.0;
    }

    int getNumerator() const noexcept { return numerator.load (std::memory_order_acquire); }
    int getDenominator() const noexcept { return denominator.load (std::memory_order_acquire); }

    /** Comprimento de um compasso em ppq (semínimas). */
    double barLengthPpq() const noexcept
    {
        return (double) getNumerator() * 4.0 / (double) getDenominator();
    }

    /** Comprimento de um tempo (batida) em ppq. */
    double beatLengthPpq() const noexcept
    {
        return 4.0 / (double) getDenominator();
    }

private:
    std::atomic<double> tempo { 120.0 };
    std::atomic<int> numerator { 4 };
    std::atomic<int> denominator { 4 };
    std::atomic<bool> playing { false };
    std::atomic<bool> resetPending { false };
    std::atomic<double> sampleRate { 44100.0 };

    /** Estado publicado do bloco atual (lido por qualquer thread). */
    std::atomic<double> blockPpq { 0.0 };
    std::atomic<double> blockTempo { 120.0 };
    std::atomic<bool> blockPlaying { false };

    /** Estado privado da thread de áudio. */
    double position = 0.0;
    bool lastPlaying = false;
};
} // namespace preseter
