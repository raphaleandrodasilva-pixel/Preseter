#pragma once

#include <juce_core/juce_core.h>

#include <cstdio>
#include <mutex>

namespace preseter
{
/** Builder pequeno para montar objetos JSON (juce::var). */
class Obj
{
public:
    Obj() : object (new juce::DynamicObject()) {}

    Obj& set (const juce::Identifier& key, juce::var value)
    {
        object->setProperty (key, std::move (value));
        return *this;
    }

    operator juce::var() const { return juce::var (static_cast<juce::ReferenceCountedObject*> (object.get())); }

private:
    juce::DynamicObject::Ptr object;
};

/** Escreve uma mensagem JSON (uma linha) em stdout. Seguro entre threads. */
inline void emit (const juce::var& message)
{
    static std::mutex mutex;
    const auto text = juce::JSON::toString (message, true);

    std::lock_guard<std::mutex> lock (mutex);
    std::fwrite (text.toRawUTF8(), 1, text.getNumBytesAsUTF8(), stdout);
    std::fputc ('\n', stdout);
    std::fflush (stdout);
}

/** Log humano vai para stderr, para não misturar com o protocolo. */
inline void logLine (const juce::String& text)
{
    std::fprintf (stderr, "[engine] %s\n", text.toRawUTF8());
    std::fflush (stderr);
}
} // namespace preseter
