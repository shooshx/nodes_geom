import sys, os, time, threading, ctypes, subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer

#run C:\lib\emscripten\emsdk\emsdk_env.bat


this_dir = os.path.dirname(os.path.abspath(__file__))

HOST_NAME = 'localhost'
PORT_NUMBER = 8000

MIME_TYPES = {".html": "text/html", 
              ".js":"text/javascript", 
              ".css":"text/css",
              ".wasm":"application/wasm",
              ".map":"application/wasm",
              ".ico":"image/x-icon",
              ".png":"image/png",
              }

CPP_SOURCES = []
CPP_HEADERS = []
JS_OUT = "out/geom_nodes.js"

class HException(Exception):
    def __init__(self, code, msg):
        self.code = code
        self.msg = msg

def check_need_update():
    out_modified = os.stat(JS_OUT).st_mtime
    for cpp in CPP_SOURCES + CPP_HEADERS:
        if not os.path.exists(cpp):
            raise HException(500, "Did not find file " + cpp)
        if os.stat(cpp).st_mtime > out_modified:
            return True
    return False
    

compiling_thread = None
status = ("ready", "")

WASM = 0
DEBUG_CMD = "em++ -g4 -O0 -s WASM=%s --bind -s ASSERTIONS=2 -s SAFE_HEAP=1 -s DEMANGLE_SUPPORT=1 -s ALLOW_MEMORY_GROWTH=0 -s NO_EXIT_RUNTIME=1 -s DISABLE_EXCEPTION_CATCHING=0 -D_DEBUG -D_LIBCPP_DEBUG=0  --memory-init-file 0 -Wno-switch -Isrc -o out/geom_nodes.js " % (WASM)


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
        print(out.decode('ascii'))
    global compiling_thread
    compiling_thread = None

class MyHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            if "/./" in self.path or "/../" in self.path:
                raise HException(500, 'illigal path')
            getpath = self.path
            if getpath == '/': 
                if check_need_update():
                    global compiling_thread
                    if compiling_thread is not None:
                        raise HException(500, 'still working')
                    compiling_thread = threading.Thread(target=compile)
                    compiling_thread.start()
                    getpath = "/compiling.html"
                else:
                    getpath = '/index.html'
            
            if getpath == "/status":
                #print("  Sending", status)
                self.send_response(200)
                self.send_header('Content-type', 'text/plain')
                self.end_headers()
                self.wfile.write(bytes(status[0] + "\n" + status[1], "latin1"))
                return

            ext = os.path.splitext(getpath)[1]
            if ext not in MIME_TYPES:
                raise HException(500, 'unknown extension `%s` in `%s`' % (ext, getpath))

            fpath = this_dir + getpath
            if os.path.exists(fpath):
                self.send_file(fpath, ext)
                return
            if ext == ".map":
                # chrome asks for the .wasm.map file without the folder
                fpath = this_dir + "/out" + getpath
                print("Checking", fpath)
                if os.path.exists(fpath):
                    self.send_file(fpath, ext)
                    return

        except HException as e:
            print(e)
            self.error(e.code, e.msg)
            return

        self.error(404)

    def send_file(self, fpath, ext):
        self.send_response(200)
        self.send_header('Content-type', MIME_TYPES[ext])
        self.end_headers()
        content = open(fpath, "rb").read()
        self.wfile.write(content)


    def error(self, code, msg=""):
        self.send_response(code)
        self.send_header('Content-type', 'text/html')
        self.end_headers()
        content = ('''
        <html><head><title>Error</title><style>
        body { font-family: Verdana; }
        </style>
        </head>
        <body><p>Something went wrong: %s</p>
        <p>msg: %s</p>
        </body></html>
        ''' % (code, msg)).encode('ascii')  
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