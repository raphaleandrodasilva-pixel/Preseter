#include "CommandRouter.h"

#include "Output.h"

namespace preseter
{
namespace
{
int intArg (const juce::var& message, const juce::Identifier& key, int fallback)
{
    return message.hasProperty (key) ? (int) message[key] : fallback;
}

bool boolArg (const juce::var& message, const juce::Identifier& key, bool fallback)
{
    return message.hasProperty (key) ? (bool) message[key] : fallback;
}
} // namespace

CommandRouter::CommandRouter (Engine& engineToUse, std::function<void()> quitCallback)
    : engine (engineToUse), requestQuit (std::move (quitCallback))
{
}

void CommandRouter::ok (const juce::var& id, const juce::var& result)
{
    emit (Obj().set ("id", id).set ("ok", true).set ("result", result));
}

void CommandRouter::fail (const juce::var& id, const juce::String& message)
{
    emit (Obj().set ("id", id).set ("ok", false).set ("error", message));
}

void CommandRouter::handleLine (const juce::String& line)
{
    juce::var message;
    const auto parsed = juce::JSON::parse (line, message);

    if (parsed.failed() || ! message.isObject())
    {
        fail ({}, "JSON inválido: " + parsed.getErrorMessage());
        return;
    }

    const auto id  = message["id"];
    const auto cmd = message["cmd"].toString();

    // ---- Diagnóstico -------------------------------------------------------
    if (cmd == "ping")
    {
        ok (id, Obj().set ("pong", true));
        return;
    }

    if (cmd == "quit")
    {
        ok (id);
        requestQuit();
        return;
    }

    // ---- Áudio e MIDI ------------------------------------------------------
    if (cmd == "devices")
    {
        ok (id, engine.describeDevices());
        return;
    }

    if (cmd == "audioStart")
    {
        if (auto error = engine.startAudio (message); error.isNotEmpty())
            fail (id, error);
        else
            ok (id, engine.describeDevices());
        return;
    }

    if (cmd == "audioStop")
    {
        engine.stopAudio();
        ok (id);
        return;
    }

    if (cmd == "midiEnable")
    {
        const auto identifier = message["identifier"].toString();
        const bool enabled    = boolArg (message, "enabled", true);

        if (identifier.isNotEmpty())
        {
            if (auto error = engine.setMidiInputEnabled (identifier, enabled); error.isNotEmpty())
            {
                fail (id, error);
                return;
            }
        }
        else
        {
            for (const auto& device : juce::MidiInput::getAvailableDevices())
            {
                if (auto error = engine.setMidiInputEnabled (device.identifier, enabled); error.isNotEmpty())
                {
                    fail (id, error);
                    return;
                }
            }
        }

        ok (id, engine.describeDevices());
        return;
    }

    // ---- Plugins -----------------------------------------------------------
    if (cmd == "plugins")
    {
        ok (id, Obj().set ("formats", juce::var (engine.getFormatNames().joinIntoString (",")))
                     .set ("plugins", engine.listKnownPlugins()));
        return;
    }

    if (cmd == "scan")
    {
        juce::StringArray extraPaths;
        if (auto* array = message["paths"].getArray())
            for (const auto& item : *array)
                extraPaths.add (item.toString());

        engine.scan (
            extraPaths,
            boolArg (message, "rescan", false),
            [] (const juce::String& name) { emit (Obj().set ("event", "scan-progress").set ("plugin", name)); },
            [this, id] (juce::var result, juce::String error)
            {
                if (error.isNotEmpty()) fail (id, error);
                else                    ok (id, result);
            });
        return;
    }

    if (cmd == "load")
    {
        auto key = message["plugin"].toString();
        if (key.isEmpty()) key = message["path"].toString();

        if (key.isEmpty())
        {
            fail (id, "Informe \"plugin\" (id) ou \"path\" do plugin.");
            return;
        }

        engine.loadPlugin (key, [this, id] (juce::var result, juce::String error)
        {
            if (error.isNotEmpty()) fail (id, error);
            else                    ok (id, result);
        });
        return;
    }

    if (cmd == "unload")
    {
        ok (id, Obj().set ("unloaded", engine.unloadPlugin()));
        return;
    }

    if (cmd == "plugin")
    {
        ok (id, engine.describeLoadedPlugin());
        return;
    }

    if (cmd == "params")
    {
        ok (id, engine.listParameters());
        return;
    }

    if (cmd == "getParam" || cmd == "setParam")
    {
        const int index = intArg (message, "index", -1);
        juce::var result;

        const auto error = (cmd == "setParam")
            ? engine.setParameter (index, (float) (double) message["value"], result)
            : engine.getParameter (index, result);

        if (error.isNotEmpty()) fail (id, error);
        else                    ok (id, result);
        return;
    }

    // ---- MIDI manual -------------------------------------------------------
    if (cmd == "noteOn" || cmd == "noteOff")
    {
        const int channel  = intArg (message, "channel", 1);
        const int note     = intArg (message, "note", -1);
        const int velocity = intArg (message, "velocity", 100);

        if (channel < 1 || channel > 16 || note < 0 || note > 127 || velocity < 0 || velocity > 127)
        {
            fail (id, "Valores fora do intervalo: channel 1-16, note 0-127, velocity 0-127.");
            return;
        }

        const auto midi = (cmd == "noteOn")
            ? juce::MidiMessage::noteOn (channel, note, (juce::uint8) velocity)
            : juce::MidiMessage::noteOff (channel, note, (juce::uint8) velocity);

        if (auto error = engine.sendMidi (midi); error.isNotEmpty()) fail (id, error);
        else                                                         ok (id);
        return;
    }

    if (cmd == "midi")
    {
        auto* bytes = message["bytes"].getArray();
        if (bytes == nullptr || bytes->size() < 1 || bytes->size() > 3)
        {
            fail (id, "Informe \"bytes\": [status, data1, data2] com 1 a 3 valores.");
            return;
        }

        juce::uint8 data[3] = { 0, 0, 0 };
        for (int i = 0; i < bytes->size(); ++i)
        {
            const int value = (int) (*bytes)[i];
            if (value < 0 || value > 255)
            {
                fail (id, "Byte MIDI fora do intervalo 0-255.");
                return;
            }
            data[i] = (juce::uint8) value;
        }

        const juce::MidiMessage midi (data, bytes->size(), 0.0);
        if (auto error = engine.sendMidi (midi); error.isNotEmpty()) fail (id, error);
        else                                                         ok (id);
        return;
    }

    if (cmd == "panic")
    {
        if (auto error = engine.panic(); error.isNotEmpty()) fail (id, error);
        else                                                 ok (id);
        return;
    }

    fail (id, "Comando desconhecido: " + cmd);
}
} // namespace preseter
