#pragma once

#ifdef __cplusplus
extern "C"
{
#endif

typedef struct OwEngine OwEngine;

OwEngine* ow_create (double sample_rate);
void ow_destroy (OwEngine* engine);
void ow_prepare (OwEngine* engine, double sample_rate, int max_block);
void ow_reset (OwEngine* engine);

void ow_note_on (OwEngine* engine, int note, float velocity);
void ow_note_off (OwEngine* engine, int note);
void ow_set_sustain (OwEngine* engine, int held);
void ow_all_notes_off (OwEngine* engine);

void ow_set_volume (OwEngine* engine, double value);
void ow_set_tremolo_depth (OwEngine* engine, double value);
void ow_set_speaker_character (OwEngine* engine, double value);
void ow_set_mlp_enabled (OwEngine* engine, int enabled);
void ow_set_hammer_contact_scale (OwEngine* engine, double value);
void ow_set_damper_scale (OwEngine* engine, double value);
void ow_set_reed_bar_trim (OwEngine* engine, double ohms);
void ow_set_noise_enabled (OwEngine* engine, int enabled);
void ow_set_noise_gain (OwEngine* engine, double value);
void ow_set_rail_sag (OwEngine* engine, int enabled);

void ow_render (OwEngine* engine, float* left, float* right, int frames);
int ow_active_voice_count (const OwEngine* engine);

#ifdef __cplusplus
}
#endif
