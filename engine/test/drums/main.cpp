/*
 * Teste de nulidade e de áudio do Preseter Drums (D11).
 *
 * Sem nota: silêncio digital. Com nota: áudio não nulo. Depois de all-notes-off:
 * silêncio. Também confere mudo e solo por pad.
 *
 * Precisa do kit SF2 (por padrão ~/PreseterSons/MuseScore_General/MuseScore_General.sf2):
 *   PreseterDrumsNullity.exe --kit=CAMINHO
 */
#include "drums/DrumKitEngine.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <string>

namespace
{
constexpr double kSampleRate = 48000.0;
constexpr int kBlockSize = 512;

struct Result
{
    float peak = 0.0f;
    double rms = 0.0;
};

Result render (preseter::drums::DrumKitEngine& kit, juce::AudioBuffer<float>& buffer,
               double seconds)
{
    const int blocks = (int) std::ceil (seconds * kSampleRate / (double) kBlockSize);
    double sum = 0.0;
    long long count = 0;
    float peak = 0.0f;

    for (int block = 0; block < blocks; ++block)
    {
        buffer.clear();
        kit.beginBlock();
        kit.render (buffer, 0, buffer.getNumSamples());

        for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
        {
            const auto* samples = buffer.getReadPointer (channel);
            for (int i = 0; i < buffer.getNumSamples(); ++i)
            {
                const float value = samples[i];
                peak = std::max (peak, std::abs (value));
                sum += (double) value * (double) value;
                ++count;
            }
        }
    }

    return { peak, count > 0 ? std::sqrt (sum / (double) count) : 0.0 };
}

std::string defaultKitPath()
{
   #if defined (_WIN32)
    const char* home = std::getenv ("USERPROFILE");
   #else
    const char* home = std::getenv ("HOME");
   #endif
    if (home == nullptr)
        return {};
    return std::string (home) + "/PreseterSons/MuseScore_General/MuseScore_General.sf2";
}
} // namespace

int main (int argc, char** argv)
{
    std::string kitPath = defaultKitPath();
    for (int i = 1; i < argc; ++i)
    {
        const std::string argument (argv[i]);
        const std::string prefix = "--kit=";
        if (argument.rfind (prefix, 0) == 0)
            kitPath = argument.substr (prefix.size());
    }

    const juce::File kitFile (juce::String (kitPath.c_str()));
    if (! kitFile.existsAsFile())
    {
        std::printf ("SKIP: kit nao encontrado em %s\n", kitPath.c_str());
        return 2;
    }

    preseter::drums::DrumKitEngine kit;
    juce::String error;
    if (! kit.load (kitFile, 128, 0, error))
    {
        std::printf ("FALHA ao carregar o kit: %s\n", error.toRawUTF8());
        return 1;
    }
    kit.prepare (kSampleRate, kBlockSize);

    juce::AudioBuffer<float> buffer (2, kBlockSize);
    bool ok = true;

    const auto silence = render (kit, buffer, 1.0);
    std::printf ("sem nota: pico %.9f | RMS %.9f\n", silence.peak, silence.rms);
    if (silence.peak > 1.0e-6f)
    {
        std::printf ("FALHA: deveria ser silencio\n");
        ok = false;
    }

    kit.noteOn (36, 1.0f);
    const auto hit = render (kit, buffer, 1.0);
    std::printf ("nota 36: pico %.6f | RMS %.6f\n", hit.peak, hit.rms);
    if (hit.peak < 1.0e-4f)
    {
        std::printf ("FALHA: nota nao produziu audio\n");
        ok = false;
    }

    kit.allNotesOff();
    const auto stopped = render (kit, buffer, 3.0);
    std::printf ("apos all-notes-off: pico %.9f\n", stopped.peak);
    if (stopped.peak > 1.0e-6f)
    {
        std::printf ("FALHA: notas presas apos all-notes-off\n");
        ok = false;
    }

    kit.setPadMuted (0, true);
    kit.noteOn (36, 1.0f);
    const auto muted = render (kit, buffer, 0.5);
    kit.setPadMuted (0, false);
    std::printf ("pad 0 em mudo: pico %.9f\n", muted.peak);
    if (muted.peak > 1.0e-6f)
    {
        std::printf ("FALHA: pad em mudo tocou\n");
        ok = false;
    }

    kit.setPadSolo (2, true);
    kit.noteOn (36, 1.0f);
    const auto soloedOut = render (kit, buffer, 0.5);
    kit.noteOn (38, 1.0f);
    const auto soloedIn = render (kit, buffer, 1.0);
    kit.setPadSolo (2, false);
    std::printf ("solo no pad 2: 36 -> %.9f | 38 -> %.6f\n", soloedOut.peak, soloedIn.peak);
    if (soloedOut.peak > 1.0e-6f || soloedIn.peak < 1.0e-4f)
    {
        std::printf ("FALHA: solo nao isolou o pad\n");
        ok = false;
    }

    std::printf ("Resultado: %s\n", ok ? "PASS" : "FAIL");
    return ok ? 0 : 1;
}
