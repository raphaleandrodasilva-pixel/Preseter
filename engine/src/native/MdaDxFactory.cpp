#include "MdaFactories.h"

#include "../../third_party/mda-dx10/PluginProcessor.h"

namespace preseter
{
namespace native
{
std::unique_ptr<juce::AudioProcessor> createMdaDx10()
{
    return std::make_unique<DX10AudioProcessor>();
}

int mdaDxActiveVoices (juce::AudioProcessor* processor)
{
    if (auto* dx = dynamic_cast<DX10AudioProcessor*> (processor))
        return dx->getNumActiveVoices();
    return 0;
}
} // namespace native
} // namespace preseter
