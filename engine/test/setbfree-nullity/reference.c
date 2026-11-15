/* Referência independente do wrapper C++.
 *
 * Reproduz, em C puro, a mesma sequência de chamadas do `b_synth/lv2.c`
 * original: allocSynth() -> initSynth() -> run()/synthSound(). Serve para
 * provar que o wrapper C++ não altera buffers, ordem de efeitos ou
 * temporização de eventos.
 */
#include "reference.h"

#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "global_inst.h"
#include "main.h"
#include "midi.h"
#include "program.h"
#include "state.h"
#include "tonegen.h"
#include "vibrato.h"

#define REF_BUFFER BUFFER_SIZE_SAMPLES

struct ref_organ
{
    b_instance inst;
    float bufA[REF_BUFFER];
    float bufB[REF_BUFFER];
    float bufC[REF_BUFFER];
    float outL[REF_BUFFER];
    float outR[REF_BUFFER];
    float tmpL[REF_BUFFER];
    float tmpR[REF_BUFFER];
    int boffset;
};

ref_organ*
ref_create (double sampleRate)
{
    ref_organ* ref = (ref_organ*) calloc (1, sizeof (ref_organ));
    if (ref == NULL)
        return NULL;

    SampleRateD = sampleRate;

    ref->inst.state   = allocRunningConfig();
    ref->inst.progs   = allocProgs();
    ref->inst.reverb  = allocReverb();
    ref->inst.whirl   = allocWhirl();
    ref->inst.midicfg = allocMidiCfg (ref->inst.state);
    ref->inst.synth   = allocTonegen();
    ref->inst.preamp  = allocPreamp();

    initControllerTable (ref->inst.midicfg);
    midiPrimeControllerMapping (ref->inst.midicfg);

    initToneGenerator (ref->inst.synth, ref->inst.midicfg);
    initVibrato (ref->inst.synth, ref->inst.midicfg);
    initPreamp (ref->inst.preamp, ref->inst.midicfg);
    initReverb (ref->inst.reverb, ref->inst.midicfg, SampleRateD);
    initWhirl (ref->inst.whirl, ref->inst.midicfg, SampleRateD);
    initRunningConfig (ref->inst.state, ref->inst.midicfg);
    initMidiTables (ref->inst.midicfg);

    {
        unsigned int defaultPreset[9] = { 8, 8, 6, 0, 0, 0, 0, 0, 0 };
        setDrawBars (&ref->inst, 0, defaultPreset);
    }

    ref->boffset = REF_BUFFER;
    return ref;
}

void
ref_destroy (ref_organ* ref)
{
    if (ref == NULL)
        return;

    freeReverb (ref->inst.reverb);
    freeWhirl (ref->inst.whirl);
    freeToneGenerator (ref->inst.synth);
    freeMidiCfg (ref->inst.midicfg);
    freePreamp (ref->inst.preamp);
    freeProgs (ref->inst.progs);
    freeRunningConfig (ref->inst.state);
    free (ref);
}

void
ref_panic (ref_organ* ref)
{
    midi_panic (&ref->inst);
}

static void
ref_send (ref_organ* ref, uint8_t status, uint8_t data1, uint8_t data2)
{
    uint8_t bytes[3];
    bytes[0] = status;
    bytes[1] = data1;
    bytes[2] = data2;
    parse_raw_midi_data (&ref->inst, bytes, 3);
}

void
ref_set_drawbars (ref_organ* ref, const int values[9])
{
    unsigned int setting[9];
    int          i;
    for (i = 0; i < 9; ++i)
    {
        int v = values[i];
        setting[i] = (unsigned int) (v < 0 ? 0 : (v > 8 ? 8 : v));
    }
    setDrawBars (&ref->inst, 0, setting);
}

static void
ref_cc (ref_organ* ref, const char* name, int value)
{
    if (value < 0)
        value = 0;
    if (value > 127)
        value = 127;
    callMIDIControlFunction (ref->inst.midicfg, name, (unsigned char) value);
}

void
ref_set_percussion (ref_organ* ref, int enabled, int soft, int fast, int thirdHarmonic)
{
    ref_cc (ref, "percussion.enable", enabled ? 127 : 0);
    ref_cc (ref, "percussion.volume", soft ? 127 : 0);
    ref_cc (ref, "percussion.decay", fast ? 127 : 0);
    ref_cc (ref, "percussion.harmonic", thirdHarmonic ? 0 : 127);
}

void
ref_set_vibrato (ref_organ* ref, int mode)
{
    static const unsigned char knob[7] = { 0, 0, 46, 92, 23, 69, 115 };
    if (mode < 0)
        mode = 0;
    if (mode > 6)
        mode = 6;
    ref_cc (ref, "vibrato.knob", knob[mode]);
    ref_cc (ref, "vibrato.routing", mode == 0 ? 0 : 64);
}

void
ref_set_leslie (ref_organ* ref, int mode)
{
    static const unsigned char preset[4] = { 43, 0, 86, 43 };
    if (mode < 0)
        mode = 0;
    if (mode > 3)
        mode = 3;
    ref_cc (ref, "rotary.speed-preset", preset[mode]);
}

void
ref_set_overdrive (ref_organ* ref, float amount)
{
    ref_cc (ref, "overdrive.character", (int) lround ((double) amount * 127.0));
    ref_cc (ref, "overdrive.enable", amount > 0.004f ? 127 : 0);
}

void
ref_set_reverb (ref_organ* ref, float mix)
{
    ref_cc (ref, "reverb.mix", (int) lround ((double) mix * 127.0));
}

void
ref_set_key_click (ref_organ* ref, float amount)
{
    setEnvAttackClickLevel (ref->inst.synth, (double) amount);
    setEnvReleaseClickLevel (ref->inst.synth, (double) amount * 0.5);
}

void
ref_set_volume (ref_organ* ref, float amount)
{
    ref_cc (ref, "swellpedal1", (int) lround ((double) amount * 127.0));
}

void
ref_send_cc (ref_organ* ref, int controller, int value)
{
    uint8_t bytes[3];
    bytes[0] = 0xB0;
    bytes[1] = (uint8_t) controller;
    bytes[2] = (uint8_t) value;
    parse_raw_midi_data (&ref->inst, bytes, 3);
}

int
ref_leslie_select (ref_organ* ref)
{
    return ref->inst.whirl->revSelect;
}

void
ref_note_on (ref_organ* ref, int note, int velocity, int samplePosition)
{
    (void) samplePosition;
    ref_send (ref, 0x90, (uint8_t) note, (uint8_t) velocity);
}

void
ref_note_off (ref_organ* ref, int note, int samplePosition)
{
    (void) samplePosition;
    ref_send (ref, 0x80, (uint8_t) note, 0);
}

static int
ref_synth (ref_organ* ref, int written, int nframes, float* left, float* right)
{
    while (written < nframes)
    {
        const int remaining = nframes - written;

        if (ref->boffset >= REF_BUFFER)
        {
            ref->boffset = 0;
            oscGenerateFragment (ref->inst.synth, ref->bufA, (size_t) REF_BUFFER);
            preamp (ref->inst.preamp, ref->bufA, ref->bufB, (size_t) REF_BUFFER);
            reverb (ref->inst.reverb, ref->bufB, ref->bufC, (size_t) REF_BUFFER);
            whirlProc3 (ref->inst.whirl, ref->bufC, ref->outL, ref->outR, ref->tmpL,
                        ref->tmpR, (size_t) REF_BUFFER);
        }

        {
            const int nread = remaining < (REF_BUFFER - ref->boffset) ? remaining
                                                                      : (REF_BUFFER - ref->boffset);
            memcpy (left + written, ref->outL + ref->boffset, (size_t) nread * sizeof (float));
            memcpy (right + written, ref->outR + ref->boffset, (size_t) nread * sizeof (float));
            written += nread;
            ref->boffset += nread;
        }
    }
    return written;
}

void
ref_render (ref_organ* ref, float* left, float* right, int numSamples)
{
    ref_synth (ref, 0, numSamples, left, right);
}

static double
peak_of (const float* buffer, int length)
{
    double peak = 0.0;
    int    i;
    for (i = 0; i < length; ++i)
    {
        double v = fabs ((double) buffer[i]);
        if (v > peak)
            peak = v;
    }
    return peak;
}

void
ref_debug_gains (ref_organ* ref, int blocks)
{
    double tone = 0.0, pre = 0.0, rev = 0.0, whirl = 0.0;
    int    b;

    for (b = 0; b < blocks; ++b)
    {
        double v;
        ref->boffset = REF_BUFFER;
        oscGenerateFragment (ref->inst.synth, ref->bufA, (size_t) REF_BUFFER);
        v = peak_of (ref->bufA, REF_BUFFER);
        if (v > tone)
            tone = v;

        preamp (ref->inst.preamp, ref->bufA, ref->bufB, (size_t) REF_BUFFER);
        v = peak_of (ref->bufB, REF_BUFFER);
        if (v > pre)
            pre = v;

        reverb (ref->inst.reverb, ref->bufB, ref->bufC, (size_t) REF_BUFFER);
        v = peak_of (ref->bufC, REF_BUFFER);
        if (v > rev)
            rev = v;

        whirlProc3 (ref->inst.whirl, ref->bufC, ref->outL, ref->outR, ref->tmpL,
                    ref->tmpR, (size_t) REF_BUFFER);
        v = peak_of (ref->outL, REF_BUFFER);
        if (v > whirl)
            whirl = v;
        v = peak_of (ref->outR, REF_BUFFER);
        if (v > whirl)
            whirl = v;
    }

    printf ("gains: tonegen %.6f  preamp %.6f  reverb %.6f  whirl %.6f\n", tone, pre, rev,
            whirl);
}

void
ref_render_block (ref_organ* ref,
                  float* left,
                  float* right,
                  int numSamples,
                  const ref_event* events,
                  int numEvents)
{
    int written = 0;
    int i;

    for (i = 0; i < numEvents; ++i)
    {
        int position = events[i].samplePosition;
        if (position < 0)
            position = 0;
        if (position >= numSamples)
            position = numSamples - 1;

        if (written + REF_BUFFER < position && position < numSamples)
            written = ref_synth (ref, written, position, left, right);

        parse_raw_midi_data (&ref->inst, (uint8_t*) events[i].data, (size_t) events[i].size);
    }

    ref_synth (ref, written, numSamples, left, right);
}
