// SPDX-License-Identifier: GPL-3.0-only
import Meta from 'gi://Meta';
import St from 'gi://St';
import {Signals} from './render/signals.js';
import {StyleLease} from './style.js';

// Opacity alone needs no scene actors, frame callbacks or framebuffer captures.
export class TintSurface {
    constructor(box, _anchor, settings, _logger, options = {}) {
        Object.assign(this, {box, settings, options});
        this.signals = new Signals();
        this.style = new StyleLease(box);
        this.signals.connect(box, 'destroy', () => this.destroy(true));
        this.signals.connect(box, 'style-changed', () => {
            if (!this._writing && box.get_style() !== this.style.applied)
                this._queueUpdate();
        });
        this.signals.connect(St.ThemeContext.get_for_stage(global.stage), 'changed', () => {
            this.color = null;
            this._queueUpdate();
        });
        this.update();
    }

    _queueUpdate() {
        if (this._destroyed || this._later)
            return;
        this._later = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._later = 0;
            this.update();
            return false;
        });
    }

    update() {
        if (this._destroyed)
            return;
        this._writing = true;
        try {
            if (!this.color || this.box.get_style() !== this.style.applied) {
                this.style.restore();
                const {red, green, blue} = this.box.get_theme_node().get_background_color();
                this.color = [red, green, blue];
            }
            this.alpha = this.options.opacity?.() ?? this.settings.get_double('surface-opacity');
            this.setFade(this.options.fade?.() ?? 1);
        } finally {
            this._writing = false;
        }
    }

    setFade(value) {
        if (this._destroyed || !this.color)
            return;
        this._writing = true;
        this.style.set(`background-color: rgba(${this.color.join(',')},${this.alpha * value}); background-image: none; transition-duration: 0ms;`);
        this._writing = false;
    }

    destroy(actorDestroyed = false) {
        if (this._destroyed)
            return;
        this._destroyed = true;
        if (this._later)
            global.compositor.get_laters().remove(this._later);
        this._later = 0;
        this.signals.clear();
        if (!actorDestroyed)
            this.style.restore();
    }
}
