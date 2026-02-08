em++ $(ls ./code/cpp/*.cpp) \
  /workspace/packages/pdfium/pdfium-src/out/wasm/obj/libpdfium.a \
  -v \
  -sEXPORT_ES6=1 \
  -sENVIRONMENT=node,worker,web,shell \
  -sMODULARIZE=1 \
  -sWASM=1 \
  -sALLOW_MEMORY_GROWTH=1 \
  -sALLOW_TABLE_GROWTH=1 \
  -sEXPORT_NAME=createPdfium \
  -sUSE_ZLIB=1 \
  -sASSERTIONS=1 \
  -sEXPORTED_RUNTIME_METHODS=$(cat ./wasm/exported-runtime-methods.txt) \
  -sEXPORTED_FUNCTIONS=$(cat ./wasm/exported-functions.txt) \
  -lpdfium \
  -L/workspace/packages/pdfium/pdfium-src/out/wasm/obj \
  -I/workspace/packages/pdfium/pdfium-src/public \
  -std=c++11 \
  -Wall \
  --no-entry \
  -o \
  ./wasm/pdfium.js