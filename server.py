import sys, os, time, threading, ctypes, subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer

#run C:\lib\emscripten\emsdk\emsdk_env.bat


this_dir = os.path.dirname(os.path.abspath(__file__))

HOST_NAME = 'localhost'
PORT_NUMBER = 8000

MIME_TYPES = {".html": "text/html", 
              ".js":"text/javascript", 
              ".css":"text/css",
              ".wasm":"application/wasm"
              }

CPP_SOURCES = ["src/mesh.cpp"
            ]              
JS_OUT = "out/geom_nodes.js"

def check_need_update():
    out_modified = os.stat(JS_OUT).st_mtime
    for cpp in CPP_SOURCES:
        if os.stat(cpp).st_mtime > out_modified:
            return True
    return False
    

compiling_thread = None
status = ("ready", "")

DEBUG_CMD = "em++ -g4 -O0 -s WASM=1 --bind -s ASSERTIONS=2 -s SAFE_HEAP=1 -s DEMANGLE_SUPPORT=1 -s ALLOW_MEMORY_GROWTH=0 -s NO_EXIT_RUNTIME=1 -D_DEBUG -D_LIBCPP_DEBUG=0  --memory-init-file 0 -Wno-switch -Isrc -o out/geom_nodes.js " 


def compile():
    global status
    try:
        status = ("compiling", "")
        cmd = DEBUG_CMD.split() + CPP_SOURCES
        print("**", cmd)
        out = subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT)
        status = ("ready", out.decode('latin1'))
        print("** done")
    except Exception as e:
        out = e.output
        status = ("error", out.decode('latin1'))
        print(out)
    global compiling_thread
    compiling_thread = None

class MyHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if "/./" in self.path or "/../" in self.path:
            self.error(500, 'illigal path')
            return
        getpath = self.path
        if getpath == '/': 
            if check_need_update():
                global compiling_thread
                if compiling_thread is not None:
                    self.error(500, 'still working')
                    return
                compiling_thread = threading.Thread(target=compile)
                compiling_thread.start()
                getpath = "/compiling.html"
            else:
                getpath = '/index.html'
        
        if getpath == "/status":
            print("  Sending", status)
            self.send_response(200)
            self.send_header('Content-type', 'text/plain')
            self.end_headers()
            self.wfile.write(bytes(status[0] + "\n" + status[1], "latin1"))
            return

        ext = os.path.splitext(getpath)[1]
        if ext not in MIME_TYPES:
            self.error(500, 'unknown extension `%s` in `%s`' % (ext, getpath))
            return

        fpath = this_dir + getpath
        if os.path.exists(fpath):
            self.send_response(200)
            self.send_header('Content-type', MIME_TYPES[ext])
            self.end_headers()
            content = open(fpath, "rb").read()
            self.wfile.write(content)
            return

        self.error(404)

    def error(self, code, msg=""):
        self.send_response(code)
        self.send_header('Content-type', 'text/html')
        self.end_headers()
        content = '''
        <html><head><title>Error</title></head>
        <body><p>Something went wrong: {}</p>
        <p>msg: {}</p>
        </body></html>
        '''.format(code, msg).encode('ascii')   
        self.wfile.write(content)


def serve():
    httpd = HTTPServer((HOST_NAME, PORT_NUMBER), MyHandler)
    print(time.asctime(), 'Server Starts - %s:%s' % (HOST_NAME, PORT_NUMBER))
    try:
        httpd.serve_forever()
        print("arg")
    except KeyboardInterrupt:
        pass
    httpd.server_close()
    print(time.asctime(), 'Server Stops - %s:%s' % (HOST_NAME, PORT_NUMBER))



def main():
    thread = threading.Thread(target=serve)
    thread.start()
    print("started")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    print("killing")
    ctypes.windll.kernel32.TerminateProcess(ctypes.windll.kernel32.GetCurrentProcess())
    #os.kill(os.getpid(), signal.SIGKILL)

if __name__ == '__main__':
    sys.exit(main())