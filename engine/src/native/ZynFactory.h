#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

namespace preseter
{
namespace native
{
/** Cria o Preseter Zyn (motor ZynAddSubFX, um Part por layer). */
std::unique_ptr<juce::AudioProcessor> createZyn();

/** Vozes ativas do Zyn (0 se o processor não for o porte). */
int zynActiveVoices (juce::AudioProcessor* processor);

/** Define as pastas de presets (fábrica e usuário). */
void setZynBankDirs (juce::AudioProcessor* processor,
                     const juce::String& factoryDir,
                     const juce::String& userDir);

/** Relê os presets .xiz do disco. */
bool reloadZynBank (juce::AudioProcessor* processor);
} // namespace native
} // namespace preseter
