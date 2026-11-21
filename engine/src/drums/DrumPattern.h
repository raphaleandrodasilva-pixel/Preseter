#pragma once

#include <algorithm>
#include <array>

namespace preseter
{
namespace drums
{
constexpr int kMaxStepsPerBar = 32;
constexpr int kMaxBars = 4;
constexpr int kMaxPatternSteps = kMaxStepsPerBar * kMaxBars; // 128
constexpr int kMaxTracks = 16;

/** Um passo: ligado/desligado e velocity (1..127). */
struct DrumStep
{
    bool on = false;
    int velocity = 100;
};

/** Uma linha da grade: um pad (0..15) e os passos do padrão. */
struct DrumTrack
{
    int pad = 0;
    bool mute = false;
    float levelDb = 0.0f;
    std::array<DrumStep, kMaxPatternSteps> steps {};
};

/**
 * Padrão do sequenciador (D4). Estrutura de tamanho fixo, sem alocação, para
 * poder ser lida na thread de áudio.
 */
struct DrumPattern
{
    int stepsPerBar = 16;   // 8, 12, 16 ou 32
    int bars = 1;           // 1, 2 ou 4
    float swing = 0.0f;     // 0..75 (%)
    int trackCount = 0;     // 0..16
    std::array<DrumTrack, kMaxTracks> tracks {};

    int totalSteps() const noexcept { return stepsPerBar * bars; }
};

inline bool isSupportedStepsPerBar (int value) noexcept
{
    return value == 8 || value == 12 || value == 16 || value == 32;
}

inline bool isSupportedBars (int value) noexcept
{
    return value == 1 || value == 2 || value == 4;
}

/** Sanitiza o padrão (usado na publicação e na leitura da interface). */
inline DrumPattern sanitizedPattern (const DrumPattern& input) noexcept
{
    DrumPattern out = input;
    if (! isSupportedStepsPerBar (out.stepsPerBar))
        out.stepsPerBar = 16;
    if (! isSupportedBars (out.bars))
        out.bars = 1;
    out.swing = std::clamp (out.swing, 0.0f, 75.0f);
    out.trackCount = std::clamp (out.trackCount, 0, kMaxTracks);

    const int total = out.totalSteps();
    for (int t = 0; t < kMaxTracks; ++t)
    {
        auto& track = out.tracks[(size_t) t];
        track.pad = std::clamp (track.pad, 0, 15);
        track.levelDb = std::clamp (track.levelDb, -60.0f, 12.0f);
        for (int s = 0; s < kMaxPatternSteps; ++s)
        {
            auto& step = track.steps[(size_t) s];
            if (s >= total)
            {
                step.on = false;
                step.velocity = 100;
                continue;
            }
            step.velocity = std::clamp (step.velocity, 1, 127);
        }
    }
    return out;
}
} // namespace drums
} // namespace preseter
