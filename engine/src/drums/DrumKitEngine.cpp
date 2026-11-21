#include "DrumKitEngine.h"

#include <cmath>

namespace preseter
{
namespace drums
{
namespace
{
const char* kPadNames[DrumKitEngine::kPadCount] = {
    "Bumbo", "Aro", "Caixa", "Palmas",
    "Caixa elétrica", "Tom baixo", "Chimbal fechado", "Tom de chão",
    "Chimbal com pedal", "Tom médio-baixo", "Chimbal aberto", "Tom médio",
    "Tom médio-alto", "Prato de ataque", "Tom alto", "Condução (ride)",
};

/** Chimbal: fechado (42), com pedal (44) e aberto (46) se calam entre si. */
bool isHatNote (int note) noexcept
{
    return note == 42 || note == 44 || note == 46;
}
} // namespace

DrumKitEngine::DrumKitEngine()
{
    for (int pad = 0; pad < kPadCount; ++pad)
    {
        padGain[(size_t) pad].store (1.0f, std::memory_order_relaxed);
        padMuted[(size_t) pad].store (false, std::memory_order_relaxed);
        padSolo[(size_t) pad].store (false, std::memory_order_relaxed);
    }
}

// ---------------------------------------------------------------------------
// Envelope e filtro (mesmo comportamento do sampler)
// ---------------------------------------------------------------------------
void DrumKitEngine::Envelope::start (float attackTime, float decayTime, float sustainValue,
                                     float releaseTime, double rate)
{
    const float sr = (float) juce::jmax (1.0, rate);
    attackDelta = attackTime <= 0.0005f ? 1.0f : 1.0f / (attackTime * sr);
    decayCoef = decayTime <= 0.001f ? 1.0f : 1.0f - std::exp (-1.0f / (decayTime * sr * 0.25f));
    sustainLevel = juce::jlimit (0.0f, 1.0f, sustainValue);
    const float releaseSamples = juce::jmax (16.0f, releaseTime * sr);
    releaseCoef = std::exp (-6.0f / releaseSamples);
    level = 0.0f;
    stage = Stage::attack;
}

float DrumKitEngine::Envelope::next() noexcept
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

void DrumKitEngine::Svf::set (float cutoffHz, float q, double rate)
{
    const float sr = (float) juce::jmax (1.0, rate);
    const float frequency = juce::jlimit (20.0f, sr * 0.45f, cutoffHz);
    const float g = std::tan (juce::MathConstants<float>::pi * frequency / sr);
    const float k = 1.0f / juce::jmax (0.2f, q);
    a1 = 1.0f / (1.0f + g * (g + k));
    a2 = g * a1;
    a3 = g * a2;
}

float DrumKitEngine::Svf::process (float input) noexcept
{
    const float v3 = input - ic2;
    const float v1 = a1 * ic1 + a2 * v3;
    const float v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2.0f * v1 - ic1;
    ic2 = 2.0f * v2 - ic2;
    return v2;
}

// ---------------------------------------------------------------------------
// Kit
// ---------------------------------------------------------------------------
bool DrumKitEngine::load (const juce::File& file, int bankToUse, int programToUse,
                          juce::String& error)
{
    juce::String cacheError;
    auto loaded = sampler::InstrumentCache::get().load (file, bankToUse, programToUse, cacheError);
    if (loaded == nullptr)
    {
        error = cacheError.isNotEmpty() ? cacheError
                                        : juce::String ("Nao foi possivel carregar o kit.");
        return false;
    }

    // Troca segura: as vozes em andamento continuam no kit antigo (mantido
    // vivo pela lista); as próximas usam o novo. O corte das vozes antigas é
    // pedido à thread de áudio (beginBlock), sem escrever nas vozes aqui.
    resetRequested.store (true, std::memory_order_release);
    instrumentKeepAlive.push_back (loaded);
    activeInstrument.store (loaded.get(), std::memory_order_release);

    sourcePath = file.getFullPathName();
    bank = bankToUse;
    program = programToUse;
    return true;
}

void DrumKitEngine::prepare (double newSampleRate, int)
{
    sampleRate = newSampleRate > 0.0 ? newSampleRate : 44100.0;
    reset();
}

void DrumKitEngine::reset() noexcept
{
    for (auto& voice : voices)
        voice = Voice {};
    activeVoices.store (0, std::memory_order_relaxed);
}

bool DrumKitEngine::isLoaded() const noexcept
{
    const auto* source = currentInstrument();
    return source != nullptr && source->isLoaded();
}

juce::String DrumKitEngine::describe() const
{
    const auto* source = currentInstrument();
    if (source == nullptr)
        return "Nenhum kit carregado";
    return source->getFormat() + " · " + source->getName()
         + " · banco " + juce::String (bank) + " / programa " + juce::String (program)
         + " · " + juce::String (source->getRegionCount()) + " regiões";
}

int DrumKitEngine::padForNote (int note) noexcept
{
    const int pad = note - kFirstPadNote;
    return pad >= 0 && pad < kPadCount ? pad : -1;
}

const char* DrumKitEngine::padName (int pad) noexcept
{
    return pad >= 0 && pad < kPadCount ? kPadNames[pad] : "";
}

// ---------------------------------------------------------------------------
// Reprodução
// ---------------------------------------------------------------------------
DrumKitEngine::Voice* DrumKitEngine::allocateVoice() noexcept
{
    for (auto& voice : voices)
        if (! voice.active)
            return &voice;

    auto* oldest = &voices[0];
    for (auto& voice : voices)
        if (voice.order < oldest->order)
            oldest = &voice;
    return oldest;
}

void DrumKitEngine::chokeHats() noexcept
{
    for (auto& voice : voices)
        if (voice.active && isHatNote (voice.note))
            voice.active = false;
}

void DrumKitEngine::chokeOffBy (int group) noexcept
{
    if (group == 0)
        return;

    for (auto& voice : voices)
    {
        if (! voice.active || voice.source == nullptr)
            continue;

        const auto& regions = voice.source->getRegions();
        if (voice.regionIndex < 0 || voice.regionIndex >= (int) regions.size())
            continue;
        if (regions[(size_t) voice.regionIndex].offBy == group)
            voice.active = false;
    }
}

void DrumKitEngine::noteOn (int note, float velocity) noexcept
{
    const auto* source = currentInstrument();
    if (source == nullptr || ! source->isLoaded())
        return;

    const int pad = padForNote (note);

    bool anySolo = false;
    for (int index = 0; index < kPadCount; ++index)
        if (padSolo[(size_t) index].load (std::memory_order_relaxed))
        {
            anySolo = true;
            break;
        }

    if (pad >= 0)
    {
        if (padMuted[(size_t) pad].load (std::memory_order_relaxed))
            return;
        if (anySolo && ! padSolo[(size_t) pad].load (std::memory_order_relaxed))
            return;
    }
    else if (anySolo)
    {
        return; // solo nos pads silencia notas fora deles
    }

    if (isHatNote (note))
        chokeHats();

    const auto& regions = source->getRegions();
    const int velocityValue = juce::jlimit (1, 127, juce::roundToInt (velocity * 127.0f));

    for (int index = 0; index < (int) regions.size(); ++index)
    {
        const auto& region = regions[(size_t) index];
        if (region.releaseTrigger)
            continue;
        if (note < region.keyLow || note > region.keyHigh)
            continue;
        if (velocityValue < region.velLow || velocityValue > region.velHigh)
            continue;
        if (region.sample < 0)
            continue;

        if (region.group != 0)
            chokeOffBy (region.group);

        startVoice (source, region, index, note, velocity);
    }
}

void DrumKitEngine::startVoice (const sampler::Instrument* source,
                                const sampler::Region& region, int regionIndex, int note,
                                float velocity) noexcept
{
    auto* voice = allocateVoice();
    if (voice == nullptr)
        return;

    *voice = Voice {};
    voice->active = true;
    voice->source = source;
    voice->regionIndex = regionIndex;
    voice->note = note;
    voice->position = (double) region.start;
    voice->order = ++voiceOrder;

    const double semitones = (double) (note - region.rootKey)
                           + region.tuneCents / 100.0;
    voice->ratio = std::pow (2.0, semitones / 12.0)
                 * (region.sampleRate > 0.0 ? region.sampleRate / sampleRate : 1.0);

    const int pad = padForNote (note);
    const float padLinear = pad >= 0 ? padGain[(size_t) pad].load (std::memory_order_relaxed) : 1.0f;
    const float velocityCurve = std::pow (juce::jlimit (0.0f, 1.0f, velocity), 1.6f);
    const float velTrack = juce::jlimit (0.0f, 1.0f, region.velTrack);
    const float velGain = (1.0f - velTrack) + velTrack * velocityCurve;

    voice->gain = region.gain * velGain * padLinear
                * outputGain.load (std::memory_order_relaxed);
    const float pan = juce::jlimit (-1.0f, 1.0f, region.pan);
    const float angle = (pan + 1.0f) * 0.25f * juce::MathConstants<float>::pi;
    voice->gainLeft = std::cos (angle);
    voice->gainRight = std::sin (angle);

    voice->cutoff = juce::jlimit (100.0f, 20000.0f, region.cutoff);
    voice->resonance = juce::jlimit (0.0f, 1.0f, region.resonance);
    // Filtro aberto (sem ressonância) não precisa processar amostra a amostra.
    voice->filterActive = voice->cutoff < 19999.0f || voice->resonance > 0.0001f;
    voice->filter.reset();
    if (voice->filterActive)
        voice->filter.set (voice->cutoff, 0.707f + voice->resonance * 9.0f, sampleRate);

    voice->envelope.start (region.attack, region.decay, region.sustain,
                           region.release, sampleRate);
}

void DrumKitEngine::beginBlock() noexcept
{
    if (! resetRequested.exchange (false, std::memory_order_acq_rel))
        return;

    for (auto& voice : voices)
        voice = Voice {};
    activeVoices.store (0, std::memory_order_relaxed);
}

void DrumKitEngine::allNotesOff() noexcept
{
    for (auto& voice : voices)
        voice.active = false;
    activeVoices.store (0, std::memory_order_relaxed);
}

void DrumKitEngine::render (juce::AudioBuffer<float>& audio, int startSample, int numSamples) noexcept
{
    if (numSamples <= 0 || audio.getNumChannels() <= 0)
    {
        activeVoices.store (0, std::memory_order_relaxed);
        return;
    }

    auto* left = audio.getWritePointer (0) + startSample;
    auto* right = audio.getNumChannels() > 1 ? audio.getWritePointer (1) + startSample : left;

    int active = 0;
    for (auto& voice : voices)
    {
        if (! voice.active)
            continue;

        if (voice.source == nullptr)
        {
            voice.active = false;
            continue;
        }

        const auto& regions = voice.source->getRegions();
        if (voice.regionIndex < 0 || voice.regionIndex >= (int) regions.size())
        {
            voice.active = false;
            continue;
        }

        const auto& region = regions[(size_t) voice.regionIndex];
        const auto* sample = voice.source->getSample (region.sample);
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

        const bool looping = region.loop
                          && region.loopEnd > region.loopStart + 8
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
            if (frame < 0 || frame >= end - 1)
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

            value = (voice.filterActive ? voice.filter.process (value) : value)
                  * env * voice.gain;
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

    activeVoices.store (active, std::memory_order_relaxed);
}

void DrumKitEngine::setPadLevelDb (int pad, float db) noexcept
{
    if (pad < 0 || pad >= kPadCount)
        return;
    padGain[(size_t) pad].store (juce::Decibels::decibelsToGain (juce::jlimit (-60.0f, 12.0f, db)),
                                 std::memory_order_relaxed);
}

void DrumKitEngine::setPadMuted (int pad, bool muted) noexcept
{
    if (pad < 0 || pad >= kPadCount)
        return;
    padMuted[(size_t) pad].store (muted, std::memory_order_relaxed);
}

float DrumKitEngine::getPadLevelDb (int pad) const noexcept
{
    if (pad < 0 || pad >= kPadCount)
        return 0.0f;
    return juce::Decibels::gainToDecibels (padGain[(size_t) pad].load (std::memory_order_relaxed),
                                           -60.0f);
}

bool DrumKitEngine::getPadMuted (int pad) const noexcept
{
    return pad >= 0 && pad < kPadCount
        && padMuted[(size_t) pad].load (std::memory_order_relaxed);
}

void DrumKitEngine::setPadSolo (int pad, bool solo) noexcept
{
    if (pad < 0 || pad >= kPadCount)
        return;
    padSolo[(size_t) pad].store (solo, std::memory_order_relaxed);
}

bool DrumKitEngine::getPadSolo (int pad) const noexcept
{
    return pad >= 0 && pad < kPadCount
        && padSolo[(size_t) pad].load (std::memory_order_relaxed);
}

void DrumKitEngine::setOutputGainDb (float db) noexcept
{
    outputGain.store (juce::Decibels::decibelsToGain (juce::jlimit (-60.0f, 12.0f, db)),
                      std::memory_order_relaxed);
}

float DrumKitEngine::getOutputGainDb() const noexcept
{
    return juce::Decibels::gainToDecibels (outputGain.load (std::memory_order_relaxed), -60.0f);
}
} // namespace drums
} // namespace preseter
