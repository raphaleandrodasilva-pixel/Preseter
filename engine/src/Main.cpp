#include <juce_gui_basics/juce_gui_basics.h>

#include "CommandRouter.h"
#include "Engine.h"
#include "Output.h"

#include <iostream>
#include <memory>
#include <string>
#include <thread>

namespace
{
constexpr const char* kEngineVersion = "0.1.0";
}

/**
 * preseter-engine: processo sem janela que hospeda plugins VST3.
 * Lê comandos JSON de stdin (um por linha) e responde em stdout.
 * Quando o processo pai fecha o stdin, o motor encerra sozinho.
 */
class PreseterEngineApplication : public juce::JUCEApplication
{
public:
    const juce::String getApplicationName() override    { return "preseter-engine"; }
    const juce::String getApplicationVersion() override { return kEngineVersion; }
    bool moreThanOneInstanceAllowed() override          { return true; }

    void initialise (const juce::String&) override
    {
        engine = std::make_unique<preseter::Engine>();
        router = std::make_unique<preseter::CommandRouter> (*engine, [] { juce::JUCEApplicationBase::quit(); });

        startStdinReader();

        preseter::emit (preseter::Obj()
                            .set ("event", "ready")
                            .set ("version", kEngineVersion)
                            .set ("os", juce::SystemStats::getOperatingSystemName())
                            .set ("formats", juce::var (engine->getFormatNames().joinIntoString (","))));
    }

    void shutdown() override
    {
        router.reset();
        engine.reset();
    }

    void systemRequestedQuit() override { quit(); }

private:
    void startStdinReader()
    {
        // Thread solta: getline bloqueia e não dá para interromper; ao sair
        // o processo inteiro termina.
        std::thread ([]
        {
            std::string line;
            while (std::getline (std::cin, line))
            {
                auto text = juce::String::fromUTF8 (line.c_str()).trim();
                if (text.isEmpty())
                    continue;

                juce::MessageManager::callAsync ([text]
                {
                    if (auto* app = dynamic_cast<PreseterEngineApplication*> (juce::JUCEApplicationBase::getInstance()))
                        if (app->router != nullptr)
                            app->router->handleLine (text);
                });
            }

            // stdin fechou (o app Electron saiu): encerra o motor.
            juce::MessageManager::callAsync ([] { juce::JUCEApplicationBase::quit(); });
        }).detach();
    }

    std::unique_ptr<preseter::Engine> engine;
    std::unique_ptr<preseter::CommandRouter> router;
};

START_JUCE_APPLICATION (PreseterEngineApplication)
