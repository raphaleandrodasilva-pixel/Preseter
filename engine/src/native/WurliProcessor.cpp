#include "WurliProcessor.h"

#include <algorithm>
#include <cmath>

#include "openwurli_capi.h"

namespace preseter
{
namespace native
{
struct WurliProcessor::Impl
{
    OwEngine* engine = nullptr;
    float modWheel = -1.0f;
    float lastTremolo = -1.0f;
};

WurliProcessor::WurliProcessor() : impl (std::make_unique<Impl>())
{
    impl->engine = ow_create (44100.0);
}

WurliProcessor::~WurliProcessor()
{
    if (impl->engine != nullptr)
    {
        ow_destroy (impl->engine);
        impl->engine = nullptr;
    }
}

void WurliProcessor::prepare (double sampleRate, int maxBlock)
{
    if (impl->engine == nullptr)
        return;

    ow_prepare (impl->engine, sampleRate > 0.0 ? sampleRate : 44100.0, std::max (32, maxBlock));
    impl->modWheel = -1.0f;
    impl->lastTremolo = -1.0f;
}

void WurliProcessor::reset()
{
    if (impl->engine != nullptr)
        ow_reset (impl->engine);
    impl->modWheel = -1.0f;
}

void WurliProcessor::setParameters (const WurliParameters& p)
{
    if (impl->engine == nullptr)
        return;

    if (std::abs (p.tremolo - impl->lastTremolo) > 1.0e-4f)
    {
        impl->lastTremolo = p.tremolo;
        impl->modWheel = -1.0f; // o knob da janela volta a mandar
    }

    const float tremolo = impl->modWheel >= 0.0f ? impl->modWheel : p.tremolo;

    ow_set_volume (impl->engine, (double) std::clamp (p.volume, 0.0f, 1.0f));
    ow_set_tremolo_depth (impl->engine, (double) std::clamp (tremolo, 0.0f, 1.0f));
    ow_set_speaker_character (impl->engine, (double) std::clamp (p.speaker, 0.0f, 1.0f));
    ow_set_mlp_enabled (impl->engine, p.mlp ? 1 : 0);
    ow_set_hammer_contact_scale (impl->engine, (double) p.hammer);
    ow_set_damper_scale (impl->engine, (double) p.damper);
    ow_set_reed_bar_trim (impl->engine, (double) p.reedTrim);
    ow_set_noise_enabled (impl->engine, p.noise ? 1 : 0);
    ow_set_noise_gain (impl->engine, (double) p.noiseGain);
}

void WurliProcessor::process (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    if (impl->engine == nullptr)
    {
        midi.clear();
        return;
    }

    buffer.clear();

    const int numSamples = buffer.getNumSamples();
    if (numSamples <= 0 || buffer.getNumChannels() <= 0)
    {
        midi.clear();
        return;
    }

    float* left = buffer.getWritePointer (0);
    float* right = buffer.getNumChannels() > 1 ? buffer.getWritePointer (1) : nullptr;
    int written = 0;

    for (const auto metadata : midi)
    {
        const auto message = metadata.getMessage();
        const int position = std::clamp (metadata.samplePosition, 0, numSamples - 1);

        if (position > written)
        {
            ow_render (impl->engine, left + written, right != nullptr ? right + written : nullptr,
                       position - written);
            written = position;
        }

        if (message.isNoteOn())
        {
            ow_note_on (impl->engine, message.getNoteNumber(),
                        juce::jlimit (0.0f, 1.0f, message.getFloatVelocity()));
        }
        else if (message.isNoteOff())
        {
            ow_note_off (impl->engine, message.getNoteNumber());
        }
        else if (message.isAllNotesOff() || message.isAllSoundOff())
        {
            ow_all_notes_off (impl->engine);
        }
        else if (message.isController())
        {
            const int controller = message.getControllerNumber();
            const int value = message.getControllerValue();

            if (controller == 1) // modulação: profundidade do tremolo
            {
                impl->modWheel = (float) value / 127.0f;
                ow_set_tremolo_depth (impl->engine, (double) impl->modWheel);
            }
            else if (controller == 64 || controller == 66) // sustain / sustenuto
            {
                ow_set_sustain (impl->engine, value >= 64 ? 1 : 0);
            }
            else if (controller == 120 || controller == 123) // all sound/notes off
            {
                ow_all_notes_off (impl->engine);
            }
        }
    }

    if (written < numSamples)
        ow_render (impl->engine, left + written, right != nullptr ? right + written : nullptr,
                   numSamples - written);

    // O plugin original aplica +14 dB na saída para alinhar com instrumentos
    // típicos (OUTPUT_ALIGNMENT_DB no openwurli-plugin). O C ABI usa o engine
    // cru, então aplicamos o mesmo ganho aqui.
    constexpr float outputGain = 5.0118723f; // +14 dB
    buffer.applyGain (outputGain);

    midi.clear();
}

int WurliProcessor::activeVoices() const
{
    return impl->engine != nullptr ? ow_active_voice_count (impl->engine) : 0;
}
} // namespace native
} // namespace preseter
