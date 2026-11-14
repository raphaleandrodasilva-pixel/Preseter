#include "SamplerProcessor.h"

#include <cmath>

namespace preseter
{
namespace
{
constexpr float kMinDb = -24.0f;
constexpr float kMaxDb = 12.0f;
} // namespace

// ---------------------------------------------------------------------------
// Parâmetro exposto ao host/app (aparece em "params" como os plugins)
// ---------------------------------------------------------------------------
class SamplerProcessor::SamplerParameter final : public juce::AudioProcessorParameter
{
public:
    SamplerParameter (const juce::String& nameToUse, float minimum, float maximum, float defaultVal,
                      const juce::String& labelToUse, std::atomic<float>& target, bool polyphonicParam = false)
        : parameterName (nameToUse), minValue (minimum), maxValue (maximum),
          defaultValue (defaultVal), label (labelToUse), value (target), polyphonic (polyphonicParam)
    {
    }

    float getValue() const override
    {
        if (polyphonic)
        {
            const auto voices = juce::roundToInt (value.load());
            for (int i = 0; i < kVoiceChoices; ++i)
                if (voiceChoice (i) >= voices)
                    return (float) i / (float) (kVoiceChoices - 1);
            return 1.0f;
        }
        return juce::jlimit (0.0f, 1.0f, (value.load() - minValue) / (maxValue - minValue));
    }

    void setValue (float newValue) override
    {
        if (polyphonic)
        {
            const int index = juce::jlimit (0, kVoiceChoices - 1,
                                            juce::roundToInt (juce::jlimit (0.0f, 1.0f, newValue) * (kVoiceChoices - 1)));
            value.store ((float) voiceChoice (index));
            return;
        }
        value.store (minValue + juce::jlimit (0.0f, 1.0f, newValue) * (maxValue - minValue));
    }

    float getDefaultValue() const override
    {
        if (polyphonic)
            return 0.6f; // 64 vozes
        return juce::jlimit (0.0f, 1.0f, (defaultValue - minValue) / (maxValue - minValue));
    }

    juce::String getName (int maximumStringLength) const override
    {
        return parameterName.substring (0, maximumStringLength);
    }

    juce::String getLabel() const override { return label; }

    juce::String getText (float normalisedValue, int) const override
    {
        if (polyphonic)
        {
            const int index = juce::jlimit (0, kVoiceChoices - 1,
                                            juce::roundToInt (juce::jlimit (0.0f, 1.0f, normalisedValue) * (kVoiceChoices - 1)));
            return juce::String (voiceChoice (index));
        }

        const float physical = minValue + juce::jlimit (0.0f, 1.0f, normalisedValue) * (maxValue - minValue);
        if (parameterName == "Vozes")
            return juce::String (juce::roundToInt (physical));
        if (parameterName == "Ganho")
            return juce::String (physical, 1) + " dB";
        if (parameterName == "Transpose")
            return juce::String (juce::roundToInt (physical)) + " st";
        if (parameterName == "Fine tune")
            return juce::String (juce::roundToInt (physical)) + " ct";
        if (parameterName == "Filtro")
            return juce::String (juce::roundToInt (physical)) + " Hz";
        if (parameterName == "Ressonância" || parameterName == "Sustain" || parameterName == "Velocity")
            return juce::String (juce::roundToInt (physical * 100.0f)) + "%";
        return juce::String (physical, 2);
    }

    float getValueForText (const juce::String& text) const override
    {
        const float physical = text.getFloatValue();
        return juce::jlimit (0.0f, 1.0f, (physical - minValue) / (maxValue - minValue));
    }

    int getNumSteps() const override
    {
        return polyphonic ? (kVoiceChoices - 1) : AudioProcessorParameter::getNumSteps();
    }

    bool isDiscrete() const override { return polyphonic; }

private:
    static constexpr int kVoiceChoices = 6;
    static int voiceChoice (int index)
    {
        static const int choices[kVoiceChoices] = { 8, 16, 32, 64, 128, 256 };
        return choices[juce::jlimit (0, kVoiceChoices - 1, index)];
    }

    juce::String parameterName;
    float minValue = 0.0f;
    float maxValue = 1.0f;
    float defaultValue = 0.0f;
    juce::String label;
    std::atomic<float>& value;
    bool polyphonic = false;
};

// ---------------------------------------------------------------------------
// Envelope e filtro
// ---------------------------------------------------------------------------
void SamplerProcessor::Envelope::start (float attackTime, float decayTime, float sustainValue,
                                        float releaseTime, double sampleRate)
{
    const float sr = (float) juce::jmax (1.0, sampleRate);
    attackDelta = attackTime <= 0.0005f ? 1.0f : 1.0f / (attackTime * sr);
    decayCoef = decayTime <= 0.001f ? 1.0f : 1.0f - std::exp (-1.0f / (decayTime * sr * 0.25f));
    sustainLevel = juce::jlimit (0.0f, 1.0f, sustainValue);
    const float releaseSamples = juce::jmax (16.0f, releaseTime * sr);
    releaseCoef = std::exp (-6.0f / releaseSamples);
    level = 0.0f;
    stage = Stage::attack;
}

void SamplerProcessor::Envelope::noteOff (float releaseTime, double sampleRate)
{
    if (stage == Stage::idle || stage == Stage::release)
        return;
    const float sr = (float) juce::jmax (1.0, sampleRate);
    const float releaseSamples = juce::jmax (16.0f, releaseTime * sr);
    releaseCoef = std::exp (-6.0f / releaseSamples);
    stage = Stage::release;
}

float SamplerProcessor::Envelope::next() noexcept
{
    switch (stage)
    {
        case Stage::attack:
            level += attackDelta;
            if (level >= 1.0f)
            {
                level = 1.0f;
                stage = Stage::decay;
            }
            break;

        case Stage::decay:
            level += (sustainLevel - level) * decayCoef;
            if (std::abs (level - sustainLevel) < 0.0005f)
            {
                level = sustainLevel;
                stage = Stage::sustain;
            }
            break;

        case Stage::sustain:
            level = sustainLevel;
            break;

        case Stage::release:
            level *= releaseCoef;
            if (level < 0.0005f)
            {
                level = 0.0f;
                stage = Stage::idle;
            }
            break;

        case Stage::idle:
        default:
            level = 0.0f;
            break;
    }
    return level;
}

void SamplerProcessor::Svf::set (float cutoffHz, float q, double sampleRate)
{
    const float sr = (float) juce::jmax (1.0, sampleRate);
    const float frequency = juce::jlimit (20.0f, sr * 0.45f, cutoffHz);
    const float g = std::tan (juce::MathConstants<float>::pi * frequency / sr);
    const float k = 1.0f / juce::jmax (0.2f, q);
    a1 = 1.0f / (1.0f + g * (g + k));
    a2 = g * a1;
    a3 = g * a2;
}

float SamplerProcessor::Svf::process (float input) noexcept
{
    const float v3 = input - ic2;
    const float v1 = a1 * ic1 + a2 * v3;
    const float v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2.0f * v1 - ic1;
    ic2 = 2.0f * v2 - ic2;
    return v2;
}

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------
SamplerProcessor::SamplerProcessor()
    : juce::AudioProcessor (BusesProperties().withOutput ("Saída", juce::AudioChannelSet::stereo(), true))
{
    for (auto& value : values)
        value.store (0.0f);

    const auto add = [this] (int index, const juce::String& name, float minValue, float maxValue,
                             float defaultValue, const juce::String& label, bool discrete = false)
    {
        addParameter (new SamplerParameter (name, minValue, maxValue, defaultValue, label,
                                            values[index], discrete));
    };

    add (ParamIndex::attack, "Ataque", 0.0f, 2.0f, 0.0f, "s");
    add (ParamIndex::decay, "Decay", 0.0f, 5.0f, 0.0f, "s");
    add (ParamIndex::sustain, "Sustain", 0.0f, 1.0f, 1.0f, "");
    add (ParamIndex::release, "Release", 0.0f, 5.0f, 0.0f, "s");
    add (ParamIndex::cutoff, "Filtro", 100.0f, 20000.0f, 20000.0f, "Hz");
    add (ParamIndex::resonance, "Ressonância", 0.0f, 1.0f, 0.0f, "");
    add (ParamIndex::velocity, "Velocity", 0.0f, 1.0f, 1.0f, "");
    add (ParamIndex::transpose, "Transpose", -24.0f, 24.0f, 0.0f, "st");
    add (ParamIndex::fineTune, "Fine tune", -100.0f, 100.0f, 0.0f, "ct");
    add (ParamIndex::polyphony, "Vozes", 8.0f, 256.0f, 64.0f, "", true);
    add (ParamIndex::outputGain, "Ganho", kMinDb, kMaxDb, 0.0f, "dB");

    voices.resize (256);
    for (auto* parameter : getParameters())
        parameter->setValue (parameter->getDefaultValue());
    syncParameters();
}

void SamplerProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    currentSampleRate = sampleRate > 0 ? sampleRate : 44100.0;
    blockSize = juce::jmax (1, samplesPerBlock);
    resetVoices();
}

bool SamplerProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    return layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo()
        || layouts.getMainOutputChannelSet() == juce::AudioChannelSet::mono();
}

int SamplerProcessor::getNumPrograms()
{
    return juce::jmax (1, instrument.getProgramCount());
}

int SamplerProcessor::getCurrentProgram()
{
    return currentProgram;
}

void SamplerProcessor::setCurrentProgram (int index)
{
    const int count = instrument.getProgramCount();
    if (count <= 0)
        return;
    currentProgram = juce::jlimit (0, count - 1, index);
    instrument.selectProgramByIndex (currentProgram);
    resetVoices();
}

const juce::String SamplerProcessor::getProgramName (int index)
{
    if (index >= 0 && index < instrument.getPrograms().size())
        return instrument.getPrograms()[index];
    return {};
}

void SamplerProcessor::changeProgramName (int, const juce::String&) {}

bool SamplerProcessor::loadFile (const juce::File& file, int bank, int program, juce::String& error)
{
    resetVoices();
    if (! instrument.load (file, error))
        return false;

    currentBank = bank;
    currentProgram = program;
    instrument.selectProgram (bank, program);
    currentProgram = instrument.getSelectedProgram();
    return true;
}

void SamplerProcessor::setPolyphonyLimit (int count) noexcept
{
    maxVoices.store (juce::jlimit (1, (int) voices.size(), count));
}

juce::String SamplerProcessor::describe() const
{
    return instrument.getFormat() + " · " + instrument.getName()
         + " · " + juce::String (instrument.getRegionCount()) + " regiões"
         + " · " + juce::String (instrument.getSampleCount()) + " samples";
}

juce::var SamplerProcessor::describeRegions() const
{
    juce::Array<juce::var> list;
    const int count = juce::jmin (512, (int) instrument.getRegions().size());
    for (int i = 0; i < count; ++i)
    {
        const auto& region = instrument.getRegions()[(size_t) i];
        list.add (juce::var (new juce::DynamicObject()));
        auto* item = list.getReference (list.size() - 1).getDynamicObject();
        item->setProperty ("keyLow", region.keyLow);
        item->setProperty ("keyHigh", region.keyHigh);
        item->setProperty ("velLow", region.velLow);
        item->setProperty ("velHigh", region.velHigh);
        item->setProperty ("rootKey", region.rootKey);
        item->setProperty ("loop", region.loop);
        item->setProperty ("loopStart", (double) region.loopStart);
        item->setProperty ("loopEnd", (double) region.loopEnd);
        item->setProperty ("start", (double) region.start);
        item->setProperty ("end", (double) region.end);
        item->setProperty ("sampleRate", region.sampleRate);
        item->setProperty ("gain", region.gain);
        item->setProperty ("pan", region.pan);
        item->setProperty ("attack", region.attack);
        item->setProperty ("decay", region.decay);
        item->setProperty ("sustain", region.sustain);
        item->setProperty ("release", region.release);
        item->setProperty ("label", region.label);
    }

    auto result = juce::var (new juce::DynamicObject());
    auto* object = result.getDynamicObject();
    object->setProperty ("format", instrument.getFormat());
    object->setProperty ("name", instrument.getName());
    object->setProperty ("program", currentProgram);
    const auto& programs = instrument.getPrograms();
    object->setProperty ("programName",
                         currentProgram >= 0 && currentProgram < programs.size()
                             ? programs[currentProgram] : juce::String());
    object->setProperty ("regions", juce::var (list));
    object->setProperty ("missing", juce::var (instrument.getMissingSamples().joinIntoString ("\n")));

    juce::Array<juce::var> presets;
    for (const auto& program : instrument.getPrograms())
        presets.add (program);
    object->setProperty ("programs", juce::var (presets));
    object->setProperty ("presetList", instrument.getPresetList());
    return result;
}

void SamplerProcessor::syncParameters()
{
    maxVoices.store (juce::jlimit (1, 256, juce::roundToInt (values[ParamIndex::polyphony].load())));
}

int SamplerProcessor::findFreeVoice()
{
    const int limit = juce::jlimit (1, (int) voices.size(), maxVoices.load());
    for (int i = 0; i < limit; ++i)
        if (! voices[(size_t) i].active)
            return i;

    int oldest = 0;
    juce::uint32 oldestOrder = 0xffffffffu;
    bool foundReleased = false;
    for (int i = 0; i < limit; ++i)
    {
        const auto& voice = voices[(size_t) i];
        const bool released = voice.envelope.stage == Envelope::Stage::release;
        if (released && (! foundReleased || voice.order < oldestOrder))
        {
            oldestOrder = voice.order;
            oldest = i;
            foundReleased = true;
        }
    }
    if (! foundReleased)
        for (int i = 0; i < limit; ++i)
            if (voices[(size_t) i].order < oldestOrder)
            {
                oldestOrder = voices[(size_t) i].order;
                oldest = i;
            }

    voices[(size_t) oldest].active = false;
    return oldest;
}

void SamplerProcessor::resetVoices()
{
    for (auto& voice : voices)
    {
        voice.active = false;
        voice.envelope.stage = Envelope::Stage::idle;
        voice.filter.reset();
    }
    activeVoices.store (0);
    sustainPedal = false;
}

const sampler::Sample* SamplerProcessor::voiceRegionSample (const Voice& voice) const
{
    if (voice.regionIndex < 0)
        return nullptr;
    const auto& regions = instrument.getRegions();
    if (voice.regionIndex >= (int) regions.size())
        return nullptr;
    return instrument.getSample (regions[(size_t) voice.regionIndex].sample);
}

void SamplerProcessor::startNote (int note, int channel, float velocity)
{
    if (! instrument.isLoaded())
        return;

    const auto& regions = instrument.getRegions();
    const int velocityValue = juce::jlimit (1, 127, juce::roundToInt (velocity * 127.0f));
    const float transposeValue = values[ParamIndex::transpose].load();
    const float fine = values[ParamIndex::fineTune].load();
    const float attackAdd = values[ParamIndex::attack].load();
    const float decayAdd = values[ParamIndex::decay].load();
    const float sustainScale = values[ParamIndex::sustain].load();
    const float releaseAdd = values[ParamIndex::release].load();
    const float cutoffCap = values[ParamIndex::cutoff].load();
    const float resonanceAdd = values[ParamIndex::resonance].load();
    const float velTrackScale = values[ParamIndex::velocity].load();
    const float outputGain = juce::Decibels::decibelsToGain (values[ParamIndex::outputGain].load());

    for (int r = 0; r < (int) regions.size(); ++r)
    {
        const auto& region = regions[(size_t) r];
        if (region.releaseTrigger)
            continue;
        if (note < region.keyLow || note > region.keyHigh)
            continue;
        if (velocityValue < region.velLow || velocityValue > region.velHigh)
            continue;
        if (region.sample < 0)
            continue;

        const int index = findFreeVoice();
        auto& voice = voices[(size_t) index];

        voice.active = true;
        voice.note = note;
        voice.channel = channel;
        voice.regionIndex = r;
        voice.position = (double) region.start;
        voice.sustained = false;
        voice.order = ++voiceOrder;

        const double semitones = (double) (note - region.rootKey)
                               + (double) transposeValue
                               + (region.tuneCents + (double) fine) / 100.0;
        voice.ratio = std::pow (2.0, semitones / 12.0)
                    * (region.sampleRate > 0.0 ? region.sampleRate / currentSampleRate : 1.0);

        const float velocityCurve = std::pow (juce::jlimit (0.0f, 1.0f, velocity), 1.6f);
        const float velTrack = juce::jlimit (0.0f, 1.0f, region.velTrack * velTrackScale);
        const float velGain = (1.0f - velTrack) + velTrack * velocityCurve;

        voice.gain = region.gain * velGain * outputGain;
        const float pan = juce::jlimit (-1.0f, 1.0f, region.pan);
        const float angle = (pan + 1.0f) * 0.25f * juce::MathConstants<float>::pi;
        voice.gainLeft = std::cos (angle);
        voice.gainRight = std::sin (angle);

        voice.cutoff = juce::jlimit (100.0f, 20000.0f, juce::jmin (region.cutoff, cutoffCap));
        voice.resonance = juce::jlimit (0.0f, 1.0f, region.resonance + resonanceAdd);
        voice.filter.reset();
        voice.filter.set (voice.cutoff, 0.707f + voice.resonance * 9.0f, currentSampleRate);

        voice.envelope.start (region.attack + attackAdd,
                              region.decay + decayAdd,
                              juce::jlimit (0.0f, 1.0f, region.sustain * sustainScale),
                              region.release + releaseAdd,
                              currentSampleRate);
    }
}

void SamplerProcessor::releaseNote (int note, int channel)
{
    for (auto& voice : voices)
    {
        if (! voice.active || voice.note != note)
            continue;
        if (channel > 0 && voice.channel != channel)
            continue;

        const auto& regions = instrument.getRegions();
        if (voice.regionIndex < 0 || voice.regionIndex >= (int) regions.size())
            continue;
        const auto& region = regions[(size_t) voice.regionIndex];

        if (sustainPedal)
        {
            voice.sustained = true;
            continue;
        }
        voice.envelope.noteOff (region.release + values[ParamIndex::release].load(), currentSampleRate);
    }
}

void SamplerProcessor::releaseAll (bool sustainedOnly)
{
    const auto& regions = instrument.getRegions();
    for (auto& voice : voices)
    {
        if (! voice.active)
            continue;
        if (sustainedOnly && ! voice.sustained)
            continue;
        if (voice.regionIndex >= 0 && voice.regionIndex < (int) regions.size())
        {
            const auto& region = regions[(size_t) voice.regionIndex];
            voice.envelope.noteOff (region.release + values[ParamIndex::release].load(), currentSampleRate);
        }
        voice.sustained = false;
    }
}

void SamplerProcessor::handleMidi (const juce::MidiMessage& message)
{
    if (message.isNoteOn())
        startNote (message.getNoteNumber(), message.getChannel(), (float) message.getVelocity() / 127.0f);
    else if (message.isNoteOff())
        releaseNote (message.getNoteNumber(), message.getChannel());
    else if (message.isAllNotesOff() || message.isAllSoundOff())
        releaseAll (false);
    else if (message.isSustainPedalOn())
        sustainPedal = true;
    else if (message.isSustainPedalOff())
    {
        sustainPedal = false;
        releaseAll (true);
    }
}

void SamplerProcessor::processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    audio.clear();

    syncParameters();

    for (const auto metadata : midi)
        handleMidi (metadata.getMessage());
    midi.clear();

    const int numSamples = audio.getNumSamples();
    const auto& regions = instrument.getRegions();
    if (numSamples <= 0 || regions.empty())
    {
        activeVoices.store (0);
        return;
    }

    const int numChannels = audio.getNumChannels();
    auto* left = audio.getWritePointer (0);
    auto* right = numChannels > 1 ? audio.getWritePointer (1) : left;

    int active = 0;
    for (auto& voice : voices)
    {
        if (! voice.active)
            continue;

        if (voice.regionIndex < 0 || voice.regionIndex >= (int) regions.size())
        {
            voice.active = false;
            continue;
        }

        const auto& region = regions[(size_t) voice.regionIndex];
        const auto* sample = instrument.getSample (region.sample);
        if (sample == nullptr || sample->pcm == nullptr)
        {
            voice.active = false;
            continue;
        }

        const juce::int64 end = juce::jmin (region.end, sample->frames);
        if (end <= region.start)
        {
            voice.active = false;
            continue;
        }

        const bool looping = loopsEnabled.load() && region.loop && region.loopEnd > region.loopStart + 8
                             && region.loopEnd <= end;
        const double loopStart = (double) region.loopStart;
        const double loopEnd = (double) region.loopEnd;

        for (int i = 0; i < numSamples; ++i)
        {
            const float env = voice.envelope.next();
            if (! voice.envelope.isActive())
            {
                voice.active = false;
                break;
            }

            double position = voice.position;
            if (looping && position >= loopEnd)
                position = loopStart + std::fmod (position - loopStart, loopEnd - loopStart);

            const auto frame = (juce::int64) position;
            if (frame >= end - 1)
            {
                voice.active = false;
                break;
            }

            const float fraction = (float) (position - (double) frame);
            float value;
            if (sample->channels == 1)
            {
                const float a = sample->pcm[frame];
                const float b = sample->pcm[frame + 1];
                value = (a + (b - a) * fraction) / 32768.0f;
            }
            else
            {
                const auto index = frame * 2;
                const float a = (sample->pcm[index] + sample->pcm[index + 1]) * 0.5f;
                const float b = (sample->pcm[index + 2] + sample->pcm[index + 3]) * 0.5f;
                value = (a + (b - a) * fraction) / 32768.0f;
            }

            value = voice.filter.process (value) * env * voice.gain;
            if (right != left)
            {
                left[i] += value * voice.gainLeft;
                right[i] += value * voice.gainRight;
            }
            else
            {
                left[i] += value * 0.707f;
            }

            voice.position += voice.ratio;
            if (! looping && voice.position >= (double) end)
            {
                voice.active = false;
                break;
            }
        }

        if (voice.active)
            ++active;
    }

    activeVoices.store (active);
}

void SamplerProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    auto state = juce::var (new juce::DynamicObject());
    auto* object = state.getDynamicObject();
    object->setProperty ("file", instrument.getSourcePath());
    object->setProperty ("bank", currentBank);
    object->setProperty ("program", currentProgram);
    object->setProperty ("attack", (double) values[ParamIndex::attack].load());
    object->setProperty ("decay", (double) values[ParamIndex::decay].load());
    object->setProperty ("sustain", (double) values[ParamIndex::sustain].load());
    object->setProperty ("release", (double) values[ParamIndex::release].load());
    object->setProperty ("cutoff", (double) values[ParamIndex::cutoff].load());
    object->setProperty ("resonance", (double) values[ParamIndex::resonance].load());
    object->setProperty ("velocity", (double) values[ParamIndex::velocity].load());
    object->setProperty ("transpose", (double) values[ParamIndex::transpose].load());
    object->setProperty ("fineTune", (double) values[ParamIndex::fineTune].load());
    object->setProperty ("polyphony", (double) values[ParamIndex::polyphony].load());
    object->setProperty ("gain", (double) values[ParamIndex::outputGain].load());
    object->setProperty ("format", instrument.getFormat());
    object->setProperty ("loop", loopsEnabled.load());

    const auto text = juce::JSON::toString (state);
    destData.replaceAll (text.toRawUTF8(), (size_t) text.getNumBytesAsUTF8());
}

void SamplerProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    if (data == nullptr || sizeInBytes <= 0)
        return;

    const auto text = juce::String::fromUTF8 (static_cast<const char*> (data), sizeInBytes);
    const auto state = juce::JSON::parse (text);
    if (auto* object = state.getDynamicObject())
    {
        const auto read = [&] (const juce::Identifier& key, float fallback)
        {
            if (! object->hasProperty (key))
                return fallback;
            return (float) (double) object->getProperty (key);
        };

        values[ParamIndex::attack].store (read ("attack", 0.0f));
        values[ParamIndex::decay].store (read ("decay", 0.0f));
        values[ParamIndex::sustain].store (read ("sustain", 1.0f));
        values[ParamIndex::release].store (read ("release", 0.0f));
        values[ParamIndex::cutoff].store (read ("cutoff", 20000.0f));
        values[ParamIndex::resonance].store (read ("resonance", 0.0f));
        values[ParamIndex::velocity].store (read ("velocity", 1.0f));
        values[ParamIndex::transpose].store (read ("transpose", 0.0f));
        values[ParamIndex::fineTune].store (read ("fineTune", 0.0f));
        values[ParamIndex::polyphony].store (read ("polyphony", 64.0f));
        values[ParamIndex::outputGain].store (read ("gain", 0.0f));
        if (object->hasProperty ("loop"))
            loopsEnabled.store ((bool) object->getProperty ("loop"));
        syncParameters();
    }
}
} // namespace preseter
