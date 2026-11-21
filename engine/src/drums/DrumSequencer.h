#pragma once

#include "DrumScheduler.h"
#include "MasterClock.h"

#include <array>

namespace preseter
{
namespace drums
{
/** Liga o `DrumScheduler` ao `MasterClock` e guarda os eventos do bloco (D4). */
class DrumSequencer
{
public:
    void setMasterClock (const MasterClock* clockToUse) noexcept { clock = clockToUse; }
    void publishPattern (const DrumPattern& pattern) noexcept { scheduler.publishPattern (pattern); }
    void setEnabled (bool value) noexcept { scheduler.setEnabled (value); }
    bool isEnabled() const noexcept { return scheduler.isEnabled(); }
    int getCurrentStep() const noexcept { return scheduler.getCurrentStep(); }
    void reset() noexcept { scheduler.reset(); }

    /** Thread de áudio: eventos do bloco, ordenados por amostra. */
    int process (int numSamples) noexcept
    {
        if (clock == nullptr)
        {
            eventCount = 0;
            return 0;
        }

        eventCount = scheduler.processBlock (clock->ppqAtBlockStart(),
                                             clock->ppqPerSample(),
                                             clock->barLengthPpq(),
                                             numSamples,
                                             clock->isPlayingAtBlockStart(),
                                             events.data(),
                                             (int) events.size());
        return eventCount;
    }

    const DrumScheduler::Event* getEvents() const noexcept { return events.data(); }
    int getEventCount() const noexcept { return eventCount; }

private:
    DrumScheduler scheduler;
    const MasterClock* clock = nullptr;
    std::array<DrumScheduler::Event, 1024> events {};
    int eventCount = 0;
};
} // namespace drums
} // namespace preseter
