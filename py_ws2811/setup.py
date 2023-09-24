import os
from distutils.core import setup, Extension

this_dir = os.path.dirname(os.path.abspath(__file__))

module1 = Extension('py_ws2811',
                    include_dirs = [this_dir + '/../../rpi_ws281x'],
                    libraries = ['ws2811'],
                    library_dirs = [this_dir + '/../../rpi_ws281x'],
                    sources = ['py_ws2811.c'])

setup (name = 'py_ws2811',
       version = '1.0',
       description = 'wrapper with bffer support',
       ext_modules = [module1])


# clone this repo on the parent dir
# https://github.com/jgarff/rpi_ws281x

# python3 setup.py build


# rpi4 support?:
# https://github.com/beyondscreen/rpi_ws281x/commits/master