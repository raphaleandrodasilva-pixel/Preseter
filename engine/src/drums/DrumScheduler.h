#pragma once

#include "DrumPattern.h"
#include "TransportGrid.h"

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdint>

namespace preseter
{
namespace drums
{
/**
 * Agendador do sequenciador de bateria (D4), sem JUCE e sem alocação.
 *
 * A thread de mensagem publica o padrão (seqlock); a thread de áudio copia o
 * pendente no **início do compasso** e emite os passos na amostra exata dentro
 * do bloco. A posição vem do `MasterClock` (ppq por bloco), então trocar o BPM
 * não salta a grade e blocos de tamanhos diferentes não perdem passos.
 */
class DrumScheduler
{
public:
    struct Event
    {
        int sampleOffset = 0;
        int stepIndex = 0;
        int pad = 0;
        int velocity = 100;
    };

    void setEnabled (bool value) noexcept
    {
        enabled.store (value, std::memory_order_relaxed);
    }

    bool isEnabled() const noexcept
    {
        return enabled.load (std::memory_order_relaxed);
    }

    /** Passo atual (0..total-1) ou -1 quando parado/desligado. Thread de UI. */
    int getCurrentStep() const noexcept
    {
        return currentStep.load (std::memory_order_relaxed);
    }

    /** Thread de mensagem: publica um padrão. Vale a partir do próximo compasso. */
    void publishPattern (const DrumPattern& pattern) noexcept
    {
        writing.store (true, std::memory_order_release);
        pending = sanitizedPattern (pattern);
        version.fetch_add (1, std::memory_order_acq_rel);
        writing.store (false, std::memory_order_release);
    }

    void reset() noexcept
    {
        initialized = false;
        lastEnabled = false;
        nextPpq = 0.0;
        stepIndex = 0;
        currentStep.store (-1, std::memory_order_relaxed);
    }

    /**
     * Avança um bloco. `ppqStart`/`ppqPerSample` vêm do `MasterClock`;
     * `barLengthPpq` é o compasso atual (4/4 = 4). Devolve os eventos emitidos.
     */
    int processBlock (double ppqStart, double ppqPerSample, double barLengthPpq,
                      int numSamples, bool playing, Event* output, int maxEvents) noexcept
    {
        const bool on = enabled.load (std::memory_order_relaxed);
        if (! playing || ! on || numSamples <= 0 || output == nullptr || maxEvents <= 0
            || ppqPerSample <= 0.0 || barLengthPpq <= 0.0)
        {
            reset();
            return 0;
        }

        if (! lastEnabled)
            initialized = false; // ligou agora: entra no próximo compasso
        lastEnabled = true;

        if (! initialized)
        {
            nextPpq = firstBarAtOrAfter (ppqStart, barLengthPpq);
            stepIndex = 0;
            initialized = true;
            currentStep.store (-1, std::memory_order_relaxed);
            applyPending();
        }

        const double ppqEnd = ppqStart + (double) numSamples * ppqPerSample;
        int count = 0;

        while (true)
        {
            // Troca de padrão só no começo de um compasso, sem cortar o anterior.
            if (stepIndex % std::max (1, active.stepsPerBar) == 0)
                applyPending();

            const double stepLen = barLengthPpq / (double) std::max (1, active.stepsPerBar);
            const double swingOffset = (stepIndex % 2 != 0)
                ? stepLen * (double) active.swing / 200.0
                : 0.0;
            const double eventPpq = nextPpq + swingOffset;

            if (! transport::eventInBlock (eventPpq, ppqStart, ppqPerSample, numSamples))
                break;

            const int offset = transport::sampleOffsetForPpq (eventPpq, ppqStart, ppqPerSample,
                                                              numSamples);
            for (int t = 0; t < active.trackCount && count < maxEvents; ++t)
            {
                const auto& track = active.tracks[(size_t) t];
                if (track.mute || ! track.steps[(size_t) stepIndex].on)
                    continue;

                auto& event = output[count];
                event.sampleOffset = offset;
                event.stepIndex = stepIndex;
                event.pad = track.pad;
                event.velocity = track.steps[(size_t) stepIndex].velocity;
                ++count;
            }

            currentStep.store (stepIndex, std::memory_order_relaxed);
            nextPpq += stepLen;
            ++stepIndex;
            if (stepIndex >= active.totalSteps())
                stepIndex = 0;
        }

        return count;
    }

private:
    static double firstBarAtOrAfter (double ppq, double barLength) noexcept
    {
        const double bars = std::floor (ppq / barLength + 1.0e-9);
        double bar = bars * barLength;
        if (bar < ppq - 1.0e-9)
            bar += barLength;
        return bar;
    }

    /** Copia o pendente se a escrita terminou; se não, tenta no próximo compasso. */
    bool applyPending() noexcept
    {
        if (writing.load (std::memory_order_acquire))
            return false;

        const auto first = version.load (std::memory_order_acquire);
        if (first == activeVersion)
            return false;

        scratch = pending;
        const auto second = version.load (std::memory_order_acquire);
        if (first != second || writing.load (std::memory_order_acquire))
            return false;

        active = scratch;
        activeVersion = first;
        stepIndex = 0;
        return true;
    }

    std::atomic<bool> enabled { false };
    std::atomic<bool> writing { false };
    std::atomic<std::uint32_t> version { 0 };
    std::atomic<int> currentStep { -1 };

    DrumPattern pending {};
    DrumPattern scratch {};
    DrumPattern active {};
    std::uint32_t activeVersion = 0;

    bool initialized = false;
    bool lastEnabled = false;
    double nextPpq = 0.0;
    int stepIndex = 0;
};
} // namespace drums
} // namespace preseter
