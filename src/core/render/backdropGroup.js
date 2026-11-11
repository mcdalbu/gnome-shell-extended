// SPDX-License-Identifier: GPL-3.0-only
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';

// Decorative captures must never participate in either ALL or REACTIVE picking.
// In particular, padded capture actors must not interfere with dock hover.
export const BackdropGroup = GObject.registerClass(class GseBackdropGroup extends Meta.BackgroundGroup {
    vfunc_pick(_context) {}
});

export const BackdropWidget = GObject.registerClass(class GseBackdropWidget extends St.Widget {
    vfunc_pick(_context) {}
});
