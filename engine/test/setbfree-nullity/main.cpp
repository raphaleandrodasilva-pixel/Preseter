/*
 * Teste de nulidade do motor de órgão.
 *
 * Renderiza a mesma sequência MIDI com:
 *   A) o wrapper C++ usado pelo Preseter (SetBfreeOrgan)
 *   B) uma referência em C que reproduz o caminho do b_synth/lv2.c
 *
 * Compara amostra a amostra e imprime a diferença em dBFS para vários
 * ajustes de drawbars/percussão/Leslie/overdrive.
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

struct Scenario
{
    const char* name;
    int drawbars[9];
    bool percussion;
    bool percussionSoft;
    bool percussionFast;
    bool percussionThird;
    int vibrato;
    int leslie;
    float overdrive;
    float reverb;
    float keyClick;
    float volume;
};

const Scenario kScenarios[] = {
    { "888000000 + Leslie lento", { 8, 8, 8, 0, 0, 0, 0, 0, 0 }, false, false, true, false, 1, 1, 0.08f, 0.20f, 0.30f, 0.82f },
    { "008800000 + Leslie rapido", { 0, 0, 8, 8, 0, 0, 0, 0, 0 }, false, false, true, false, 2, 2, 0.15f, 0.18f, 0.30f, 0.82f },
    { "percussao (2o, normal, rapida)", { 8, 8, 8, 0, 0, 0, 0, 0, 0 }, true, false, true, false, 0, 0, 0.08f, 0.0f, 0.30f, 0.82f },
    { "overdrive alto", { 8, 8, 8, 0, 0, 0, 0, 0, 0 }, false, false, true, false, 0, 0, 1.0f, 0.20f, 0.30f, 0.82f },
    { "clean (overdrive 0)", { 8, 8, 8, 0, 0, 0, 0, 0, 0 }, false, false, true, false, 0, 0, 0.0f, 0.0f, 0.30f, 0.82f },
    { "888888888 + volume maximo", { 8, 8, 8, 8, 8, 8, 8, 8, 8 }, true, false, true, false, 1, 1, 0.15f, 0.20f, 0.30f, 1.0f },
};

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

void applyParameters (preseter::native::SetBfreeOrgan& wrapper, const Scenario& scenario)
{
    std::array<int, 9> bars {};
    for (int i = 0; i < 9; ++i)
        bars[(size_t) i] = scenario.drawbars[i];

    wrapper.setDrawbars (bars);
    wrapper.setPercussion (scenario.percussion, scenario.percussionSoft,
                           scenario.percussionFast, scenario.percussionThird);
    wrapper.setVibrato (scenario.vibrato);
    wrapper.setLeslie (scenario.leslie);
    wrapper.setOverdrive (scenario.overdrive);
    wrapper.setReverb (scenario.reverb);
    wrapper.setKeyClick (scenario.keyClick);
    wrapper.setVolume (scenario.volume);
}

void applyParametersReference (ref_organ* reference, const Scenario& scenario)
{
    ref_set_drawbars (reference, scenario.drawbars);
    ref_set_percussion (reference, scenario.percussion ? 1 : 0,
                        scenario.percussionSoft ? 1 : 0,
                        scenario.percussionFast ? 1 : 0,
                        scenario.percussionThird ? 1 : 0);
    ref_set_vibrato (reference, scenario.vibrato);
    ref_set_leslie (reference, scenario.leslie);
    ref_set_overdrive (reference, scenario.overdrive);
    ref_set_reverb (reference, scenario.reverb);
    ref_set_key_click (reference, scenario.keyClick);
    ref_set_volume (reference, scenario.volume);
}

void renderWrapper (const std::vector<NoteEvent>& sequence,
                    int totalFrames,
                    std::vector<float>& left,
                    std::vector<float>& right,
                    const Scenario& scenario)
{
    std::srand (kSeed);

    preseter::native::SetBfreeOrgan wrapper;
    wrapper.prepare (kSampleRate);
    applyParameters (wrapper, scenario);

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
                      const Scenario& scenario)
{
    std::srand (kSeed);

    ref_organ* reference = ref_create (kSampleRate);
    applyParametersReference (reference, scenario);

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

void compare (const std::vector<float>& aLeft,
              const std::vector<float>& aRight,
              const std::vector<float>& bLeft,
              const std::vector<float>& bRight,
              double& diffDb,
              double& diffMax,
              double& peak)
{
    double differenceEnergy = 0.0;
    diffMax = 0.0;
    peak = 0.0;

    for (size_t i = 0; i < aLeft.size(); ++i)
    {
        for (int channel = 0; channel < 2; ++channel)
        {
            const double a = channel == 0 ? aLeft[i] : aRight[i];
            const double b = channel == 0 ? bLeft[i] : bRight[i];
            const double diff = a - b;

            diffMax = std::max (diffMax, std::fabs (diff));
            differenceEnergy += diff * diff;
            peak = std::max (peak, std::fabs (a));
        }
    }

    const double samples = (double) aLeft.size() * 2.0;
    const double diffRms = std::sqrt (differenceEnergy / samples);
    diffDb = diffRms > 0.0 ? 20.0 * std::log10 (diffRms) : -1000.0;
}
} // namespace

int main (int argc, char** argv)
{
    std::string outputDirectory = ".";
    bool debugGains = false;

    for (int i = 1; i < argc; ++i)
    {
        const std::string arg = argv[i];
        if (arg.rfind ("--out-dir=", 0) == 0)
            outputDirectory = arg.substr (10);
        else if (arg == "--debug-gains")
            debugGains = true;
    }

    if (argc > 1 && std::string (argv[1]) == "--cc1")
    {
        ref_organ* reference = ref_create (kSampleRate);
        applyParametersReference (reference, kScenarios[0]);

        std::printf ("Leslie inicial (parado=1): %d\n", ref_leslie_select (reference));
        ref_send_cc (reference, 1, 0);
        std::printf ("CC1=0   -> revSelect %d (0=lento)\n", ref_leslie_select (reference));
        ref_send_cc (reference, 1, 64);
        std::printf ("CC1=64  -> revSelect %d (1=parado)\n", ref_leslie_select (reference));
        ref_send_cc (reference, 1, 127);
        std::printf ("CC1=127 -> revSelect %d (2=rapido)\n", ref_leslie_select (reference));

        ref_destroy (reference);
        return 0;
    }

    if (debugGains)
    {
        std::srand (kSeed);
        ref_organ* reference = ref_create (kSampleRate);
        applyParametersReference (reference, kScenarios[2]);
        ref_note_on (reference, 60, 100, 0);
        ref_debug_gains (reference, 200);
        ref_destroy (reference);
        return 0;
    }

    if (argc > 1 && std::string (argv[1]) == "--sweep-overdrive")
    {
        const int frames = kSampleRate * 4;
        const auto seq = buildSequence (frames);
        std::vector<float> left ((size_t) frames);
        std::vector<float> right ((size_t) frames);

        for (float amount : { 0.0f, 0.01f, 0.1f, 0.2f, 0.3f, 0.5f, 0.7f, 0.85f, 1.0f })
        {
            Scenario scenario = kScenarios[0];
            scenario.overdrive = amount;
            scenario.reverb = 0.2f;
            scenario.volume = 0.82f;

            renderWrapper (seq, frames, left, right, scenario);

            double peak = 0.0;
            double energy = 0.0;
            for (int i = 0; i < frames; ++i)
            {
                for (int c = 0; c < 2; ++c)
                {
                    const double v = c == 0 ? left[(size_t) i] : right[(size_t) i];
                    peak = std::max (peak, std::fabs (v));
                    energy += v * v;
                }
            }
            const double rms = std::sqrt (energy / ((double) frames * 2.0));
            std::printf ("over %.2f  char %3d  pico %.4f  RMS %6.1f dBFS  trim p/0.8=%.2f\n",
                         amount, (int) std::lround (amount * 127.0), peak,
                         20.0 * std::log10 (std::max (1e-12, rms)), 0.8 / peak);
        }
        return 0;
    }

    const int seconds = 6;
    const int totalFrames = kSampleRate * seconds;
    const auto sequence = buildSequence (totalFrames);

    std::vector<float> wrapperLeft ((size_t) totalFrames);
    std::vector<float> wrapperRight ((size_t) totalFrames);
    std::vector<float> referenceLeft ((size_t) totalFrames);
    std::vector<float> referenceRight ((size_t) totalFrames);

    bool allPassed = true;
    double worstDb = -1000.0;
    std::string worstName;

    std::printf ("%-34s %12s %12s %10s  %s\n", "Caso", "dif. max", "dif. RMS", "pico", "resultado");

    for (size_t index = 0; index < sizeof (kScenarios) / sizeof (kScenarios[0]); ++index)
    {
        const auto& scenario = kScenarios[index];

        renderWrapper (sequence, totalFrames, wrapperLeft, wrapperRight, scenario);
        renderReference (sequence, totalFrames, referenceLeft, referenceRight, scenario);

        double diffDb = 0.0;
        double diffMax = 0.0;
        double peak = 0.0;
        compare (wrapperLeft, wrapperRight, referenceLeft, referenceRight, diffDb, diffMax, peak);

        const bool pass = diffDb < -90.0;
        allPassed = allPassed && pass;

        if (diffDb > worstDb)
        {
            worstDb = diffDb;
            worstName = scenario.name;
        }

        std::printf ("%-34s %12.9f %10.2f dB %10.4f  %s\n", scenario.name, diffMax, diffDb, peak,
                     pass ? "PASS" : "FAIL");

        {
            const std::string suffix = "-" + std::to_string (index + 1) + ".wav";
            const std::string wrapperPath = outputDirectory + "/organ-wrapper" + suffix;
            const std::string referencePath = outputDirectory + "/organ-reference" + suffix;
            writeFloatWav (wrapperPath.c_str(), wrapperLeft, wrapperRight);
            writeFloatWav (referencePath.c_str(), referenceLeft, referenceRight);
        }
    }

    std::printf ("\nPior caso: %s (%.2f dBFS de diferenca RMS)\n", worstName.c_str(), worstDb);
    std::printf ("Resultado: %s (criterio < -90 dBFS)\n",
                 allPassed ? "PASS" : "FAIL");

    return allPassed ? 0 : 1;
}
