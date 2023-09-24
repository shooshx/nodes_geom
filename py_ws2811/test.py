import os, sys, time, signal

this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(this_dir, "build", "lib.linux-armv7l-3.9"))

import py_ws2811

def Color(red, green, blue, white=0):
    return (white << 24) | (red << 16) | (green << 8) | blue

def wheel(pos):
    """Generate rainbow colors across 0-255 positions."""
    if pos < 85:
        return Color(pos * 3, 255 - pos * 3, 0)
    elif pos < 170:
        pos -= 85
        return Color(255 - pos * 3, 0, pos * 3)
    else:
        pos -= 170
        return Color(0, pos * 3, 255 - pos * 3)


def rainbow(cbuf):
    """Draw rainbow that fades across all pixels at once."""
    for j in range(16):
        for i in range(16):
            cbuf[i*16 + j] = (wheel((i + j) & 255)//10)

def ctrl_c_handler(sig, frame):
    print('You pressed Ctrl+C!')
    py_ws2811.fill(0)
    sys.exit(0)

def main_matrix():
    py_ws2811.init(16, 16, 1.0)

    ba = bytearray(16*16*4)
    cbuf = memoryview(ba).cast('I')
    rainbow(cbuf)

    #py_ws2811.set_buffer(ba)

    py_ws2811.fill(0x000000)


colors = [0xff0000, 0x00ff00, 0x0000ff, 0xff00ff]

def main():
    signal.signal(signal.SIGINT, ctrl_c_handler)
    py_ws2811.init(1, 4, 1.0)

    ba = bytearray(1*4*4)
    cbuf = memoryview(ba).cast('I')
    offset = 0
    while True:
        for i in range(0, 4):
            cbuf[(i+offset)%4] = colors[i]

        py_ws2811.set_buffer(ba)
        time.sleep(1)
        offset += 1





if __name__ == "__main__":
    
    main()
