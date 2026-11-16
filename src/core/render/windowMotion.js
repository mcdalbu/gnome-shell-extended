// SPDX-License-Identifier: GPL-3.0-only
let current = null;

// Owned by the extension, not individual blur actors. No frame callback or
// repeating timeout: the grace period is checked only on existing frames.
export class WindowMotion {
    constructor(display, grabOps, clock, redraw) {
        this.display = display;
        this.clock = clock;
        this.redraw = redraw;
        this.active = false;
        this.until = 0;
        const operations = new Set(Object.entries(grabOps)
            .filter(([name]) => /^(KEYBOARD_)?(MOVING|RESIZING)(_|$)/.test(name))
            .map(([, value]) => value));
        this.signals = [];
        try {
            this.signals.push(display.connect('grab-op-begin', (_display, _window, op) => {
                if (operations.has(op)) {
                    this.active = true;
                    this.until = 0;
                }
            }));
            this.signals.push(display.connect('grab-op-end', () => {
                if (!this.active)
                    return;
                this.active = false;
                // Let the dock's default 200ms intellihide transition finish.
                this.until = this.clock() + 250000;
                this.redraw();
            }));
        } catch (error) {
            this.destroy();
            throw error;
        }
    }

    get busy() {
        return this.active || this.clock() < this.until;
    }

    destroy() {
        for (const id of this.signals.splice(0))
            this.display.disconnect(id);
        this.active = false;
        this.until = 0;
    }
}

export function watchWindowMotion(...args) {
    current?.destroy();
    current = null;
    const tracker = new WindowMotion(...args);
    current = tracker;
    return () => {
        tracker.destroy();
        if (current === tracker)
            current = null;
    };
}

export function windowMotionActive() {
    return current?.busy ?? false;
}
