cmake_minimum_required(VERSION 3.22)

project(PreseterEngine VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# --------------------------------------------------------------------------
# JUCE
# Por padrão o JUCE é baixado sozinho (FetchContent). Se você já tem um
# checkout local, passe -DPRESETER_JUCE_DIR=/caminho/para/JUCE
# --------------------------------------------------------------------------
set(PRESETER_JUCE_DIR "" CACHE PATH "Checkout local do JUCE (opcional)")
set(PRESETER_JUCE_TAG "8.0.8" CACHE STRING "Tag do JUCE usada pelo FetchContent")

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
option(PRESETER_ENABLE_JACK "Linux: habilita JACK (exige libjack-dev)" OFF)

# --------------------------------------------------------------------------
# Alvo: processo sem janela, controlado por JSON em stdin/stdout
# --------------------------------------------------------------------------
juce_add_console_app(PreseterEngine
    PRODUCT_NAME "preseter-engine"
    COMPANY_NAME "Preseter")

target_sources(PreseterEngine PRIVATE
    src/Main.cpp
    src/Engine.cpp
    src/CommandRouter.cpp)

target_include_directories(PreseterEngine PRIVATE src)

target_compile_definitions(PreseterEngine PRIVATE
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_PLUGINHOST_VST3=1
    JUCE_PLUGINHOST_VST=0
    JUCE_PLUGINHOST_LADSPA=0
    JUCE_PLUGINHOST_LV2=0
    JUCE_STRICT_REFCOUNTEDPOINTER=1
    JUCE_MODAL_LOOPS_PERMITTED=0)

if(APPLE)
    target_compile_definitions(PreseterEngine PRIVATE JUCE_PLUGINHOST_AU=1)
endif()

if(WIN32 AND PRESETER_ENABLE_ASIO)
    if(NOT PRESETER_ASIO_SDK_DIR)
        message(FATAL_ERROR "PRESETER_ENABLE_ASIO=ON exige -DPRESETER_ASIO_SDK_DIR=<pasta do ASIO SDK>")
    endif()
    target_compile_definitions(PreseterEngine PRIVATE JUCE_ASIO=1)
    target_include_directories(PreseterEngine PRIVATE "${PRESETER_ASIO_SDK_DIR}/common")
endif()

if(UNIX AND NOT APPLE AND PRESETER_ENABLE_JACK)
    target_compile_definitions(PreseterEngine PRIVATE JUCE_JACK=1)
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
