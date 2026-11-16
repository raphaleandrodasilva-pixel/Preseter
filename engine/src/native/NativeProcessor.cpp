#include "NativeProcessor.h"
#include "MdaFactories.h"

#include <cmath>

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

juce::String kindName (NativeKind kind)
{
    if (kind == NativeKind::organ) return "Preseter Organ";
    if (kind == NativeKind::tines) return "Preseter Tines";
    if (kind == NativeKind::mdaPiano) return "Preseter Piano";
    if (kind == NativeKind::mdaDx10) return "Preseter DX10";
    if (kind == NativeKind::mdaJx10) return "Preseter JX10";
    return "Preseter Wurly";
}

juce::String kindId (NativeKind kind)
{
    if (kind == NativeKind::organ) return "preseter.organ";
    if (kind == NativeKind::tines) return "preseter.tines";
    if (kind == NativeKind::mdaPiano) return "preseter.piano";
    if (kind == NativeKind::mdaDx10) return "preseter.dx";
    if (kind == NativeKind::mdaJx10) return "preseter.jx";
    return "preseter.reeds";
}
} // namespace

std::unique_ptr<NativeProcessor> createNativeProcessor (const juce::String& id)
{
    if (id == "preseter.organ") return std::make_unique<NativeProcessor> (NativeKind::organ, id, kindName (NativeKind::organ));
    if (id == "preseter.tines") return std::make_unique<NativeProcessor> (NativeKind::tines, id, kindName (NativeKind::tines));
    if (id == "preseter.reeds") return std::make_unique<NativeProcessor> (NativeKind::reeds, id, kindName (NativeKind::reeds));
    if (id == "preseter.piano") return std::make_unique<NativeProcessor> (NativeKind::mdaPiano, id, kindName (NativeKind::mdaPiano));
    if (id == "preseter.dx") return std::make_unique<NativeProcessor> (NativeKind::mdaDx10, id, kindName (NativeKind::mdaDx10));
    if (id == "preseter.jx") return std::make_unique<NativeProcessor> (NativeKind::mdaJx10, id, kindName (NativeKind::mdaJx10));
    return nullptr;
}

juce::AudioProcessorValueTreeState::ParameterLayout NativeProcessor::createLayout (NativeKind kind)
{
    using namespace juce;
    AudioProcessorValueTreeState::ParameterLayout layout;

    if (kind == NativeKind::mdaPiano || kind == NativeKind::mdaDx10
        || kind == NativeKind::mdaJx10)
        return layout;

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
        add ("organ_percussion", "Percussao", 0.0f, 1.0f, 0.01f, 0.0f);
        add ("organ_perc_volume", "Volume da percussao", 0.0f, 1.0f, 0.01f, 0.5f);
        add ("organ_perc_decay", "Decaimento da percussao", 0.0f, 1.0f, 0.01f, 0.5f);
        add ("organ_perc_harmonic", "Harmonico da percussao", 0.0f, 1.0f, 0.01f, 0.3f);
        add ("organ_vibrato", "Vibrato/Chorus", 0.0f, 6.0f, 1.0f, 1.0f);
        add ("organ_chorus", "Profundidade do chorus", 0.0f, 1.0f, 0.01f, 0.25f);
        add ("organ_overdrive", "Overdrive", 0.0f, 1.0f, 0.01f, 0.1f);
        add ("organ_leslie", "Leslie (0 parado, 1 lento, 2 rapido, 3 freio)", 0.0f, 3.0f, 1.0f, 1.0f);
        add ("organ_reverb", "Reverb", 0.0f, 1.0f, 0.01f, 0.2f);
        add ("organ_key_click", "Key click", 0.0f, 1.0f, 0.01f, 0.3f);
        add ("organ_volume", "Volume", 0.0f, 1.0f, 0.01f, 0.8f);
    }
    else if (kind == NativeKind::tines)
    {
        // MDA ePiano (base MIT de Paul Kellett / M.I. Hollemans).
        add ("tines_gain", "Gain", 0.0f, 1.0f, 0.01f, 0.8f);
        add ("tines_volume", "Volume", 0.0f, 1.0f, 0.01f, 0.8f);
        add ("tines_decay", "Envelope Decay", 0.0f, 100.0f, 1.0f, 50.0f);
        add ("tines_release", "Envelope Release", 0.0f, 100.0f, 1.0f, 50.0f);
        add ("tines_hardness", "Hardness", -50.0f, 50.0f, 0.1f, 0.0f);
        add ("tines_treble", "Treble Boost", -50.0f, 50.0f, 1.0f, 0.0f);
        add ("tines_modulation", "Modulation", 0.0f, 1.0f, 0.01f, 0.5f);
        add ("tines_lfo_rate", "LFO Rate", 0.0f, 1.0f, 0.01f, 0.65f);
        add ("tines_velocity", "Velocity Sensitivity", 0.0f, 100.0f, 1.0f, 25.0f);
        add ("tines_stereo", "Stereo Width", 0.0f, 200.0f, 1.0f, 100.0f);
        add ("tines_polyphony", "Polyphony", 1.0f, 32.0f, 1.0f, 16.0f);
        add ("tines_fine", "Fine Tuning", -50.0f, 50.0f, 0.1f, 0.0f);
        add ("tines_random", "Random Tuning", 0.0f, 1.0f, 0.01f, 0.0f);
        add ("tines_overdrive", "Overdrive", 0.0f, 100.0f, 0.1f, 0.0f);
    }
    else
    {
        // Wurlitzer 200A (OpenWurli).
        add ("wurly_volume", "Volume", 0.0f, 100.0f, 1.0f, 80.0f);
        add ("wurly_tremolo", "Tremolo Depth", 0.0f, 100.0f, 1.0f, 50.0f);
        add ("wurly_speaker", "Speaker Character", 0.0f, 100.0f, 1.0f, 0.0f);
        add ("wurly_mlp", "MLP Corrections", 0.0f, 1.0f, 1.0f, 0.0f);
        add ("wurly_hammer", "Hammer Contact", 0.5f, 2.0f, 0.01f, 1.0f);
        add ("wurly_damper", "Damper", 0.25f, 4.0f, 0.01f, 1.0f);
        add ("wurly_reed_trim", "Reed Bar Trim", 0.0f, 25000.0f, 10.0f, 17200.0f);
        add ("wurly_noise", "Noise", 0.0f, 1.0f, 1.0f, 0.0f);
        add ("wurly_noise_gain", "Noise Gain", 0.0f, 100.0f, 1.0f, 0.0f);
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
    else if (kind == NativeKind::tines)
        mdaEPiano = std::make_unique<MdaEPianoDsp>();
    else if (kind == NativeKind::reeds)
        wurli = std::make_unique<WurliProcessor>();
    else if (kind == NativeKind::mdaPiano)
        mdaProcessor = createMdaPiano();
    else if (kind == NativeKind::mdaDx10)
        mdaProcessor = createMdaDx10();
    else if (kind == NativeKind::mdaJx10)
        mdaProcessor = createMdaJx10();

    applyProgram (0);
}

void NativeProcessor::prepareToPlay (double newSampleRate, int samplesPerBlock)
{
    sampleRate = newSampleRate > 0.0 ? newSampleRate : 44100.0;

    if (mdaProcessor)
    {
        mdaProcessor->setRateAndBufferSizeDetails (sampleRate, samplesPerBlock);
        mdaProcessor->prepareToPlay (sampleRate, samplesPerBlock);
        mdaPrepared = true;
        return;
    }

    if (kind == NativeKind::tines)
    {
        if (mdaEPiano != nullptr)
            mdaEPiano->prepare (sampleRate);
        lastTinesModulation = -1.0f;
        return;
    }

    if (kind == NativeKind::reeds)
    {
        if (wurli != nullptr)
            wurli->prepare (sampleRate, samplesPerBlock);
        return;
    }

    if (kind == NativeKind::organ)
    {
        // Reservado aqui para não alocar na thread de áudio.
        organScratch.setSize (1, juce::jmax (1, samplesPerBlock), false, false, true);

        if (setBfree != nullptr)
        {
            setBfree->prepare (sampleRate);
            lastLeslieParam.store (-1);
            updateOrganParameters();
            organOutputGain = SetBfreeOrgan::outputTrim (parameter ("organ_overdrive"));
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
    modWheel = -1.0f;
    tremoloDepthSmoothed = 0.0f;
    tremoloDepthInitialized = false;
    toneStateL = 0.0f;
    toneStateR = 0.0f;
    reverbL = 0.0f;
    reverbR = 0.0f;
}

void NativeProcessor::releaseResources()
{
    if (mdaProcessor)
        mdaProcessor->releaseResources();
}

bool NativeProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    return layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo()
        && layouts.getMainInputChannelSet() == juce::AudioChannelSet::disabled();
}

double NativeProcessor::getTailLengthSeconds() const
{
    return mdaProcessor ? mdaProcessor->getTailLengthSeconds() : 2.0;
}

int NativeProcessor::getActiveVoices() const noexcept
{
    // Os portes do MDA inicializam o contador de vozes em prepareToPlay/reset
    // (o construtor do JX10 não o inicializa). Antes disso o valor é lixo.
    if (mdaProcessor == nullptr || !mdaPrepared)
        return 0;

    int voices = 0;
    if (kind == NativeKind::mdaPiano)
        voices = mdaPianoActiveVoices (mdaProcessor.get());
    else if (kind == NativeKind::mdaDx10)
        voices = mdaDxActiveVoices (mdaProcessor.get());
    else if (kind == NativeKind::mdaJx10)
        voices = mdaJxActiveVoices (mdaProcessor.get());

    return juce::jlimit (0, 64, voices);
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

    if (mdaProcessor)
    {
        buffer.clear();
        mdaProcessor->processBlock (buffer, midi);
        return;
    }

    buffer.clear();

    if (kind == NativeKind::tines)
    {
        if (mdaEPiano == nullptr)
        {
            midi.clear();
            return;
        }

        MdaEPianoParameters mda;
        mda.decay = parameter ("tines_decay");
        mda.release = parameter ("tines_release");
        mda.hardness = parameter ("tines_hardness");
        mda.treble = parameter ("tines_treble");
        mda.modulation = parameter ("tines_modulation");

        // Se o controle de Modulation da janela mudou, ele volta a mandar.
        if (std::abs (mda.modulation - lastTinesModulation) > 1.0e-4f)
        {
            lastTinesModulation = mda.modulation;
            mdaEPiano->clearModWheelOverride();
        }
        mda.lfoRate = parameter ("tines_lfo_rate");
        mda.velocity = parameter ("tines_velocity");
        mda.stereo = parameter ("tines_stereo");
        mda.polyphony = parameter ("tines_polyphony");
        mda.fine = parameter ("tines_fine");
        mda.random = parameter ("tines_random");
        mda.overdrive = parameter ("tines_overdrive");
        mda.volume = parameter ("tines_volume");

        mdaEPiano->setParameters (mda);
        mdaEPiano->process (buffer, midi);

        buffer.applyGain (parameter ("tines_gain"));
        return;
    }

    if (kind == NativeKind::reeds)
    {
        if (wurli == nullptr)
        {
            midi.clear();
            return;
        }

        WurliParameters wurly;
        wurly.volume = parameter ("wurly_volume") / 100.0f;
        wurly.tremolo = parameter ("wurly_tremolo") / 100.0f;
        wurly.speaker = parameter ("wurly_speaker") / 100.0f;
        wurly.mlp = parameter ("wurly_mlp") > 0.5f;
        wurly.hammer = parameter ("wurly_hammer");
        wurly.damper = parameter ("wurly_damper");
        wurly.reedTrim = parameter ("wurly_reed_trim");
        wurly.noise = parameter ("wurly_noise") > 0.5f;
        wurly.noiseGain = parameter ("wurly_noise_gain") / 100.0f;

        wurli->setParameters (wurly);
        wurli->process (buffer, midi);
        return;
    }

    if (kind == NativeKind::organ)
    {
        if (setBfree == nullptr)
        {
            midi.clear();
            return;
        }

        organEventCount = 0;

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
            else if (message.isController() && message.getControllerNumber() == 1)
            {
                // CC1 (modulação) = "rotary.speed-preset" no setBfree:
                // 0..42 lento, 43..85 parado, 86..127 rápido.
                event.data[0] = 0xB0; // canal 0
                event.data[1] = 1;
                event.data[2] = (std::uint8_t) juce::jlimit (0, 127,
                                                            message.getControllerValue());
            }
            else
            {
                continue;
            }

            if (organEventCount < (int) organEvents.size())
                organEvents[(size_t) organEventCount++] = event;
        }

        midi.clear();
        updateOrganParameters();

        auto* left = buffer.getWritePointer (0);
        const int numSamples = buffer.getNumSamples();

        if (buffer.getNumChannels() > 1)
        {
            setBfree->process (left, buffer.getWritePointer (1), numSamples,
                               organEvents.data(), organEventCount);
        }
        else
        {
            if (organScratch.getNumSamples() < numSamples)
                organScratch.setSize (1, numSamples, false, false, true);

            setBfree->process (left, organScratch.getWritePointer (0), numSamples,
                               organEvents.data(), organEventCount);
        }

        // Rampa de ganho entre blocos para o knob de overdrive não estalar.
        const float targetGain = SetBfreeOrgan::outputTrim (parameter ("organ_overdrive"));
        const float step = (targetGain - organOutputGain) / (float) juce::jmax (1, numSamples);

        for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
        {
            auto* data = buffer.getWritePointer (channel);
            float gain = organOutputGain;

            for (int sample = 0; sample < numSamples; ++sample)
            {
                gain += step;
                data[sample] = juce::jlimit (-1.0f, 1.0f, data[sample] * gain);
            }
        }

        organOutputGain = targetGain;

        const int midiLeslie = setBfree->takePendingLeslieMode();
        if (midiLeslie >= 0)
        {
            pendingLeslieFromMidi.store (midiLeslie);
            triggerAsyncUpdate();
        }
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
        else if (message.isController() && message.getControllerNumber() == 1)
            modWheel = juce::jlimit (0.0f, 1.0f, (float) message.getControllerValue() / 127.0f);
    }
    midi.clear();

    renderModal (buffer, buffer.getNumSamples());
}

void NativeProcessor::handleAsyncUpdate()
{
    const int mode = pendingLeslieFromMidi.exchange (-1);
    if (mode < 0 || kind != NativeKind::organ)
        return;

    // Reflete o CC1 na UI (botões do Leslie). Roda na thread de mensagens.
    lastLeslieParam.store (mode);
    setParameterValue ("organ_leslie", (float) mode);
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

    // Só reaplica quando o controle da janela muda: assim o CC1 (modulação)
    // pode assumir a velocidade do Leslie sem ser sobrescrito a cada bloco.
    const int leslieParam = (int) std::lround (parameter ("organ_leslie"));
    if (leslieParam != lastLeslieParam.load())
    {
        lastLeslieParam.store (leslieParam);
        setBfree->setLeslie (leslieParam);
    }

    setBfree->setOverdrive (parameter ("organ_overdrive"));
    setBfree->setReverb (parameter ("organ_reverb"));
    setBfree->setKeyClick (parameter ("organ_key_click"));
    setBfree->setVolume (parameter ("organ_volume"));
}

void NativeProcessor::renderModal (juce::AudioBuffer<float>& buffer, int numSamples)
{
    // Renderização do Preseter Reeds (o Tines usa o MDA ePiano em processBlock).
    const float gain = parameter ("reeds_gain");
    const float volume = parameter ("reeds_volume");
    const float tone = parameter ("reeds_tone");
    const float bell = parameter ("reeds_hammer");
    const float bark = parameter ("reeds_bark");
    const float tremRate = parameter ("reeds_trem_rate");
    const float tremDepth = parameter ("reeds_trem_depth");
    const float tremMode = parameter ("reeds_trem_mode");
    const float velocityAmount = parameter ("reeds_velocity");

    // CC1 (modulação) controla a profundidade do tremolo. Se o controle da
    // janela estiver em zero, o CC1 ainda consegue ativar até 50%.
    float effectiveDepth = tremDepth;
    if (modWheel >= 0.0f)
        effectiveDepth = modWheel * juce::jmax (tremDepth, 0.5f);
    effectiveDepth = juce::jlimit (0.0f, 1.0f, effectiveDepth);

    if (! tremoloDepthInitialized)
    {
        tremoloDepthSmoothed = effectiveDepth;
        tremoloDepthInitialized = true;
    }

    const float depthSmoothing = 1.0f - std::exp (-1.0f / (0.03f * (float) sampleRate));
    const double* ratios = kReedRatios;
    const double* amps = kReedAmps;
    const double* decays = kReedDecay;
    const double releaseCoeff = std::exp (-1.0 / (0.16 * sampleRate));
    const double tremIncrement = kTwoPi * juce::jlimit (0.0f, 10.0f, tremRate) / sampleRate;
    const float toneCoeff = 0.015f + tone * 0.55f;
    const float barkDrive = 1.0f + bark * 8.0f;

    auto* left = buffer.getWritePointer (0);
    auto* right = buffer.getNumChannels() > 1 ? buffer.getWritePointer (1) : left;

    for (int sample = 0; sample < numSamples; ++sample)
    {
        float mixL = 0.0f;
        float mixR = 0.0f;

        tremoloDepthSmoothed += depthSmoothing * (effectiveDepth - tremoloDepthSmoothed);

        const float lfo = std::sin ((float) tremoloPhase);
        tremoloPhase += tremIncrement;
        if (tremoloPhase > kTwoPi) tremoloPhase -= kTwoPi;

        const float depth = tremoloDepthSmoothed;
        float tremoloL = 1.0f - depth * 0.5f * (1.0f + lfo);
        float tremoloR = tremoloL;

        if (tremMode > 0.5f) // auto-pan
            tremoloR = 1.0f - depth * 0.5f * (1.0f - lfo);

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
                const double amp = amps[mode] * (mode == 0 ? 1.0 : 0.8);
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
            driven = toneStateL * voice.envelope * volume * gain * velocityGain;
            mixL += driven * tremoloL * (1.0f - voice.pan);
            mixR += driven * tremoloR * (1.0f + voice.pan);
            voice.age += 1.0;
        }

        left[sample] = juce::jlimit (-1.0f, 1.0f, mixL * 0.8f);
        if (right != left)
            right[sample] = juce::jlimit (-1.0f, 1.0f, mixR * 0.8f);
    }
}

int NativeProcessor::getNumPrograms()
{
    if (mdaProcessor) return mdaProcessor->getNumPrograms();
    if (kind == NativeKind::organ) return 4;
    if (kind == NativeKind::tines) return 4;
    return 4;
}

int NativeProcessor::getCurrentProgram()
{
    if (mdaProcessor) return mdaProcessor->getCurrentProgram();
    return currentProgram;
}

void NativeProcessor::setCurrentProgram (int index)
{
    if (mdaProcessor)
    {
        mdaProcessor->setCurrentProgram (index);
        currentProgram = mdaProcessor->getCurrentProgram();
        return;
    }
    applyProgram (juce::jlimit (0, getNumPrograms() - 1, index));
}

void NativeProcessor::applyProgram (int index)
{
    if (mdaProcessor)
    {
        const int count = juce::jmax (1, mdaProcessor->getNumPrograms());
        currentProgram = juce::jlimit (0, count - 1, index);
        mdaProcessor->setCurrentProgram (currentProgram);
        return;
    }

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
        // Presets do MDA ePiano (Autopan, Default, Mellow e Bright).
        struct Program
        {
            float decay, release, hardness, treble, modulation, lfo;
            float velocity, stereo, polyphony, fine, random, overdrive;
        };

        static const Program programs[4] = {
            { 50.0f, 50.0f,   0.0f,   0.0f, 0.25f, 0.65f, 25.0f, 100.0f, 16.0f, 0.0f, 0.246f,  0.0f }, // Suitcase (Autopan)
            { 50.0f, 50.0f,   0.0f,   0.0f, 0.50f, 0.65f, 25.0f, 100.0f, 16.0f, 0.0f, 0.146f,  0.0f }, // Stage (Default)
            { 50.0f, 50.0f, -50.0f, -50.0f, 0.50f, 0.65f, 25.0f, 100.0f, 16.0f, 0.0f, 0.246f,  0.0f }, // Mellow
            { 50.0f, 50.0f,  50.0f,  30.0f, 0.50f, 0.65f, 25.0f, 100.0f, 16.0f, 0.0f, 0.146f, 50.0f }, // Bark (Bright)
        };

        const auto& program = programs[juce::jlimit (0, 3, currentProgram)];
        setParameterValue ("tines_gain", 0.8f);
        setParameterValue ("tines_volume", 0.8f);
        setParameterValue ("tines_decay", program.decay);
        setParameterValue ("tines_release", program.release);
        setParameterValue ("tines_hardness", program.hardness);
        setParameterValue ("tines_treble", program.treble);
        setParameterValue ("tines_modulation", program.modulation);
        setParameterValue ("tines_lfo_rate", program.lfo);
        setParameterValue ("tines_velocity", program.velocity);
        setParameterValue ("tines_stereo", program.stereo);
        setParameterValue ("tines_polyphony", program.polyphony);
        setParameterValue ("tines_fine", program.fine);
        setParameterValue ("tines_random", program.random);
        setParameterValue ("tines_overdrive", program.overdrive);
        return;
    }

    struct Program
    {
        float volume, tremolo, speaker, mlp, hammer, damper, reedTrim, noise, noiseGain;
    };

    static const Program programs[4] = {
        { 80.0f, 50.0f,   0.0f, 0.0f, 1.0f, 1.0f, 17200.0f, 0.0f, 0.0f }, // Clássico
        { 80.0f, 65.0f,  60.0f, 1.0f, 1.0f, 1.0f, 17200.0f, 0.0f, 0.0f }, // Suitcase
        { 80.0f,  0.0f,  30.0f, 0.0f, 1.0f, 1.0f, 17200.0f, 0.0f, 0.0f }, // Stage
        { 90.0f, 25.0f,  50.0f, 0.0f, 1.0f, 1.0f, 17200.0f, 0.0f, 0.0f }, // Bark
    };

    const auto& program = programs[juce::jlimit (0, 3, currentProgram)];
    setParameterValue ("wurly_volume", program.volume);
    setParameterValue ("wurly_tremolo", program.tremolo);
    setParameterValue ("wurly_speaker", program.speaker);
    setParameterValue ("wurly_mlp", program.mlp);
    setParameterValue ("wurly_hammer", program.hammer);
    setParameterValue ("wurly_damper", program.damper);
    setParameterValue ("wurly_reed_trim", program.reedTrim);
    setParameterValue ("wurly_noise", program.noise);
    setParameterValue ("wurly_noise_gain", program.noiseGain);
}

const juce::String NativeProcessor::getProgramName (int index)
{
    if (mdaProcessor)
        return mdaProcessor->getProgramName (index);
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
    static const char* names[] = { "Clássico", "Suitcase", "Stage", "Bark" };
    return juce::isPositiveAndBelow (index, 4) ? names[index] : juce::String();
}

void NativeProcessor::changeProgramName (int index, const juce::String& newName)
{
    if (mdaProcessor)
    {
        mdaProcessor->changeProgramName (index, newName);
        return;
    }
    juce::ignoreUnused (index, newName);
}

void NativeProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    if (mdaProcessor)
    {
        mdaProcessor->getStateInformation (destData);
        return;
    }
    if (auto xml = apvts.copyState().createXml())
        copyXmlToBinary (*xml, destData);
}

void NativeProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    if (mdaProcessor)
    {
        mdaProcessor->setStateInformation (data, sizeInBytes);
        return;
    }
    if (auto xml = getXmlFromBinary (data, sizeInBytes))
        apvts.replaceState (juce::ValueTree::fromXml (*xml));
}

juce::AudioProcessorEditor* NativeProcessor::createEditor()
{
    if (mdaProcessor)
        return mdaProcessor->createEditorIfNeeded();
    return new juce::GenericAudioProcessorEditor (this);
}

} // namespace native
} // namespace preseter
