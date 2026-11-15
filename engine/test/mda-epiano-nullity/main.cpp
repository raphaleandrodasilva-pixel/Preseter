/*
 * Teste de nulidade do Preseter Tines contra o porte JUCE do MDA ePiano.
 *
 * O DSP do Preseter (MdaEPianoDsp) é comparado com o MDAEPianoAudioProcessor
 * original do repositório hollance/mda-plugins-juce (MIT), usando os mesmos
 * samples, parâmetros, MIDI e blocos de 512 amostras.
 */
#include "MdaEPianoDsp.h"
#include "MDAEPianoProcessor.h"

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
constexpr int kBlockSize = 512;

struct TimedEvent
{
    int frame;
    std::uint8_t data[3];
};

std::vector<TimedEvent> buildSequence (int totalFrames)
{
    std::vector<TimedEvent> events;
    events.push_back ({ 0, { 0xB0, 7, 127 } }); // volume CC7 no máximo

    const int notes[] = { 36, 48, 55, 60, 64, 67, 72, 79, 84, 91 };
    long long frame = 0;
    for (int i = 0; i < 40; ++i)
    {
        const int note = notes[i % (int) (sizeof (notes) / sizeof (notes[0]))];
        const int velocity = 40 + (i * 17) % 80;
        events.push_back ({ (int) frame, { 0x90, (std::uint8_t) note, (std::uint8_t) velocity } });
        events.push_back ({ (int) frame + 900, { 0x80, (std::uint8_t) note, 0 } });
        frame += 1600;
        if (frame > totalFrames - 2000)
            break;
    }

    std::sort (events.begin(), events.end(), [] (const auto& a, const auto& b) { return a.frame < b.frame; });
    return events;
}

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

    if (argc > 1 && std::string (argv[1]) == "--cc1")
    {
        preseter::native::MdaEPianoDsp dsp;
        dsp.prepare (kSampleRate);
        preseter::native::MdaEPianoParameters p;
        p.modulation = 0.5f;
        dsp.setParameters (p);

        juce::AudioBuffer<float> buffer (2, kBlockSize);
        juce::MidiBuffer midi;
        buffer.clear();
        midi.addEvent (juce::MidiMessage::controllerEvent (1, 1, 127), 0);
        dsp.process (buffer, midi);
        std::printf ("CC1=127 -> modWheel %.3f\n", dsp.modWheelDepth());

        dsp.setParameters (p); // simula o próximo bloco
        std::printf ("bloco seguinte (sem CC1) -> modWheel %.3f\n", dsp.modWheelDepth());

        midi.clear();
        midi.addEvent (juce::MidiMessage::controllerEvent (1, 1, 0), 0);
        dsp.process (buffer, midi);
        std::printf ("CC1=0 -> modWheel %.3f\n", dsp.modWheelDepth());
        return 0;
    }

    const int totalFrames = kSampleRate * 6;
    const auto sequence = buildSequence (totalFrames);

    // Nosso DSP primeiro: ele copia a tabela de samples antes de o MDA de
    // referência aplicar o crossfade na tabela global.
    preseter::native::MdaEPianoDsp ours;
    ours.prepare (kSampleRate);

    preseter::native::MdaEPianoParameters parameters;
    parameters.decay = 50.0f;
    parameters.release = 50.0f;
    parameters.hardness = 0.0f;
    parameters.treble = 0.0f;
    parameters.modulation = 0.25f;
    parameters.lfoRate = 0.65f;
    parameters.velocity = 25.0f;
    parameters.stereo = 100.0f;
    parameters.polyphony = 16.0f;
    parameters.fine = 0.0f;
    parameters.random = 0.246f;
    parameters.overdrive = 0.0f;
    parameters.volume = 1.0f;
    ours.setParameters (parameters);

    juce::ScopedJuceInitialiser_GUI juceInitialiser;
    MDAEPianoAudioProcessor reference;
    reference.prepareToPlay (kSampleRate, kBlockSize);

    const auto setParam = [&reference] (const char* id, float normalized)
    {
        if (auto* parameter = reference.apvts.getParameter (id))
            parameter->setValueNotifyingHost (normalized);
    };

    setParam ("Envelope Decay", 0.50f);
    setParam ("Envelope Release", 0.50f);
    setParam ("Hardness", 0.50f);
    setParam ("Treble Boost", 0.50f);
    setParam ("Modulation", 0.25f);
    setParam ("LFO Rate", 0.65f);
    setParam ("Velocity Sensitivity", 0.25f);
    setParam ("Stereo Width", 0.50f);
    setParam ("Polyphony", (16.0f - 1.0f) / 31.0f);
    setParam ("Fine Tuning", 0.50f);
    setParam ("Random Tuning", 0.246f);
    setParam ("Overdrive", 0.0f);

    std::vector<float> oursLeft ((size_t) totalFrames);
    std::vector<float> oursRight ((size_t) totalFrames);
    std::vector<float> refLeft ((size_t) totalFrames);
    std::vector<float> refRight ((size_t) totalFrames);

    juce::AudioBuffer<float> bufferOurs (2, kBlockSize);
    juce::AudioBuffer<float> bufferRef (2, kBlockSize);

    size_t nextEvent = 0;

    for (int frame = 0; frame < totalFrames; frame += kBlockSize)
    {
        juce::MidiBuffer midiOurs;
        juce::MidiBuffer midiRef;

        while (nextEvent < sequence.size() && sequence[nextEvent].frame < frame + kBlockSize)
        {
            const auto& event = sequence[nextEvent];
            const int position = event.frame - frame;
            juce::MidiMessage message;
            if ((event.data[0] & 0xF0) == 0x90)
                message = juce::MidiMessage::noteOn (1, event.data[1], (juce::uint8) event.data[2]);
            else if ((event.data[0] & 0xF0) == 0x80)
                message = juce::MidiMessage::noteOff (1, event.data[1]);
            else
                message = juce::MidiMessage::controllerEvent (1, event.data[1], event.data[2]);

            midiOurs.addEvent (message, position);
            midiRef.addEvent (message, position);
            ++nextEvent;
        }

        ours.setParameters (parameters);
        bufferOurs.clear();
        ours.process (bufferOurs, midiOurs);

        bufferRef.clear();
        reference.processBlock (bufferRef, midiRef);

        for (int i = 0; i < kBlockSize; ++i)
        {
            oursLeft[(size_t) frame + (size_t) i] = bufferOurs.getSample (0, i);
            oursRight[(size_t) frame + (size_t) i] = bufferOurs.getSample (1, i);
            refLeft[(size_t) frame + (size_t) i] = bufferRef.getSample (0, i);
            refRight[(size_t) frame + (size_t) i] = bufferRef.getSample (1, i);
        }
    }

    double maxDiff = 0.0;
    double diffEnergy = 0.0;
    double refEnergy = 0.0;
    double peak = 0.0;

    for (int i = 0; i < totalFrames; ++i)
    {
        for (int channel = 0; channel < 2; ++channel)
        {
            const double a = channel == 0 ? oursLeft[(size_t) i] : oursRight[(size_t) i];
            const double b = channel == 0 ? refLeft[(size_t) i] : refRight[(size_t) i];
            const double diff = a - b;
            maxDiff = std::max (maxDiff, std::fabs (diff));
            diffEnergy += diff * diff;
            refEnergy += b * b;
            peak = std::max (peak, std::fabs (a));
        }
    }

    const double samples = (double) totalFrames * 2.0;
    const double diffRms = std::sqrt (diffEnergy / samples);
    const double refRms = std::sqrt (refEnergy / samples);
    const double diffDb = diffRms > 0.0 ? 20.0 * std::log10 (diffRms) : -1000.0;
    const double refDb = refRms > 0.0 ? 20.0 * std::log10 (refRms) : -1000.0;

    const std::string oursPath = outputDirectory + "/tines-preseter.wav";
    const std::string refPath = outputDirectory + "/tines-mda.wav";
    writeFloatWav (oursPath.c_str(), oursLeft, oursRight);
    writeFloatWav (refPath.c_str(), refLeft, refRight);

    std::printf ("WAVs: %s / %s\n", oursPath.c_str(), refPath.c_str());
    std::printf ("Pico: %.6f  RMS: %.2f dBFS\n", peak, refDb);
    std::printf ("Diferenca maxima: %.9f (%.2f dBFS)\n", maxDiff,
                 20.0 * std::log10 (std::max (1e-12, maxDiff)));
    std::printf ("RMS da diferenca: %.2f dBFS\n", diffDb);

    const bool pass = diffDb < -90.0;
    std::printf ("Resultado: %s\n", pass ? "PASS (< -90 dBFS)" : "FAIL");
    return pass ? 0 : 1;
}
