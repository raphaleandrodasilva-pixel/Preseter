cmake_minimum_required(VERSION 3.22)

project(PreseterEngine VERSION 0.1.0 LANGUAGES C CXX)

# Sem tipo de build o compilador não otimiza nada (áudio estala). Padrão: Release.
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Tipo de build" FORCE)
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# --------------------------------------------------------------------------
# JUCE
# Por padrão o JUCE é baixado sozinho (FetchContent). Se você já tem um
# checkout local, passe -DPRESETER_JUCE_DIR=/caminho/para/JUCE
# --------------------------------------------------------------------------
set(PRESETER_JUCE_DIR "" CACHE PATH "Checkout local do JUCE (opcional)")
set(PRESETER_JUCE_TAG "8.0.13" CACHE STRING "Tag do JUCE usada pelo FetchContent")
if(PRESETER_JUCE_TAG VERSION_LESS "8.0.13")
    # O Element usa 8.0.13; a partir do 8.0.11 o JUCE traz o ASIO SDK
    # embutido e as correções de áudio que faltavam no 8.0.8/8.0.9.
    set(PRESETER_JUCE_TAG "8.0.13" CACHE STRING "Tag do JUCE usada pelo FetchContent" FORCE)
endif()

if(PRESETER_JUCE_DIR)
    add_subdirectory("${PRESETER_JUCE_DIR}" juce EXCLUDE_FROM_ALL)
else()
    include(FetchContent)
    FetchContent_Declare(
        JUCE
        GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
        GIT_TAG        ${PRESETER_JUCE_TAG}
        GIT_SHALLOW    TRUE
    )
    FetchContent_MakeAvailable(JUCE)
endif()

# --------------------------------------------------------------------------
# Opções de backend de áudio
# --------------------------------------------------------------------------
option(PRESETER_ENABLE_ASIO "Windows: habilita ASIO (exige o SDK da Steinberg)" OFF)
set(PRESETER_ASIO_SDK_DIR "" CACHE PATH "Windows: pasta do ASIO SDK")
if(UNIX AND NOT APPLE)
    option(PRESETER_ENABLE_JACK "Linux: habilita JACK (exige libjack-dev)" ON)
else()
    option(PRESETER_ENABLE_JACK "Linux: habilita JACK (exige libjack-dev)" OFF)
endif()
set(PRESETER_VST2_SDK_DIR "" CACHE PATH "VST2 SDK (ex.: R-Tur/VST_SDK_2.4); vazio desativa VST2")

# --------------------------------------------------------------------------
# Alvo: processo sem janela, controlado por JSON em stdin/stdout
# --------------------------------------------------------------------------
juce_add_console_app(PreseterEngine
    PRODUCT_NAME "preseter-engine"
    COMPANY_NAME "Preseter")

# --------------------------------------------------------------------------
# setBfree (DSP do órgão) - ver third_party/setbfree/UPSTREAM.md
# --------------------------------------------------------------------------
set(PRESETER_SETBFREE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/third_party/setbfree")
set(PRESETER_SETBFREE_SOURCES
    "${PRESETER_SETBFREE_DIR}/src/tonegen.c"
    "${PRESETER_SETBFREE_DIR}/src/vibrato.c"
    "${PRESETER_SETBFREE_DIR}/src/midi.c"
    "${PRESETER_SETBFREE_DIR}/src/cfgParser.c"
    "${PRESETER_SETBFREE_DIR}/src/program.c"
    "${PRESETER_SETBFREE_DIR}/src/state.c"
    "${PRESETER_SETBFREE_DIR}/src/pgmParser.c"
    "${PRESETER_SETBFREE_DIR}/b_whirl/whirl.c"
    "${PRESETER_SETBFREE_DIR}/b_whirl/eqcomp.c"
    "${PRESETER_SETBFREE_DIR}/b_overdrive/overdrive.c"
    "${PRESETER_SETBFREE_DIR}/b_reverb/reverb.c"
    "${PRESETER_SETBFREE_DIR}/glue/setbfree_glue.c"
    "${PRESETER_SETBFREE_DIR}/glue/setbfree_globals.c")

if(WIN32)
    list(APPEND PRESETER_SETBFREE_SOURCES "${PRESETER_SETBFREE_DIR}/compat/fmemopen_win32.c")
else()
    # glibc já fornece fmemopen; o memstream.c do setBfree é BSD-only.
    target_compile_definitions(PreseterEngine PRIVATE HAVE_MEMSTREAM=1)
endif()

target_sources(PreseterEngine PRIVATE
    src/Main.cpp
    src/Engine.cpp
    src/CommandRouter.cpp
    src/native/NativeProcessor.cpp
    src/native/SetBfreeOrganProcessor.cpp
    src/native/Synth2Dsp.cpp
    src/native/WurliProcessor.cpp
    src/native/MdaPianoFactory.cpp
    src/native/MdaDxFactory.cpp
    src/native/MdaJxFactory.cpp
    third_party/mda-piano/PluginProcessor.cpp
    third_party/mda-dx10/PluginProcessor.cpp
    third_party/mda-jx10/PluginProcessor.cpp
    third_party/mda-epiano/MdaEPianoDsp.cpp
    src/sampler/SamplerInstrument.cpp
    src/sampler/SamplerProcessor.cpp
    src/drums/DrumKitEngine.cpp
    ${PRESETER_SETBFREE_SOURCES})

target_include_directories(PreseterEngine PRIVATE
    src
    "${CMAKE_CURRENT_SOURCE_DIR}/third_party/oxo-synth2"
    "${CMAKE_CURRENT_SOURCE_DIR}/third_party/mda-common"
    "${CMAKE_CURRENT_SOURCE_DIR}/third_party/mda-piano"
    "${CMAKE_CURRENT_SOURCE_DIR}/third_party/mda-dx10"
    "${CMAKE_CURRENT_SOURCE_DIR}/third_party/mda-jx10"
    "${CMAKE_CURRENT_SOURCE_DIR}/third_party/mda-epiano"
    "${PRESETER_SETBFREE_DIR}/src"
    "${PRESETER_SETBFREE_DIR}/b_whirl"
    "${PRESETER_SETBFREE_DIR}/b_overdrive"
    "${PRESETER_SETBFREE_DIR}/b_reverb")

target_compile_definitions(PreseterEngine PRIVATE _USE_MATH_DEFINES NOMINMAX)

# Os fontes são UTF-8 (nomes de parâmetros com acento). Sem isso o MSVC lê
# como Windows-1252 e os nomes chegam à UI como "rÃ¡pido", quebrando a busca
# por nome na janela dos instrumentos.
if(MSVC)
    target_compile_options(PreseterEngine PRIVATE /utf-8)
endif()

if(WIN32)
    set_source_files_properties(${PRESETER_SETBFREE_SOURCES} PROPERTIES
        INCLUDE_DIRECTORIES "${PRESETER_SETBFREE_DIR}/compat")
endif()

if(MSVC)
    set_source_files_properties(${PRESETER_SETBFREE_SOURCES} PROPERTIES
        COMPILE_OPTIONS "/FI${PRESETER_SETBFREE_DIR}/compat/setbfree_compat.h;/std:c11")
endif()

if(UNIX AND NOT APPLE)
    target_link_libraries(PreseterEngine PRIVATE m)
endif()

# --------------------------------------------------------------------------
# OpenWurli (DSP Rust do Preseter Wurly) - ver third_party/openwurli/UPSTREAM.md
# --------------------------------------------------------------------------
find_program(CARGO_EXECUTABLE NAMES cargo
    HINTS "$ENV{USERPROFILE}/.cargo/bin" "$ENV{HOME}/.cargo/bin")
if(NOT CARGO_EXECUTABLE)
    message(FATAL_ERROR
        "cargo nao encontrado. Instale Rust 1.85+ (https://rustup.rs) para compilar o Preseter Wurly.")
endif()

set(OPENWURLI_DIR "${CMAKE_CURRENT_SOURCE_DIR}/third_party/openwurli")
if(WIN32)
    set(OPENWURLI_STATIC_LIB "${OPENWURLI_DIR}/target/release/openwurli_capi.lib")
else()
    set(OPENWURLI_STATIC_LIB "${OPENWURLI_DIR}/target/release/libopenwurli_capi.a")
endif()

file(GLOB_RECURSE OPENWURLI_RUST_SOURCES CONFIGURE_DEPENDS
    "${OPENWURLI_DIR}/crates/openwurli-dsp/src/*.rs"
    "${OPENWURLI_DIR}/capi/src/*.rs"
    "${OPENWURLI_DIR}/melange-primitives/src/*.rs")
list(APPEND OPENWURLI_RUST_SOURCES
    "${OPENWURLI_DIR}/Cargo.toml"
    "${OPENWURLI_DIR}/Cargo.lock")

add_custom_command(
    OUTPUT "${OPENWURLI_STATIC_LIB}"
    COMMAND "${CARGO_EXECUTABLE}" build -p openwurli-capi --release
            --manifest-path "${OPENWURLI_DIR}/Cargo.toml"
    WORKING_DIRECTORY "${OPENWURLI_DIR}"
    DEPENDS ${OPENWURLI_RUST_SOURCES}
    COMMENT "Compilando OpenWurli (Rust)"
    VERBATIM)

add_custom_target(openwurli_capi_build DEPENDS "${OPENWURLI_STATIC_LIB}")

add_library(openwurli_capi STATIC IMPORTED GLOBAL)
set_target_properties(openwurli_capi PROPERTIES
    IMPORTED_LOCATION "${OPENWURLI_STATIC_LIB}")

add_dependencies(PreseterEngine openwurli_capi_build)
target_link_libraries(PreseterEngine PRIVATE openwurli_capi)

if(WIN32)
    target_link_libraries(PreseterEngine PRIVATE advapi32 userenv ws2_32 ntdll bcrypt synchronization)
elseif(UNIX AND NOT APPLE)
    target_link_libraries(PreseterEngine PRIVATE pthread dl)
endif()

option(PRESETER_BUILD_WURLI_SMOKE "Compila o teste de áudio do Wurly (OpenWurli)" OFF)
if(PRESETER_BUILD_WURLI_SMOKE)
    add_executable(PreseterWurliSmoke test/openwurli-capi/main.cpp)

    target_include_directories(PreseterWurliSmoke PRIVATE src/native)
    add_dependencies(PreseterWurliSmoke openwurli_capi_build)
    target_link_libraries(PreseterWurliSmoke PRIVATE openwurli_capi)

    if(WIN32)
        target_link_libraries(PreseterWurliSmoke PRIVATE
            advapi32 userenv ws2_32 ntdll bcrypt synchronization)
    elseif(UNIX AND NOT APPLE)
        target_link_libraries(PreseterWurliSmoke PRIVATE pthread dl m)
    endif()
endif()

target_compile_definitions(PreseterEngine PRIVATE
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_PLUGINHOST_VST3=1
    JUCE_PLUGINHOST_VST=$<BOOL:${PRESETER_VST2_SDK_DIR}>
    JUCE_PLUGINHOST_LADSPA=0
    JUCE_PLUGINHOST_LV2=1
    JUCE_STRICT_REFCOUNTEDPOINTER=1
    JUCE_MODAL_LOOPS_PERMITTED=0)

if(PRESETER_VST2_SDK_DIR)
    if(NOT EXISTS "${PRESETER_VST2_SDK_DIR}/pluginterfaces/vst2.x/aeffect.h")
        message(FATAL_ERROR "PRESETER_VST2_SDK_DIR não contém pluginterfaces/vst2.x/aeffect.h: ${PRESETER_VST2_SDK_DIR}")
    endif()
    target_include_directories(PreseterEngine PRIVATE
        "${PRESETER_VST2_SDK_DIR}"
        "${PRESETER_VST2_SDK_DIR}/public.sdk/source/vst2.x")
endif()

if(APPLE)
    target_compile_definitions(PreseterEngine PRIVATE JUCE_PLUGINHOST_AU=1)
endif()

if(WIN32 AND PRESETER_ENABLE_ASIO)
    # Igual ao Element: usa os headers ASIO embutidos no JUCE 8.0.13.
    # O SDK externo continua aceito para quem precisar, mas não é mais
    # obrigatório nem entra no include por padrão.
    target_compile_definitions(PreseterEngine PRIVATE JUCE_ASIO=1)
    if(PRESETER_ASIO_SDK_DIR)
        message(STATUS "ASIO: usando headers embutidos do JUCE (SDK externo ignorado)")
    endif()
endif()

if(UNIX AND NOT APPLE AND PRESETER_ENABLE_JACK)
    find_path(PRESETER_JACK_INCLUDE_DIR jack/jack.h)
    if(PRESETER_JACK_INCLUDE_DIR)
        target_compile_definitions(PreseterEngine PRIVATE JUCE_JACK=1)
        target_include_directories(PreseterEngine PRIVATE "${PRESETER_JACK_INCLUDE_DIR}")
    else()
        message(WARNING "JACK habilitado, mas jack/jack.h não foi encontrado. Instale libjack-jackd2-dev; o engine será compilado sem JACK.")
        target_compile_definitions(PreseterEngine PRIVATE JUCE_JACK=0)
    endif()
endif()

option(PRESETER_BUILD_TEST_PLUGIN "Compila um sintetizador VST3 de teste (para validar o motor)" OFF)
if(PRESETER_BUILD_TEST_PLUGIN)
    add_subdirectory(test-plugin)
endif()

option(PRESETER_BUILD_SYNTH2_SMOKE "Compila o teste offline do Preseter Synth2 (Oxo Synth2)" OFF)
if(PRESETER_BUILD_SYNTH2_SMOKE)
    add_executable(PreseterSynth2Smoke
        test/synth2-smoke/main.cpp
        src/native/Synth2Dsp.cpp)

    target_include_directories(PreseterSynth2Smoke PRIVATE
        src/native
        "${CMAKE_CURRENT_SOURCE_DIR}/third_party/oxo-synth2")

    target_compile_definitions(PreseterSynth2Smoke PRIVATE _USE_MATH_DEFINES NOMINMAX)

    if(MSVC)
        target_compile_options(PreseterSynth2Smoke PRIVATE /utf-8)
    endif()

    if(UNIX AND NOT APPLE)
        target_link_libraries(PreseterSynth2Smoke PRIVATE m)
    endif()
endif()

option(PRESETER_BUILD_TINES_NULLITY "Compila o teste de nulidade do Tines (MDA ePiano)" OFF)
if(PRESETER_BUILD_TINES_NULLITY)
    juce_add_console_app(PreseterTinesNullity
        PRODUCT_NAME "preseter-tines-nullity"
        COMPANY_NAME "Preseter")
    juce_generate_juce_header(PreseterTinesNullity)

    target_sources(PreseterTinesNullity PRIVATE
        test/mda-epiano-nullity/main.cpp
        third_party/mda-epiano/MdaEPianoDsp.cpp
        third_party/mda-epiano/MDAEPianoProcessor.cpp)

    target_include_directories(PreseterTinesNullity PRIVATE
        src/native
        test/mda-epiano-nullity
        "${CMAKE_CURRENT_SOURCE_DIR}/third_party/mda-epiano")

    target_compile_definitions(PreseterTinesNullity PRIVATE
        JucePlugin_Name="MDAEPiano"
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_MODAL_LOOPS_PERMITTED=0
        _USE_MATH_DEFINES
        NOMINMAX)

    if(MSVC)
        target_compile_options(PreseterTinesNullity PRIVATE /utf-8)
    endif()

    target_link_libraries(PreseterTinesNullity
        PRIVATE
            juce::juce_audio_utils
            juce::juce_audio_processors
            juce::juce_audio_basics
            juce::juce_gui_basics
            juce::juce_gui_extra
            juce::juce_events
            juce::juce_core
            juce::juce_data_structures)
endif()

option(PRESETER_BUILD_SETBFREE_NULLITY "Compila o teste de nulidade do órgão setBfree" OFF)
if(PRESETER_BUILD_SETBFREE_NULLITY)
    add_executable(PreseterSetBfreeNullity
        test/setbfree-nullity/main.cpp
        test/setbfree-nullity/reference.c
        src/native/SetBfreeOrganProcessor.cpp
        ${PRESETER_SETBFREE_SOURCES})

    target_include_directories(PreseterSetBfreeNullity PRIVATE
        src/native
        test/setbfree-nullity
        "${PRESETER_SETBFREE_DIR}/src"
        "${PRESETER_SETBFREE_DIR}/b_whirl"
        "${PRESETER_SETBFREE_DIR}/b_overdrive"
        "${PRESETER_SETBFREE_DIR}/b_reverb")

    target_compile_definitions(PreseterSetBfreeNullity PRIVATE _USE_MATH_DEFINES NOMINMAX)

    if(MSVC)
        target_compile_options(PreseterSetBfreeNullity PRIVATE /utf-8)
    endif()

    if(WIN32)
        set_source_files_properties(${PRESETER_SETBFREE_SOURCES} PROPERTIES
            INCLUDE_DIRECTORIES "${PRESETER_SETBFREE_DIR}/compat")
    endif()

    if(MSVC)
        set_source_files_properties(${PRESETER_SETBFREE_SOURCES} PROPERTIES
            COMPILE_OPTIONS "/FI${PRESETER_SETBFREE_DIR}/compat/setbfree_compat.h;/std:c11")
    endif()

    if(UNIX AND NOT APPLE)
        target_link_libraries(PreseterSetBfreeNullity PRIVATE m)
    endif()
endif()

# Teste de fase do relógio mestre (D1). Não usa JUCE: compila e roda em segundos.
option(PRESETER_BUILD_CLOCK_TEST "Compila o teste de fase do relógio mestre (D1)" OFF)
if(PRESETER_BUILD_CLOCK_TEST)
    add_executable(PreseterClockTest test/clock-phase/main.cpp)
    target_include_directories(PreseterClockTest PRIVATE src)
    if(MSVC)
        target_compile_options(PreseterClockTest PRIVATE /utf-8)
    endif()
endif()

# Teste de tempo do sequenciador de bateria (D4). Não usa JUCE.
option(PRESETER_BUILD_DRUM_TIMING_TEST "Compila o teste de tempo do sequenciador de bateria (D4)" OFF)
if(PRESETER_BUILD_DRUM_TIMING_TEST)
    add_executable(PreseterDrumTimingTest test/drum-timing/main.cpp)
    target_include_directories(PreseterDrumTimingTest PRIVATE src)
    if(MSVC)
        target_compile_options(PreseterDrumTimingTest PRIVATE /utf-8)
    endif()
endif()

# Teste de nulidade/áudio do Preseter Drums (D11). Precisa do kit SF2 instalado.
option(PRESETER_BUILD_DRUMS_NULLITY "Compila o teste de nulidade do Preseter Drums (D11)" OFF)
if(PRESETER_BUILD_DRUMS_NULLITY)
    juce_add_console_app(PreseterDrumsNullity
        PRODUCT_NAME "preseter-drums-nullity"
        COMPANY_NAME "Preseter")
    juce_generate_juce_header(PreseterDrumsNullity)

    target_sources(PreseterDrumsNullity PRIVATE
        test/drums/main.cpp
        src/drums/DrumKitEngine.cpp
        src/sampler/SamplerInstrument.cpp)

    target_include_directories(PreseterDrumsNullity PRIVATE src)

    target_compile_definitions(PreseterDrumsNullity PRIVATE
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_MODAL_LOOPS_PERMITTED=0
        _USE_MATH_DEFINES
        NOMINMAX)

    if(MSVC)
        target_compile_options(PreseterDrumsNullity PRIVATE /utf-8)
    endif()

    target_link_libraries(PreseterDrumsNullity PRIVATE
        juce::juce_audio_formats
        juce::juce_audio_basics
        juce::juce_events
        juce::juce_core
        juce::juce_data_structures)

    if(UNIX AND NOT APPLE)
        target_link_libraries(PreseterDrumsNullity PRIVATE pthread dl m)
    endif()
endif()

target_link_libraries(PreseterEngine
    PRIVATE
        juce::juce_audio_utils
        juce::juce_audio_devices
        juce::juce_audio_processors
        juce::juce_audio_basics
        juce::juce_events
        juce::juce_gui_basics
        juce::juce_data_structures
        juce::juce_core
    PUBLIC
        juce::juce_recommended_config_flags)
