/*
  ZynAddSubFX - a software synthesizer

  FFTwrapper.c  -  A wrapper for Fast Fourier Transforms
  Copyright (C) 2002-2005 Nasca Octavian Paul
  Author: Nasca Octavian Paul

  This program is free software; you can redistribute it and/or
  modify it under the terms of the GNU General Public License
  as published by the Free Software Foundation; either version 2
  of the License, or (at your option) any later version.

  Preseter port: FFTW replaced by juce::dsp::FFT so the engine does not
  need the external FFTW library. The inverse transform is scaled by the
  FFT size to preserve FFTW's unscaled inverse convention used by Zyn.
*/

#include <cmath>
#include <cassert>
#include <cstring>
#include <mutex>
#include "FFTwrapper.h"

namespace zyn {

static std::mutex mutex;

FFTwrapper::FFTwrapper(int fftsize_) : m_fftsize(fftsize_)
{
    int order = 0;
    while ((1 << order) < m_fftsize)
        ++order;

    fft = std::make_unique<juce::dsp::FFT>(order);
    scratch.allocate((size_t) m_fftsize * 2, false);
}

FFTwrapper::~FFTwrapper() = default;

void FFTwrapper::smps2freqs(const FFTsampleBuffer smps, FFTfreqBuffer freqs, FFTsampleBuffer scratch) const
{
    juce::ignoreUnused(scratch);
    smps2freqs_noconst_input(smps, freqs);
}

void FFTwrapper::smps2freqs_noconst_input(FFTsampleBuffer smps, FFTfreqBuffer freqs) const
{
    assert(m_fftsize == freqs.fftsize);
    assert(m_fftsize == smps.fftsize);

    std::memcpy(scratch.getData(), smps.data, (size_t) m_fftsize * sizeof(float));
    std::memset(scratch.getData() + m_fftsize, 0, (size_t) m_fftsize * sizeof(float));

    fft->performRealOnlyForwardTransform(scratch.getData(), false);

    // Como o FFTW (r2c), entrega só as frequências 0..N/2. A área de trabalho
    // tem N números complexos: ler o índice N passaria do fim dela.
    const auto* bins = reinterpret_cast<const std::complex<float>*>(scratch.getData());
    for (int i = 0; i <= m_fftsize / 2; ++i)
        freqs.data[i] = bins[i];
}

void FFTwrapper::freqs2smps(const FFTfreqBuffer freqs, FFTsampleBuffer smps, FFTfreqBuffer scratch) const
{
    juce::ignoreUnused(scratch);
    freqs2smps_noconst_input(freqs, smps);
}

void FFTwrapper::freqs2smps_noconst_input(FFTfreqBuffer freqs, FFTsampleBuffer smps) const
{
    assert(m_fftsize == freqs.fftsize);
    assert(m_fftsize == smps.fftsize);

    auto* bins = reinterpret_cast<std::complex<float>*>(scratch.getData());
    for (int i = 0; i <= m_fftsize / 2; ++i)
        bins[i] = freqs.data[i];
    for (int i = m_fftsize / 2 + 1; i < m_fftsize; ++i)
        bins[i] = std::complex<float>(0.0f, 0.0f);
    bins[m_fftsize / 2] = std::complex<float>(freqs.data[m_fftsize / 2].real(), 0.0f);

    fft->performRealOnlyInverseTransform(scratch.getData());

    const float scale = (float) m_fftsize;
    for (int i = 0; i < m_fftsize; ++i)
        smps.data[i] = scratch.getData()[i] * scale;
}

void FFT_cleanup()
{
}

}
