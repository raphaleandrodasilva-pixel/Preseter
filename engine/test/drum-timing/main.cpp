/*
 * Teste de tempo do sequenciador de bateria (D4).
 *
 * Simula 10 minutos com blocos de 64/256/1024 amostras e BPM variando
 * (120/143/97/180/120), usando o `MasterClock` e o `DrumSequencer` reais.
 * Confere:
 *  - cada passo cai na amostra esperada (±1), inclusive em blocos diferentes;
 *  - a troca de BPM não perde nem adianta passos;
 *  - o swing desloca os passos ímpares pela metade do percentual;
 *  - a troca de padrão só acontece no início do compasso.
 */
#include "MasterClock.h"
#include "drums/DrumSequencer.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <vector>

namespace
{
constexpr int kSampleRate = 48000;
constexpr int kSeconds = 600;
constexpr long long kTotalSamples = (long long) kSampleRate * kSeconds;
constexpr int kBlockSizes[] = { 64, 256, 1024 };

struct Segment
{
    double ppqStart = 0.0;
    double ppqPerSample = 0.0;
    long long sampleStart = 0;
};

struct CapturedEvent
{
    long long sample = 0;
    int stepIndex = 0;
    int pad = 0;
    int velocity = 0;
};

double tempoForSecond (double seconds)
{
    if (seconds < 120.0) return 120.0;
    if (seconds < 240.0) return 143.0;
    if (seconds < 360.0) return 97.0;
    if (seconds < 480.0) return 180.0;
    return 120.0;
}

preseter::drums::DrumPattern makePattern (int pad, int stepsPerBar = 16, int bars = 1,
                                          float swing = 0.0f)
{
    preseter::drums::DrumPattern pattern;
    pattern.stepsPerBar = stepsPerBar;
    pattern.bars = bars;
    pattern.swing = swing;
    pattern.trackCount = 1;
    auto& track = pattern.tracks[0];
    track.pad = pad;
    track.mute = false;
    track.levelDb = 0.0f;
    for (int step = 0; step < pattern.totalSteps(); ++step)
    {
        track.steps[(size_t) step].on = true;
        track.steps[(size_t) step].velocity = 100;
    }
    return pattern;
}

/** Modelo independente: tempo decorrido até a posição ppq, integrando os blocos. */
double sampleAtPpq (const std::vector<Segment>& segments, double ppq)
{
    if (segments.empty())
        return 0.0;

    size_t low = 0;
    size_t high = segments.size();
    while (low + 1 < high)
    {
        const size_t middle = (low + high) / 2;
        if (segments[middle].ppqStart <= ppq)
            low = middle;
        else
            high = middle;
    }

    const auto& segment = segments[low];
    return (double) segment.sampleStart + (ppq - segment.ppqStart) / segment.ppqPerSample;
}

} // namespace

int main()
{
    using preseter::MasterClock;
    using preseter::drums::DrumSequencer;

    bool ok = true;

    // ---------------------------------------------------------------------
    // 1) 10 minutos, BPM variando, blocos variados: ±1 amostra
    // ---------------------------------------------------------------------
    {
        MasterClock clock;
        clock.setSampleRate (kSampleRate);
        clock.setTimeSignature (4, 4);
        clock.setTempo (120.0);
        clock.setPlaying (true);

        DrumSequencer sequencer;
        sequencer.setMasterClock (&clock);
        sequencer.publishPattern (makePattern (0));
        sequencer.setEnabled (true);

        std::vector<CapturedEvent> events;
        std::vector<Segment> segments;
        events.reserve (6000);
        segments.reserve (70000);

        long long absolute = 0;
        int blockIndex = 0;
        while (absolute < kTotalSamples)
        {
            int numSamples = kBlockSizes[blockIndex % 3];
            if (absolute + numSamples > kTotalSamples)
                numSamples = (int) (kTotalSamples - absolute);

            clock.setTempo (tempoForSecond ((double) absolute / (double) kSampleRate));
            clock.beginBlock (numSamples);

            const double ppqStart = clock.ppqAtBlockStart();
            const double ppqPerSample = clock.ppqPerSample();
            segments.push_back ({ ppqStart, ppqPerSample, absolute });

            const int count = sequencer.process (numSamples);
            const auto* emitted = sequencer.getEvents();
            for (int i = 0; i < count; ++i)
                events.push_back ({ absolute + emitted[i].sampleOffset, emitted[i].stepIndex,
                                    emitted[i].pad, emitted[i].velocity });

            absolute += numSamples;
            ++blockIndex;
        }

        const double stepLen = 4.0 / 16.0; // 4/4, 16 passos por compasso
        const long long expected = 5280;  // 1320 semínimas / 0.25
        const long long delta = (long long) events.size() - expected;
        std::printf ("10 min: eventos=%zu (esperado ~%lld, delta %+lld)\n",
                     events.size(), expected, delta);
        if (delta < -2 || delta > 2)
        {
            std::printf ("FALHA: contagem de passos fora do esperado\n");
            ok = false;
        }

        if (! events.empty() && events.front().sample != 0)
        {
            std::printf ("FALHA: primeiro passo em %lld (esperado 0)\n", events.front().sample);
            ok = false;
        }

        double worst = 0.0;
        long long worstSample = -1;
        for (size_t i = 0; i < events.size(); ++i)
        {
            const long long k = (long long) i;
            const double expectedPpq = (double) k * stepLen;
            const double expectedSample = sampleAtPpq (segments, expectedPpq);
            const double error = std::abs ((double) events[i].sample - expectedSample);
            if (error > worst)
            {
                worst = error;
                worstSample = events[i].sample;
            }
            if (events[i].stepIndex != (int) (k % 16))
            {
                std::printf ("FALHA: passo %zu com índice %d\n", i, events[i].stepIndex);
                ok = false;
                break;
            }
            if (i > 0 && events[i].sample <= events[i - 1].sample)
            {
                std::printf ("FALHA: passo %zu não avança (%lld -> %lld)\n", i,
                             events[i - 1].sample, events[i].sample);
                ok = false;
                break;
            }
        }

        std::printf ("pior erro absoluto: %.3f amostras (em %lld)\n", worst, worstSample);
        if (worst > 1.0)
        {
            std::printf ("FALHA: passo fora de ±1 amostra\n");
            ok = false;
        }
    }

    // ---------------------------------------------------------------------
    // 2) Swing: passos ímpares atrasados em stepLen * swing / 200
    // ---------------------------------------------------------------------
    {
        MasterClock clock;
        clock.setSampleRate (kSampleRate);
        clock.setTimeSignature (4, 4);
        clock.setTempo (120.0);
        clock.setPlaying (true);

        DrumSequencer sequencer;
        sequencer.setMasterClock (&clock);
        sequencer.publishPattern (makePattern (0, 16, 1, 60.0f));
        sequencer.setEnabled (true);

        std::vector<CapturedEvent> events;
        std::vector<Segment> segments;

        long long absolute = 0;
        const long long total = (long long) kSampleRate * 30;
        int blockIndex = 0;
        while (absolute < total)
        {
            const int numSamples = std::min ((long long) kBlockSizes[blockIndex % 3], total - absolute);
            clock.beginBlock (numSamples);
            segments.push_back ({ clock.ppqAtBlockStart(), clock.ppqPerSample(), absolute });

            const int count = sequencer.process (numSamples);
            const auto* emitted = sequencer.getEvents();
            for (int i = 0; i < count; ++i)
                events.push_back ({ absolute + emitted[i].sampleOffset, emitted[i].stepIndex,
                                    emitted[i].pad, emitted[i].velocity });

            absolute += numSamples;
            ++blockIndex;
        }

        const double stepLen = 4.0 / 16.0;
        double worst = 0.0;
        for (size_t i = 0; i < events.size(); ++i)
        {
            const long long k = (long long) i;
            const double swing = (k % 2 != 0) ? stepLen * 0.3 : 0.0; // 60% = 0.3 do passo
            const double expectedPpq = (double) k * stepLen + swing;
            worst = std::max (worst, std::abs ((double) events[i].sample
                                               - sampleAtPpq (segments, expectedPpq)));
        }
        std::printf ("swing 60%%: eventos=%zu | pior erro %.3f amostras\n",
                     events.size(), worst);
        if (worst > 1.0)
        {
            std::printf ("FALHA: swing fora de ±1 amostra\n");
            ok = false;
        }
    }

    // ---------------------------------------------------------------------
    // 3) Resoluções 8/12/16/32 e compassos 1/2/4
    // ---------------------------------------------------------------------
    {
        for (const int stepsPerBar : { 8, 12, 16, 32 })
        {
            MasterClock clock;
            clock.setSampleRate (kSampleRate);
            clock.setTimeSignature (4, 4);
            clock.setTempo (120.0);
            clock.setPlaying (true);

            DrumSequencer sequencer;
            sequencer.setMasterClock (&clock);
            sequencer.publishPattern (makePattern (0, stepsPerBar, 1));
            sequencer.setEnabled (true);

            std::vector<CapturedEvent> events;
            long long absolute = 0;
            const long long total = (long long) kSampleRate * 10;
            while (absolute < total)
            {
                const int numSamples = std::min ((long long) 256, total - absolute);
                clock.beginBlock (numSamples);
                const int count = sequencer.process (numSamples);
                const auto* emitted = sequencer.getEvents();
                for (int i = 0; i < count; ++i)
                    events.push_back ({ absolute + emitted[i].sampleOffset, emitted[i].stepIndex,
                                        emitted[i].pad, emitted[i].velocity });
                absolute += numSamples;
            }

            const int expected = 5 * stepsPerBar; // 10 s a 120 BPM = 5 compassos
            const int delta = (int) events.size() - expected;
            double worstGap = 0.0;
            const double expectedGap = (2.0 / (double) stepsPerBar) * (double) kSampleRate;
            for (size_t i = 0; i < events.size(); ++i)
            {
                if (events[i].stepIndex != (int) (i % (size_t) stepsPerBar))
                {
                    std::printf ("FALHA: resolução %d, passo %zu com índice %d\n",
                                 stepsPerBar, i, events[i].stepIndex);
                    ok = false;
                    break;
                }
                if (i > 0)
                {
                    const double gap = (double) (events[i].sample - events[i - 1].sample);
                    worstGap = std::max (worstGap, std::abs (gap - expectedGap));
                }
            }
            std::printf ("resolução %2d: eventos=%zu (esperado %d, delta %+d) | pior erro de espaçamento %.3f\n",
                         stepsPerBar, events.size(), expected, delta, worstGap);
            if (delta < -1 || delta > 1 || worstGap > 1.0)
            {
                std::printf ("FALHA: resolução %d fora do esperado\n", stepsPerBar);
                ok = false;
            }
        }

        // bars = 2: o índice do passo percorre 0..31 e volta.
        MasterClock clock;
        clock.setSampleRate (kSampleRate);
        clock.setTimeSignature (4, 4);
        clock.setTempo (120.0);
        clock.setPlaying (true);

        DrumSequencer sequencer;
        sequencer.setMasterClock (&clock);
        sequencer.publishPattern (makePattern (0, 16, 2));
        sequencer.setEnabled (true);

        std::vector<int> indices;
        long long absolute = 0;
        const long long total = (long long) kSampleRate * 6;
        while (absolute < total)
        {
            const int numSamples = std::min ((long long) 256, total - absolute);
            clock.beginBlock (numSamples);
            const int count = sequencer.process (numSamples);
            const auto* emitted = sequencer.getEvents();
            for (int i = 0; i < count; ++i)
                indices.push_back (emitted[i].stepIndex);
            absolute += numSamples;
        }
        bool barsOk = ! indices.empty();
        for (size_t i = 0; i < indices.size(); ++i)
            if (indices[i] != (int) (i % 32))
                barsOk = false;
        std::printf ("bars=2: passos=%zu | índice 0..31: %s\n", indices.size(),
                     barsOk ? "ok" : "FALHA");
        if (! barsOk)
            ok = false;
    }

    // ---------------------------------------------------------------------
    // 4) Troca de padrão só no início do compasso
    // ---------------------------------------------------------------------
    {
        MasterClock clock;
        clock.setSampleRate (kSampleRate);
        clock.setTimeSignature (4, 4);
        clock.setTempo (120.0); // compasso 4/4 = 2 s = 96000 amostras
        clock.setPlaying (true);

        DrumSequencer sequencer;
        sequencer.setMasterClock (&clock);
        sequencer.publishPattern (makePattern (0));
        sequencer.setEnabled (true);

        std::vector<CapturedEvent> events;
        long long absolute = 0;
        const long long total = (long long) kSampleRate * 4;
        const long long changeAt = (long long) kSampleRate * 1.3; // meio do primeiro compasso
        int blockIndex = 0;
        while (absolute < total)
        {
            const int numSamples = std::min ((long long) 256, total - absolute);
            if (absolute >= changeAt && absolute < changeAt + 256)
                sequencer.publishPattern (makePattern (1));

            clock.beginBlock (numSamples);
            const int count = sequencer.process (numSamples);
            const auto* emitted = sequencer.getEvents();
            for (int i = 0; i < count; ++i)
                events.push_back ({ absolute + emitted[i].sampleOffset, emitted[i].stepIndex,
                                    emitted[i].pad, emitted[i].velocity });

            absolute += numSamples;
            ++blockIndex;
        }

        const long long barStart = (long long) kSampleRate * 2;
        long long firstB = -1;
        long long lastA = -1;
        for (const auto& event : events)
        {
            if (event.pad == 1 && firstB < 0)
                firstB = event.sample;
            if (event.pad == 0)
                lastA = std::max (lastA, event.sample);
        }

        std::printf ("troca de padrão: primeiro B em %lld (compasso em %lld) | último A em %lld\n",
                     firstB, barStart, lastA);
        if (firstB < 0 || std::abs (firstB - barStart) > 1)
        {
            std::printf ("FALHA: o padrão novo não entrou no início do compasso\n");
            ok = false;
        }
        if (lastA >= barStart)
        {
            std::printf ("FALHA: o padrão antigo continuou depois do compasso\n");
            ok = false;
        }
    }

    std::printf ("Resultado: %s\n", ok ? "PASS" : "FAIL");
    return ok ? 0 : 1;
}
