#include "Synth2Dsp.h"

#include "EngineCore/Synth.hpp"
#include "EngineCore/Sy1Codec.hpp"

#include <algorithm>
#include <atomic>
#include <cmath>

namespace preseter
{
namespace native
{
struct Synth2Dsp::Impl
{
    oxo::s2::Synth synth;
    std::atomic<bool> reloadRequested { false };
    std::atomic<int> reportedVoices { 0 };
};

Synth2Dsp::Synth2Dsp()
    : impl (std::make_unique<Impl>())
{
}

Synth2Dsp::~Synth2Dsp() = default;

void Synth2Dsp::prepare (double sampleRate)
{
    impl->synth.SetSampleRate (sampleRate > 0.0 ? sampleRate : 44100.0);
}

void Synth2Dsp::beginPatchIfNeeded()
{
    if (! impl->reloadRequested.exchange (false, std::memory_order_relaxed))
        return;

    impl->synth.ClearDelay();
    impl->synth.BeginPatchChange();
}

void Synth2Dsp::beginBlock (int frames)
{
    impl->synth.BeginBlock (frames > 0 ? frames : 0);
}

void Synth2Dsp::render (float* left, float* right, int frames)
{
    if (frames <= 0)
        return;

    // O Synth sempre escreve os dois canais; um buffer mono recebe o esquerdo
    // e o render é descartado no direito.
    static thread_local float scratch[4096];
    int pos = 0;
    while (pos < frames)
    {
        const int n = std::min (frames - pos, (int) (sizeof (scratch) / sizeof (scratch[0])));
        impl->synth.Render (left + pos, right != nullptr ? right + pos : scratch, n);
        pos += n;
    }

    // Lido pela UI/`voices` em outra thread; GatedVoices só é consultado aqui.
    impl->reportedVoices.store (impl->synth.GatedVoices(), std::memory_order_relaxed);
}

void Synth2Dsp::setParam (int id, int32_t value)
{
    impl->synth.SetParam (id, value);
}

void Synth2Dsp::setVolume (int32_t value)
{
    impl->synth.SetVolume (value);
}

void Synth2Dsp::setTransport (double bpm, double ppq, bool playing)
{
    impl->synth.SetTransport (bpm, ppq, playing);
}

void Synth2Dsp::noteOn (int note, int velocity)
{
    impl->synth.NoteOn (note, velocity);
}

void Synth2Dsp::noteOff (int note)
{
    impl->synth.NoteOff (note);
}

void Synth2Dsp::pitchBend (int value14)
{
    impl->synth.PitchBend (value14);
}

void Synth2Dsp::controlChange (int cc, int value)
{
    impl->synth.ControlChange (cc, value);
}

void Synth2Dsp::channelPressure (int value)
{
    impl->synth.ChannelPressure (value);
}

void Synth2Dsp::allNotesOff (bool immediate)
{
    impl->synth.AllNotesOff (immediate);
}

void Synth2Dsp::panic()
{
    impl->synth.Panic();
}

int Synth2Dsp::activeVoices() const
{
    return impl->reportedVoices.load (std::memory_order_relaxed);
}

void Synth2Dsp::requestPatchReload()
{
    impl->reloadRequested.store (true, std::memory_order_relaxed);
}

bool Synth2Dsp::parseSy1 (const std::string& text, Synth2PatchValues& values, std::string* name)
{
    const auto patch = oxo::s2::ParseSy1 (text);
    if (patch.values.size() != values.size())
        return false;

    values = patch.values;
    if (name != nullptr)
        *name = patch.name;
    return true;
}

std::string Synth2Dsp::writeSy1 (const std::string& name, const Synth2PatchValues& values)
{
    oxo::s2::Sy1Patch patch;
    patch.name = name;
    patch.color = "default";
    patch.version = 112;
    patch.values = values;
    return oxo::s2::WriteSy1 (patch);
}
} // namespace native
} // namespace preseter
