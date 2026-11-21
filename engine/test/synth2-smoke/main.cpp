// Smoke test offline do motor do Preseter Synth2: renderiza acordes sem
// dispositivo de áudio e confere que há sinal, que ele é finito e que o
// release não vira ruído/NaN.

#include "Synth2Dsp.h"

#include "EngineCore/InitPatch.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <vector>

using preseter::native::Synth2Dsp;
using preseter::native::Synth2PatchValues;

namespace
{
float analyse (const std::vector<float>& buffer, double& rms)
{
    double sum = 0.0;
    float peak = 0.0f;
    for (const float sample : buffer)
    {
        if (! std::isfinite (sample))
            return -1.0f;
        peak = std::max (peak, std::abs (sample));
        sum += (double) sample * (double) sample;
    }
    rms = buffer.empty() ? 0.0 : std::sqrt (sum / (double) buffer.size());
    return peak;
}
} // namespace

int main()
{
    constexpr double sampleRate = 48000.0;
    constexpr int blockSize = 256;
    constexpr int seconds = 1;
    const int frames = (int) (sampleRate * seconds);

    Synth2Dsp dsp;
    dsp.prepare (sampleRate);

    const Synth2PatchValues patch = oxo::s2::kInitPatchValues;
    for (int i = 0; i < preseter::native::kSynth2ParamCount; ++i)
        dsp.setParam (i, patch[(size_t) i]);
    dsp.setVolume (64);

    std::vector<float> left ((size_t) frames, 0.0f);
    std::vector<float> right ((size_t) frames, 0.0f);

    dsp.beginBlock (frames);
    dsp.noteOn (60, 100);
    dsp.noteOn (64, 100);
    dsp.noteOn (67, 100);

    for (int pos = 0; pos < frames; pos += blockSize)
    {
        const int n = std::min (blockSize, frames - pos);
        dsp.render (left.data() + pos, right.data() + pos, n);
    }

    double rms = 0.0;
    const float peak = analyse (left, rms);
    const float rightPeak = analyse (right, rms);
    const int heldVoices = dsp.activeVoices();

    dsp.noteOff (60);
    dsp.noteOff (64);
    dsp.noteOff (67);

    std::vector<float> tail ((size_t) blockSize * 40, 0.0f);
    dsp.beginBlock ((int) tail.size());
    for (size_t pos = 0; pos < tail.size(); pos += blockSize)
        dsp.render (tail.data() + pos, nullptr, (int) std::min ((size_t) blockSize, tail.size() - pos));

    double tailRms = 0.0;
    const float tailPeak = analyse (tail, tailRms);

    std::printf ("peak L/R = %.6f / %.6f | rms L = %.6f | tail peak = %.6f | vozes seguradas = %d, depois = %d\n",
                 (double) peak, (double) rightPeak, rms, (double) tailPeak, heldVoices, dsp.activeVoices());

    const bool ok = peak > 0.01f && rightPeak > 0.01f && tailPeak >= 0.0f && std::isfinite (tailRms)
                    && heldVoices >= 3 && dsp.activeVoices() == 0;
    if (! ok)
        std::printf ("FALHOU: sinal insuficiente ou inválido\n");
    return ok ? 0 : 1;
}
