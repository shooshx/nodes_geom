import sys, os, time, threading, ctypes, subprocess, functools, signal
from http.server import BaseHTTPRequestHandler, HTTPServer, ThreadingHTTPServer

import requests

#run C:\lib\emscripten\emsdk\emsdk_env.bat


this_dir = os.path.dirname(os.path.abspath(__file__))

# HOST_NAME = 'localhost'
HOST_NAME = '0.0.0.0'
PORT_NUMBER = 8000

MIME_TYPES = {".html": "text/html", 
              ".js":"text/javascript", 
              ".css":"text/css",
              ".wasm":"application/wasm",
              ".map":"application/wasm",
              ".ico":"image/x-icon",
              ".png":"image/png",
              ".svg":"image/svg+xml",
              }

CPP_SOURCES = []
CPP_HEADERS = []
JS_OUT = "out/geom_nodes.js"

class HException(Exception):
    def __init__(self, code, msg):
        self.code = code
        self.msg = msg

def check_need_update():
    return False
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


class TkImgWnd:
    def __init__(self):
        def tk_loop():
            self.root = tk.Tk()
            #self.root.geometry("700x350")

            self.panel = tk.Label(self.root)  # , image=img)
            self.panel.pack(side="bottom", fill="both", expand="yes")

            self.root.mainloop()

        thread = threading.Thread(target=tk_loop)
        thread.start()

    def set_im(self, im):
        rim = im.resize((250,250), Image.NEAREST)
        img2 = ImageTk.PhotoImage(rim, (100,100))
        self.panel.configure(image=img2)
        self.panel.image = img2



class DisplayWnd:
    def __init__(self):
        from PIL import Image, ImageTk
        import tkinter as tk

        self.count = 0
        self.last_print_ts = 0
        self.last_print_count = 0

        self.wnd = TkImgWnd()

    def display_data(self, data):
        #print("disp got", len(data), "count", self.count)

        im = Image.frombytes("RGBA", (16, 16), data)
        #im.save( os.path.join(this_dir, "data_display.png"))
        #im.show()
        self.wnd.set_im(im)


        now = time.time()
        if now - self.last_print_ts >= 1.0:
            print(self.count - self.last_print_count, "FPS")
            self.last_print_ts = now
            self.last_print_count = self.count
        self.count += 1


def data_to_arduino(data):
    assert len(data) == 1024, "unexpected data size"
    tosend = []
    si = 0
    # RGBA to RGB
    while si < 1024:
        tosend.append(data[si])
        si += 1
        tosend.append(data[si])
        si += 1
        tosend.append(data[si])
        si += 2
    return bytes(tosend)

class DisplayArduinoSerial:
    def __init__(self):
        import serial
        self.ser = serial.Serial('COM5', 300000) #115200)
        self.count = 0

    def display_data(self, data):
        tosend = data_to_arduino(data)
        s = time.time()
        self.ser.write(tosend)
        print("sent", self.count, "took", time.time()-s)
        self.count += 1


class DisplayArduinoWifi:
    def __init__(self):
        self.count = 0

    def display_data(self, data):
        tosend = data_to_arduino(data)
        s = time.time()
        requests.post("http://192.168.4.22/data/", tosend)
        #requests.post("http://10.100.102.51/data/", tosend)
        print("sent", self.count, "took", time.time()-s)
        self.count += 1

py_ws2811 = None
class DisplayRaspPi:
    def __init__(self):
        sys.path.append(os.path.join(this_dir, "../build/lib.linux-armv7l-3.9"))
        import py_ws2811 as _py_ws2811
        global py_ws2811
        py_ws2811 = _py_ws2811
        py_ws2811.init(16, 16, 2.0)

        signal.signal(signal.SIGINT, ctrl_c_handler)

        self.count = 0
        self.last_print_ts = 0

    def display_data(self, data):
        py_ws2811.set_buffer(data)

        self.count += 1
        now = time.time()
        if now - self.last_print_ts >= 1.0:
            print(self.count, "FPS")
            self.last_print_ts = now
            self.count = 0


def ctrl_c_handler(sig, frame):
    print('You pressed Ctrl+C!')
    py_ws2811.fill(0)
    sys.exit(0)



class MyHandler(BaseHTTPRequestHandler):
    def __init__(self, disp, *args, **kwargs):
        self.display = disp
        super().__init__(*args, **kwargs)

    def log_message(self, format, *args):
        return

    def do_POST(self):
        content_len = int(self.headers['Content-Length'])
        data = self.rfile.read(content_len)
        self.display.display_data(data)

        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()
        self.wfile.write(bytes("OK", "latin1"))

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
    # DisplayArduinoWifi() DisplayArduinoSerial()
    disp = DisplayRaspPi()
    handler_cls = functools.partial(MyHandler, disp)

# ThreadingHTTPServer
    httpd = HTTPServer((HOST_NAME, PORT_NUMBER), handler_cls)
    print(time.asctime(), 'Server Starts - %s:%s' % (HOST_NAME, PORT_NUMBER))
    try:
        httpd.serve_forever()
        print("arg")
    except KeyboardInterrupt:
        pass
    httpd.server_close()
    print(time.asctime(), 'Server Stops - %s:%s' % (HOST_NAME, PORT_NUMBER))




def main():
    serve()
    return

    thread = threading.Thread(target=serve)
    thread.start()
    print("started")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    sys.exit(main())