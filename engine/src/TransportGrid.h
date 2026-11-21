#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace preseter
{
/**
 * Aritmética da grade de eventos sobre o `MasterClock` (D1).
 *
 * Arpejador, metrônomo e (na D4) o sequenciador de bateria usam estas mesmas
 * funções. Assim, dois eventos que caem no mesmo ponto da grade caem na mesma
 * amostra — é o que o teste de fase (`engine/test/clock-phase`) verifica.
 *
 * Unidades: ppq = semínima. `length` é o espaçamento da grade em ppq.
 * Sem JUCE de propósito (testável sem o motor).
 */
namespace transport
{
/** Espaçamento de um tempo (batida) em ppq, para o denominador do compasso. */
inline double beatLengthPpq (int denominator) noexcept
{
    return 4.0 / (double) std::max (1, denominator);
}

/** Espaçamento de um passo em ppq, para uma divisão do arp (ver a tabela do arp). */
inline double stepLengthPpq (int division) noexcept
{
    return 4.0 / (double) std::max (1, division);
}

/**
 * Posição em ppq do evento `index` da grade. `swingPercent` (0 a 75) atrasa os
 * eventos ímpares em até metade de um passo, como no arp.
 */
inline double gridPpq (std::int64_t index, double length, double swingPercent) noexcept
{
    const double base = (double) index * length;
    const double swing = (index & 1) != 0 ? length * (swingPercent / 100.0) * 0.5 : 0.0;
    return base + swing;
}

/** Primeiro índice da grade com posição >= `ppq`. */
inline std::int64_t firstIndexAtOrAfter (double ppq, double length) noexcept
{
    if (length <= 0.0)
        return 0;
    return (std::int64_t) std::ceil (ppq / length - 1.0e-9);
}

/**
 * O evento cai neste bloco? O bloco cobre [início, fim) em aritmética de
 * amostras; o evento que arredondaria para a amostra `numSamples` fica para o
 * próximo bloco, para nunca disparar duas vezes na fronteira.
 */
inline bool eventInBlock (double eventPpq, double blockPpq, double ppqPerSample,
                          int numSamples) noexcept
{
    if (ppqPerSample <= 0.0 || numSamples <= 0)
        return false;
    const double half = 0.5 * ppqPerSample;
    return eventPpq >= blockPpq - half
        && eventPpq < blockPpq + ((double) numSamples - 0.5) * ppqPerSample;
}

/** Amostra do bloco em que o evento cai (arredondada e presa a 0..numSamples-1). */
inline int sampleOffsetForPpq (double eventPpq, double blockPpq, double ppqPerSample,
                               int numSamples) noexcept
{
    if (ppqPerSample <= 0.0 || numSamples <= 0)
        return 0;
    const long offset = std::lround ((eventPpq - blockPpq) / ppqPerSample);
    return (int) std::clamp (offset, 0L, (long) numSamples - 1);
}
} // namespace transport
} // namespace preseter
