// SPDX-License-Identifier: GPL-2.0-or-later
#include <cogl/cogl.h>
/**
 * frame_probe_read:
 * @framebuffer: framebuffer to read after paint
 * @x: left pixel
 * @y: top pixel
 * @width: width in pixels
 * @height: height in pixels
 *
 * Returns: (transfer full) (nullable): RGBA pixels, without painting another frame
 */
GBytes *frame_probe_read(CoglFramebuffer *framebuffer, int x, int y, int width, int height);
