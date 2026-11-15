/*
 * MDA ePiano DSP adaptado para o Preseter.
 *
 * Base: mda-plugins-juce (https://github.com/hollance/mda-plugins-juce),
 * porte JUCE MIT de M.I. Hollemans sobre o código original de Paul Kellett.
 * Ver LICENSE e UPSTREAM.md nesta pasta.
 */
#include "MdaEPianoDsp.h"

#include <algorithm>
#include <cmath>
#include <cstring>

#include "mdaEPianoData.h"

namespace preseter
{
namespace native
{
namespace
{
float clampValue (float value, float low, float high)
{
    return std::max (low, std::min (high, value));
}
} // namespace

MdaEPianoDsp::MdaEPianoDsp()
{
    // O MDA original modifica a tabela de samples para o crossfade do loop.
    // Copiamos os dados para cada instância para não corromper a tabela global.
    constexpr size_t sampleCount = sizeof (epianoData) / sizeof (epianoData[0]);
    waveData_.assign (epianoData, epianoData + sampleCount);
    waves_ = waveData_.data();

    // Waveform data e keymapping (igual ao MDA ePiano).
    std::memset (keygroups_, 0, sizeof (keygroups_));

    keygroups_[0].root = 36; keygroups_[0].high = 39;   // C1
    keygroups_[3].root = 43; keygroups_[3].high = 45;   // G1
    keygroups_[6].root = 48; keygroups_[6].high = 51;   // C2
    keygroups_[9].root = 55; keygroups_[9].high = 57;   // G2
    keygroups_[12].root = 60; keygroups_[12].high = 63; // C3
    keygroups_[15].root = 67; keygroups_[15].high = 69; // G3
    keygroups_[18].root = 72; keygroups_[18].high = 75; // C4
    keygroups_[21].root = 79; keygroups_[21].high = 81; // G4
    keygroups_[24].root = 84; keygroups_[24].high = 87; // C5
    keygroups_[27].root = 91; keygroups_[27].high = 93; // G5
    keygroups_[30].root = 96; keygroups_[30].high = 999; // C6

    keygroups_[0].pos = 0;       keygroups_[0].end = 8476;    keygroups_[0].loop = 4400;
    keygroups_[1].pos = 8477;    keygroups_[1].end = 16248;   keygroups_[1].loop = 4903;
    keygroups_[2].pos = 16249;   keygroups_[2].end = 34565;   keygroups_[2].loop = 6398;
    keygroups_[3].pos = 34566;   keygroups_[3].end = 41384;   keygroups_[3].loop = 3938;
    keygroups_[4].pos = 41385;   keygroups_[4].end = 45760;   keygroups_[4].loop = 1633;
    keygroups_[5].pos = 45761;   keygroups_[5].end = 65211;   keygroups_[5].loop = 5245;
    keygroups_[6].pos = 65212;   keygroups_[6].end = 72897;   keygroups_[6].loop = 2937;
    keygroups_[7].pos = 72898;   keygroups_[7].end = 78626;   keygroups_[7].loop = 2203;
    keygroups_[8].pos = 78627;   keygroups_[8].end = 100387;  keygroups_[8].loop = 6368;
    keygroups_[9].pos = 100388;  keygroups_[9].end = 116297;  keygroups_[9].loop = 10452;
    keygroups_[10].pos = 116298; keygroups_[10].end = 127661; keygroups_[10].loop = 5217;
    keygroups_[11].pos = 127662; keygroups_[11].end = 144113; keygroups_[11].loop = 3099;
    keygroups_[12].pos = 144114; keygroups_[12].end = 152863; keygroups_[12].loop = 4284;
    keygroups_[13].pos = 152864; keygroups_[13].end = 173107; keygroups_[13].loop = 3916;
    keygroups_[14].pos = 173108; keygroups_[14].end = 192734; keygroups_[14].loop = 2937;
    keygroups_[15].pos = 192735; keygroups_[15].end = 204598; keygroups_[15].loop = 4732;
    keygroups_[16].pos = 204599; keygroups_[16].end = 218995; keygroups_[16].loop = 4733;
    keygroups_[17].pos = 218996; keygroups_[17].end = 233801; keygroups_[17].loop = 2285;
    keygroups_[18].pos = 233802; keygroups_[18].end = 248011; keygroups_[18].loop = 4098;
    keygroups_[19].pos = 248012; keygroups_[19].end = 265287; keygroups_[19].loop = 4099;
    keygroups_[20].pos = 265288; keygroups_[20].end = 282255; keygroups_[20].loop = 3609;
    keygroups_[21].pos = 282256; keygroups_[21].end = 293776; keygroups_[21].loop = 2446;
    keygroups_[22].pos = 293777; keygroups_[22].end = 312566; keygroups_[22].loop = 6278;
    keygroups_[23].pos = 312567; keygroups_[23].end = 330200; keygroups_[23].loop = 2283;
    keygroups_[24].pos = 330201; keygroups_[24].end = 348889; keygroups_[24].loop = 2689;
    keygroups_[25].pos = 348890; keygroups_[25].end = 365675; keygroups_[25].loop = 4370;
    keygroups_[26].pos = 365676; keygroups_[26].end = 383661; keygroups_[26].loop = 5225;
    keygroups_[27].pos = 383662; keygroups_[27].end = 393372; keygroups_[27].loop = 2811;
    keygroups_[28].pos = 383662; keygroups_[28].end = 393372; keygroups_[28].loop = 2811;
    keygroups_[29].pos = 393373; keygroups_[29].end = 406045; keygroups_[29].loop = 4522;
    keygroups_[30].pos = 406046; keygroups_[30].end = 414486; keygroups_[30].loop = 2306;
    keygroups_[31].pos = 406046; keygroups_[31].end = 414486; keygroups_[31].loop = 2306;
    keygroups_[32].pos = 414487; keygroups_[32].end = 422408; keygroups_[32].loop = 2169;

    // Crossfade entre o fim e o início do loop, igual ao MDA.
    for (int k = 0; k < 28; ++k)
    {
        int p0 = keygroups_[k].end;
        int p1 = keygroups_[k].end - keygroups_[k].loop;

        float xf = 1.0f;
        const float dxf = -0.02f;
        while (xf > 0.0f)
        {
            waveData_[(size_t) p0] = (short) ((1.0f - xf) * (float) waveData_[(size_t) p0]
                                              + xf * (float) waveData_[(size_t) p1]);
            --p0;
            --p1;
            xf += dxf;
        }
    }

    reset();
}

void MdaEPianoDsp::prepare (double sampleRate)
{
    sampleRate_ = sampleRate > 0.0 ? (float) sampleRate : 44100.0f;
    inverseSampleRate_ = 1.0f / sampleRate_;
    reset();
}

void MdaEPianoDsp::reset()
{
    resetState();
}

void MdaEPianoDsp::resetState()
{
    for (int v = 0; v < kNumVoices; ++v)
    {
        voices_[v].env = 0.0f;
        voices_[v].decay = 0.99f;
    }

    numActiveVoices_ = 0;
    notes_[0] = kEventsDone;
    sustain_ = 0;
    volume_ = 0.2f;
    filtL_ = filtR_ = 0.0f;
    lfo0_ = 0.0f;
    lfo1_ = 1.0f;
    modWheel_ = -1.0f;
}

void MdaEPianoDsp::clearModWheelOverride()
{
    modWheel_ = -1.0f;
}

void MdaEPianoDsp::setParameters (const MdaEPianoParameters& p)
{
    envDecay_ = clampValue (p.decay, 0.0f, 100.0f) / 100.0f;
    envRelease_ = clampValue (p.release, 0.0f, 100.0f) / 100.0f;

    float hardness = (clampValue (p.hardness, -50.0f, 50.0f) + 50.0f) / 100.0f;
    hardnessOffset_ = (int) (12.0f * hardness - 6.0f);

    float treble = (clampValue (p.treble, -50.0f, 50.0f) + 50.0f) / 100.0f;
    trebleGain_ = 4.0f * treble * treble - 1.0f;
    const float cutoff = treble > 0.5f ? 14000.0f : 5000.0f;
    filtCoef_ = 1.0f - std::exp (-inverseSampleRate_ * cutoff);

    modulation_ = clampValue (p.modulation, 0.0f, 1.0f);
    lmod_ = rmod_ = modulation_ + modulation_ - 1.0f;
    if (modulation_ < 0.5f)
        rmod_ = -rmod_;

    // Depois que o CC1 é recebido, ele manda na profundidade. Diferente do
    // porte original (que esquecia o CC1 no bloco seguinte), aqui o valor
    // persiste até o próximo CC1 ou troca de preset.
    if (modWheel_ >= 0.0f)
    {
        lmod_ = rmod_ = modWheel_;
        if (modulation_ < 0.5f)
            rmod_ = -rmod_;
    }

    const float lfo = clampValue (p.lfoRate, 0.0f, 1.0f);
    lfoRate_ = 6.28318530718f * inverseSampleRate_ * std::exp (6.22f * lfo - 2.61f);

    float velocity = clampValue (p.velocity, 0.0f, 100.0f) / 100.0f;
    velocitySensitivity_ = 1.0f + velocity + velocity;
    if (velocity < 0.25f)
        velocitySensitivity_ -= 0.75f - 3.0f * velocity;

    width_ = 0.03f * clampValue (p.stereo, 0.0f, 200.0f) / 200.0f;
    polyphony_ = (int) std::lround (clampValue (p.polyphony, 1.0f, 32.0f));
    fine_ = clampValue (p.fine, -50.0f, 50.0f) / 100.0f;

    const float random = clampValue (p.random, 0.0f, 1.0f);
    random_ = 0.077f * random * random;

    overdrive_ = 1.8f * clampValue (p.overdrive, 0.0f, 100.0f) / 100.0f;

    // Mesma curva do CC7 do MDA (posição 0..127 -> 0..0.32258).
    const int volumeCc = (int) std::lround (clampValue (p.volume, 0.0f, 1.0f) * 127.0f);
    volume_ = 0.00002f * (float) (volumeCc * volumeCc);
}

void MdaEPianoDsp::processEvents (juce::MidiBuffer& midi)
{
    int npos = 0;

    for (const auto metadata : midi)
    {
        if (metadata.numBytes != 3)
            continue;

        const auto data0 = metadata.data[0];
        const auto data1 = metadata.data[1];
        const auto data2 = metadata.data[2];
        const int deltaFrames = metadata.samplePosition;

        switch (data0 & 0xF0)
        {
            case 0x80: // note off
                notes_[npos++] = deltaFrames;
                notes_[npos++] = data1 & 0x7F;
                notes_[npos++] = 0;
                break;

            case 0x90: // note on
                notes_[npos++] = deltaFrames;
                notes_[npos++] = data1 & 0x7F;
                notes_[npos++] = data2 & 0x7F;
                break;

            case 0xB0: // controller
                switch (data1)
                {
                    case 0x01: // mod wheel: profundidade do tremolo/auto-pan
                    {
                        modWheel_ = 0.0078f * (float) data2;
                        rmod_ = lmod_ = modWheel_;
                        if (modulation_ < 0.5f)
                            rmod_ = -rmod_;
                        break;
                    }

                    case 0x07: // volume
                        volume_ = 0.00002f * (float) (data2 * data2);
                        break;

                    case 0x40: // sustain
                    case 0x42: // sustenuto
                        sustain_ = data2 & 0x40;
                        if (sustain_ == 0)
                        {
                            notes_[npos++] = deltaFrames;
                            notes_[npos++] = kSustain;
                            notes_[npos++] = 0;
                        }
                        break;

                    default:
                        if (data1 > 0x7A)
                        {
                            for (int v = 0; v < kNumVoices; ++v)
                                voices_[v].decay = 0.99f;
                            sustain_ = 0;
                        }
                        break;
                }
                break;

            default:
                break;
        }

        if (npos > kEventBuffer)
            npos -= 3;
    }

    notes_[npos] = kEventsDone;
    midi.clear();
}

void MdaEPianoDsp::process (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    processEvents (midi);

    const int sampleFrames = buffer.getNumSamples();
    if (sampleFrames <= 0 || buffer.getNumChannels() <= 0)
        return;

    buffer.clear();

    float* out0 = buffer.getWritePointer (0);
    float* out1 = buffer.getNumChannels() > 1 ? buffer.getWritePointer (1) : nullptr;

    const float overdrive = overdrive_;
    int event = 0;
    int frame = 0;

    while (frame < sampleFrames)
    {
        int frames = notes_[event++];
        if (frames > sampleFrames)
            frames = sampleFrames;
        frames -= frame;
        frame += frames;

        while (--frames >= 0)
        {
            Voice* V = voices_;
            float l = 0.0f;
            float r = 0.0f;

            for (int v = 0; v < numActiveVoices_; ++v)
            {
                V->frac += V->delta;
                V->pos += V->frac >> 16;
                V->frac &= 0xFFFF;
                if (V->pos > V->end)
                    V->pos -= V->loop;

                const int i = waves_[V->pos]
                              + ((V->frac * (waves_[V->pos + 1] - waves_[V->pos])) >> 16);

                float x = V->env * (float) i / 32768.0f;
                V->env = V->env * V->decay;

                if (x > 0.0f)
                {
                    x -= overdrive * x * x;
                    if (x < -V->env)
                        x = -V->env;
                }

                l += V->outl * x;
                r += V->outr * x;

                if ((l < -2.0f) || (l > 2.0f))
                    l = 0.0f;
                if ((r < -2.0f) || (r > 2.0f))
                    r = 0.0f;

                ++V;
            }

            filtL_ += filtCoef_ * (l - filtL_);
            filtR_ += filtCoef_ * (r - filtR_);
            l += trebleGain_ * (l - filtL_);
            r += trebleGain_ * (r - filtR_);

            lfo0_ += lfoRate_ * lfo1_;
            lfo1_ -= lfoRate_ * lfo0_;

            l += l * lmod_ * lfo1_;
            r += r * rmod_ * lfo1_;

            *out0++ = l;
            if (out1 != nullptr)
                *out1++ = r;
        }

        if (frame < sampleFrames)
        {
            if (numActiveVoices_ == 0 && modulation_ > 0.5f)
            {
                lfo0_ = -0.7071f;
                lfo1_ = 0.7071f;
            }

            const int note = notes_[event++];
            const int velocity = notes_[event++];
            noteOn (note, velocity);
        }
    }

    if (std::fabs (filtL_) < 1.0e-10f)
        filtL_ = 0.0f;
    if (std::fabs (filtR_) < 1.0e-10f)
        filtR_ = 0.0f;

    for (int v = 0; v < numActiveVoices_; ++v)
    {
        if (voices_[v].env < 0.0001f)
            voices_[v] = voices_[--numActiveVoices_];
    }

    notes_[0] = kEventsDone;
}

void MdaEPianoDsp::noteOn (int note, int velocity)
{
    if (velocity > 0)
    {
        int vl = 0;
        if (numActiveVoices_ < polyphony_)
        {
            vl = numActiveVoices_;
            ++numActiveVoices_;
        }
        else
        {
            float level = 99.0f;
            for (int v = 0; v < polyphony_; ++v)
            {
                if (voices_[v].env < level)
                {
                    level = voices_[v].env;
                    vl = v;
                }
            }
        }

        const int k = (note - 60) * (note - 60);
        const float r = random_ * ((float) (k % 13) - 6.5f);
        float l = fine_ + r;

        const int s = hardnessOffset_;
        int kg = 0;
        while (note > (keygroups_[kg].high + s))
            kg += 3;

        l += (float) (note - keygroups_[kg].root);
        l = 32000.0f * inverseSampleRate_ * std::exp (0.05776226505f * l);
        voices_[vl].delta = (int) (65536.0f * l);

        if (velocity > 48)
            ++kg;
        if (velocity > 80)
            ++kg;

        voices_[vl].frac = 0;
        voices_[vl].pos = keygroups_[kg].pos;
        voices_[vl].end = keygroups_[kg].end - 1;
        voices_[vl].loop = keygroups_[kg].loop;
        voices_[vl].note = note;

        if (note < 12)
            note = 12;
        if (note > 108)
            note = 108;

        const float w = width_ * (float) (note - 60);
        voices_[vl].outr = volume_ * (1.0f + w);
        voices_[vl].outl = volume_ * (1.0f - w);

        voices_[vl].env = (3.0f + 2.0f * velocitySensitivity_)
                          * std::pow (0.0078f * (float) velocity, velocitySensitivity_);

        if (note > 60)
            voices_[vl].env *= std::exp (0.01f * (float) (60 - note));

        if (note < 44)
            note = 44;

        voices_[vl].decay = std::exp (-inverseSampleRate_
                                      * std::exp (-1.0f + 0.03f * (float) note - 2.0f * envDecay_));
    }
    else
    {
        for (int v = 0; v < kNumVoices; ++v)
        {
            if (voices_[v].note == note)
            {
                if (sustain_ == 0)
                {
                    voices_[v].decay = std::exp (-inverseSampleRate_
                                                 * std::exp (6.0f + 0.01f * (float) note
                                                             - 5.0f * envRelease_));
                }
                else
                {
                    voices_[v].note = kSustain;
                }
            }
        }
    }
}
} // namespace native
} // namespace preseter
