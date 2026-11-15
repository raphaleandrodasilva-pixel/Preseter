/*
 * Smoke/áudio do C ABI do OpenWurli.
 *
 * Renderiza um acorde de Wurlitzer para WAV, sem JUCE, para validar a
 * biblioteca Rust que o PreseterEngine linka.
 */
#include "openwurli_capi.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

namespace
{
constexpr int kSampleRate = 48000;
constexpr int kBlock = 512;

void writeFloatWav (const char* path, const std::vector<float>& left, const std::vector<float>& right)
{
    std::FILE* file = std::fopen (path, "wb");
    if (file == nullptr)
        return;

    const std::uint32_t frames = (std::uint32_t) left.size();
    const std::uint16_t channels = 2;
    const std::uint16_t bits = 32;
    const std::uint32_t dataBytes = frames * channels * (bits / 8);
    const std::uint32_t riffSize = 36 + dataBytes;

    std::fwrite ("RIFF", 1, 4, file);
    std::fwrite (&riffSize, 4, 1, file);
    std::fwrite ("WAVEfmt ", 1, 8, file);
    const std::uint32_t fmtSize = 16;
    const std::uint16_t format = 3;
    const std::uint32_t byteRate = kSampleRate * channels * (bits / 8);
    const std::uint16_t blockAlign = (std::uint16_t) (channels * (bits / 8));
    std::fwrite (&fmtSize, 4, 1, file);
    std::fwrite (&format, 2, 1, file);
    const std::uint16_t ch = channels;
    std::fwrite (&ch, 2, 1, file);
    const std::uint32_t rate = kSampleRate;
    std::fwrite (&rate, 4, 1, file);
    std::fwrite (&byteRate, 4, 1, file);
    std::fwrite (&blockAlign, 2, 1, file);
    const std::uint16_t b = bits;
    std::fwrite (&b, 2, 1, file);
    std::fwrite ("data", 1, 4, file);
    std::fwrite (&dataBytes, 4, 1, file);

    for (std::uint32_t i = 0; i < frames; ++i)
    {
        std::fwrite (&left[i], sizeof (float), 1, file);
        std::fwrite (&right[i], sizeof (float), 1, file);
    }
    std::fclose (file);
}
} // namespace

int main (int argc, char** argv)
{
    std::string outputDirectory = ".";
    for (int i = 1; i < argc; ++i)
    {
        const std::string arg = argv[i];
        if (arg.rfind ("--out-dir=", 0) == 0)
            outputDirectory = arg.substr (10);
    }

    OwEngine* engine = ow_create (kSampleRate);
    if (engine == nullptr)
    {
        std::fprintf (stderr, "ow_create falhou\n");
        return 1;
    }

    ow_prepare (engine, kSampleRate, kBlock);
    ow_set_volume (engine, 0.8);
    ow_set_tremolo_depth (engine, 0.5);
    ow_set_speaker_character (engine, 0.0);
    ow_set_mlp_enabled (engine, 0);

    const int attackFrames = kSampleRate * 2;
    const int releaseFrames = kSampleRate * 3;
    const int totalFrames = attackFrames + releaseFrames;
    std::vector<float> left ((size_t) totalFrames);
    std::vector<float> right ((size_t) totalFrames);

    for (int note : { 40, 52, 59, 64 })
        ow_note_on (engine, note, 0.85f);

    for (int pos = 0; pos < attackFrames; pos += kBlock)
        ow_render (engine, left.data() + pos, right.data() + pos,
                   std::min (kBlock, attackFrames - pos));

    for (int note : { 40, 52, 59, 64 })
        ow_note_off (engine, note);

    for (int pos = attackFrames; pos < totalFrames; pos += kBlock)
        ow_render (engine, left.data() + pos, right.data() + pos,
                   std::min (kBlock, totalFrames - pos));

    // Mesmo alinhamento de saída do plugin original (+14 dB).
    constexpr float outputGain = 5.0118723f;
    for (int i = 0; i < totalFrames; ++i)
    {
        left[(size_t) i] *= outputGain;
        right[(size_t) i] *= outputGain;
    }

    double peak = 0.0;
    double energy = 0.0;
    for (int i = 0; i < totalFrames; ++i)
    {
        for (float value : { left[(size_t) i], right[(size_t) i] })
        {
            peak = std::max (peak, (double) std::fabs (value));
            energy += (double) value * value;
        }
    }

    const double rms = std::sqrt (energy / ((double) totalFrames * 2.0));
    const std::string path = outputDirectory + "/wurly-openwurli.wav";
    writeFloatWav (path.c_str(), left, right);

    std::printf ("WAV: %s\n", path.c_str());
    std::printf ("Pico: %.6f  RMS: %.2f dBFS  vozes: %d\n", peak,
                 20.0 * std::log10 (std::max (1e-12, rms)), ow_active_voice_count (engine));

    ow_destroy (engine);
    return peak > 0.0001 ? 0 : 1;
}
