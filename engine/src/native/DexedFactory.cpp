#include "DexedFactory.h"

#include "../../third_party/dexed/source/PluginProcessor.h"
#include "../../third_party/dexed/source/core/Cartridge.h"

#include "BinaryData.h"

#include <algorithm>
#include <memory>
#include <set>

namespace preseter
{
namespace native
{
namespace
{
/**
 * Dexed nativo do Preseter.
 *
 * O Dexed original expõe os 32 programas de um único cartucho. O Preseter
 * carrega todos os cartuchos de fábrica (Dexed_01 + SynprezFM_01..32) e os
 * cartuchos .syx importados pelo usuário em uma lista plana, para que a
 * biblioteca de Timbres e o `programIndex` do patch enxerguem tudo.
 */
class PreseterDexedProcessor final : public DexedAudioProcessor
{
public:
    PreseterDexedProcessor()
    {
        loadBank();
    }

    /** Relê os cartuchos (depois de importar um .syx). */
    void reloadBank()
    {
        const int current = flatProgram;
        loadBank();
        if (! bank.empty())
            setCurrentProgram (current);
    }

    int getNumPrograms() override
    {
        return bank.empty() ? 1 : (int) (bank.size() * 32);
    }

    int getCurrentProgram() override
    {
        return flatProgram;
    }

    void setCurrentProgram (int index) override
    {
        if (bank.empty())
            return;

        const int count = (int) (bank.size() * 32);
        const int flat = juce::jlimit (0, count - 1, index);
        const int cart = flat / 32;
        const int program = flat % 32;

        if (cart != cartIndex)
        {
            loadCartridge (bank[(size_t) cart]);
            cartIndex = cart;
        }

        DexedAudioProcessor::setCurrentProgram (program);
        flatProgram = flat;
    }

    const juce::String getProgramName (int index) override
    {
        if (bank.empty())
            return "Init";

        const int count = (int) (bank.size() * 32);
        const int flat = juce::jlimit (0, count - 1, index);
        const int cart = flat / 32;
        const int program = flat % 32;
        return bankNames[(size_t) cart] + " · " + bank[(size_t) cart].getProgramName (program);
    }

private:
    std::vector<Cartridge> bank;
    std::vector<juce::String> bankNames;
    int cartIndex = 0;
    int flatProgram = 0;

    static juce::String bankLabel (const juce::String& fileName)
    {
        const auto stem = juce::File (fileName).getFileNameWithoutExtension();
        const auto number = stem.fromLastOccurrenceOf ("_", false, false);

        if (stem.startsWithIgnoreCase ("Dexed_"))
            return "Dexed " + number;
        if (stem.startsWithIgnoreCase ("SynprezFM_"))
            return "Synprez " + number;
        return stem;
    }

    static int bankOrder (const juce::String& fileName)
    {
        const auto name = juce::File (fileName).getFileName();
        if (name.equalsIgnoreCase ("Dexed_01.syx")) return 0;
        if (name.startsWithIgnoreCase ("Dexed_")) return 1;
        if (name.startsWithIgnoreCase ("SynprezFM_")) return 2;
        return 3;
    }

    void appendCart (const juce::String& fileName, Cartridge cart, std::set<juce::String>& loaded)
    {
        const auto name = juce::File (fileName).getFileName();
        if (! loaded.insert (name.toLowerCase()).second)
            return;

        bank.push_back (cart);
        bankNames.push_back (bankLabel (name));
    }

    void loadBank()
    {
        bank.clear();
        bankNames.clear();
        cartIndex = 0;
        flatProgram = 0;

        std::set<juce::String> loaded;

        // 1) Cartuchos de fábrica compilados no binário.
        {
            std::unique_ptr<juce::InputStream> stream (new juce::MemoryInputStream (
                BinaryData::builtin_pgm_zip, (size_t) BinaryData::builtin_pgm_zipSize, false));
            juce::ZipFile zip (stream.get(), false);

            std::vector<juce::String> names;
            for (int i = 0; i < zip.getNumEntries(); ++i)
            {
                const auto* entry = zip.getEntry (i);
                if (entry == nullptr || entry->filename.endsWithChar ('/'))
                    continue;
                if (entry->filename.endsWithIgnoreCase (".syx"))
                    names.push_back (entry->filename);
            }

            std::sort (names.begin(), names.end(), [] (const juce::String& a, const juce::String& b)
            {
                const int orderA = bankOrder (a);
                const int orderB = bankOrder (b);
                if (orderA != orderB) return orderA < orderB;
                return a.compareNatural (b) < 0;
            });

            for (const auto& name : names)
            {
                const int index = zip.getIndexOfFileName (name, true);
                if (index < 0)
                    continue;
                std::unique_ptr<juce::InputStream> cartStream (zip.createStreamForEntry (index));
                if (cartStream == nullptr)
                    continue;

                Cartridge cart;
                if (cart.load (*cartStream) != 0)
                    continue;
                appendCart (name, cart, loaded);
            }
        }

        // 2) Cartuchos do usuário (importados pela interface). Os nomes já
        //    embutidos são ignorados para não duplicar os bancos de fábrica.
        juce::Array<juce::File> files;
        dexedCartDir.findChildFiles (files, juce::File::findFiles, true, "*.syx");
        juce::File::NaturalFileComparator comparator (true);
        files.sort (comparator);

        for (const auto& file : files)
        {
            if (file.getParentDirectory().getFileName().equalsIgnoreCase ("SynprezFM")
                && file.getFileName().startsWithIgnoreCase ("SynprezFM_"))
                continue;

            Cartridge cart;
            if (cart.load (file) != 0)
                continue;
            appendCart (file.getFileName(), cart, loaded);
        }

        if (! bank.empty())
            setCurrentProgram (0);
    }
};
} // namespace

std::unique_ptr<juce::AudioProcessor> createDexed()
{
    return std::make_unique<PreseterDexedProcessor>();
}

int dexedActiveVoices (juce::AudioProcessor* processor)
{
    if (auto* dexed = dynamic_cast<PreseterDexedProcessor*> (processor))
        return dexed->countActiveVoices();
    return 0;
}

bool reloadDexedBank (juce::AudioProcessor* processor)
{
    if (auto* dexed = dynamic_cast<PreseterDexedProcessor*> (processor))
    {
        dexed->reloadBank();
        return true;
    }
    return false;
}
} // namespace native
} // namespace preseter
