"""Send actual X11 key events to the focused isolated test window, through Fcitx."""
import ctypes
import sys
import time

x11 = ctypes.CDLL('libX11.so.6')
xtest = ctypes.CDLL('libXtst.so.6')
x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XStringToKeysym.argtypes = [ctypes.c_char_p]
x11.XStringToKeysym.restype = ctypes.c_ulong
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XKeysymToKeycode.restype = ctypes.c_uint
x11.XFlush.argtypes = [ctypes.c_void_p]
x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
x11.XSetInputFocus.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
xtest.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
display = x11.XOpenDisplay(None)
if not display:
    raise RuntimeError('无法连接隔离测试显示器')
try:
    if len(sys.argv) > 2:
        # Xvfb has no window manager to honor Electron's focus request.
        x11.XSetInputFocus(display, int(sys.argv[2]), 1, 0)
        x11.XFlush(display)
    for char in sys.argv[1]:
        symbol = {' ': 'space', '\n': 'Return'}.get(char, char)
        key = x11.XKeysymToKeycode(display, x11.XStringToKeysym(symbol.encode('ascii')))
        if not key:
            raise RuntimeError(f'缺少按键 {symbol}')
        xtest.XTestFakeKeyEvent(display, key, 1, 0)
        xtest.XTestFakeKeyEvent(display, key, 0, 0)
        x11.XFlush(display)
        time.sleep(.04)
finally:
    x11.XCloseDisplay(display)
