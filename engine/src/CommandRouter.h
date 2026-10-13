#pragma once

#include "Engine.h"

#include <functional>

namespace preseter
{
/**
 * Traduz o protocolo JSON (uma mensagem por linha) em chamadas ao Engine.
 *
 *   entrada : {"id": 1, "cmd": "load", "path": "C:\\...\\Synth.vst3"}
 *   sucesso : {"id": 1, "ok": true,  "result": {...}}
 *   erro    : {"id": 1, "ok": false, "error": "mensagem"}
 *   eventos : {"event": "ready" | "scan-progress", ...}   (sem id)
 *
 * Deve ser usado apenas na message thread.
 */
class CommandRouter
{
public:
    CommandRouter (Engine& engineToUse, std::function<void()> quitCallback);

    void handleLine (const juce::String& line);

private:
    void ok (const juce::var& id, const juce::var& result = {});
    void fail (const juce::var& id, const juce::String& message);

    Engine& engine;
    std::function<void()> requestQuit;
};
} // namespace preseter
