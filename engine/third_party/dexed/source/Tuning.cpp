#include "PluginProcessor.h"
#include "parameter/Model.h"

int DexedAudioProcessor::tuningTranspositionShift() {
    int transpose = activeProgram[IDs::transpose.pos];
    if( synthTuningState->is_standard_tuning() || ! controllers.transpose12AsScale )
        return transpose - 24;
    else {
        int d144 = transpose;
        if( d144 % 12 == 0 ) {
            int oct = (d144 - 24) / 12;
            int res = oct * synthTuningState->scale_length();
            return res;
        }
        else
            return transpose - 24;
    }
}

void DexedAudioProcessor::resetTuning(std::shared_ptr<TuningState> t) {
    synthTuningState = t;
    synthTuningStateLast = t;
    for( int i=0; i<MAX_ACTIVE_NOTES; ++i )
        if( voices[i].dx7_note != nullptr )
            voices[i].dx7_note->tuning_state_ = synthTuningState;
}

void DexedAudioProcessor::retuneToStandard() {
    currentSCLData = "";
    currentKBMData = "";
    resetTuning(createStandardTuning());
}

void DexedAudioProcessor::applySCLTuning(File s) {
    std::string sclcontents = s.loadFileAsString().toStdString();
    applySCLTuning(sclcontents);
}

void DexedAudioProcessor::applySCLTuning(std::string sclcontents) {
    if( currentKBMData.size() < 1 ) {
        auto t = createTuningFromSCLData( sclcontents );
        if (t != nullptr) {
            resetTuning(t); // update tuning
            currentSCLData = sclcontents; // remember this SCL data
            synthTuningStateLast = t; // remember this whole state as a "last good working state"
        }
        else {
            resetTuning(synthTuningStateLast); // revert to the "last good working state"
        }
    }
    else {
        auto t = createTuningFromSCLAndKBMData( sclcontents, currentKBMData );
        if (t != nullptr) {
            resetTuning(t); // update tuning
            currentSCLData = sclcontents; // remember this SCL data
            synthTuningStateLast = t; // remember this whole state as a "last good working state"
        }
        else {
            resetTuning(synthTuningStateLast); // revert to the "last good working state"
        }
    }
}

void DexedAudioProcessor::applyKBMMapping( File s ) {
    std::string kbmcontents = s.loadFileAsString().toStdString();
    applyKBMMapping(kbmcontents);
}

void DexedAudioProcessor::applyKBMMapping(std::string kbmcontents) {
    if( currentSCLData.size() < 1 ) {
        auto t = createTuningFromKBMData(kbmcontents);
        if (t != nullptr) {
            resetTuning(t); // update tuning
            currentKBMData = kbmcontents; // remember this KBM data
            synthTuningStateLast = t; // remember this whole state as a "last good working state"
        } else {
            resetTuning(synthTuningStateLast); // revert to the "last good working state"
        }
    } else {
        auto t = createTuningFromSCLAndKBMData( currentSCLData, kbmcontents );
        if (t != nullptr) {
            resetTuning(t); // update tuning
            currentKBMData = kbmcontents; // remember this KBM data
            synthTuningStateLast = t; // remember this whole state as a "last good working state"
        } else {
            resetTuning(synthTuningStateLast); // revert to "last good working state"
        }
    }
}
