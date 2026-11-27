#pragma once

#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_core/juce_core.h>

#include <map>
#include <memory>
#include <set>
#include <vector>

namespace preseter
{
namespace sampler
{
/** PCM 16 bits intercalado, lido direto de um arquivo mapeado em memória. */
struct Sample
{
    std::shared_ptr<juce::MemoryMappedFile> map;
    const juce::int16* pcm = nullptr;
    int channels = 1;
    juce::int64 frames = 0;
};

/** Uma zona tocável: faixa de teclas/velocity, sample e parâmetros de som. */
struct Region
{
    int keyLow = 0;
    int keyHigh = 127;
    int velLow = 1;
    int velHigh = 127;
    int rootKey = 60;
    int sample = -1;
    juce::int64 start = 0;
    juce::int64 end = 0;
    juce::int64 loopStart = 0;
    juce::int64 loopEnd = 0;
    bool loop = false;
    bool loopSustain = false;
    bool releaseTrigger = false;
    double tuneCents = 0.0;
    double sampleRate = 44100.0;
    float gain = 1.0f;
    float pan = 0.0f;
    float attack = 0.0f;
    float decay = 0.0f;
    float sustain = 1.0f;
    float release = 0.2f;
    float velTrack = 1.0f;
    float cutoff = 20000.0f;
    float resonance = 0.0f;
    int group = 0;
    int offBy = 0;
    float rtDecay = 0.0f;
    juce::String label;
};

/**
 * Leitor de SF2 e SFZ. Converte o mínimo possível: SF2 é mapeado direto;
 * samples de SFZ (FLAC/WAV) viram um WAV 16 bits em cache na primeira carga e
 * depois são mapeados, para tocar sem decodificar nada na thread de áudio.
 */
class Instrument
{
public:
    bool load (const juce::File& file, juce::String& error);
    void selectProgram (int bank, int program);
    void selectProgramByIndex (int index);
    /** Cópia leve para outro programa, compartilhando os samples mapeados. */
    std::shared_ptr<Instrument> cloneForProgram (int bank, int program) const;

    const std::vector<Region>& getRegions() const noexcept { return regions; }
    const Sample* getSample (int index) const noexcept
    {
        return index >= 0 && index < (int) samples.size() ? samples[(size_t) index].get() : nullptr;
    }
    const juce::String& getName() const noexcept { return name; }
    const juce::String& getFormat() const noexcept { return format; }
    const juce::StringArray& getPrograms() const noexcept { return programs; }
    const juce::StringArray& getMissingSamples() const noexcept { return missingSamples; }
    juce::String getSourcePath() const { return source.getFullPathName(); }
    int getProgramCount() const noexcept { return (int) presets.size(); }
    int getSelectedProgram() const noexcept { return selectedProgram; }
    int getRegionCount() const noexcept { return (int) regions.size(); }
    int getSampleCount() const noexcept { return (int) samples.size(); }
    juce::var getPresetList() const;
    int getPresetBank (int index) const;
    int getPresetProgram (int index) const;
    bool isLoaded() const noexcept { return loaded; }

private:
    void normalizePresets();
    struct Preset
    {
        juce::String name;
        int bank = 0;
        int program = 0;
        std::vector<Region> regions;
    };

    bool loadSf2 (const juce::File& file, juce::String& error);
    bool loadSfz (const juce::File& file, juce::String& error);
    int addSampleFile (const juce::File& file);
    int addSf2Sample (const juce::int16* pcm, juce::int64 frames,
                      const std::shared_ptr<juce::MemoryMappedFile>& map);

    juce::File source;
    juce::String name;
    juce::String format;
    bool loaded = false;
    int selectedProgram = 0;
    std::vector<Preset> presets;
    std::vector<Region> regions;
    std::vector<std::unique_ptr<Sample>> samples;
    std::map<juce::String, int> sampleByPath;
    juce::StringArray programs;
    juce::StringArray missingSamples;
};

/** Pasta de cache dos samples convertidos. */
juce::File getSampleCacheFolder();

/**
 * Cache de instrumentos já lidos. A troca de patch fica instantânea quando o
 * arquivo (e o programa) já foi carregado nesta sessão.
 */
class InstrumentCache
{
public:
    /** Resultado de uma preparação síncrona (abrir concert / depurar lentidão). */
    struct PrepareResult
    {
        bool ok = false;
        bool cacheHit = false;
        juce::String error;
        juce::String name;
        juce::String format;
        int regions = 0;
        int samples = 0;
        juce::int64 fileBytes = 0;
        double ms = 0.0;
    };

    /** Situação do cache para diagnóstico e para dimensionar o concert. */
    struct Stats
    {
        int files = 0;
        int entries = 0;
        int maxFiles = 0;
        int maxEntries = 0;
        juce::int64 hits = 0;
        juce::int64 misses = 0;
        juce::int64 evictions = 0;
    };

    static InstrumentCache& get();

    std::shared_ptr<Instrument> load (const juce::File& file, int bank, int program,
                                      juce::String& error);
    /** Carrega de forma síncrona e mede; usado para preparar o concert inteiro. */
    bool prepare (const juce::File& file, int bank, int program, PrepareResult& result);
    void preloadAsync (const juce::File& file, int bank, int program);
    /** Garante espaço para o conjunto do concert não ser descartado no meio. */
    void reserve (int filesNeeded, int programsNeeded);
    Stats stats() const;
    void clear();

private:
    struct Entry
    {
        juce::String key;
        std::shared_ptr<Instrument> instrument;
    };

    struct FileEntry
    {
        juce::String key;
        std::shared_ptr<Instrument> instrument;
    };

    struct PreloadJob
    {
        juce::File file;
        int bank = 0;
        int program = 0;
    };

    static constexpr int kDefaultMaxFiles = 16;
    static constexpr int kDefaultMaxEntries = 128;
    juce::CriticalSection lock;
    juce::CriticalSection preloadLock;
    std::vector<Entry> entries;
    std::vector<FileEntry> files;
    std::vector<PreloadJob> preloadQueue;
    std::set<juce::String> preloadQueued;
    bool preloadRunning = false;
    int maxFiles = kDefaultMaxFiles;
    int maxEntries = kDefaultMaxEntries;
    juce::int64 hits = 0;
    juce::int64 misses = 0;
    juce::int64 evictions = 0;
};
} // namespace sampler
} // namespace preseter
