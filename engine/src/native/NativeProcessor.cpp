#include "NativeProcessor.h"

#include "drums/DrumKitEngine.h"
#include "drums/DrumSequencer.h"
#include "MdaFactories.h"
#include "DexedFactory.h"

#include "EngineCore/InitPatch.hpp"
#include "EngineCore/ParamFormat.hpp"
#include "EngineCore/Params.hpp"

#include <algorithm>
#include <cmath>

namespace preseter
{
namespace native
{
namespace
{
constexpr double kTwoPi = 6.283185307179586;
constexpr double kOrganRatios[9] = { 0.5, 1.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0 };

/**
 * D6: padrão de bateria em texto compacto para o XML do estado.
 * Formato: `v1;stepsPerBar;bars;swing*100;trackCount|pad,mute,level*100,steps...`
 * onde cada passo é `..` (desligado) ou a velocity em hex (01..7f).
 */
juce::String serializeDrumPattern (const preseter::drums::DrumPattern& pattern)
{
    juce::String text;
    text << "v1;" << pattern.stepsPerBar << ";" << pattern.bars << ";"
         << juce::roundToInt (pattern.swing * 100.0f) << ";" << pattern.trackCount;

    const int total = pattern.totalSteps();
    for (int t = 0; t < pattern.trackCount; ++t)
    {
        const auto& track = pattern.tracks[(size_t) t];
        text << "|" << track.pad << "," << (track.mute ? 1 : 0) << ","
             << juce::roundToInt (track.levelDb * 100.0f) << ",";

        for (int s = 0; s < total; ++s)
        {
            const auto& step = track.steps[(size_t) s];
            if (! step.on)
            {
                text << "..";
                continue;
            }

            text << juce::String::toHexString (juce::jlimit (1, 127, step.velocity))
                        .paddedLeft ('0', 2)
                        .toLowerCase();
        }
    }
    return text;
}

bool parseDrumPattern (const juce::String& text, preseter::drums::DrumPattern& pattern)
{
    juce::StringArray parts;
    parts.addTokens (text, "|", "");
    if (parts.size() < 1)
        return false;

    juce::StringArray header;
    header.addTokens (parts[0], ";", "");
    if (header.size() < 5 || header[0] != "v1")
        return false;

    const int stepsPerBar = header[1].getIntValue();
    const int bars = header[2].getIntValue();
    if (! preseter::drums::isSupportedStepsPerBar (stepsPerBar)
        || ! preseter::drums::isSupportedBars (bars))
        return false;

    pattern = preseter::drums::DrumPattern {};
    pattern.stepsPerBar = stepsPerBar;
    pattern.bars = bars;
    pattern.swing = (float) header[3].getIntValue() / 100.0f;

    const int requestedTracks = juce::jlimit (0, preseter::drums::kMaxTracks,
                                              header[4].getIntValue());
    const int total = pattern.totalSteps();

    for (int t = 0; t < requestedTracks && t + 1 < parts.size(); ++t)
    {
        juce::StringArray fields;
        fields.addTokens (parts[t + 1], ",", "");
        if (fields.size() < 4)
            continue;

        auto& track = pattern.tracks[(size_t) pattern.trackCount];
        track.pad = juce::jlimit (0, 15, fields[0].getIntValue());
        track.mute = fields[1].getIntValue() != 0;
        track.levelDb = (float) fields[2].getIntValue() / 100.0f;

        const auto& encodedSteps = fields[3];
        for (int s = 0; s < total; ++s)
        {
            const auto token = encodedSteps.substring (s * 2, s * 2 + 2);
            auto& step = track.steps[(size_t) s];
            if (token.isEmpty() || token == "..")
            {
                step.on = false;
                step.velocity = 100;
            }
            else
            {
                step.on = true;
                step.velocity = juce::jlimit (1, 127, (int) token.getHexValue32());
            }
        }

        ++pattern.trackCount;
    }

    return true;
}
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
    if (kind == NativeKind::dexed) return "Preseter Dexed";
    if (kind == NativeKind::synth2) return "Preseter Synth2";
    if (kind == NativeKind::drums) return "Preseter Drums";
    return "Preseter Wurly";
}

juce::String kindId (NativeKind kind)
{
    if (kind == NativeKind::organ) return "preseter.organ";
    if (kind == NativeKind::tines) return "preseter.tines";
    if (kind == NativeKind::mdaPiano) return "preseter.piano";
    if (kind == NativeKind::mdaDx10) return "preseter.dx";
    if (kind == NativeKind::mdaJx10) return "preseter.jx";
    if (kind == NativeKind::synth2) return "preseter.synth2";
    if (kind == NativeKind::drums) return "preseter.drums";
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
    if (id == "preseter.dexed") return std::make_unique<NativeProcessor> (NativeKind::dexed, id, kindName (NativeKind::dexed));
    if (id == "preseter.synth2") return std::make_unique<NativeProcessor> (NativeKind::synth2, id, kindName (NativeKind::synth2));
    if (id == "preseter.drums") return std::make_unique<NativeProcessor> (NativeKind::drums, id, kindName (NativeKind::drums));
    return nullptr;
}

/** Parâmetro inteiro do Synth2 com o texto formatado pelo próprio motor (Hz,
    semitons, divisões de tempo...), igual ao painel do Synth1/Synth2. */
class Synth2Parameter final : public juce::AudioParameterInt
{
public:
    Synth2Parameter (const juce::ParameterID& parameterID, const juce::String& name,
                     int synth2Index, int minimum, int maximum, int defaultValue)
        : AudioParameterInt (parameterID, name, minimum, maximum, defaultValue),
          index (synth2Index), minValue (minimum), maxValue (maximum)
    {
    }

    juce::String getText (float normalisedValue, int) const override
    {
        const auto value = minValue + (int) std::lround ((double) juce::jlimit (0.0f, 1.0f, normalisedValue)
                                                       * (double) (maxValue - minValue));
        return juce::String (oxo::s2::FormatParam (index, value));
    }

private:
    int index;
    int minValue;
    int maxValue;
};

juce::AudioProcessorValueTreeState::ParameterLayout NativeProcessor::createLayout (NativeKind kind)
{
    using namespace juce;
    AudioProcessorValueTreeState::ParameterLayout layout;

    if (kind == NativeKind::synth2)
    {
        for (int i = 0; i < oxo::s2::kParamCount; ++i)
        {
            const auto& info = oxo::s2::kParams[(size_t) i];
            layout.add (std::make_unique<Synth2Parameter> (
                ParameterID { info.key, 1 }, info.name, i, info.min, info.max,
                oxo::s2::kInitPatchValues[(size_t) i]));
        }

        // Volume mestre (fora do patch .sy1, como no Synth1/Synth2).
        layout.add (std::make_unique<Synth2Parameter> (
            ParameterID { "volume", 1 }, "volume", oxo::s2::kVolumeParamId, 0, 127, 64));
        return layout;
    }

    if (kind == NativeKind::mdaPiano || kind == NativeKind::mdaDx10
        || kind == NativeKind::mdaJx10)
        return layout;

    // D2: o Preseter Drums ainda não tem parâmetros (o kit e o sequenciador
    // entram nas próximas tarefas). Layout vazio, estado vazio serializável.
    if (kind == NativeKind::drums)
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
        delegatedProcessor = createMdaPiano();
    else if (kind == NativeKind::mdaDx10)
        delegatedProcessor = createMdaDx10();
    else if (kind == NativeKind::mdaJx10)
        delegatedProcessor = createMdaJx10();
    else if (kind == NativeKind::dexed)
        delegatedProcessor = createDexed();
    else if (kind == NativeKind::synth2)
        synth2 = std::make_unique<Synth2Dsp>();
    else if (kind == NativeKind::drums)
    {
        drumKit = std::make_unique<drums::DrumKitEngine>();
        drumSequencer = std::make_unique<drums::DrumSequencer>();
    }

    applyProgram (0);
}

NativeProcessor::~NativeProcessor() = default;

void NativeProcessor::prepareToPlay (double newSampleRate, int samplesPerBlock)
{
    sampleRate = newSampleRate > 0.0 ? newSampleRate : 44100.0;

    // D2/D3: Preseter Drums — prepara o motor de pads (o kit é carregado na
    // thread de mensagem, em `loadDrumKit`).
    if (kind == NativeKind::drums)
    {
        if (drumKit != nullptr)
            drumKit->prepare (sampleRate, samplesPerBlock);
        return;
    }

    if (kind == NativeKind::synth2)
    {
        if (synth2 != nullptr)
            synth2->prepare (sampleRate);
        synth2ForceParams.store (true);
        return;
    }

    if (delegatedProcessor)
    {
        delegatedProcessor->setRateAndBufferSizeDetails (sampleRate, samplesPerBlock);
        delegatedProcessor->prepareToPlay (sampleRate, samplesPerBlock);
        delegatedPrepared = true;
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
    if (delegatedProcessor)
        delegatedProcessor->releaseResources();
}

bool NativeProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    return layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo()
        && layouts.getMainInputChannelSet() == juce::AudioChannelSet::disabled();
}

double NativeProcessor::getTailLengthSeconds() const
{
    if (kind == NativeKind::drums) return 2.5;
    if (kind == NativeKind::synth2) return 4.5;
    return delegatedProcessor ? delegatedProcessor->getTailLengthSeconds() : 2.0;
}

int NativeProcessor::getActiveVoices() const noexcept
{
    if (kind == NativeKind::drums)
        return drumKit != nullptr ? drumKit->getActiveVoices() : 0;
    if (kind == NativeKind::synth2)
        return synth2 != nullptr ? synth2->activeVoices() : 0;

    // Os portes do MDA inicializam o contador de vozes em prepareToPlay/reset
    // (o construtor do JX10 não o inicializa). Antes disso o valor é lixo.
    if (delegatedProcessor == nullptr || !delegatedPrepared)
        return 0;

    int voices = 0;
    if (kind == NativeKind::mdaPiano)
        voices = mdaPianoActiveVoices (delegatedProcessor.get());
    else if (kind == NativeKind::mdaDx10)
        voices = mdaDxActiveVoices (delegatedProcessor.get());
    else if (kind == NativeKind::mdaJx10)
        voices = mdaJxActiveVoices (delegatedProcessor.get());
    else if (kind == NativeKind::dexed)
        voices = dexedActiveVoices (delegatedProcessor.get());

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

    // D3/D4: pads + sequenciador. O MIDI do teclado e os passos do sequenciador
    // são aplicados na amostra exata, com um array fixo (sem alocar).
    if (kind == NativeKind::drums)
    {
        buffer.clear();
        const int numSamples = buffer.getNumSamples();
        if (drumKit == nullptr || numSamples <= 0)
        {
            midi.clear();
            return;
        }

        drumKit->beginBlock();
        int inputCount = 0;
        for (const auto metadata : midi)
        {
            if (inputCount >= (int) drumInputEvents.size())
                break;

            const auto message = metadata.getMessage();
            if (message.isSysEx())
                continue; // sysex pode alocar ao copiar; o drums não o usa

            auto& event = drumInputEvents[(size_t) inputCount];
            event.position = juce::jlimit (0, numSamples, metadata.samplePosition);
            event.message = message;
            ++inputCount;
        }
        midi.clear();

        const int sequenceCount = drumSequencer != nullptr
            ? drumSequencer->process (numSamples)
            : 0;
        const auto* sequenceEvents = sequenceCount > 0 ? drumSequencer->getEvents() : nullptr;

        int inputIndex = 0;
        int sequenceIndex = 0;
        int position = 0;

        while (inputIndex < inputCount || sequenceIndex < sequenceCount)
        {
            const int nextInput = inputIndex < inputCount
                ? drumInputEvents[(size_t) inputIndex].position
                : numSamples;
            const int nextSequence = sequenceIndex < sequenceCount
                ? sequenceEvents[sequenceIndex].sampleOffset
                : numSamples;
            const int next = juce::jmin (nextInput, nextSequence);

            if (next > position)
            {
                drumKit->render (buffer, position, next - position);
                position = next;
            }

            while (inputIndex < inputCount
                   && drumInputEvents[(size_t) inputIndex].position == next)
            {
                const auto& message = drumInputEvents[(size_t) inputIndex].message;
                if (message.isNoteOn())
                    drumKit->noteOn (message.getNoteNumber(),
                                     (float) message.getVelocity() / 127.0f);
                else if (message.isAllNotesOff() || message.isAllSoundOff())
                    drumKit->allNotesOff();
                ++inputIndex;
            }

            while (sequenceIndex < sequenceCount
                   && sequenceEvents[sequenceIndex].sampleOffset == next)
            {
                const auto& event = sequenceEvents[sequenceIndex];
                drumKit->noteOn (36 + event.pad, (float) event.velocity / 127.0f);
                ++sequenceIndex;
            }
        }

        if (position < numSamples)
            drumKit->render (buffer, position, numSamples - position);
        return;
    }

    if (kind == NativeKind::synth2)
    {
        processSynth2 (buffer, midi);
        return;
    }

    if (delegatedProcessor)
    {
        buffer.clear();
        delegatedProcessor->processBlock (buffer, midi);
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

void NativeProcessor::processSynth2 (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    buffer.clear();

    if (synth2 == nullptr)
    {
        midi.clear();
        return;
    }

    const int numSamples = buffer.getNumSamples();
    auto* left = buffer.getNumChannels() > 0 ? buffer.getWritePointer (0) : nullptr;
    auto* right = buffer.getNumChannels() > 1 ? buffer.getWritePointer (1) : nullptr;

    if (left == nullptr)
    {
        midi.clear();
        return;
    }

    if (auto* head = getPlayHead())
        if (auto position = head->getPosition())
            synth2->setTransport (position->getBpm().orFallback (120.0),
                                  position->getPpqPosition().orFallback (0.0),
                                  position->getIsPlaying());

    const bool force = synth2ForceParams.exchange (false, std::memory_order_relaxed);
    if (synth2PatchReload.exchange (false, std::memory_order_relaxed))
        synth2->requestPatchReload();

    synth2->beginPatchIfNeeded();

    for (int i = 0; i < kSynth2ParamCount; ++i)
    {
        const auto& info = oxo::s2::kParams[(size_t) i];
        const int value = juce::jlimit (info.min, info.max,
                                        juce::roundToInt (parameter (info.key)));
        if (force || value != synth2Values[(size_t) i])
        {
            synth2->setParam (i, value);
            synth2Values[(size_t) i] = value;
        }
    }

    const int volume = juce::jlimit (0, 127, juce::roundToInt (parameter ("volume")));
    if (force || volume != synth2Volume)
    {
        synth2->setVolume (volume);
        synth2Volume = volume;
    }

    synth2->beginBlock (numSamples);

    int pos = 0;
    for (const auto metadata : midi)
    {
        const auto message = metadata.getMessage();
        int at = juce::jlimit (pos, numSamples, metadata.samplePosition);
        if (message.isNoteOnOrOff())
            at &= ~15; // o original inicia/encerra notas no começo do sub-bloco de 16 samples
        at = juce::jlimit (pos, numSamples, at);

        if (at > pos)
        {
            synth2->render (left + pos, right != nullptr ? right + pos : nullptr, at - pos);
            pos = at;
        }

        if (message.isNoteOn())
            synth2->noteOn (message.getNoteNumber(), juce::jlimit (1, 127, (int) message.getVelocity()));
        else if (message.isNoteOff())
            synth2->noteOff (message.getNoteNumber());
        else if (message.isPitchWheel())
            synth2->pitchBend (message.getPitchWheelValue());
        else if (message.isController())
            synth2->controlChange (message.getControllerNumber(), message.getControllerValue());
        else if (message.isChannelPressure())
            synth2->channelPressure (message.getChannelPressureValue());
        else if (message.isProgramChange())
        {
            synth2PendingProgram.store (message.getProgramChangeNumber(), std::memory_order_relaxed);
            triggerAsyncUpdate();
        }
        else if (message.isAllNotesOff())
            synth2->allNotesOff (false);
        else if (message.isAllSoundOff())
            synth2->panic();
    }

    if (pos < numSamples)
        synth2->render (left + pos, right != nullptr ? right + pos : nullptr, numSamples - pos);

    midi.clear();
}

void NativeProcessor::handleAsyncUpdate()
{
    if (kind == NativeKind::synth2)
    {
        const int program = synth2PendingProgram.exchange (-1, std::memory_order_relaxed);
        if (program >= 0)
        {
            applyProgram (program);
            synth2PatchReload.store (true, std::memory_order_relaxed);
        }
        return;
    }

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
    if (delegatedProcessor) return delegatedProcessor->getNumPrograms();
    if (kind == NativeKind::synth2)
        return synth2Programs.empty() ? 1 : (int) synth2Programs.size();
    if (kind == NativeKind::drums) return 1; // D2: "Kit vazio"; os kits entram na D3/D8.
    if (kind == NativeKind::organ) return 4;
    if (kind == NativeKind::tines) return 4;
    return 4;
}

int NativeProcessor::getCurrentProgram()
{
    if (delegatedProcessor) return delegatedProcessor->getCurrentProgram();
    return currentProgram;
}

void NativeProcessor::setCurrentProgram (int index)
{
    if (delegatedProcessor)
    {
        delegatedProcessor->setCurrentProgram (index);
        currentProgram = delegatedProcessor->getCurrentProgram();
        return;
    }
    applyProgram (juce::jlimit (0, getNumPrograms() - 1, index));
}

void NativeProcessor::applyProgram (int index)
{
    if (delegatedProcessor)
    {
        const int count = juce::jmax (1, delegatedProcessor->getNumPrograms());
        currentProgram = juce::jlimit (0, count - 1, index);
        delegatedProcessor->setCurrentProgram (currentProgram);
        return;
    }

    if (kind == NativeKind::synth2)
    {
        currentProgram = juce::jlimit (0, getNumPrograms() - 1, index);
        const Synth2PatchValues& source = synth2Programs.empty()
            ? oxo::s2::kInitPatchValues
            : synth2Programs[(size_t) currentProgram].values;

        for (int i = 0; i < oxo::s2::kParamCount; ++i)
            setParameterValue (oxo::s2::kParams[(size_t) i].key, (float) source[(size_t) i]);

        const auto name = synth2Programs.empty()
            ? juce::String ("INIT")
            : synth2Programs[(size_t) currentProgram].name;
        apvts.state.setProperty ("synth2PatchName", name, nullptr);
        synth2ForceParams.store (true, std::memory_order_relaxed);
        return;
    }

    // D2: o Preseter Drums ainda não tem kits; mantém um programa vazio.
    if (kind == NativeKind::drums)
    {
        currentProgram = 0;
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
    if (delegatedProcessor)
        return delegatedProcessor->getProgramName (index);
    if (kind == NativeKind::synth2)
    {
        if (synth2Programs.empty())
            return index == 0 ? juce::String ("INIT") : juce::String();
        return juce::isPositiveAndBelow (index, (int) synth2Programs.size())
            ? synth2Programs[(size_t) index].name
            : juce::String();
    }
    if (kind == NativeKind::drums)
        return index == 0 ? juce::String ("Kit vazio") : juce::String();
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
    if (delegatedProcessor)
    {
        delegatedProcessor->changeProgramName (index, newName);
        return;
    }
    juce::ignoreUnused (index, newName);
}

void NativeProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    if (delegatedProcessor)
    {
        delegatedProcessor->getStateInformation (destData);
        return;
    }

    if (kind == NativeKind::drums)
    {
        auto state = apvts.copyState();
        state.setProperty ("drumKitPath", drumKitPath, nullptr);
        state.setProperty ("drumKitBank", drumKitBank, nullptr);
        state.setProperty ("drumKitProgram", drumKitProgram, nullptr);
        state.setProperty ("drumPattern", serializeDrumPattern (drumPattern), nullptr);
        state.setProperty ("drumGainDb", juce::roundToInt (drumGainDb * 100.0f), nullptr);

        // Sample próprio por pad (v1.1). Ausente nos estados antigos.
        if (drumKit != nullptr)
        {
            for (int pad = 0; pad < drums::DrumKitEngine::kPadCount; ++pad)
            {
                const auto info = drumKit->getPadSourceInfo (pad);
                if (! info.active)
                    continue;
                const auto suffix = juce::String (pad);
                state.setProperty ("drumPadPath" + suffix, info.path, nullptr);
                state.setProperty ("drumPadBank" + suffix, info.bank, nullptr);
                state.setProperty ("drumPadProgram" + suffix, info.program, nullptr);
                state.setProperty ("drumPadNote" + suffix, info.note, nullptr);
            }
        }

        if (auto xml = state.createXml())
            copyXmlToBinary (*xml, destData);
        return;
    }

    if (auto xml = apvts.copyState().createXml())
        copyXmlToBinary (*xml, destData);
}

void NativeProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    if (delegatedProcessor)
    {
        delegatedProcessor->setStateInformation (data, sizeInBytes);
        return;
    }
    if (auto xml = getXmlFromBinary (data, sizeInBytes))
    {
        auto state = juce::ValueTree::fromXml (*xml);
        if (kind == NativeKind::drums)
        {
            drumKitPath = state.getProperty ("drumKitPath").toString();

            // Atributos de XML viram strings no ValueTree: converte sem perder
            // o número (o `(int) var` de uma string daria 0).
            const auto readInt = [&state] (const juce::Identifier& name, int fallback)
            {
                const auto value = state.getProperty (name);
                if (value.isInt() || value.isDouble())
                    return (int) value;
                if (value.isString())
                    return value.toString().getIntValue();
                return fallback;
            };
            drumKitBank = readInt ("drumKitBank", 128);
            drumKitProgram = readInt ("drumKitProgram", 0);
            drumGainDb = juce::jlimit (-60.0f, 12.0f,
                                       (float) readInt ("drumGainDb", 0) / 100.0f);
            if (drumKit != nullptr)
                drumKit->setOutputGainDb (drumGainDb);

            // Recarrega o kit se o estado aponta para outro arquivo. A troca no
            // DrumKitEngine é segura: as vozes em andamento continuam no kit
            // antigo e as próximas usam o novo.
            if (drumKit != nullptr && drumKitPath.isNotEmpty())
            {
                const juce::File kitFile (drumKitPath);
                if (kitFile.existsAsFile()
                    && (drumKit->getSourcePath() != drumKitPath
                        || drumKit->getBank() != drumKitBank
                        || drumKit->getProgram() != drumKitProgram))
                {
                    juce::String ignored;
                    drumKit->load (kitFile, drumKitBank, drumKitProgram, ignored);
                }
            }

            // Sample próprio por pad (v1.1). O estado antigo não traz as
            // propriedades: nesse caso os pads continuam usando o kit.
            if (drumKit != nullptr)
            {
                for (int pad = 0; pad < drums::DrumKitEngine::kPadCount; ++pad)
                {
                    drumKit->clearPadSource (pad);
                    const auto suffix = juce::String (pad);
                    const auto padPath = state.getProperty ("drumPadPath" + suffix).toString();
                    if (padPath.isEmpty())
                        continue;

                    const juce::File padFile (padPath);
                    if (! padFile.existsAsFile())
                        continue;

                    const int padBank = readInt ("drumPadBank" + suffix, 128);
                    const int padProgram = readInt ("drumPadProgram" + suffix, 0);
                    const int padNote = juce::jlimit (
                        0, 127, readInt ("drumPadNote" + suffix,
                                         drums::DrumKitEngine::kFirstPadNote + pad));
                    juce::String ignored;
                    drumKit->loadPadSource (pad, padFile, padBank, padProgram, padNote, ignored);
                }
            }

            // Padrão (v1). Ausente = estado antigo: mantém o padrão atual (vazio
            // no instrumento novo), sem erro.
            const auto patternText = state.getProperty ("drumPattern").toString();
            drums::DrumPattern restored;
            if (patternText.isNotEmpty() && parseDrumPattern (patternText, restored))
            {
                drumPattern = drums::sanitizedPattern (restored);
                applyDrumPatternPadSettings (drumPattern);
                if (drumSequencer != nullptr)
                    drumSequencer->publishPattern (drumPattern);
            }
        }
        apvts.replaceState (state);
        if (kind == NativeKind::synth2)
        {
            synth2ForceParams.store (true, std::memory_order_relaxed);
            synth2PatchReload.store (true, std::memory_order_relaxed);
        }
    }
}

bool NativeProcessor::loadDrumKit (const juce::File& file, int bank, int program,
                                   juce::String& error)
{
    if (kind != NativeKind::drums || drumKit == nullptr)
        return false;

    if (! drumKit->load (file, bank, program, error))
        return false;

    drumKitPath = file.getFullPathName();
    drumKitBank = bank;
    drumKitProgram = program;
    drumKit->setOutputGainDb (drumGainDb);
    return true;
}

bool NativeProcessor::setDrumPadSource (int pad, const juce::File& file, int bank, int program,
                                        int note, juce::String& error)
{
    if (kind != NativeKind::drums || drumKit == nullptr)
    {
        error = "Este layer nao e um Preseter Drums.";
        return false;
    }
    if (pad < 0 || pad >= drums::DrumKitEngine::kPadCount)
    {
        error = "Pad invalido.";
        return false;
    }
    return drumKit->loadPadSource (pad, file, bank, program, note, error);
}

void NativeProcessor::clearDrumPadSource (int pad)
{
    if (drumKit != nullptr)
        drumKit->clearPadSource (pad);
}

juce::String NativeProcessor::describeDrumKit() const
{
    return drumKit != nullptr ? drumKit->describe() : juce::String();
}

bool NativeProcessor::reloadDexedBank()
{
    if (kind != NativeKind::dexed || delegatedProcessor == nullptr)
        return false;
    return native::reloadDexedBank (delegatedProcessor.get());
}

void NativeProcessor::setMasterClock (const MasterClock* clockToUse)
{
    masterClock = clockToUse;
    if (drumSequencer != nullptr)
        drumSequencer->setMasterClock (clockToUse);
}

void NativeProcessor::setDrumSequencerEnabled (bool shouldBeEnabled)
{
    if (drumSequencer != nullptr)
        drumSequencer->setEnabled (shouldBeEnabled);
}

bool NativeProcessor::isDrumSequencerEnabled() const
{
    return drumSequencer != nullptr && drumSequencer->isEnabled();
}

int NativeProcessor::getDrumCurrentStep() const
{
    return drumSequencer != nullptr ? drumSequencer->getCurrentStep() : -1;
}

void NativeProcessor::setDrumSolo (int pad)
{
    if (drumKit == nullptr)
        return;
    for (int index = 0; index < drums::DrumKitEngine::kPadCount; ++index)
        drumKit->setPadSolo (index, index == pad);
}

void NativeProcessor::setDrumGainDb (float db)
{
    drumGainDb = juce::jlimit (-60.0f, 12.0f, db);
    if (drumKit != nullptr)
        drumKit->setOutputGainDb (drumGainDb);
}

bool NativeProcessor::setDrumPattern (const juce::var& options, juce::String& error)
{
    if (kind != NativeKind::drums || drumSequencer == nullptr)
    {
        error = "Este layer nao e um Preseter Drums.";
        return false;
    }

    if (! options.isObject())
    {
        error = "Padrao invalido.";
        return false;
    }

    const juce::var patternVar = options.hasProperty ("pattern") ? options["pattern"] : options;
    if (! patternVar.isObject())
    {
        error = "Padrao invalido.";
        return false;
    }

    const int stepsPerBar = (int) patternVar.getProperty ("stepsPerBar", 16);
    const int bars = (int) patternVar.getProperty ("bars", 1);
    if (! drums::isSupportedStepsPerBar (stepsPerBar))
    {
        error = "stepsPerBar deve ser 8, 12, 16 ou 32.";
        return false;
    }
    if (! drums::isSupportedBars (bars))
    {
        error = "bars deve ser 1, 2 ou 4.";
        return false;
    }

    drums::DrumPattern pattern;
    pattern.stepsPerBar = stepsPerBar;
    pattern.bars = bars;
    pattern.swing = (float) (double) patternVar.getProperty ("swing", 0.0);

    if (auto* tracks = patternVar["tracks"].getArray())
    {
        int trackCount = 0;
        for (const auto& item : *tracks)
        {
            if (trackCount >= drums::kMaxTracks)
                break;
            if (! item.isObject())
                continue;

            auto& track = pattern.tracks[(size_t) trackCount];
            track.pad = juce::jlimit (0, 15, (int) item.getProperty ("pad", trackCount));
            track.mute = (bool) item.getProperty ("mute", false);
            track.levelDb = (float) (double) item.getProperty ("level", 0.0);

            if (auto* steps = item["steps"].getArray())
            {
                const int total = pattern.totalSteps();
                int stepIndex = 0;
                for (const auto& stepVar : *steps)
                {
                    if (stepIndex >= total)
                        break;

                    auto& step = track.steps[(size_t) stepIndex];
                    if (stepVar.isObject())
                    {
                        step.on = (bool) stepVar.getProperty ("on", false);
                        step.velocity = juce::jlimit (1, 127,
                            (int) stepVar.getProperty ("velocity", 100));
                    }
                    else if (stepVar.isBool())
                    {
                        step.on = (bool) stepVar;
                        step.velocity = 100;
                    }
                    else if (stepVar.isInt() || stepVar.isDouble())
                    {
                        const int value = (int) stepVar;
                        step.on = value > 0;
                        step.velocity = value > 0 ? juce::jlimit (1, 127, value) : 100;
                    }
                    ++stepIndex;
                }
            }

            ++trackCount;
        }
        pattern.trackCount = trackCount;
    }

    drumPattern = drums::sanitizedPattern (pattern);
    applyDrumPatternPadSettings (drumPattern);
    drumSequencer->publishPattern (drumPattern);
    return true;
}

void NativeProcessor::applyDrumPatternPadSettings (const drums::DrumPattern& pattern)
{
    if (drumKit == nullptr)
        return;

    for (int t = 0; t < pattern.trackCount; ++t)
    {
        const auto& track = pattern.tracks[(size_t) t];
        drumKit->setPadLevelDb (track.pad, track.levelDb);
        drumKit->setPadMuted (track.pad, track.mute);
    }
}

juce::var NativeProcessor::describeDrums() const
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("enabled", isDrumSequencerEnabled());
    object->setProperty ("currentStep",
                         drumSequencer != nullptr ? drumSequencer->getCurrentStep() : -1);
    object->setProperty ("stepsPerBar", drumPattern.stepsPerBar);
    object->setProperty ("bars", drumPattern.bars);
    object->setProperty ("swing", drumPattern.swing);
    object->setProperty ("trackCount", drumPattern.trackCount);
    object->setProperty ("totalSteps", drumPattern.totalSteps());
    object->setProperty ("gainDb", drumGainDb);
    object->setProperty ("kit", describeDrumKit());
    object->setProperty ("kitPath", drumKitPath);
    object->setProperty ("kitBank", drumKitBank);
    object->setProperty ("kitProgram", drumKitProgram);

    juce::Array<juce::var> tracks;
    for (int t = 0; t < drumPattern.trackCount; ++t)
    {
        const auto& track = drumPattern.tracks[(size_t) t];
        auto* trackObject = new juce::DynamicObject();
        trackObject->setProperty ("pad", track.pad);
        trackObject->setProperty ("mute", track.mute);
        trackObject->setProperty ("level", track.levelDb);

        juce::Array<juce::var> steps;
        for (int s = 0; s < drumPattern.totalSteps(); ++s)
        {
            auto* stepObject = new juce::DynamicObject();
            stepObject->setProperty ("on", track.steps[(size_t) s].on);
            stepObject->setProperty ("velocity", track.steps[(size_t) s].velocity);
            steps.add (juce::var (stepObject));
        }
        trackObject->setProperty ("steps", steps);
        tracks.add (juce::var (trackObject));
    }
    object->setProperty ("tracks", tracks);

    juce::Array<juce::var> pads;
    for (int p = 0; p < drums::DrumKitEngine::kPadCount; ++p)
    {
        auto* padObject = new juce::DynamicObject();
        padObject->setProperty ("index", p);
        padObject->setProperty ("note", drums::DrumKitEngine::kFirstPadNote + p);
        padObject->setProperty ("name", drums::DrumKitEngine::padName (p));
        padObject->setProperty ("levelDb", drumKit != nullptr ? drumKit->getPadLevelDb (p) : 0.0f);
        padObject->setProperty ("muted", drumKit != nullptr && drumKit->getPadMuted (p));
        padObject->setProperty ("solo", drumKit != nullptr && drumKit->getPadSolo (p));

        if (drumKit != nullptr && drumKit->hasPadSource (p))
        {
            const auto source = drumKit->getPadSourceInfo (p);
            auto* sourceObject = new juce::DynamicObject();
            sourceObject->setProperty ("path", source.path);
            sourceObject->setProperty ("bank", source.bank);
            sourceObject->setProperty ("program", source.program);
            sourceObject->setProperty ("note", source.note);
            padObject->setProperty ("source", juce::var (sourceObject));
        }
        else
        {
            padObject->setProperty ("source", juce::var());
        }
        pads.add (juce::var (padObject));
    }
    object->setProperty ("pads", pads);

    return juce::var (object);
}

bool NativeProcessor::loadSynth2Patch (const juce::String& text, const juce::String& name)
{
    if (kind != NativeKind::synth2)
        return false;

    Synth2PatchValues values {};
    if (! Synth2Dsp::parseSy1 (text.toStdString(), values))
        return false;

    for (int i = 0; i < oxo::s2::kParamCount; ++i)
        setParameterValue (oxo::s2::kParams[(size_t) i].key, (float) values[(size_t) i]);

    apvts.state.setProperty ("synth2PatchName", name.isNotEmpty() ? name : "INIT", nullptr);
    currentProgram = -1; // patch avulso: não é um dos programas de fábrica
    synth2ForceParams.store (true, std::memory_order_relaxed);
    synth2PatchReload.store (true, std::memory_order_relaxed);
    return true;
}

void NativeProcessor::loadSynth2FactoryPrograms (const juce::String& directory)
{
    if (kind != NativeKind::synth2)
        return;

    synth2Programs.clear();

    juce::File root (directory);
    if (! root.isDirectory())
        return;

    juce::Array<juce::File> found;
    root.findChildFiles (found, juce::File::findFiles, false, "*.sy1");

    std::vector<juce::File> files;
    files.reserve ((size_t) found.size());
    for (const auto& file : found)
        files.push_back (file);

    std::sort (files.begin(), files.end(), [] (const juce::File& a, const juce::File& b)
    {
        return a.getFileName() < b.getFileName();
    });

    for (const auto& file : files)
    {
        Synth2PatchValues values {};
        std::string name;
        if (! Synth2Dsp::parseSy1 (file.loadFileAsString().toStdString(), values, &name))
            continue;

        Synth2Program program;
        program.name = juce::String::fromUTF8 (name.c_str(), (int) name.size());
        if (program.name.isEmpty())
            program.name = file.getFileNameWithoutExtension();
        program.values = values;
        synth2Programs.push_back (std::move (program));
    }

    currentProgram = juce::jlimit (0, getNumPrograms() - 1, currentProgram);
}

juce::String NativeProcessor::getSynth2PatchName() const
{
    if (kind != NativeKind::synth2)
        return {};
    const auto name = apvts.state.getProperty ("synth2PatchName").toString();
    return name.isNotEmpty() ? name : "INIT";
}

juce::String NativeProcessor::exportSynth2Patch (const juce::String& name) const
{
    if (kind != NativeKind::synth2)
        return {};

    Synth2PatchValues values {};
    for (int i = 0; i < oxo::s2::kParamCount; ++i)
        values[(size_t) i] = juce::roundToInt (parameter (oxo::s2::kParams[(size_t) i].key));

    const auto data = Synth2Dsp::writeSy1 (name.toStdString(), values);
    return juce::String::fromUTF8 (data.data(), (int) data.size());
}

juce::AudioProcessorEditor* NativeProcessor::createEditor()
{
    if (delegatedProcessor != nullptr && delegatedProcessor->hasEditor())
        return delegatedProcessor->createEditorIfNeeded();
    return new juce::GenericAudioProcessorEditor (this);
}

} // namespace native
} // namespace preseter
