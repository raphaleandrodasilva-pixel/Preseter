#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include <memory>

namespace preseter
{
namespace native
{
/** Fábricas isoladas: cada TU inclui só um PluginProcessor do MDA (evita
    colisão dos `struct Voice` globais dos portes). */
std::unique_ptr<juce::AudioProcessor> createMdaPiano();
std::unique_ptr<juce::AudioProcessor> createMdaDx10();
std::unique_ptr<juce::AudioProcessor> createMdaJx10();

/** Vozes ativas do processador MDA (0 se o ponteiro não for do tipo certo).
    Fica no TU da fábrica porque só ele conhece o tipo concreto. */
int mdaPianoActiveVoices (juce::AudioProcessor* processor);
int mdaDxActiveVoices (juce::AudioProcessor* processor);
int mdaJxActiveVoices (juce::AudioProcessor* processor);
} // namespace native
} // namespace preseter
