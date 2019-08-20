import sys, os, time, threading, ctypes
from http.server import BaseHTTPRequestHandler, HTTPServer

this_dir = os.path.dirname(os.path.abspath(__file__))

HOST_NAME = 'localhost'
PORT_NUMBER = 8000

MIME_TYPES = {".html": "text/html", 
              ".js":"text/javascript", 
              ".css":"text/css"
              }

class MyHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if "/./" in self.path or "/../" in self.path:
            self.error(500, 'illigal path')
            return
        getpath = self.path
        if getpath == '/':
            getpath = '/index.html'

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