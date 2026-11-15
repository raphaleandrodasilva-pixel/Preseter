#pragma once

#ifdef __cplusplus
extern "C"
{
#endif

typedef struct ref_organ ref_organ;

ref_organ* ref_create (double sampleRate);
void ref_destroy (ref_organ* ref);
void ref_panic (ref_organ* ref);

void ref_set_drawbars (ref_organ* ref, const int values[9]);
void ref_set_percussion (ref_organ* ref, int enabled, int soft, int fast, int thirdHarmonic);
void ref_set_vibrato (ref_organ* ref, int mode);
void ref_set_leslie (ref_organ* ref, int mode);
void ref_set_overdrive (ref_organ* ref, float amount);
void ref_set_reverb (ref_organ* ref, float mix);
void ref_set_key_click (ref_organ* ref, float amount);
void ref_set_volume (ref_organ* ref, float amount);

void ref_note_on (ref_organ* ref, int note, int velocity, int samplePosition);
void ref_note_off (ref_organ* ref, int note, int samplePosition);

void ref_render (ref_organ* ref, float* left, float* right, int numSamples);

typedef struct ref_event
{
    int samplePosition;
    unsigned char data[3];
    unsigned char size;
} ref_event;

void ref_render_block (ref_organ* ref,
                       float* left,
                       float* right,
                       int numSamples,
                       const ref_event* events,
                       int numEvents);

void ref_debug_gains (ref_organ* ref, int blocks);

#ifdef __cplusplus
}
#endif
