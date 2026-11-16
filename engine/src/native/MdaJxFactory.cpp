#include "MdaFactories.h"

#include "../../third_party/mda-jx10/PluginProcessor.h"

namespace preseter
{
namespace native
{
std::unique_ptr<juce::AudioProcessor> createMdaJx10()
{
    return std::make_unique<JX10AudioProcessor>();
}

int mdaJxActiveVoices (juce::AudioProcessor* processor)
{
    if (auto* jx = dynamic_cast<JX10AudioProcessor*> (processor))
        return jx->getNumActiveVoices();
    return 0;
}
} // namespace native
} // namespace preseter
