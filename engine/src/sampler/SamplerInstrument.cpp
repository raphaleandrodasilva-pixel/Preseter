#include "SamplerInstrument.h"

#include <cmath>
#include <cstring>
#include <functional>
#include <algorithm>

namespace preseter
{
namespace sampler
{
namespace
{
juce::uint16 readU16 (const juce::uint8* p) noexcept
{
    return (juce::uint16) (p[0] | ((juce::uint16) p[1] << 8));
}

juce::uint32 readU32 (const juce::uint8* p) noexcept
{
    return (juce::uint32) p[0]
         | ((juce::uint32) p[1] << 8)
         | ((juce::uint32) p[2] << 16)
         | ((juce::uint32) p[3] << 24);
}

juce::int16 readI16 (const juce::uint8* p) noexcept
{
    return (juce::int16) readU16 (p);
}

struct Span
{
    const juce::uint8* data = nullptr;
    juce::uint32 size = 0;

    bool valid() const noexcept { return data != nullptr; }
};

Span findChunkIn (const juce::uint8* data, juce::uint32 size, const char* wanted)
{
    juce::uint32 pos = 0;
    while (pos + 8 <= size)
    {
        if (std::memcmp (data + pos, wanted, 4) == 0)
            return { data + pos + 8, readU32 (data + pos + 4) };

        const juce::uint32 len = readU32 (data + pos + 4);
        pos += 8 + len + (len & 1);
    }
    return {};
}

double timecentsToSeconds (double timecents) noexcept
{
    if (timecents <= -12000.0)
        return 0.0;
    return std::pow (2.0, timecents / 1200.0);
}

float centibelsToGain (float cb) noexcept
{
    return (float) std::pow (10.0, -cb / 200.0);
}

float centsToHz (float cents) noexcept
{
    return (float) (8.176 * std::pow (2.0, cents / 1200.0));
}

int noteNameToMidi (const juce::String& text)
{
    auto trimmed = text.trim();
    if (trimmed.isEmpty())
        return -1;

    if (trimmed.containsOnly ("0123456789-"))
        return juce::jlimit (0, 127, trimmed.getIntValue());

    static const char* names[] = { "c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b" };
    const auto lower = trimmed.toLowerCase();
    int index = -1;
    for (int i = 11; i >= 0; --i)
        if (lower.startsWith (names[i]))
        {
            index = i;
            break;
        }
    if (index < 0)
        return -1;

    const int prefix = (index == 0 || index == 2 || index == 4 || index == 5
                        || index == 7 || index == 9 || index == 11) ? 1 : 2;
    const int octave = lower.substring (prefix).getIntValue();
    return juce::jlimit (0, 127, (octave + 1) * 12 + index);
}

bool mapWav (const juce::File& file, std::shared_ptr<juce::MemoryMappedFile>& map,
             const juce::int16*& pcm, int& channels, juce::int64& frames)
{
    auto mapped = std::make_shared<juce::MemoryMappedFile> (file, juce::MemoryMappedFile::readOnly);
    const auto* base = static_cast<const juce::uint8*> (mapped->getData());
    const auto size = mapped->getSize();
    if (base == nullptr || size < 44)
        return false;

    if (std::memcmp (base, "RIFF", 4) != 0 || std::memcmp (base + 8, "WAVE", 4) != 0)
        return false;

    int format = 0;
    int bits = 0;
    channels = 1;
    juce::uint32 dataOffset = 0;
    juce::uint32 dataSize = 0;

    juce::uint32 pos = 12;
    while (pos + 8 <= size)
    {
        const juce::uint32 len = readU32 (base + pos + 4);
        if (std::memcmp (base + pos, "fmt ", 4) == 0 && len >= 16)
        {
            format = readU16 (base + pos + 8);
            channels = readU16 (base + pos + 10);
            bits = readU16 (base + pos + 22);
        }
        else if (std::memcmp (base + pos, "data", 4) == 0)
        {
            dataOffset = pos + 8;
            dataSize = len;
        }

        pos += 8 + len + (len & 1);
    }

    if (format != 1 || bits != 16 || channels < 1 || dataOffset == 0)
        return false;

    pcm = reinterpret_cast<const juce::int16*> (base + dataOffset);
    frames = dataSize / (juce::int64) (2 * channels);
    map = std::move (mapped);
    return frames > 0;
}

/** Converte FLAC/OGG/WAV 24 bits para um WAV 16 bits em cache (uma vez). */
bool ensureWavCache (const juce::File& source, const juce::File& destination, juce::String& error)
{
    if (destination.existsAsFile() && destination.getSize() > 64)
        return true;

    destination.getParentDirectory().createDirectory();

    juce::AudioFormatManager formats;
    formats.registerBasicFormats();
    std::unique_ptr<juce::AudioFormatReader> reader (formats.createReaderFor (source));
    if (reader == nullptr)
    {
        error = "Formato de sample nao suportado: " + source.getFullPathName();
        return false;
    }

    const auto temp = destination.getSiblingFile (destination.getFileName() + ".tmp");
    temp.deleteFile();

    {
        std::unique_ptr<juce::FileOutputStream> stream (temp.createOutputStream());
        if (stream == nullptr)
        {
            error = "Nao foi possivel gravar o cache: " + temp.getFullPathName();
            return false;
        }

        juce::WavAudioFormat wav;
        const int channels = juce::jlimit (1, 2, (int) reader->numChannels);
        std::unique_ptr<juce::AudioFormatWriter> writer (
            wav.createWriterFor (stream.get(), reader->sampleRate, (unsigned int) channels, 16, {}, 0));
        if (writer == nullptr)
        {
            error = "Nao foi possivel criar o WAV de cache: " + temp.getFullPathName();
            return false;
        }
        stream.release();

        juce::AudioBuffer<float> buffer (channels, 16384);
        const auto total = reader->lengthInSamples;
        for (juce::int64 start = 0; start < total; start += buffer.getNumSamples())
        {
            const int count = (int) juce::jmin ((juce::int64) buffer.getNumSamples(), total - start);
            buffer.clear();
            reader->read (&buffer, 0, count, start, true, true);
            if (! writer->writeFromAudioSampleBuffer (buffer, 0, count))
            {
                error = "Falha ao gravar o cache: " + temp.getFullPathName();
                return false;
            }
        }
        writer.reset();
    }

    if (! temp.moveFileTo (destination))
    {
        temp.deleteFile();
        error = "Nao foi possivel concluir o cache: " + destination.getFullPathName();
        return false;
    }
    return true;
}

juce::String cacheKeyFor (const juce::File& source)
{
    const auto signature = source.getFullPathName() + "|"
                         + juce::String (source.getSize()) + "|"
                         + juce::String (source.getLastModificationTime().toMilliseconds());
    return juce::String::toHexString (signature.hashCode64());
}
} // namespace

juce::File getSampleCacheFolder()
{
    auto folder = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                      .getChildFile ("Preseter")
                      .getChildFile ("sample-cache");
    folder.createDirectory();
    return folder;
}

int Instrument::addSf2Sample (const juce::int16* pcm, juce::int64 frames,
                              const std::shared_ptr<juce::MemoryMappedFile>& map)
{
    auto sample = std::make_unique<Sample>();
    sample->map = map;
    sample->pcm = pcm;
    sample->channels = 1;
    sample->frames = frames;
    samples.push_back (std::move (sample));
    return (int) samples.size() - 1;
}

int Instrument::addSampleFile (const juce::File& file)
{
    const auto key = file.getFullPathName();
    if (const auto found = sampleByPath.find (key); found != sampleByPath.end())
        return found->second;

    if (! file.existsAsFile())
    {
        missingSamples.addIfNotAlreadyThere (key);
        return -1;
    }

    const auto cached = getSampleCacheFolder().getChildFile (cacheKeyFor (file) + ".wav");
    juce::String error;
    if (! ensureWavCache (file, cached, error))
    {
        missingSamples.addIfNotAlreadyThere (file.getFileName() + ": " + error);
        return -1;
    }

    std::shared_ptr<juce::MemoryMappedFile> map;
    const juce::int16* pcm = nullptr;
    int channels = 1;
    juce::int64 frames = 0;
    if (! mapWav (cached, map, pcm, channels, frames))
    {
        missingSamples.addIfNotAlreadyThere (file.getFileName() + ": WAV de cache invalido");
        return -1;
    }

    auto sample = std::make_unique<Sample>();
    sample->map = std::move (map);
    sample->pcm = pcm;
    sample->channels = channels;
    sample->frames = frames;
    samples.push_back (std::move (sample));
    const int index = (int) samples.size() - 1;
    sampleByPath[key] = index;
    return index;
}

bool Instrument::load (const juce::File& file, juce::String& error)
{    presets.clear();
    regions.clear();
    samples.clear();
    sampleByPath.clear();
    programs.clear();
    missingSamples.clear();
    selectedProgram = 0;
    loaded = false;
    source = file;
    name = file.getFileNameWithoutExtension();

    if (! file.existsAsFile())
    {
        error = "Arquivo nao encontrado: " + file.getFullPathName();
        return false;
    }

    const auto extension = file.getFileExtension().toLowerCase();
    const bool ok = extension == ".sf2" ? loadSf2 (file, error) : loadSfz (file, error);
    if (! ok)
        return false;

    normalizePresets();
    loaded = true;
    return true;
}

/**
 * Equaliza o nível dos presets: algumas bibliotecas (MuseScore_General) usam
 * atenuação muito alta em certos instrumentos. Mede o RMS efetivo de amostras
 * do preset e aplica um ganho único, preservando a relação entre camadas.
 */
void Instrument::normalizePresets()
{
    for (auto& preset : presets)
    {
        std::vector<float> levels;
        const auto stride = juce::jmax<size_t> (1, preset.regions.size() / 24);
        for (size_t i = 0; i < preset.regions.size() && levels.size() < 24; i += stride)
        {
            const auto& region = preset.regions[i];
            const auto* sample = getSample (region.sample);
            if (sample == nullptr || sample->pcm == nullptr)
                continue;

            const auto start = juce::jlimit ((juce::int64) 0, juce::jmax ((juce::int64) 0, sample->frames - 1), region.start);
            const auto count = (int) juce::jmin ((juce::int64) 220500, sample->frames - start);
            if (count <= 8)
                continue;

            float peak = 0.0f;
            for (int f = 0; f < count; f += 4)
            {
                float value = 0.0f;
                if (sample->channels == 1)
                    value = sample->pcm[start + f] / 32768.0f;
                else
                {
                    const auto index = (start + f) * 2;
                    value = ((float) sample->pcm[index] + (float) sample->pcm[index + 1]) / 65536.0f;
                }
                peak = juce::jmax (peak, std::abs (value));
            }
            if (peak > 0.0001f)
                levels.push_back (peak * region.gain);
        }

        if (levels.size() < 2)
            continue;

        const float maximum = *std::max_element (levels.begin(), levels.end());
        const float scale = juce::jlimit (0.25f, 60.0f, 0.7f / juce::jmax (0.0005f, maximum));
        if (std::abs (scale - 1.0f) < 0.05f)
            continue;

        for (auto& region : preset.regions)
            region.gain *= scale;
    }
}

void Instrument::selectProgram (int bank, int program)
{
    if (presets.empty())
        return;

    int index = -1;
    for (int i = 0; i < (int) presets.size(); ++i)
        if (presets[(size_t) i].bank == bank && presets[(size_t) i].program == program)
        {
            index = i;
            break;
        }

    if (index < 0)
        index = juce::jlimit (0, (int) presets.size() - 1, program);

    selectProgramByIndex (index);
}

void Instrument::selectProgramByIndex (int index)
{
    if (presets.empty())
        return;
    selectedProgram = juce::jlimit (0, (int) presets.size() - 1, index);
    regions = presets[(size_t) selectedProgram].regions;
}

juce::var Instrument::getPresetList() const
{
    juce::Array<juce::var> list;
    for (const auto& preset : presets)
    {
        juce::DynamicObject::Ptr item (new juce::DynamicObject());
        item->setProperty ("name", preset.name);
        item->setProperty ("bank", preset.bank);
        item->setProperty ("program", preset.program);
        item->setProperty ("regions", (int) preset.regions.size());
        list.add (juce::var (item.get()));
    }
    return juce::var (list);
}

// ---------------------------------------------------------------------------
// SF2
// ---------------------------------------------------------------------------
bool Instrument::loadSf2 (const juce::File& file, juce::String& error)
{
    auto map = std::make_shared<juce::MemoryMappedFile> (file, juce::MemoryMappedFile::readOnly);
    const auto* base = static_cast<const juce::uint8*> (map->getData());
    const auto size = (juce::uint32) map->getSize();
    if (base == nullptr || size < 12 || std::memcmp (base, "RIFF", 4) != 0
        || std::memcmp (base + 8, "sfbk", 4) != 0)
    {
        error = "Arquivo nao e um SoundFont SF2 valido.";
        return false;
    }

    format = "SF2";
    Span smpl;
    Span pdta;

    const juce::uint32 total = juce::jmin (size, readU32 (base + 4) + 8);
    juce::uint32 pos = 12;
    while (pos + 8 <= total)
    {
        const juce::uint32 len = readU32 (base + pos + 4);
        const auto* payload = base + pos + 8;
        if (std::memcmp (base + pos, "LIST", 4) == 0 && len >= 4)
        {
            if (std::memcmp (payload, "sdta", 4) == 0)
                smpl = findChunkIn (payload + 4, len - 4, "smpl");
            else if (std::memcmp (payload, "pdta", 4) == 0)
                pdta = { payload + 4, len - 4 };
        }
        pos += 8 + len + (len & 1);
    }

    if (! smpl.valid() || ! pdta.valid())
    {
        error = "SoundFont sem os blocos sdta/pdta.";
        return false;
    }

    const auto phdr = findChunkIn (pdta.data, pdta.size, "phdr");
    const auto pbag = findChunkIn (pdta.data, pdta.size, "pbag");
    const auto pgen = findChunkIn (pdta.data, pdta.size, "pgen");
    const auto inst = findChunkIn (pdta.data, pdta.size, "inst");
    const auto ibag = findChunkIn (pdta.data, pdta.size, "ibag");
    const auto igen = findChunkIn (pdta.data, pdta.size, "igen");
    const auto shdr = findChunkIn (pdta.data, pdta.size, "shdr");
    if (! phdr.valid() || ! pbag.valid() || ! pgen.valid() || ! inst.valid()
        || ! ibag.valid() || ! igen.valid() || ! shdr.valid())
    {
        error = "SoundFont incompleto (faltam tabelas pdta).";
        return false;
    }

    const int presetCount = (int) (phdr.size / 38) - 1;
    const int bagCount = (int) (pbag.size / 4);
    const int genCount = (int) (igen.size / 4);
    const int instCount = (int) (inst.size / 22) - 1;
    const int ibagCount = (int) (ibag.size / 4);
    const int shdrCount = (int) (shdr.size / 46) - 1;

    struct SampleHeader
    {
        juce::String name;
        juce::uint32 start = 0, end = 0, loopStart = 0, loopEnd = 0, rate = 44100;
        int rootKey = 60;
        int correction = 0;
    };
    std::vector<SampleHeader> headers ((size_t) juce::jmax (0, shdrCount));
    for (int i = 0; i < shdrCount; ++i)
    {
        const auto* record = shdr.data + (size_t) i * 46;
        auto& header = headers[(size_t) i];
        header.name = juce::String::fromUTF8 (reinterpret_cast<const char*> (record), 20).trim();
        header.start = readU32 (record + 20);
        header.end = readU32 (record + 24);
        header.loopStart = readU32 (record + 28);
        header.loopEnd = readU32 (record + 32);
        header.rate = readU32 (record + 36);
        header.rootKey = record[40];
        header.correction = (int) (juce::int8) record[41];
    }

    const auto* pcm = reinterpret_cast<const juce::int16*> (smpl.data);
    const juce::int64 pcmFrames = (juce::int64) (smpl.size / 2);
    std::vector<int> sampleIds ((size_t) juce::jmax (0, shdrCount), -1);

    auto sampleIdFor = [&] (int index) -> int
    {
        if (index < 0 || index >= (int) sampleIds.size())
            return -1;
        if (sampleIds[(size_t) index] < 0)
            sampleIds[(size_t) index] = addSf2Sample (pcm, pcmFrames, map);
        return sampleIds[(size_t) index];
    };

    struct GenState
    {
        int keyLow = 0, keyHigh = 127, velLow = 1, velHigh = 127;
        int rootKey = -1;
        double tuneCents = 0.0;
        float attenuationCb = 0.0f;
        float pan = 0.0f;
        double attackTc = -12000.0, holdTc = -12000.0, decayTc = -12000.0, releaseTc = -12000.0;
        float sustainCb = 0.0f;
        float cutoffCents = 13500.0f;
        float qCb = 0.0f;
        int sampleModes = 0;
        int sampleId = -1;
        int presetInstrument = -1;
        juce::int64 startOffset = 0, endOffset = 0, loopStartOffset = 0, loopEndOffset = 0;
    };

    auto applyGen = [] (GenState& state, int oper, juce::int16 amount)
    {
        switch (oper)
        {
            case 0:  state.startOffset += amount; break;
            case 1:  state.endOffset += amount; break;
            case 2:  state.loopStartOffset += amount; break;
            case 3:  state.loopEndOffset += amount; break;
            case 4:  state.startOffset += (juce::int64) amount * 32768; break;
            case 12: state.endOffset += (juce::int64) amount * 32768; break;
            case 45: state.loopStartOffset += (juce::int64) amount * 32768; break;
            case 50: state.loopEndOffset += (juce::int64) amount * 32768; break;
            case 8:  state.cutoffCents += (float) amount; break;
            case 9:  state.qCb += (float) amount; break;
            case 17: state.pan = (float) amount / 500.0f; break;
            case 33: state.attackTc = amount; break;
            case 34: state.attackTc = amount; break;
            case 35: state.holdTc = amount; break;
            case 36: state.decayTc = amount; break;
            case 37: state.sustainCb = (float) amount; break;
            case 38: state.releaseTc = amount; break;
            case 43: state.keyLow = (int) (juce::uint8) amount; state.keyHigh = (int) ((juce::uint16) amount >> 8); break;
            case 44: state.velLow = (int) (juce::uint8) amount; state.velHigh = (int) ((juce::uint16) amount >> 8); break;
            case 48: state.attenuationCb += (float) amount; break;
            case 51: state.tuneCents += (double) amount * 100.0; break;
            case 52: state.tuneCents += (double) amount; break;
            case 53: state.sampleId = (int) (juce::uint16) amount; break;
            case 54: state.sampleModes = (int) amount; break;
            case 58: state.rootKey = (int) amount; break;
            case 41: state.presetInstrument = (int) (juce::uint16) amount; break;
            default: break;
        }
    };

    auto readZone = [&] (const juce::uint8* bagData, int bagIndex, int bagTotal,
                         const juce::uint8* genData, int genTotal, GenState& state)
    {
        const int genStart = readU16 (bagData + (size_t) bagIndex * 4);
        const int genEnd = bagIndex + 1 < bagTotal
            ? readU16 (bagData + (size_t) (bagIndex + 1) * 4)
            : genTotal;
        for (int g = genStart; g < genEnd && g < genTotal; ++g)
        {
            const auto* record = genData + (size_t) g * 4;
            applyGen (state, (int) readU16 (record), readI16 (record + 2));
        }
    };

    for (int p = 0; p < presetCount; ++p)
    {
        const auto* record = phdr.data + (size_t) p * 38;
        Preset preset;
        preset.name = juce::String::fromUTF8 (reinterpret_cast<const char*> (record), 20).trim();
        preset.program = readU16 (record + 20);
        preset.bank = readU16 (record + 22);
        const int presetBagStart = readU16 (record + 24);
        const int presetBagEnd = p + 1 < presetCount
            ? readU16 (phdr.data + (size_t) (p + 1) * 38 + 24)
            : bagCount;



        GenState presetDefaults;
        for (int pb = presetBagStart; pb < presetBagEnd && pb < bagCount; ++pb)
        {
            GenState zone = presetDefaults;
            readZone (pbag.data, pb, bagCount, pgen.data, genCount, zone);


            if (zone.presetInstrument < 0)
            {
                presetDefaults = zone;
                continue;
            }

            const int instrumentIndex = zone.presetInstrument;
            if (instrumentIndex < 0 || instrumentIndex >= instCount)
                continue;

            const auto* instRecord = inst.data + (size_t) instrumentIndex * 22;
            const int instBagStart = readU16 (instRecord + 20);
            const int instBagEnd = instrumentIndex + 1 < instCount
                ? readU16 (inst.data + (size_t) (instrumentIndex + 1) * 22 + 20)
                : ibagCount;

            GenState instDefaults = zone;
            for (int ib = instBagStart; ib < instBagEnd && ib < ibagCount; ++ib)
            {
                GenState instrumentZone = instDefaults;
                const int genStart = readU16 (ibag.data + (size_t) ib * 4);
                const int genEnd = ib + 1 < ibagCount
                    ? readU16 (ibag.data + (size_t) (ib + 1) * 4)
                    : genCount;
                for (int g = genStart; g < genEnd && g < genCount; ++g)
                {
                    const auto* genRecord = igen.data + (size_t) g * 4;
                    applyGen (instrumentZone, (int) readU16 (genRecord), readI16 (genRecord + 2));
                }

                if (instrumentZone.sampleId < 0)
                {
                    instDefaults = instrumentZone;
                    continue;
                }



                if (instrumentZone.sampleId >= shdrCount)
                    continue;

                const auto& header = headers[(size_t) instrumentZone.sampleId];
                Region region;
                region.keyLow = juce::jmax (zone.keyLow, instrumentZone.keyLow);
                region.keyHigh = juce::jmin (zone.keyHigh, instrumentZone.keyHigh);
                region.velLow = juce::jmax (zone.velLow, instrumentZone.velLow);
                region.velHigh = juce::jmin (zone.velHigh, instrumentZone.velHigh);
                if (region.keyLow > region.keyHigh || region.velLow > region.velHigh)
                    continue;

                region.rootKey = instrumentZone.rootKey >= 0 ? instrumentZone.rootKey : header.rootKey;
                region.sample = sampleIdFor (instrumentZone.sampleId);
                if (region.sample < 0)
                    continue;

                region.start = juce::jmax ((juce::int64) 0, (juce::int64) header.start + instrumentZone.startOffset);
                region.end = juce::jmin ((juce::int64) header.end + instrumentZone.endOffset, pcmFrames);
                region.loopStart = juce::jmax (region.start, (juce::int64) header.loopStart + instrumentZone.loopStartOffset);
                region.loopEnd = juce::jmin (region.end, (juce::int64) header.loopEnd + instrumentZone.loopEndOffset);
                region.loop = instrumentZone.sampleModes == 1 || instrumentZone.sampleModes == 3;
                region.loopSustain = instrumentZone.sampleModes == 3;
                region.sampleRate = header.rate > 0 ? (double) header.rate : 44100.0;
                region.tuneCents += instrumentZone.tuneCents + (double) header.correction;
                region.gain = centibelsToGain (instrumentZone.attenuationCb);
                region.pan = juce::jlimit (-1.0f, 1.0f, instrumentZone.pan);
                region.attack = (float) timecentsToSeconds (instrumentZone.attackTc);
                region.decay = (float) timecentsToSeconds (instrumentZone.decayTc);
                region.sustain = centibelsToGain (instrumentZone.sustainCb);
                region.release = (float) timecentsToSeconds (instrumentZone.releaseTc);
                region.cutoff = juce::jlimit (20.0f, 20000.0f, centsToHz (instrumentZone.cutoffCents));
                region.resonance = juce::jlimit (0.0f, 1.0f, instrumentZone.qCb / 1000.0f);
                region.label = header.name;
                preset.regions.push_back (region);
            }
        }

        if (! preset.regions.empty())
        {
            programs.add (preset.name);
            presets.push_back (std::move (preset));
        }
    }

    if (presets.empty())
    {
        error = "SoundFont sem presets tocaveis.";
        return false;
    }

    selectProgram (0, 0);
    return true;
}

// ---------------------------------------------------------------------------
// SFZ
// ---------------------------------------------------------------------------
bool Instrument::loadSfz (const juce::File& file, juce::String& error)
{
    format = "SFZ";

    struct OpSet
    {
        std::map<juce::String, juce::String> values;
        void set (const juce::String& key, const juce::String& value) { values[key] = value; }
        juce::String get (const juce::String& key, const juce::String& fallback = {}) const
        {
            const auto found = values.find (key);
            return found != values.end() ? found->second : fallback;
        }
        bool has (const juce::String& key) const { return values.find (key) != values.end(); }
    };

    struct State
    {
        std::map<juce::String, juce::String> macros;
        OpSet global, master, group, region;
        juce::String defaultPath;
        bool inRegion = false;
        int depth = 0;
    } state;

    std::vector<Region> parsed;
    bool failed = false;
    int attempts = 0, noSample = 0, ccSkip = 0, swSkip = 0;

    auto expand = [&state] (juce::String text)
    {
        if (! text.containsChar ('$'))
            return text;

        juce::String out;
        for (int i = 0; i < text.length(); ++i)
        {
            const auto ch = text[i];
            if (ch != '$')
            {
                out += ch;
                continue;
            }
            int end = i + 1;
            while (end < text.length()
                   && (juce::CharacterFunctions::isLetterOrDigit (text[end]) || text[end] == '_'))
                ++end;
            const auto name = text.substring (i + 1, end);
            const auto found = state.macros.find (name);
            if (found != state.macros.end())
                out += found->second;
            else
                out += "$" + name;
            i = end - 1;
        }
        return out;
    };

    auto merged = [&state] (const OpSet& extra)
    {
        OpSet result = state.global;
        for (const auto& entry : state.master.values) result.values[entry.first] = entry.second;
        for (const auto& entry : state.group.values) result.values[entry.first] = entry.second;
        for (const auto& entry : extra.values) result.values[entry.first] = entry.second;
        return result;
    };

    auto parseNumber = [] (const juce::String& text, double fallback)
    {
        const auto trimmed = text.trim();
        if (trimmed.isEmpty())
            return fallback;
        if (trimmed.containsOnly ("0123456789+-."))
            return trimmed.getDoubleValue();
        return fallback;
    };

    std::function<void (const juce::File&)> parseFile;

    enum class Section { global, master, group, region };
    Section sectionKind = Section::global;

    auto applyOps = [&] (const juce::String& text)
    {
        juce::StringArray tokens;
        tokens.addTokens (text, " \t", "");
        for (const auto& token : tokens)
        {
            if (token.isEmpty())
                continue;
            const int equals = token.indexOfChar ('=');
            if (equals <= 0)
                continue;
            const auto key = expand (token.substring (0, equals).trim()).toLowerCase();
            const auto value = expand (token.substring (equals + 1).trim());
            if (key == "default_path")
                state.defaultPath = value;
            if (sectionKind == Section::region)      state.region.set (key, value);
            else if (sectionKind == Section::global) state.global.set (key, value);
            else if (sectionKind == Section::master) state.master.set (key, value);
            else                                     state.group.set (key, value);
        }
    };

    auto finalizeRegion = [&]()
    {
        if (! state.inRegion)
            return;
        state.inRegion = false;

        OpSet ops = merged (state.region);
        state.region = {};
        ++attempts;
        if (! ops.has ("sample"))
        {
            ++noSample;
            return;
        }

        // Regiões condicionadas a CC ainda não são avaliadas: ignorar evita
        // disparar pedal/hammer/resonance fora de hora.
        for (const auto& entry : ops.values)
        {
            const auto& key = entry.first;
            if (key.startsWith ("on_locc") || key.startsWith ("on_hicc")
                || key.startsWith ("locc") || key.startsWith ("hicc"))
            {
                ++ccSkip;
                return;
            }
        }

        // Keyswitch: sem teclas de troca, toca só a variante padrão ($NATURAL).
        if (ops.has ("sw_last"))
        {
            const auto last = noteNameToMidi (ops.get ("sw_last"));
            const auto def = ops.has ("sw_default") ? noteNameToMidi (ops.get ("sw_default")) : -1;
            if (def >= 0 && last >= 0 && last != def)
            {
                ++swSkip;
                return;
            }
        }

        const auto sampleName = ops.get ("sample");
        const auto defaultPath = state.defaultPath.isNotEmpty() ? state.defaultPath
                                                                : ops.get ("default_path");
        juce::File sample;
        if (juce::File::isAbsolutePath (sampleName))
        {
            sample = juce::File (sampleName);
        }
        else
        {
            auto base = file.getParentDirectory();
            if (defaultPath.isNotEmpty())
                base = base.getChildFile (defaultPath);
            sample = base.getChildFile (sampleName);
        }

        const int sampleIndex = addSampleFile (sample);
        if (sampleIndex < 0)
            return;

        Region region;
        region.sample = sampleIndex;
        region.label = sampleName;

        auto noteOr = [&] (const char* key, int fallback)
        {
            if (! ops.has (key))
                return fallback;
            const int note = noteNameToMidi (ops.get (key));
            return note >= 0 ? note : fallback;
        };

        if (ops.has ("key"))
        {
            region.keyLow = noteOr ("key", 0);
            region.keyHigh = region.keyLow;
        }
        else
        {
            region.keyLow = noteOr ("lokey", 0);
            region.keyHigh = noteOr ("hikey", 127);
        }

        region.velLow = juce::jlimit (1, 127, (int) parseNumber (ops.get ("lovel", "1"), 1));
        region.velHigh = juce::jlimit (1, 127, (int) parseNumber (ops.get ("hivel", "127"), 127));
        region.rootKey = noteOr ("pitch_keycenter", region.keyLow);
        region.tuneCents = parseNumber (ops.get ("tune", "0"), 0)
                         + parseNumber (ops.get ("transpose", "0"), 0) * 100.0;

        const auto& sampleData = *samples[(size_t) sampleIndex];
        const juce::int64 frames = sampleData.frames;
        region.start = juce::jlimit ((juce::int64) 0, frames, (juce::int64) parseNumber (ops.get ("offset", "0"), 0));
        region.end = juce::jlimit (region.start, frames,
                                   ops.has ("end") ? (juce::int64) parseNumber (ops.get ("end"), (double) frames)
                                                   : frames);
        region.loopStart = juce::jlimit (region.start, region.end,
                                         ops.has ("loop_start") ? (juce::int64) parseNumber (ops.get ("loop_start"), 0) + region.start
                                                                : region.start);
        region.loopEnd = juce::jlimit (region.loopStart, region.end,
                                       ops.has ("loop_end") ? (juce::int64) parseNumber (ops.get ("loop_end"), 0) + region.start
                                                            : region.end);

        const auto loopMode = ops.get ("loop_mode", ops.get ("loopmode", ""));
        region.loop = loopMode == "loop_continuous" || loopMode == "loop_sustain";
        region.loopSustain = loopMode == "loop_sustain";
        if (! ops.has ("loop_end") && region.loop)
        {
            region.loopStart = region.start;
            region.loopEnd = region.end;
        }

        region.sampleRate = (double) parseNumber (ops.get ("sample_rate", "0"), 0);
        if (region.sampleRate <= 0)
        {
            const auto cached = getSampleCacheFolder().getChildFile (cacheKeyFor (sample) + ".wav");
            juce::MemoryMappedFile map (cached, juce::MemoryMappedFile::readOnly);
            const auto* base = static_cast<const juce::uint8*> (map.getData());
            const auto size = map.getSize();
            region.sampleRate = 44100.0;
            juce::uint32 pos = 12;
            while (base != nullptr && pos + 8 <= size)
            {
                const juce::uint32 len = readU32 (base + pos + 4);
                if (std::memcmp (base + pos, "fmt ", 4) == 0 && len >= 16)
                {
                    region.sampleRate = (double) readU32 (base + pos + 12);
                    break;
                }
                pos += 8 + len + (len & 1);
            }
        }

        region.gain = (float) std::pow (10.0, parseNumber (ops.get ("volume", "0"), 0) / 20.0);
        region.pan = juce::jlimit (-1.0f, 1.0f, (float) parseNumber (ops.get ("pan", "0"), 0) / 100.0f);
        region.attack = juce::jmax (0.0f, (float) parseNumber (ops.get ("ampeg_attack", "0"), 0));
        region.decay = juce::jmax (0.0f, (float) parseNumber (ops.get ("ampeg_decay", "0"), 0));
        region.sustain = juce::jlimit (0.0f, 1.0f, (float) parseNumber (ops.get ("ampeg_sustain", "100"), 100) / 100.0f);
        region.release = juce::jmax (0.0f, (float) parseNumber (ops.get ("ampeg_release", "0.05"), 0.05));
        region.velTrack = juce::jlimit (0.0f, 1.0f, (float) parseNumber (ops.get ("amp_veltrack", "100"), 100) / 100.0f);
        region.cutoff = juce::jlimit (20.0f, 20000.0f, (float) parseNumber (ops.get ("cutoff", "20000"), 20000));
        region.resonance = juce::jlimit (0.0f, 1.0f, (float) parseNumber (ops.get ("resonance", "0"), 0) / 30.0f);
        region.releaseTrigger = ops.get ("trigger", "") == "release";
        region.group = (int) parseNumber (ops.get ("group", "0"), 0);
        region.offBy = (int) parseNumber (ops.get ("off_by", "0"), 0);
        region.rtDecay = (float) parseNumber (ops.get ("rt_decay", "0"), 0);

        parsed.push_back (region);
    };

    parseFile = [&] (const juce::File& current)
    {
        if (failed || state.depth > 8 || ! current.existsAsFile())
            return;
        ++state.depth;

        juce::StringArray lines;
        lines.addLines (current.loadFileAsString());

        for (auto rawLine : lines)
        {
            auto line = rawLine.trim();
            if (line.isEmpty() || line.startsWith ("//"))
                continue;

            const int comment = line.indexOf ("//");
            if (comment >= 0)
                line = line.substring (0, comment).trim();
            if (line.isEmpty())
                continue;

            if (line.startsWithIgnoreCase ("#define"))
            {
                const auto rest = line.substring (7).trim();
                if (rest.startsWithChar ('$'))
                {
                    int end = 1;
                    while (end < rest.length()
                           && (juce::CharacterFunctions::isLetterOrDigit (rest[end]) || rest[end] == '_'))
                        ++end;
                    state.macros[rest.substring (1, end)] = rest.substring (end).trim();
                }
                continue;
            }

            if (line.startsWithChar ('<'))
            {
                finalizeRegion();
                const auto close = line.indexOfChar ('>');
                const auto section = line.substring (1, juce::jmax (1, close)).trim().toLowerCase();
                if (section == "region")
                {
                    state.region = {};
                    state.inRegion = true;
                    sectionKind = Section::region;
                }
                else if (section == "group")
                {
                    state.group = state.master;
                    sectionKind = Section::group;
                }
                else if (section == "master")
                {
                    state.master = state.global;
                    state.group = state.master;
                    sectionKind = Section::master;
                }
                else if (section == "global")
                {
                    state.global = {};
                    state.master = {};
                    state.group = {};
                    sectionKind = Section::global;
                }
                else
                {
                    sectionKind = Section::global;
                }

                line = close < 0 ? juce::String() : line.substring (close + 1).trim();
                if (line.isEmpty())
                    continue;
            }

            // Inclusões no meio da linha: o Salamander usa
            // `<group> #include "vel_01.txt" lovel=1 hivel=26 #include "region.txt"`.
            while (true)
            {
                const int includeAt = line.indexOfIgnoreCase ("#include");
                if (includeAt < 0)
                    break;

                const auto before = line.substring (0, includeAt).trim();
                if (before.isNotEmpty())
                    applyOps (before);

                auto rest = line.substring (includeAt + 8).trim();
                juce::String target;
                if (rest.startsWithChar ('"'))
                {
                    const int quote = rest.indexOfChar (1, '"');
                    target = rest.substring (1, quote);
                    rest = rest.substring (quote + 1);
                }
                else
                {
                    const int space = rest.indexOfChar (' ');
                    target = space < 0 ? rest : rest.substring (0, space);
                    rest = space < 0 ? juce::String() : rest.substring (space + 1);
                }

                // Caminhos de include são relativos ao SFZ raiz, não ao arquivo atual.
                parseFile (file.getParentDirectory().getChildFile (expand (target)));
                line = rest.trim();            }

            if (line.isNotEmpty())
                applyOps (line);
        }

        --state.depth;
    };

    parseFile (file);
    finalizeRegion();

    if (failed)
    {
        error = "Falha ao ler o SFZ.";
        return false;
    }

    if (parsed.empty())
    {
        error = "SFZ sem regioes tocaveis (" + juce::String (attempts) + " zonas, "
              + juce::String (ccSkip) + " por CC, " + juce::String (swSkip) + " por keyswitch, "
              + juce::String (missingSamples.size()) + " samples faltando).";
        return false;
    }

    Preset preset;
    preset.name = name;
    preset.regions = std::move (parsed);
    programs.add (preset.name);
    presets.push_back (std::move (preset));
    selectProgram (0, 0);
    return true;
}

} // namespace sampler
} // namespace preseter
