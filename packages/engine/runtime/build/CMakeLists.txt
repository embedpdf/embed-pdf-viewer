cmake_minimum_required(VERSION 3.15)
project(pdf_runtime_node)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT DEFINED PDFIUM_LIB_DIR)
  message(FATAL_ERROR "PDFIUM_LIB_DIR is required")
endif()

if(NOT DEFINED PDFIUM_INCLUDE_DIR)
  message(FATAL_ERROR "PDFIUM_INCLUDE_DIR is required")
endif()

set(GENERATED_DIR "${CMAKE_CURRENT_LIST_DIR}/generated")

add_library(${PROJECT_NAME} SHARED
  "${GENERATED_DIR}/binding.generated.cc"
)

target_include_directories(${PROJECT_NAME} PRIVATE
  ${CMAKE_JS_INC}
  "${PDFIUM_INCLUDE_DIR}"
)

if(WIN32)
  set(PDFIUM_LIB "${PDFIUM_LIB_DIR}/pdfium.dll.lib")
elseif(APPLE)
  set(PDFIUM_LIB "${PDFIUM_LIB_DIR}/libpdfium.dylib")
  set_target_properties(${PROJECT_NAME} PROPERTIES
    BUILD_RPATH   "@loader_path"
    INSTALL_RPATH "@loader_path"
  )
elseif(UNIX)
  if(EXISTS "${PDFIUM_LIB_DIR}/libpdfium.so")
    set(PDFIUM_LIB "${PDFIUM_LIB_DIR}/libpdfium.so")
    set_target_properties(${PROJECT_NAME} PROPERTIES
      BUILD_RPATH   "$ORIGIN"
      INSTALL_RPATH "$ORIGIN"
    )
  else()
    set(PDFIUM_LIB "${PDFIUM_LIB_DIR}/libpdfium.a")
  endif()
endif()

target_link_libraries(${PROJECT_NAME} PRIVATE
  ${CMAKE_JS_LIB}
  "${PDFIUM_LIB}"
)

if(APPLE)
  target_link_libraries(${PROJECT_NAME} PRIVATE
    "-framework AppKit"
    "-framework CoreFoundation"
    "-framework CoreGraphics"
    "-framework Foundation"
  )
elseif(WIN32)
  target_link_libraries(${PROJECT_NAME} PRIVATE
    advapi32
    gdi32
    user32
    usp10
  )
else()
  target_link_libraries(${PROJECT_NAME} PRIVATE
    pthread
    dl
    m
  )
endif()

set_target_properties(${PROJECT_NAME} PROPERTIES
  PREFIX ""
  SUFFIX ".node"
  OUTPUT_NAME "pdf-runtime"
)
