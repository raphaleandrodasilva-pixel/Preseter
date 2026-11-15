/*
 * Teste de nulidade do motor de órgão.
 *
 * Renderiza a mesma sequência MIDI com:
 *   A) o wrapper C++ usado pelo Preseter (SetBfreeOrgan)
 *   B) uma referência em C que reproduz o caminho do b_synth/lv2.c
 *
 * Compara amostra a amostra e imprime a diferença em dBFS.
 *
 * O setBfree usa rand() (global) para o ruído de key-click. Para comparar,
 * cada renderização começa com a mesma semente e roda do início ao fim antes
 * da outra, de modo que as duas consomem exatamente a mesma sequência.
 */
#include "reference.h"

#include "SetBfreeOrganProcessor.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

namespace
{
constexpr int kSampleRate = 48000;
constexpr int kBlockSize = 512;
constexpr unsigned int kSeed = 0x5E7B3EEu;

void writeFloatWav (const char* path, const std::vector<float>& left, const std::vector<float>& right)
{
    std::FILE* file = std::fopen (path, "wb");
    if (file == nullptr)
    {
        std::perror (path);
        return;
    }

    const std::uint32_t frames = (std::uint32_t) left.size();
    const std::uint16_t channels = 2;
    const std::uint16_t bits = 32;
    const std::uint32_t dataBytes = frames * channels * (bits / 8);
    const std::uint32_t riffSize = 36 + dataBytes;

    std::fwrite ("RIFF", 1, 4, file);
    std::fwrite (&riffSize, 4, 1, file);
    std::fwrite ("WAVEfmt ", 1, 8, file);
    const std::uint32_t fmtSize = 16;
    const std::uint16_t format = 3; // IEEE float
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

struct NoteEvent
{
    long long frame;
    bool on;
    int note;
    int velocity;
};

std::vector<NoteEvent> buildSequence (int totalFrames)
{
    std::vector<NoteEvent> events;
    const int notes[] = { 48, 55, 60, 64, 67, 72 };
    const int noteCount = (int) (sizeof (notes) / sizeof (notes[0]));

    for (int note : { 48, 55, 60, 64 })
        events.push_back ({ 0, true, note, 100 });

    int index = 0;
    for (long long frame = 6000; frame < totalFrames - 12000; frame += 9000)
    {
        const int note = notes[index % noteCount];
        events.push_back ({ frame, false, note, 0 });
        events.push_back ({ frame + 37, true, note, 60 + (index * 13) % 60 });
        ++index;
    }

    return events;
}

void applyParameters (preseter::native::SetBfreeOrgan& wrapper, bool allBars)
{
    const std::array<int, 9> bars = allBars
        ? std::array<int, 9> { { 8, 8, 8, 8, 8, 8, 8, 8, 8 } }
        : std::array<int, 9> { { 8, 8, 8, 6, 0, 0, 0, 0, 0 } };

    wrapper.setDrawbars (bars);
    wrapper.setPercussion (true, false, true, false);
    wrapper.setVibrato (1);
    wrapper.setLeslie (1);
    wrapper.setOverdrive (0.15f);
    wrapper.setReverb (0.2f);
    wrapper.setKeyClick (0.3f);
    wrapper.setVolume (allBars ? 1.0f : 0.82f);
}

void applyParametersReference (ref_organ* reference, bool allBars)
{
    const int drawbars[9] = { 8, 8, 8, 8, 8, 8, 8, 8, 8 };
    const int sparse[9] = { 8, 8, 8, 6, 0, 0, 0, 0, 0 };
    ref_set_drawbars (reference, allBars ? drawbars : sparse);
    ref_set_percussion (reference, 1, 0, 1, 0);
    ref_set_vibrato (reference, 1);
    ref_set_leslie (reference, 1);
    ref_set_overdrive (reference, 0.15f);
    ref_set_reverb (reference, 0.2f);
    ref_set_key_click (reference, 0.3f);
    ref_set_volume (reference, allBars ? 1.0f : 0.82f);
}

void renderWrapper (const std::vector<NoteEvent>& sequence,
                    int totalFrames,
                    std::vector<float>& left,
                    std::vector<float>& right,
                    bool allBars)
{
    std::srand (kSeed);

    preseter::native::SetBfreeOrgan wrapper;
    wrapper.prepare (kSampleRate);
    applyParameters (wrapper, allBars);

    std::vector<preseter::native::SetBfreeMidiEvent> events;
    size_t nextEvent = 0;

    for (int frame = 0; frame < totalFrames; frame += kBlockSize)
    {
        events.clear();

        while (nextEvent < sequence.size() && sequence[nextEvent].frame < frame + kBlockSize)
        {
            const auto& item = sequence[nextEvent];

            preseter::native::SetBfreeMidiEvent event;
            event.samplePosition = (int) (item.frame - frame);
            event.size = 3;
            event.data[0] = item.on ? 0x90 : 0x80;
            event.data[1] = (std::uint8_t) item.note;
            event.data[2] = (std::uint8_t) (item.on ? item.velocity : 0);
            events.push_back (event);
            ++nextEvent;
        }

        wrapper.process (left.data() + frame, right.data() + frame, kBlockSize,
                         events.data(), (int) events.size());
    }
}

void renderReference (const std::vector<NoteEvent>& sequence,
                      int totalFrames,
                      std::vector<float>& left,
                      std::vector<float>& right,
                      bool allBars)
{
    std::srand (kSeed);

    ref_organ* reference = ref_create (kSampleRate);
    applyParametersReference (reference, allBars);

    std::vector<ref_event> events;
    size_t nextEvent = 0;

    for (int frame = 0; frame < totalFrames; frame += kBlockSize)
    {
        events.clear();

        while (nextEvent < sequence.size() && sequence[nextEvent].frame < frame + kBlockSize)
        {
            const auto& item = sequence[nextEvent];

            ref_event event;
            event.samplePosition = (int) (item.frame - frame);
            event.size = 3;
            event.data[0] = item.on ? 0x90 : 0x80;
            event.data[1] = (std::uint8_t) item.note;
            event.data[2] = (std::uint8_t) (item.on ? item.velocity : 0);
            events.push_back (event);
            ++nextEvent;
        }

        ref_render_block (reference, left.data() + frame, right.data() + frame,
                          kBlockSize, events.data(), (int) events.size());
    }

    ref_destroy (reference);
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

    bool allBars = false;
    for (int i = 1; i < argc; ++i)
        if (std::string (argv[i]) == "--max-level")
            allBars = true;

    const int seconds = 6;
    const int totalFrames = kSampleRate * seconds;
    const auto sequence = buildSequence (totalFrames);

    std::vector<float> wrapperLeft ((size_t) totalFrames);
    std::vector<float> wrapperRight ((size_t) totalFrames);
    std::vector<float> referenceLeft ((size_t) totalFrames);
    std::vector<float> referenceRight ((size_t) totalFrames);

    renderWrapper (sequence, totalFrames, wrapperLeft, wrapperRight, allBars);
    renderReference (sequence, totalFrames, referenceLeft, referenceRight, allBars);

    double maxDifference = 0.0;
    double differenceEnergy = 0.0;
    double referenceEnergy = 0.0;
    double wrapperEnergy = 0.0;
    double wrapperPeak = 0.0;
    double referencePeak = 0.0;

    for (int i = 0; i < totalFrames; ++i)
    {
        for (int channel = 0; channel < 2; ++channel)
        {
            const double a = channel == 0 ? wrapperLeft[(size_t) i] : wrapperRight[(size_t) i];
            const double b = channel == 0 ? referenceLeft[(size_t) i] : referenceRight[(size_t) i];
            const double diff = a - b;

            maxDifference = std::max (maxDifference, std::fabs (diff));
            differenceEnergy += diff * diff;
            referenceEnergy += b * b;
            wrapperEnergy += a * a;
            wrapperPeak = std::max (wrapperPeak, std::fabs (a));
            referencePeak = std::max (referencePeak, std::fabs (b));
        }
    }

    const double samples = (double) totalFrames * 2.0;
    const double diffRms = std::sqrt (differenceEnergy / samples);
    const double refRms = std::sqrt (referenceEnergy / samples);
    const double wrapperRms = std::sqrt (wrapperEnergy / samples);
    const double diffDb = diffRms > 0.0 ? 20.0 * std::log10 (diffRms) : -1000.0;
    const double refDb = refRms > 0.0 ? 20.0 * std::log10 (refRms) : -1000.0;
    const double wrapperDb = wrapperRms > 0.0 ? 20.0 * std::log10 (wrapperRms) : -1000.0;

    const std::string wrapperPath = outputDirectory + "/organ-wrapper.wav";
    const std::string referencePath = outputDirectory + "/organ-reference.wav";
    writeFloatWav (wrapperPath.c_str(), wrapperLeft, wrapperRight);
    writeFloatWav (referencePath.c_str(), referenceLeft, referenceRight);

    std::printf ("WAVs: %s / %s\n", wrapperPath.c_str(), referencePath.c_str());
    std::printf ("Pico: wrapper %.6f  referencia %.6f\n", wrapperPeak, referencePeak);
    std::printf ("RMS:  wrapper %.2f dBFS  referencia %.2f dBFS\n", wrapperDb, refDb);
    std::printf ("Diferenca maxima: %.9f (%.2f dBFS)\n", maxDifference,
                 20.0 * std::log10 (std::max (1e-12, maxDifference)));
    std::printf ("RMS da diferenca: %.2f dBFS\n", diffDb);

    const bool pass = diffDb < -90.0;
    std::printf ("Resultado: %s\n", pass ? "PASS (< -90 dBFS)" : "FAIL");

    return pass ? 0 : 1;
}
