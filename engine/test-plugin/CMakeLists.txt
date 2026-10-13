# Sintetizador VST3 de teste (opcional). Compile com -DPRESETER_BUILD_TEST_PLUGIN=ON
juce_add_plugin(PreseterTestSynth
    COMPANY_NAME "Preseter"
    PRODUCT_NAME "Preseter Test Synth"
    PLUGIN_MANUFACTURER_CODE Prst
    PLUGIN_CODE Tsyn
    FORMATS VST3
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    COPY_PLUGIN_AFTER_BUILD FALSE)

target_sources(PreseterTestSynth PRIVATE TestSynth.cpp)

target_compile_definitions(PreseterTestSynth PUBLIC
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0)

target_link_libraries(PreseterTestSynth
    PRIVATE
        juce::juce_audio_utils
    PUBLIC
        juce::juce_recommended_config_flags)
