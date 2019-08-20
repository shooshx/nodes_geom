rem --profiling -s DEMANGLE_SUPPORT=1  -s TOTAL_MEMORY=20000000
rem --preload-file models/bunny.obj
rem -O3
rem -O0 -g3
%EMSCRIPTEN%\emcc -O3 --bind --memory-init-file 0 -Wno-switch -std=c++11 -s NO_EXIT_RUNTIME=1 -s ASSERTIONS=0 -s STACK_OVERFLOW_CHECK=0 -s ALLOW_MEMORY_GROWTH=1 -s WASM=0 -s PRECISE_F32=0 -s DISABLE_EXCEPTION_CATCHING=1 -Isrc src/main.cpp src/Mesh.cpp --preload-file models/bunny.obj  -o out/topo_js_main.html 