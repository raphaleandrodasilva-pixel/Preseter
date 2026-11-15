#include "NativeProcessor.h"

#include <cmath>
#include <vector>

namespace preseter
{
namespace native
{
namespace
{
constexpr double kTwoPi = 6.283185307179586;
constexpr double kOrganRatios[9] = { 0.5, 1.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0 };
constexpr double kTineRatios[4] = { 1.0, 6.27, 17.55, 34.5 };
constexpr double kTineAmps[4] = { 1.0, 0.45, 0.22, 0.10 };
constexpr double kTineDecay[4] = { 0.99986, 0.99935, 0.9982, 0.9960 };
constexpr double kReedRatios[4] = { 1.0, 2.0, 3.0, 4.2 };
constexpr double kReedAmps[4] = { 1.0, 0.5, 0.3, 0.15 };
constexpr double kReedDecay[4] = { 0.99972, 0.99910, 0.9978, 0.9955 };

// O setBfree sai bem baixo (outputLevelTrim interno = 0.07). Este trim fixo
// é aplicado DEPOIS da cadeia do setBfree, sem alterar o timbre.
constexpr float kOrganOutputTrim = 4.0f; // +12 dB

juce::String kindName (NativeKind kind)
{
    if (kind == NativeKind::organ) return "Preseter Organ";
    if (kind == NativeKind::tines) return "Preseter Tines";
    return "Preseter Reeds";
}

juce::String kindId (NativeKind kind)
{
    if (kind == NativeKind::organ) return "preseter.organ";
    if (kind == NativeKind::tines) return "preseter.tines";
    return "preseter.reeds";
}
} // namespace

std::unique_ptr<NativeProcessor> createNativeProcessor (const juce::String& id)
{
    if (id == "preseter.organ") return std::make_unique<NativeProcessor> (NativeKind::organ, id, kindName (NativeKind::organ));
    if (id == "preseter.tines") return std::make_unique<NativeProcessor> (NativeKind::tines, id, kindName (NativeKind::tines));
    if (id == "preseter.reeds") return std::make_unique<NativeProcessor> (NativeKind::reeds, id, kindName (NativeKind::reeds));
    return nullptr;
}

juce::AudioProcessorValueTreeState::ParameterLayout NativeProcessor::createLayout (NativeKind kind)
{
    using namespace juce;
    AudioProcessorValueTreeState::ParameterLayout layout;

    const auto add = [&layout] (const char* id, const char* name, float minimum, float maximum,
                                float step, float defaultValue)
    {
        layout.add (std::make_unique<AudioParameterFloat> (
            ParameterID { id, 1 }, name, NormalisableRange<float> (minimum, maximum, step), defaultValue));
    };

    if (kind == NativeKind::organ)
    {
        add ("organ_drawbar_16", "Drawbar 16'", 0.0f, 8.0f, 1.0f, 8.0f);
        add ("organ_drawbar_513", "Drawbar 5 1/3'", 0.0f, 8.0f, 1.0f, 8.0f);
        add ("organ_drawbar_8", "Drawbar 8'", 0.0f, 8.0f, 1.0f, 8.0f);
        add ("organ_drawbar_4", "Drawbar 4'", 0.0f, 8.0f, 1.0f, 0.0f);
        add ("organ_drawbar_223", "Drawbar 2 2/3'", 0.0f, 8.0f, 1.0f, 0.0f);
        add ("organ_drawbar_2", "Drawbar 2'", 0.0f, 8.0f, 1.0f, 0.0f);
        add ("organ_drawbar_135", "Drawbar 1 3/5'", 0.0f, 8.0f, 1.0f, 0.0f);
        add ("organ_drawbar_113", "Drawbar 1 1/3'", 0.0f, 8.0f, 1.0f, 0.0f);
        add ("organ_drawbar_1", "Drawbar 1'", 0.0f, 8.0f, 1.0f, 0.0f);
        add ("organ_percussion", "Percussão", 0.0f, 1.0f, 0.01f, 0.0f);
        add ("organ_perc_volume", "Volume da percussão", 0.0f, 1.0f, 0.01f, 0.5f);
        add ("organ_perc_decay", "Decaimento da percussão", 0.0f, 1.0f, 0.01f, 0.5f);
        add ("organ_perc_harmonic", "Harmônico da percussão", 0.0f, 1.0f, 0.01f, 0.3f);
        add ("organ_vibrato", "Vibrato/Chorus", 0.0f, 6.0f, 1.0f, 1.0f);
        add ("organ_chorus", "Profundidade do chorus", 0.0f, 1.0f, 0.01f, 0.25f);
        add ("organ_overdrive", "Overdrive", 0.0f, 1.0f, 0.01f, 0.1f);
        add ("organ_leslie", "Leslie (0 parado, 1 lento, 2 rápido, 3 freio)", 0.0f, 3.0f, 1.0f, 1.0f);
        add ("organ_reverb", "Reverb", 0.0f, 1.0f, 0.01f, 0.2f);
        add ("organ_key_click", "Key click", 0.0f, 1.0f, 0.01f, 0.3f);
        add ("organ_volume", "Volume", 0.0f, 1.0f, 0.01f, 0.8f);
    }
    else if (kind == NativeKind::tines)
    {
        add ("tines_gain", "Gain", 0.0f, 1.0f, 0.01f, 0.8f);
        add ("tines_volume", "Volume", 0.0f, 1.0f, 0.01f, 0.8f);
        add ("tines_tone", "Tom", 0.0f, 1.0f, 0.01f, 0.5f);
        add ("tines_bell", "Sino (tonebar)", 0.0f, 1.0f, 0.01f, 0.4f);
        add ("tines_bark", "Bark do captador", 0.0f, 1.0f, 0.01f, 0.4f);
        add ("tines_trem_rate", "Tremolo (Hz)", 0.0f, 10.0f, 0.1f, 4.5f);
        add ("tines_trem_depth", "Profundidade do tremolo", 0.0f, 1.0f, 0.01f, 0.3f);
        add ("tines_velocity", "Sensibilidade à velocity", 0.0f, 1.0f, 0.01f, 0.8f);
    }
    else
    {
        add ("reeds_gain", "Gain", 0.0f, 1.0f, 0.01f, 0.8f);
        add ("reeds_volume", "Volume", 0.0f, 1.0f, 0.01f, 0.8f);
        add ("reeds_tone", "Tom", 0.0f, 1.0f, 0.01f, 0.55f);
        add ("reeds_hammer", "Brilho do martelo", 0.0f, 1.0f, 0.01f, 0.5f);
        add ("reeds_bark", "Bark", 0.0f, 1.0f, 0.01f, 0.5f);
        add ("reeds_trem_rate", "Tremolo (Hz)", 0.0f, 10.0f, 0.1f, 5.0f);
        add ("reeds_trem_depth", "Profundidade do tremolo", 0.0f, 1.0f, 0.01f, 0.3f);
        add ("reeds_velocity", "Sensibilidade à velocity", 0.0f, 1.0f, 0.01f, 0.8f);
    }

    return layout;
}

NativeProcessor::NativeProcessor (NativeKind kindToUse, juce::String stable, juce::String display)
    : AudioProcessor (BusesProperties().withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      kind (kindToUse),
      stableId (std::move (stable)),
      displayName (std::move (display)),
      apvts (*this, nullptr, "PARAMETERS", createLayout (kindToUse))
{
    if (kind == NativeKind::organ)
        setBfree = std::make_unique<SetBfreeOrgan>();

    applyProgram (0);
}

void NativeProcessor::prepareToPlay (double newSampleRate, int)
{
    sampleRate = newSampleRate > 0.0 ? newSampleRate : 44100.0;

    if (kind == NativeKind::organ)
    {
        if (setBfree != nullptr)
        {
            setBfree->prepare (sampleRate);
            updateOrganParameters();
        }
        return;
    }

    resetDsp();
}

void NativeProcessor::resetDsp()
{
    for (auto& voice : voices)
        voice = Voice {};
    lfoPhase = 0.0;
    tremoloPhase = 0.0;
    toneStateL = 0.0f;
    toneStateR = 0.0f;
    reverbL = 0.0f;
    reverbR = 0.0f;
}

bool NativeProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    return layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo()
        && layouts.getMainInputChannelSet() == juce::AudioChannelSet::disabled();
}

float NativeProcessor::parameter (const char* id) const
{
    if (auto* value = apvts.getRawParameterValue (id))
        return value->load();
    return 0.0f;
}

void NativeProcessor::setParameterValue (const char* id, float value)
{
    if (auto* parameterObject = apvts.getParameter (id))
        parameterObject->setValueNotifyingHost (parameterObject->convertTo0to1 (value));
}

NativeProcessor::Voice* NativeProcessor::findVoiceForNote (int note)
{
    for (auto& voice : voices)
        if (voice.active && ! voice.released && voice.note == note)
            return &voice;
    return nullptr;
}

NativeProcessor::Voice* NativeProcessor::allocateVoice()
{
    for (auto& voice : voices)
        if (! voice.active)
            return &voice;
    auto* oldest = &voices[0];
    for (auto& voice : voices)
        if (voice.age > oldest->age)
            oldest = &voice;
    return oldest;
}

void NativeProcessor::startNote (int note, float velocity)
{
    auto* voice = findVoiceForNote (note);
    if (voice == nullptr)
        voice = allocateVoice();
    if (voice == nullptr)
        return;

    *voice = Voice {};
    voice->active = true;
    voice->note = note;
    voice->velocity = juce::jlimit (0.0f, 1.0f, velocity);
    voice->frequency = 440.0 * std::pow (2.0, (note - 69) / 12.0);
    voice->envelope = 1.0f;
    voice->clickEnvelope = 1.0f;
    voice->percussionEnvelope = 1.0f;
    voice->age = 0.0;
    voice->modeEnvelope.fill (1.0f);
    voice->phase.fill (0.0);
    voice->modePhase.fill (0.0);
    voice->pan = juce::jlimit (-0.6f, 0.6f, (note - 60) / 90.0f);
}

void NativeProcessor::stopNote (int note)
{
    if (auto* voice = findVoiceForNote (note))
        voice->released = true;
}

void NativeProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    buffer.clear();

    if (kind == NativeKind::organ)
    {
        if (setBfree == nullptr)
        {
            midi.clear();
            return;
        }

        std::vector<SetBfreeMidiEvent> events;
        events.reserve ((size_t) midi.getNumEvents());

        for (const auto metadata : midi)
        {
            const auto message = metadata.getMessage();

            if (message.isAllNotesOff() || message.isAllSoundOff())
            {
                setBfree->panic();
                continue;
            }

            SetBfreeMidiEvent event;
            event.samplePosition = metadata.samplePosition;
            event.size = 3;

            if (message.isNoteOn())
            {
                event.data[0] = 0x90; // canal 0 = manual superior
                event.data[1] = (std::uint8_t) juce::jlimit (0, 127, message.getNoteNumber());
                event.data[2] = (std::uint8_t) juce::jlimit (1, 127, (int) message.getVelocity());
            }
            else if (message.isNoteOff())
            {
                event.data[0] = 0x80;
                event.data[1] = (std::uint8_t) juce::jlimit (0, 127, message.getNoteNumber());
                event.data[2] = 0;
            }
            else
            {
                continue;
            }

            events.push_back (event);
        }

        midi.clear();
        updateOrganParameters();

        auto* left = buffer.getWritePointer (0);
        const int numSamples = buffer.getNumSamples();

        if (buffer.getNumChannels() > 1)
        {
            setBfree->process (left, buffer.getWritePointer (1), numSamples,
                               events.data(), (int) events.size());
        }
        else
        {
            std::vector<float> scratch ((size_t) numSamples);
            setBfree->process (left, scratch.data(), numSamples, events.data(), (int) events.size());
        }

        buffer.applyGain (kOrganOutputTrim);

        for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
            juce::FloatVectorOperations::clip (buffer.getWritePointer (channel),
                                               buffer.getReadPointer (channel), -1.0f, 1.0f,
                                               numSamples);
        return;
    }

    for (const auto metadata : midi)
    {
        const auto message = metadata.getMessage();
        if (message.isNoteOn())
            startNote (message.getNoteNumber(), message.getFloatVelocity());
        else if (message.isNoteOff())
            stopNote (message.getNoteNumber());
        else if (message.isAllNotesOff() || message.isAllSoundOff())
            for (auto& voice : voices)
                voice.released = true;
    }
    midi.clear();

    renderModal (buffer, buffer.getNumSamples());
}

void NativeProcessor::updateOrganParameters()
{
    if (setBfree == nullptr)
        return;

    const std::array<int, 9> drawbars { {
        (int) std::lround (parameter ("organ_drawbar_16")),
        (int) std::lround (parameter ("organ_drawbar_513")),
        (int) std::lround (parameter ("organ_drawbar_8")),
        (int) std::lround (parameter ("organ_drawbar_4")),
        (int) std::lround (parameter ("organ_drawbar_223")),
        (int) std::lround (parameter ("organ_drawbar_2")),
        (int) std::lround (parameter ("organ_drawbar_135")),
        (int) std::lround (parameter ("organ_drawbar_113")),
        (int) std::lround (parameter ("organ_drawbar_1")),
    } };

    setBfree->setDrawbars (drawbars);

    setBfree->setPercussion (parameter ("organ_percussion") > 0.01f,
                             parameter ("organ_perc_volume") < 0.5f,
                             parameter ("organ_perc_decay") >= 0.5f,
                             parameter ("organ_perc_harmonic") >= 0.5f);

    setBfree->setVibrato ((int) std::lround (parameter ("organ_vibrato")));
    setBfree->setLeslie ((int) std::lround (parameter ("organ_leslie")));
    setBfree->setOverdrive (parameter ("organ_overdrive"));
    setBfree->setReverb (parameter ("organ_reverb"));
    setBfree->setKeyClick (parameter ("organ_key_click"));
    setBfree->setVolume (parameter ("organ_volume"));
}

void NativeProcessor::renderModal (juce::AudioBuffer<float>& buffer, int numSamples)
{
    const bool tines = kind == NativeKind::tines;
    const float gain = parameter (tines ? "tines_gain" : "reeds_gain");
    const float volume = parameter (tines ? "tines_volume" : "reeds_volume");
    const float tone = parameter (tines ? "tines_tone" : "reeds_tone");
    const float bell = tines ? parameter ("tines_bell") : parameter ("reeds_hammer");
    const float bark = parameter (tines ? "tines_bark" : "reeds_bark");
    const float tremRate = parameter (tines ? "tines_trem_rate" : "reeds_trem_rate");
    const float tremDepth = parameter (tines ? "tines_trem_depth" : "reeds_trem_depth");
    const float velocityAmount = parameter (tines ? "tines_velocity" : "reeds_velocity");
    const double* ratios = tines ? kTineRatios : kReedRatios;
    const double* amps = tines ? kTineAmps : kReedAmps;
    const double* decays = tines ? kTineDecay : kReedDecay;
    const double releaseCoeff = std::exp (-1.0 / ((tines ? 0.22 : 0.16) * sampleRate));
    const double tremIncrement = kTwoPi * juce::jlimit (0.0f, 10.0f, tremRate) / sampleRate;
    const float toneCoeff = 0.015f + tone * 0.55f;
    const float barkDrive = 1.0f + bark * 8.0f;

    auto* left = buffer.getWritePointer (0);
    auto* right = buffer.getNumChannels() > 1 ? buffer.getWritePointer (1) : left;

    for (int sample = 0; sample < numSamples; ++sample)
    {
        float mixL = 0.0f;
        float mixR = 0.0f;
        const float tremolo = 1.0f - tremDepth * 0.5f * (1.0f + std::sin ((float) tremoloPhase));
        tremoloPhase += tremIncrement;
        if (tremoloPhase > kTwoPi) tremoloPhase -= kTwoPi;

        for (auto& voice : voices)
        {
            if (! voice.active) continue;
            if (voice.released)
            {
                voice.envelope *= (float) releaseCoeff;
                if (voice.envelope < 0.0001f)
                {
                    voice.active = false;
                    continue;
                }
            }

            double value = 0.0;
            for (int mode = 0; mode < 4; ++mode)
            {
                const double amp = amps[mode] * (mode == 0 ? 1.0 : (tines ? 0.65 + bell * 0.55 : 0.8));
                value += amp * voice.modeEnvelope[(size_t) mode] * std::sin (voice.modePhase[(size_t) mode]);
                voice.modePhase[(size_t) mode] += kTwoPi * voice.frequency * ratios[mode] / sampleRate;
                if (voice.modePhase[(size_t) mode] > kTwoPi) voice.modePhase[(size_t) mode] -= kTwoPi;
                voice.modeEnvelope[(size_t) mode] *= (float) decays[mode];
            }

            if (voice.clickEnvelope > 0.0001f)
            {
                value += (random.nextFloat() * 2.0f - 1.0f) * voice.clickEnvelope * 0.22;
                voice.clickEnvelope *= 0.9985f;
            }

            float driven = std::tanh ((float) value * barkDrive) / barkDrive * 1.6f;
            toneStateL += toneCoeff * (driven - toneStateL);
            toneStateR = toneStateL;
            const float velocityGain = juce::jmap (voice.velocity, 0.25f, 1.0f, 1.0f - velocityAmount * 0.5f, 1.0f);
            driven = toneStateL * voice.envelope * volume * gain * velocityGain * tremolo;
            mixL += driven * (1.0f - voice.pan);
            mixR += driven * (1.0f + voice.pan);
            voice.age += 1.0;
        }

        left[sample] = juce::jlimit (-1.0f, 1.0f, mixL * 0.8f);
        if (right != left)
            right[sample] = juce::jlimit (-1.0f, 1.0f, mixR * 0.8f);
    }
}

int NativeProcessor::getNumPrograms()
{
    if (kind == NativeKind::organ) return 4;
    if (kind == NativeKind::tines) return 4;
    return 4;
}

void NativeProcessor::setCurrentProgram (int index)
{
    applyProgram (juce::jlimit (0, getNumPrograms() - 1, index));
}

void NativeProcessor::applyProgram (int index)
{
    currentProgram = juce::jlimit (0, getNumPrograms() - 1, index);
    const auto setDrawbars = [this] (std::array<float, 9> values)
    {
        const char* ids[9] = {
            "organ_drawbar_16", "organ_drawbar_513", "organ_drawbar_8", "organ_drawbar_4",
            "organ_drawbar_223", "organ_drawbar_2", "organ_drawbar_135", "organ_drawbar_113",
            "organ_drawbar_1",
        };
        for (int i = 0; i < 9; ++i)
            setParameterValue (ids[i], values[(size_t) i]);
    };

    if (kind == NativeKind::organ)
    {
        if (currentProgram == 0) // Jazz
        {
            setDrawbars ({ 8, 8, 8, 0, 0, 0, 0, 0, 0 });
            setParameterValue ("organ_percussion", 0.0f);
            setParameterValue ("organ_vibrato", 1.0f);
            setParameterValue ("organ_chorus", 0.2f);
            setParameterValue ("organ_overdrive", 0.08f);
            setParameterValue ("organ_leslie", 1.0f);
            setParameterValue ("organ_reverb", 0.2f);
            setParameterValue ("organ_volume", 0.82f);
        }
        else if (currentProgram == 1) // Gospel
        {
            setDrawbars ({ 8, 8, 8, 8, 8, 8, 8, 8, 8 });
            setParameterValue ("organ_percussion", 0.5f);
            setParameterValue ("organ_perc_volume", 0.65f);
            setParameterValue ("organ_perc_decay", 0.55f);
            setParameterValue ("organ_perc_harmonic", 0.3f);
            setParameterValue ("organ_vibrato", 2.0f);
            setParameterValue ("organ_chorus", 0.4f);
            setParameterValue ("organ_overdrive", 0.15f);
            setParameterValue ("organ_leslie", 1.0f);
            setParameterValue ("organ_reverb", 0.28f);
            setParameterValue ("organ_volume", 0.82f);
        }
        else if (currentProgram == 2) // Rock
        {
            setDrawbars ({ 8, 8, 8, 8, 0, 0, 0, 0, 0 });
            setParameterValue ("organ_percussion", 0.4f);
            setParameterValue ("organ_overdrive", 0.5f);
            setParameterValue ("organ_vibrato", 1.0f);
            setParameterValue ("organ_leslie", 2.0f);
            setParameterValue ("organ_reverb", 0.18f);
            setParameterValue ("organ_volume", 0.82f);
        }
        else // Combo
        {
            setDrawbars ({ 8, 8, 0, 0, 0, 0, 0, 0, 0 });
            setParameterValue ("organ_percussion", 0.0f);
            setParameterValue ("organ_vibrato", 0.0f);
            setParameterValue ("organ_chorus", 0.0f);
            setParameterValue ("organ_overdrive", 0.2f);
            setParameterValue ("organ_leslie", 0.0f);
            setParameterValue ("organ_reverb", 0.12f);
            setParameterValue ("organ_volume", 0.82f);
        }
        return;
    }

    if (kind == NativeKind::tines)
    {
        const float values[4][6] = {
            { 0.82f, 0.48f, 0.42f, 0.42f, 4.8f, 0.35f }, // Suitcase
            { 0.82f, 0.62f, 0.5f, 0.5f, 0.0f, 0.0f },    // Stage
            { 0.82f, 0.32f, 0.24f, 0.2f, 3.2f, 0.16f },  // Mellow
            { 0.82f, 0.72f, 0.72f, 0.9f, 6.0f, 0.22f },  // Bark
        };
        setParameterValue ("tines_volume", values[currentProgram][0]);
        setParameterValue ("tines_tone", values[currentProgram][1]);
        setParameterValue ("tines_bell", values[currentProgram][2]);
        setParameterValue ("tines_bark", values[currentProgram][3]);
        setParameterValue ("tines_trem_rate", values[currentProgram][4]);
        setParameterValue ("tines_trem_depth", values[currentProgram][5]);
        setParameterValue ("tines_velocity", 0.8f);
        return;
    }

    const float values[4][7] = {
        { 0.80f, 0.55f, 0.50f, 0.50f, 5.0f, 0.30f, 0.80f }, // Clássico
        { 0.80f, 0.35f, 0.30f, 0.25f, 3.0f, 0.15f, 0.72f }, // Suave
        { 0.80f, 0.70f, 0.70f, 0.90f, 6.0f, 0.25f, 0.85f }, // Bark
        { 0.80f, 0.82f, 0.55f, 0.65f, 5.5f, 0.22f, 0.90f }, // Brilhante
    };
    setParameterValue ("reeds_gain", values[currentProgram][0]);
    setParameterValue ("reeds_tone", values[currentProgram][1]);
    setParameterValue ("reeds_hammer", values[currentProgram][2]);
    setParameterValue ("reeds_bark", values[currentProgram][3]);
    setParameterValue ("reeds_trem_rate", values[currentProgram][4]);
    setParameterValue ("reeds_trem_depth", values[currentProgram][5]);
    setParameterValue ("reeds_volume", values[currentProgram][6]);
    setParameterValue ("reeds_velocity", 0.8f);
}

const juce::String NativeProcessor::getProgramName (int index)
{
    if (kind == NativeKind::organ)
    {
        static const char* names[] = { "Jazz", "Gospel", "Rock", "Combo" };
        return juce::isPositiveAndBelow (index, 4) ? names[index] : juce::String();
    }
    if (kind == NativeKind::tines)
    {
        static const char* names[] = { "Suitcase", "Stage", "Mellow", "Bark" };
        return juce::isPositiveAndBelow (index, 4) ? names[index] : juce::String();
    }
    static const char* names[] = { "Clássico", "Suave", "Bark", "Brilhante" };
    return juce::isPositiveAndBelow (index, 4) ? names[index] : juce::String();
}

void NativeProcessor::changeProgramName (int, const juce::String&) {}

void NativeProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    if (auto xml = apvts.copyState().createXml())
        copyXmlToBinary (*xml, destData);
}

void NativeProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    if (auto xml = getXmlFromBinary (data, sizeInBytes))
        apvts.replaceState (juce::ValueTree::fromXml (*xml));
}

juce::AudioProcessorEditor* NativeProcessor::createEditor()
{
    return new juce::GenericAudioProcessorEditor (this);
}

} // namespace native
} // namespace preseter
