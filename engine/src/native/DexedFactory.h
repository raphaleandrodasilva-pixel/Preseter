#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

namespace preseter
{
namespace native
{
/** Cria o motor do Dexed com os cartuchos de fábrica embutidos. */
std::unique_ptr<juce::AudioProcessor> createDexed();

/** Vozes ativas do Dexed (0 se o processor não for o porte). */
int dexedActiveVoices (juce::AudioProcessor* processor);

/** Relê os cartuchos .syx do Dexed. `false` se o processor não for o porte. */
bool reloadDexedBank (juce::AudioProcessor* processor);
} // namespace native
} // namespace preseter
