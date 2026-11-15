//! C ABI mínima em volta do `WurliEngine` do OpenWurli.
//!
//! O PreseterEngine (C++/JUCE) chama estas funções; o DSP continua sendo o
//! código Rust original do OpenWurli (GPL-3.0-or-later).

#![allow(unsafe_op_in_unsafe_fn)]

use std::ptr;

use openwurli_dsp::engine::{DAMPER_SCALE_RANGE, HAMMER_CONTACT_SCALE_RANGE};
use openwurli_dsp::WurliEngine;

pub struct OwEngine {
    engine: WurliEngine,
    scratch: Vec<f32>,
}

fn clamp01(value: f64) -> f64 {
    value.clamp(0.0, 1.0)
}

#[no_mangle]
pub extern "C" fn ow_create(sample_rate: f64) -> *mut OwEngine {
    let rate = if sample_rate.is_finite() && sample_rate > 0.0 {
        sample_rate
    } else {
        44_100.0
    };

    Box::into_raw(Box::new(OwEngine {
        engine: WurliEngine::new(rate),
        scratch: Vec::new(),
    }))
}

#[no_mangle]
pub unsafe extern "C" fn ow_destroy(handle: *mut OwEngine) {
    if !handle.is_null() {
        drop(Box::from_raw(handle));
    }
}

#[no_mangle]
pub unsafe extern "C" fn ow_prepare(handle: *mut OwEngine, sample_rate: f64, max_block: i32) {
    let Some(state) = handle.as_mut() else { return };

    let rate = if sample_rate.is_finite() && sample_rate > 0.0 {
        sample_rate
    } else {
        44_100.0
    };
    let max_block = max_block.max(32) as usize;

    state.engine.set_sample_rate(rate);
    state.engine.ensure_buffer_capacity(max_block);
    state.scratch.resize(max_block, 0.0);
    state.engine.reset();
}

#[no_mangle]
pub unsafe extern "C" fn ow_reset(handle: *mut OwEngine) {
    if let Some(state) = handle.as_mut() {
        state.engine.reset();
    }
}

#[no_mangle]
pub unsafe extern "C" fn ow_note_on(handle: *mut OwEngine, note: i32, velocity: f32) {
    if let Some(state) = handle.as_mut() {
        state.engine.note_on(note.clamp(0, 127) as u8, velocity.clamp(0.0, 1.0));
    }
}

#[no_mangle]
pub unsafe extern "C" fn ow_note_off(handle: *mut OwEngine, note: i32) {
    if let Some(state) = handle.as_mut() {
        state.engine.note_off(note.clamp(0, 127) as u8);
    }
}

#[no_mangle]
pub unsafe extern "C" fn ow_set_sustain(handle: *mut OwEngine, held: i32) {
    if let Some(state) = handle.as_mut() {
        state.engine.set_sustain(held != 0);
    }
}

#[no_mangle]
pub unsafe extern "C" fn ow_all_notes_off(handle: *mut OwEngine) {
    if let Some(state) = handle.as_mut() {
        state.engine.all_notes_off();
    }
}

#[no_mangle]
pub unsafe extern "C" fn ow_set_volume(handle: *mut OwEngine, value: f64) {
    if let Some(state) = handle.as_mut() {
        state.engine.set_volume(clamp01(value));
    }
}

#[no_mangle]
pub unsafe extern "C" fn ow_set_tremolo_depth(handle: *mut OwEngine, value: f64) {
    if let Some(state) = handle.as_mut() {
        state.engine.set_tremolo_depth(clamp01(value));
    }
}

#[no_mangle]
pub unsafe extern "C" fn ow_set_speaker_character(handle: *mut OwEngine, value: f64) {
    if let Some(state) = handle.as_mut() {
        state.engine.set_speaker_character(clamp01(value));
    }
}

#[no_mangle]
pub unsafe extern "C" fn ow_set_mlp_enabled(handle: *mut OwEngine, enabled: i32) {
    if let Some(state) = handle.as_mut() {
        state.engine.set_mlp_enabled(enabled != 0);
    }
}

#[no_mangle]
pub unsafe extern "C" fn ow_set_hammer_contact_scale(handle: *mut OwEngine, value: f64) {
    if let Some(state) = handle.as_mut() {
        state.engine.set_hammer_contact_scale(
            value.clamp(HAMMER_CONTACT_SCALE_RANGE.0, HAMMER_CONTACT_SCALE_RANGE.1),
        );
    }
}

#[no_mangle]
pub unsafe extern "C" fn ow_set_damper_scale(handle: *mut OwEngine, value: f64) {
    if let Some(state) = handle.as_mut() {
        state
            .engine
            .set_damper_scale(value.clamp(DAMPER_SCALE_RANGE.0, DAMPER_SCALE_RANGE.1));
    }
}

#[no_mangle]
pub unsafe extern "C" fn ow_set_reed_bar_trim(handle: *mut OwEngine, ohms: f64) {
    if let Some(state) = handle.as_mut() {
        state.engine.set_reed_bar_trim(ohms.max(0.0));
    }
}

#[no_mangle]
pub unsafe extern "C" fn ow_set_noise_enabled(handle: *mut OwEngine, enabled: i32) {
    if let Some(state) = handle.as_mut() {
        state.engine.set_noise_enabled(enabled != 0);
    }
}

#[no_mangle]
pub unsafe extern "C" fn ow_set_noise_gain(handle: *mut OwEngine, value: f64) {
    if let Some(state) = handle.as_mut() {
        state.engine.set_noise_gain(value.max(0.0));
    }
}

#[no_mangle]
pub unsafe extern "C" fn ow_set_rail_sag(handle: *mut OwEngine, enabled: i32) {
    if let Some(state) = handle.as_mut() {
        state.engine.set_rail_sag(enabled != 0);
    }
}

#[no_mangle]
pub unsafe extern "C" fn ow_render(
    handle: *mut OwEngine,
    left: *mut f32,
    right: *mut f32,
    frames: i32,
) {
    if handle.is_null() || frames <= 0 {
        return;
    }

    let state = &mut *handle;
    let count = frames as usize;

    if state.scratch.len() < count {
        state.scratch.resize(count, 0.0);
    }

    let buffer = &mut state.scratch[..count];
    state.engine.render(buffer);

    if !left.is_null() {
        ptr::copy_nonoverlapping(buffer.as_ptr(), left, count);
    }
    if !right.is_null() {
        ptr::copy_nonoverlapping(buffer.as_ptr(), right, count);
    }
}

#[no_mangle]
pub unsafe extern "C" fn ow_active_voice_count(handle: *const OwEngine) -> i32 {
    if let Some(state) = handle.as_ref() {
        state.engine.active_voice_count() as i32
    } else {
        0
    }
}
