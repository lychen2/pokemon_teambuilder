cmake_minimum_required(VERSION 3.24)

project(poketeam_display VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(Qt6 REQUIRED COMPONENTS Widgets Gui Test Svg)

set(POKETEAM_REPO_ROOT "${CMAKE_CURRENT_LIST_DIR}/../.." CACHE PATH "poke-type repository root")

set(POKETEAM_SHARED_DATA
    localization-data.json
    team-planner-assets.json
)

foreach(asset_name IN LISTS POKETEAM_SHARED_DATA)
    configure_file("${POKETEAM_REPO_ROOT}/static/${asset_name}" "${CMAKE_CURRENT_LIST_DIR}/assets/data/${asset_name}" COPYONLY)
endforeach()

set(POKETEAM_SHARED_STATS
    abilities.json
    forms_index.json
    items.json
    moves.json
    pokedex.json
)

foreach(asset_name IN LISTS POKETEAM_SHARED_STATS)
    configure_file("${POKETEAM_REPO_ROOT}/poke_analysis-main/stats/${asset_name}" "${CMAKE_CURRENT_LIST_DIR}/assets/data/${asset_name}" COPYONLY)
endforeach()

set(POKETEAM_SOURCES
    src/team_parser.cpp
    src/data_repository.cpp
    src/team_analyzer.cpp
    src/team_renderer.cpp
    src/main_window.cpp
    src/share_controller.cpp
    include/poketeam/main_window.hpp
)

add_library(poketeam_core STATIC ${POKETEAM_SOURCES})
target_include_directories(poketeam_core PUBLIC include)
target_link_libraries(poketeam_core PUBLIC Qt6::Widgets Qt6::Gui Qt6::Svg)

add_executable(poketeam_display src/main.cpp)
target_link_libraries(poketeam_display PRIVATE poketeam_core)

include(CTest)
if(BUILD_TESTING)
    foreach(test_name IN ITEMS team_parser data_repository team_analyzer team_renderer)
        add_executable(test_${test_name} tests/test_${test_name}.cpp)
        target_link_libraries(test_${test_name} PRIVATE poketeam_core Qt6::Test)
        add_test(NAME test_${test_name} COMMAND test_${test_name})
    endforeach()
endif()
