#include "MdaFactories.h"

#include "../../third_party/mda-piano/PluginProcessor.h"

namespace preseter
{
namespace native
{
std::unique_ptr<juce::AudioProcessor> createMdaPiano()
{
    return std::make_unique<MDAPianoAudioProcessor>();
}

int mdaPianoActiveVoices (juce::AudioProcessor* processor)
{
    if (auto* piano = dynamic_cast<MDAPianoAudioProcessor*> (processor))
        return piano->getNumActiveVoices();
    return 0;
}
} // namespace native
} // namespace preseter
