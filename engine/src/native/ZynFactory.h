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

/** Diagnóstico Z0: lista os programas com caminho, tamanho e se são gzip. */
juce::var describeZynPrograms (juce::AudioProcessor* processor);

/** Diagnóstico Z0: carrega um .xiz por caminho e devolve o perfil por etapa.
    Não altera o programa atual do banco. */
bool loadZynPresetForDiagnostics (juce::AudioProcessor* processor,
                                  const juce::String& path,
                                  juce::var& result);

/** Diagnóstico Z0: último perfil de carga + contadores do alocador. */
juce::var describeZynDiagnostics (juce::AudioProcessor* processor);

/** Diagnóstico Z0: zera contadores e o último perfil. */
void resetZynDiagnostics (juce::AudioProcessor* processor);
} // namespace native
} // namespace preseter
