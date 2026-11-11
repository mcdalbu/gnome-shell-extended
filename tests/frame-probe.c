// SPDX-License-Identifier: GPL-2.0-or-later
#include "frame-probe.h"
GBytes *frame_probe_read(CoglFramebuffer *framebuffer, int x, int y, int width, int height) {
    gsize size = (gsize)width * height * 4;
    guint8 *pixels = g_malloc0(size);
    if (!cogl_framebuffer_read_pixels(framebuffer, x, y, width, height, COGL_PIXEL_FORMAT_RGBA_8888, pixels)) {
        g_free(pixels);
        return NULL;
    }
    return g_bytes_new_take(pixels, size);
}
