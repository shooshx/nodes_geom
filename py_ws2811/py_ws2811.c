#include <Python.h>
#include <stdio.h>
#include <stdbool.h>

#include "../../rpi_ws281x/clk.h"
#include "../../rpi_ws281x/gpio.h"
#include "../../rpi_ws281x/dma.h"
#include "../../rpi_ws281x/pwm.h"
#include "../../rpi_ws281x/version.h"

#include "../../rpi_ws281x/ws2811.h"


// https://github.com/jgarff/rpi_ws281x

#define ARRAY_SIZE(stuff)       (sizeof(stuff) / sizeof(stuff[0]))

// defaults for cmdline options
#define TARGET_FREQ             WS2811_TARGET_FREQ
#define GPIO_PIN                18
#define DMA                     10
//#define STRIP_TYPE            WS2811_STRIP_RGB		// WS2812/SK6812RGB integrated chip+leds
#define STRIP_TYPE              WS2811_STRIP_GBR		// WS2812/SK6812RGB integrated chip+leds
//#define STRIP_TYPE            SK6812_STRIP_RGBW		// SK6812RGBW (NOT SK6812RGB)

#define WIDTH                   8
#define HEIGHT                  8
#define LED_COUNT               (WIDTH * HEIGHT)

int g_width = WIDTH;
int g_height = HEIGHT;
int g_led_count = LED_COUNT;


ws2811_t ledstring =
{
    .freq = TARGET_FREQ,
    .dmanum = DMA,
    .channel =
    {
        [0] =
        {
            .gpionum = GPIO_PIN,
            .invert = 0,
            .count = LED_COUNT,
            .strip_type = STRIP_TYPE,
            .brightness = 255,
        },
        [1] =
        {
            .gpionum = 0,
            .invert = 0,
            .count = 0,
            .brightness = 0,
        },
    },
};

ws2811_led_t *matrix;


bool init(int height, int width, double gamma)
{
    ws2811_return_t ret;
    if (height <= 0 || width <= 0) {
        printf ("invalid size %d %d\n", width, height);
        false;
    }

    g_width = width;
    g_height = height;
    g_led_count = height * width;
    ledstring.channel[0].count = g_led_count;        

    if ((ret = ws2811_init(&ledstring)) != WS2811_SUCCESS)
    {
        fprintf(stderr, "ws2811_init failed: %s\n", ws2811_get_return_t_str(ret));
        return false;
    }
    if (gamma != 1.0) {
        ws2811_set_custom_gamma_factor(&ledstring, gamma);
    }

    return true;
}

static PyObject *py_init(PyObject *self, PyObject *args)
{
    int width = 0, height = 0;
    double gamma = 1.0;

    if (!PyArg_ParseTuple(args, "iid", &width, &height, &gamma))
        return NULL;

    //printf("init\n");
    if (!init(width, height, gamma))
        return NULL;
    
    Py_RETURN_NONE;
}


static PyObject *py_fill(PyObject *self, PyObject *args)
{
    unsigned int c = 0;
    ws2811_return_t ret;

    if (!PyArg_ParseTuple(args, "I", &c))
        return NULL;

    for(int i = 0; i < g_led_count; ++i) {
        ledstring.channel[0].leds[i] = c;
    }

    if ((ret = ws2811_render(&ledstring)) != WS2811_SUCCESS)
    {
        fprintf(stderr, "ws2811_render failed: %s\n", ws2811_get_return_t_str(ret));
        PyErr_SetString(PyExc_ValueError, "ws2811_render failed");
        return NULL;
    }

    Py_RETURN_NONE;
}


static PyObject *py_set_buffer(PyObject *self, PyObject *args)
{
    Py_buffer buf;
    ws2811_return_t ret;

    if (!PyArg_ParseTuple(args, "y*", &buf))
        return NULL;

    if ((unsigned int)buf.len != g_led_count * sizeof(uint32_t)) {
        PyErr_SetString(PyExc_ValueError, "Unexpected buffer size");
        return NULL;
    }

    uint32_t* dest = ledstring.channel[0].leds;
    uint32_t* src = buf.buf;
    for(int y = 0; y < g_height; y += 2)
    {
        for(int x = 0; x < g_width; ++x)
        {
            dest[y*g_width + x] = src[y*g_width + x];
            dest[(y+1)*g_width + x] = src[(y+1)*g_width + (g_width - x - 1)];
        }
    }

    //memcpy(ledstring.channel[0].leds, buf.buf, buf.len);

    if ((ret = ws2811_render(&ledstring)) != WS2811_SUCCESS)
    {
        fprintf(stderr, "ws2811_render failed: %s\n", ws2811_get_return_t_str(ret));
        PyErr_SetString(PyExc_ValueError, "ws2811_render failed");
        return NULL;
    }

    //printf("set_buffer\n");
    Py_RETURN_NONE;
}



static PyMethodDef py_ws2811_methods[] = {
    {"init",  py_init, METH_VARARGS, "initialize"},
    {"fill",  py_fill, METH_VARARGS, "set_buffer"},
    {"set_buffer",  py_set_buffer, METH_VARARGS, "set_buffer"},

    {NULL, NULL, 0, NULL}        /* Sentinel */
};

static struct PyModuleDef py_ws2811_module = {
    PyModuleDef_HEAD_INIT,
    "py_ws2811",   /* name of module */
    NULL, /* module documentation, may be NULL */
    -1,       /* size of per-interpreter state of the module,
                 or -1 if the module keeps state in global variables. */
    py_ws2811_methods
};

PyMODINIT_FUNC PyInit_py_ws2811(void)
{
    return PyModule_Create(&py_ws2811_module);
}