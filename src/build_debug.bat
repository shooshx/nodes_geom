rem run C:\lib\emscripten\emsdk\emsdk_env.bat before
rem %EMSCRIPTEN%\emcc --clear-cache
rem --tracing
rem -D_LIBCPP_DEBUG=0  
rem --preload-file loads things late
rem Pointer_stringify

em++  -g4 -O0 -s WASM=1 --bind -s ASSERTIONS=2 -s SAFE_HEAP=1 -s DEMANGLE_SUPPORT=1 -s ALLOW_MEMORY_GROWTH=0 -s NO_EXIT_RUNTIME=1 -D_DEBUG -D_LIBCPP_DEBUG=0  --memory-init-file 0 -Wno-switch -Isrc src/mesh.cpp -o out/geom_nodes.js 

