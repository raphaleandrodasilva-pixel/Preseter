/*
 * Teste de fase do relógio mestre (D1).
 *
 * Simula 10 minutos de áudio (48 kHz, blocos de 64/256/1024 amostras, BPM
 * variando) e confere que:
 *  - a posição em ppq é contínua (sem salto ao trocar o BPM);
 *  - o metrônomo (grade de batidas) e o arpejador (grade de passos) caem
 *    exatamente na mesma amostra.
 *
 * Usa só `MasterClock.h` e `TransportGrid.h` — as mesmas funções que os
 * processadores do motor usam — sem JUCE e sem dispositivo de áudio.
 */
#include "MasterClock.h"
#include "TransportGrid.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <vector>

namespace
{
constexpr int kSampleRate = 48000;
constexpr int kSeconds = 600;                       // 10 minutos
constexpr long long kTotalSamples = (long long) kSampleRate * kSeconds;
constexpr int kBlockSizes[] = { 64, 256, 1024 };

/** Divisão do arp usada no teste: rateIndex 3 ("1/16") → division 4 (um tempo). */
constexpr int kArpDivision = 4;

double tempoForSecond (double seconds)
{
    if (seconds < 120.0) return 120.0;
    if (seconds < 240.0) return 143.0;
    if (seconds < 360.0) return 97.0;
    if (seconds < 480.0) return 180.0;
    return 120.0;
}
} // namespace
int main()
{
    preseter::MasterClock clock;
    clock.setSampleRate (kSampleRate);
    clock.setTimeSignature (4, 4);
    clock.setTempo (120.0);
    clock.setPlaying (true);

    const double beatLength = preseter::transport::beatLengthPpq (4);
    const double stepLength = preseter::transport::stepLengthPpq (kArpDivision);

    std::vector<long long> beatSamples;
    std::vector<long long> stepSamples;
    beatSamples.reserve (2048);
    stepSamples.reserve (2048);

    std::int64_t nextBeat = 0;
    std::int64_t nextStep = 0;
    long long absoluteSample = 0;
    long long blockIndex = 0;
    double previousEndPpq = 0.0;
    double worstContinuity = 0.0;
    bool firstBlock = true;

    while (absoluteSample < kTotalSamples)
    {
        int numSamples = kBlockSizes[blockIndex % 3];
        if (absoluteSample + numSamples > kTotalSamples)
            numSamples = (int) (kTotalSamples - absoluteSample);

        clock.setTempo (tempoForSecond ((double) absoluteSample / (double) kSampleRate));
        clock.beginBlock (numSamples);

        const double ppqStart = clock.ppqAtBlockStart();
        const double ppqPerSample = clock.ppqPerSample();

        if (! firstBlock)
            worstContinuity = std::max (worstContinuity, std::abs (ppqStart - previousEndPpq));
        firstBlock = false;
        previousEndPpq = ppqStart + (double) numSamples * ppqPerSample;

        while (preseter::transport::eventInBlock (
                   preseter::transport::gridPpq (nextBeat, beatLength, 0.0),
                   ppqStart, ppqPerSample, numSamples))
        {
            const double eventPpq = preseter::transport::gridPpq (nextBeat, beatLength, 0.0);
            beatSamples.push_back (absoluteSample + preseter::transport::sampleOffsetForPpq (
                                                         eventPpq, ppqStart, ppqPerSample,
                                                         numSamples));
            ++nextBeat;
        }

        while (preseter::transport::eventInBlock (
                   preseter::transport::gridPpq (nextStep, stepLength, 0.0),
                   ppqStart, ppqPerSample, numSamples))
        {
            const double eventPpq = preseter::transport::gridPpq (nextStep, stepLength, 0.0);
            stepSamples.push_back (absoluteSample + preseter::transport::sampleOffsetForPpq (
                                                         eventPpq, ppqStart, ppqPerSample,
                                                         numSamples));
            ++nextStep;
        }

        absoluteSample += numSamples;
        ++blockIndex;
    }

    std::printf ("Relogio mestre - teste de fase (10 min simulados)\n");
    std::printf ("blocos: %lld | amostras: %lld\n", blockIndex, kTotalSamples);
    std::printf ("eventos: metronomo=%zu arp=%zu\n", beatSamples.size(), stepSamples.size());
    std::printf ("continuidade maxima de ppq entre blocos: %.3e\n", worstContinuity);

    bool ok = true;

    if (beatSamples.empty() || stepSamples.empty())
    {
        std::printf ("FALHA: nenhuma grade gerou eventos\n");
        ok = false;
    }

    if (! beatSamples.empty() && beatSamples.front() != 0)
    {
        std::printf ("FALHA: primeiro evento em %lld (esperado 0)\n", beatSamples.front());
        ok = false;
    }

    // Esperado: 2 min em cada BPM (120, 143, 97, 180, 120) = 1320 batidas.
    const long long expectedBeats = 1320;
    const long long beatDelta = (long long) beatSamples.size() - expectedBeats;
    if (beatDelta < -2 || beatDelta > 2)
    {
        std::printf ("FALHA: %zu batidas, esperado ~%lld\n",
                     beatSamples.size(), expectedBeats);
        ok = false;
    }

    if (beatSamples.size() != stepSamples.size())
    {
        std::printf ("FALHA: tamanhos diferentes (metronomo=%zu arp=%zu)\n",
                     beatSamples.size(), stepSamples.size());
        ok = false;
    }
    else
    {
        int mismatches = 0;
        long long firstMismatchBeat = -1;
        for (std::size_t i = 0; i < beatSamples.size(); ++i)
        {
            if (beatSamples[i] != stepSamples[i])
            {
                if (mismatches == 0)
                    firstMismatchBeat = (long long) i;
                ++mismatches;
            }
        }
        if (mismatches != 0)
        {
            std::printf ("FALHA: %d eventos fora de fase (primeiro no evento %lld)\n",
                         mismatches, firstMismatchBeat);
            ok = false;
        }
    }

    for (std::size_t i = 1; i < beatSamples.size(); ++i)
    {
        if (beatSamples[i] <= beatSamples[i - 1])
        {
            std::printf ("FALHA: evento %zu nao avanca (%lld -> %lld)\n",
                         i, beatSamples[i - 1], beatSamples[i]);
            ok = false;
            break;
        }
    }

    // 10 minutos em 48 kHz: a posição não pode saltar na troca de BPM. A
    // tolerância cobre só erro de ponto flutuante (1e-9 ppq).
    if (worstContinuity > 1.0e-9)
    {
        std::printf ("FALHA: salto de posicao ao trocar o BPM (%.3e ppq)\n", worstContinuity);
        ok = false;
    }

    // Play/Stop: o transporte reinicia no compasso 1 (documentado em
    // docs/DRUMS.md). Stop publica 0; Play recomeça em 0 e volta a avançar.
    bool transportOk = true;
    clock.setPlaying (false);
    clock.beginBlock (256);
    if (clock.ppqAtBlockStart() != 0.0 || clock.isPlayingAtBlockStart())
        transportOk = false;

    clock.setPlaying (true);
    clock.beginBlock (256);
    if (clock.ppqAtBlockStart() != 0.0 || ! clock.isPlayingAtBlockStart())
        transportOk = false;

    const double ppqPerSample = clock.ppqPerSample();
    clock.beginBlock (256);
    const double advanced = clock.ppqAtBlockStart();
    const double expectedAdvance = 256.0 * ppqPerSample;
    if (std::abs (advanced - expectedAdvance) > 1.0e-12)
        transportOk = false;

    if (! transportOk)
    {
        std::printf ("FALHA: Play/Stop nao reiniciou a posicao como documentado\n");
        ok = false;
    }
    else
    {
        std::printf ("transporte: Stop=0, Play=0, avanco apos Play=%.9f ppq (ok)\n",
                     advanced);
    }

    std::printf ("ultimo evento: amostra %lld\n",
                 beatSamples.empty() ? -1LL : beatSamples.back());
    std::printf ("Resultado: %s\n", ok ? "PASS" : "FAIL");
    return ok ? 0 : 1;
}
