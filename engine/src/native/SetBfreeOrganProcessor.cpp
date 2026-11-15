#include "SetBfreeOrganProcessor.h"

#include <algorithm>
#include <cmath>
#include <cstring>

extern "C"
{
#include "cfgParser.h"
#include "global_inst.h"
#include "main.h"
#include "midi.h"
#include "program.h"
#include "state.h"
#include "tonegen.h"
#include "vibrato.h"
}

namespace preseter
{
namespace native
{
namespace
{
constexpr int kBufferSize = BUFFER_SIZE_SAMPLES;

int clampInt (int value, int low, int high)
{
    return std::max (low, std::min (high, value));
}
} // namespace

struct SetBfreeOrgan::Impl
{
    b_instance inst {};
    float bufA[kBufferSize] {};
    float bufB[kBufferSize] {};
    float bufC[kBufferSize] {};
    float outL[kBufferSize] {};
    float outR[kBufferSize] {};
    float tmpL[kBufferSize] {};
    float tmpR[kBufferSize] {};

    int boffset = kBufferSize;
    bool prepared = false;

    std::array<int, 9> drawbars { { -1, -1, -1, -1, -1, -1, -1, -1, -1 } };
    int percEnabled = -1;
    int percSoft = -1;
    int percFast = -1;
    int percThird = -1;
    int vibratoMode = -1;
    int leslieMode = -1;
    int overdriveCharacter = -1;
    int overdriveOn = -1;
    int reverbMix = -1;
    int keyClick = -1;
    int volume = -1;

    void prepare (double sampleRate);
    void release();
    void resetCaches();

    int render (int written, int nframes, float* left, float* right);
};

void SetBfreeOrgan::Impl::resetCaches()
{
    drawbars.fill (-1);
    percEnabled = percSoft = percFast = percThird = -1;
    vibratoMode = -1;
    leslieMode = -1;
    overdriveCharacter = -1;
    overdriveOn = -1;
    reverbMix = -1;
    keyClick = -1;
    volume = -1;
}

void SetBfreeOrgan::Impl::release()
{
    if (inst.reverb != nullptr)
        freeReverb (inst.reverb);
    if (inst.whirl != nullptr)
        freeWhirl (inst.whirl);
    if (inst.synth != nullptr)
        freeToneGenerator (inst.synth);
    if (inst.midicfg != nullptr)
        freeMidiCfg (inst.midicfg);
    if (inst.preamp != nullptr)
        freePreamp (inst.preamp);
    if (inst.progs != nullptr)
        freeProgs (inst.progs);
    if (inst.state != nullptr)
        freeRunningConfig (inst.state);

    inst = b_instance {};
    boffset = kBufferSize;
    prepared = false;
    resetCaches();
}

void SetBfreeOrgan::Impl::prepare (double sampleRate)
{
    release();

    SampleRateD = sampleRate > 0.0 ? sampleRate : 48000.0;

    /* Mesma sequência de allocSynth() em b_synth/lv2.c. */
    inst.state = allocRunningConfig();
    inst.progs = allocProgs();
    inst.reverb = allocReverb();
    inst.whirl = allocWhirl();
    inst.midicfg = allocMidiCfg (inst.state);
    inst.synth = allocTonegen();
    inst.preamp = allocPreamp();

    if (inst.state == nullptr || inst.progs == nullptr || inst.reverb == nullptr
        || inst.whirl == nullptr || inst.midicfg == nullptr || inst.synth == nullptr
        || inst.preamp == nullptr)
    {
        release();
        return;
    }

    initControllerTable (inst.midicfg);
    midiPrimeControllerMapping (inst.midicfg);

    /* Mesma sequência de initSynth() em b_synth/lv2.c. */
    initToneGenerator (inst.synth, inst.midicfg);
    initVibrato (inst.synth, inst.midicfg);
    initPreamp (inst.preamp, inst.midicfg);
    initReverb (inst.reverb, inst.midicfg, SampleRateD);
    initWhirl (inst.whirl, inst.midicfg, SampleRateD);
    initRunningConfig (inst.state, inst.midicfg);
    initMidiTables (inst.midicfg);

    unsigned int defaultPreset[9] = { 8, 8, 6, 0, 0, 0, 0, 0, 0 };
    setDrawBars (&inst, 0, defaultPreset);

    boffset = kBufferSize;
    prepared = true;
    resetCaches();
}

int SetBfreeOrgan::Impl::render (int written, int nframes, float* left, float* right)
{
    /* Cópia fiel de synthSound() em b_synth/lv2.c. */
    while (written < nframes)
    {
        const int remaining = nframes - written;

        if (boffset >= kBufferSize)
        {
            boffset = 0;
            oscGenerateFragment (inst.synth, bufA, (size_t) kBufferSize);
            preamp (inst.preamp, bufA, bufB, (size_t) kBufferSize);
            reverb (inst.reverb, bufB, bufC, (size_t) kBufferSize);
            whirlProc3 (inst.whirl, bufC, outL, outR, tmpL, tmpR, (size_t) kBufferSize);
        }

        const int nread = std::min (remaining, kBufferSize - boffset);
        std::memcpy (left + written, outL + boffset, (size_t) nread * sizeof (float));
        std::memcpy (right + written, outR + boffset, (size_t) nread * sizeof (float));

        written += nread;
        boffset += nread;
    }

    return written;
}

SetBfreeOrgan::SetBfreeOrgan() : impl (std::make_unique<Impl>()) {}

SetBfreeOrgan::~SetBfreeOrgan()
{
    impl->release();
}

void SetBfreeOrgan::prepare (double sampleRate)
{
    impl->prepare (sampleRate);
}

void SetBfreeOrgan::release()
{
    impl->release();
}

void SetBfreeOrgan::panic()
{
    if (impl->prepared)
        midi_panic (&impl->inst);
}

void SetBfreeOrgan::setDrawbars (const std::array<int, 9>& values)
{
    if (! impl->prepared || values == impl->drawbars)
        return;

    impl->drawbars = values;
    unsigned int setting[9];
    for (int i = 0; i < 9; ++i)
        setting[i] = (unsigned int) clampInt (values[(size_t) i], 0, 8);

    setDrawBars (&impl->inst, 0, setting);
}

void SetBfreeOrgan::setPercussion (bool enabled, bool soft, bool fast, bool thirdHarmonic)
{
    if (! impl->prepared)
        return;

    const int on = enabled ? 127 : 0;
    const int softValue = soft ? 127 : 0;
    const int fastValue = fast ? 127 : 0;
    const int thirdValue = thirdHarmonic ? 0 : 127;

    if (on != impl->percEnabled)
    {
        impl->percEnabled = on;
        callMIDIControlFunction (impl->inst.midicfg, "percussion.enable", (unsigned char) on);
    }
    if (softValue != impl->percSoft)
    {
        impl->percSoft = softValue;
        callMIDIControlFunction (impl->inst.midicfg, "percussion.volume", (unsigned char) softValue);
    }
    if (fastValue != impl->percFast)
    {
        impl->percFast = fastValue;
        callMIDIControlFunction (impl->inst.midicfg, "percussion.decay", (unsigned char) fastValue);
    }
    if (thirdValue != impl->percThird)
    {
        impl->percThird = thirdValue;
        callMIDIControlFunction (impl->inst.midicfg, "percussion.harmonic", (unsigned char) thirdValue);
    }
}

void SetBfreeOrgan::setVibrato (int mode)
{
    if (! impl->prepared)
        return;

    mode = clampInt (mode, 0, 6);
    if (mode == impl->vibratoMode)
        return;

    impl->vibratoMode = mode;

    /* setVibratoFromMIDI() do setBfree separa o knob em 6 faixas de 23. */
    static const unsigned char knob[7] = { 0, 0, 46, 92, 23, 69, 115 };
    callMIDIControlFunction (impl->inst.midicfg, "vibrato.knob", knob[mode]);

    /* Roteamento 64 (2 << 5) = manual superior, que é o canal que tocamos. */
    callMIDIControlFunction (impl->inst.midicfg, "vibrato.routing", (unsigned char) (mode == 0 ? 0 : 64));
}

void SetBfreeOrgan::setLeslie (int mode)
{
    if (! impl->prepared)
        return;

    mode = clampInt (mode, 0, 3);
    if (mode == impl->leslieMode)
        return;

    impl->leslieMode = mode;

    /* rotary.speed-preset: 0 = lento, 43 = parado, 86 = rápido.
       "Freio" usa a mesma parada do setBfree. */
    static const unsigned char preset[4] = { 43, 0, 86, 43 };
    callMIDIControlFunction (impl->inst.midicfg, "rotary.speed-preset", preset[mode]);
}

float SetBfreeOrgan::outputTrim (float overdriveAmount)
{
    struct Point
    {
        float amount;
        float gain;
    };

    // Pico medido no teste de nulidade (acorde, volume 0.82), normalizado
    // para 0.5. Ver docs/testes/orgao-nulidade.md.
    static const Point table[] = {
        { 0.00f, 0.158f },
        { 0.01f, 1.600f },
        { 0.10f, 2.780f },
        { 0.20f, 3.420f },
        { 0.30f, 3.710f },
        { 0.50f, 2.800f },
        { 0.70f, 1.850f },
        { 0.85f, 1.130f },
        { 1.00f, 0.380f },
    };

    const float amount = std::clamp (overdriveAmount, 0.0f, 1.0f);
    constexpr int count = (int) (sizeof (table) / sizeof (table[0]));

    for (int i = 1; i < count; ++i)
    {
        if (amount <= table[i].amount)
        {
            const float span = table[i].amount - table[i - 1].amount;
            const float t = span > 0.0f ? (amount - table[i - 1].amount) / span : 0.0f;
            return table[i - 1].gain + t * (table[i].gain - table[i - 1].gain);
        }
    }

    return table[count - 1].gain;
}

void SetBfreeOrgan::setOverdrive (float amount)
{
    if (! impl->prepared)
        return;

    const int character = clampInt ((int) std::lround (amount * 127.0f), 0, 127);
    const int enabled = amount > 0.004f ? 127 : 0;

    if (character != impl->overdriveCharacter)
    {
        impl->overdriveCharacter = character;
        callMIDIControlFunction (impl->inst.midicfg, "overdrive.character", (unsigned char) character);
    }
    if (enabled != impl->overdriveOn)
    {
        impl->overdriveOn = enabled;
        callMIDIControlFunction (impl->inst.midicfg, "overdrive.enable", (unsigned char) enabled);
    }
}

void SetBfreeOrgan::setReverb (float mix)
{
    if (! impl->prepared)
        return;

    const int value = clampInt ((int) std::lround (mix * 127.0f), 0, 127);
    if (value == impl->reverbMix)
        return;

    impl->reverbMix = value;
    callMIDIControlFunction (impl->inst.midicfg, "reverb.mix", (unsigned char) value);
}

void SetBfreeOrgan::setKeyClick (float amount)
{
    if (! impl->prepared)
        return;

    const int value = clampInt ((int) std::lround (amount * 100.0f), 0, 100);
    if (value == impl->keyClick)
        return;

    impl->keyClick = value;
    setEnvAttackClickLevel (impl->inst.synth, (double) amount);
    setEnvReleaseClickLevel (impl->inst.synth, (double) amount * 0.5);
}

void SetBfreeOrgan::setVolume (float amount)
{
    if (! impl->prepared)
        return;

    const int value = clampInt ((int) std::lround (amount * 127.0f), 0, 127);
    if (value == impl->volume)
        return;

    impl->volume = value;
    callMIDIControlFunction (impl->inst.midicfg, "swellpedal1", (unsigned char) value);
}

void SetBfreeOrgan::process (float* left,
                             float* right,
                             int numSamples,
                             const SetBfreeMidiEvent* events,
                             int numEvents)
{
    if (left == nullptr || right == nullptr || numSamples <= 0)
        return;

    if (! impl->prepared)
    {
        std::memset (left, 0, (size_t) numSamples * sizeof (float));
        std::memset (right, 0, (size_t) numSamples * sizeof (float));
        return;
    }

    int written = 0;

    /* Mesmo laço de run() em b_synth/lv2.c: sintetiza até o timestamp do
       evento, aplica o evento e continua. */
    for (int event = 0; event < numEvents; ++event)
    {
        const auto& message = events[event];
        const int position = clampInt (message.samplePosition, 0, numSamples - 1);

        if (written + kBufferSize < position && position < numSamples)
            written = impl->render (written, position, left, right);

        parse_raw_midi_data (&impl->inst, const_cast<std::uint8_t*> (message.data),
                             (size_t) message.size);

        // Mantém o cache do Leslie coerente com o CC1 (rotary.speed-preset),
        // para o botão da janela voltar a funcionar depois.
        if (message.size == 3 && (message.data[0] & 0xF0) == 0xB0 && message.data[1] == 1)
        {
            const int cc = message.data[2];
            impl->leslieMode = cc < 43 ? 1 : (cc < 86 ? 0 : 2);
        }
    }

    impl->render (written, numSamples, left, right);
}
} // namespace native
} // namespace preseter
