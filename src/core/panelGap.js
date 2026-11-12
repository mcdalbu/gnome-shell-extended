// SPDX-License-Identifier: GPL-3.0-only
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Signals} from './render/signals.js';

// Shell reserves the rounded panelBox bounds, which can include theme spacing
// or an extra logical pixel after fractional allocation. Replace only that
// reservation with the panel's painted edge; Mutter then lays out maximized
// windows normally. No window actors or panel backgrounds are stretched.
export class PanelGap {
    constructor(panel, settings) {
        this.panel = panel;
        this.settings = settings;
        this.layout = Main.layoutManager;
        this.box = this.layout.panelBox;
        this.signals = new Signals();
        this.later = 0;
        this.signals.connect(settings, 'changed::panel-remove-gap', () => this.queue());
        this.signals.connect(this.layout, 'monitors-changed', () => this.queue());
        for (const actor of [panel, this.box])
            this.signals.connect(actor, 'notify::allocation', () => this.queue());
        this.queue();
    }

    queue() {
        if (this.later)
            return;
        this.later = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this.later = 0;
            this.sync();
            return false;
        });
    }

    sync() {
        if (!this.settings.get_boolean('panel-remove-gap')) {
            this.restore();
            return;
        }
        const [x, y] = this.box.get_transformed_position();
        const [width, height] = this.box.get_transformed_size();
        const [, panelY] = this.panel.get_transformed_position();
        const [, panelHeight] = this.panel.get_transformed_size();
        if (![x, y, width, height, panelY, panelHeight].every(Number.isFinite) || width <= 0 || panelHeight <= 0)
            return;
        const bottom = Math.floor(panelY + panelHeight + 1e-6);
        if (bottom >= Math.round(y) + Math.round(height)) {
            this.restore();
            return;
        }
        if (!this.original) {
            // Keep all native tracking flags (including fullscreen behavior).
            // Only the strut owner changes; the panel stays in its container.
            const data = this.layout._trackedActors.find(record => record.actor === this.box);
            if (!data?.affectsStruts)
                return;
            this.original = Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'actor'));
            this.layout.untrackChrome(this.box);
            this.layout.trackChrome(this.box, {...this.original, affectsStruts: false});
            this.reservation = new St.Widget({name: 'gse-panel-reservation', reactive: false, opacity: 0});
            this.signals.connect(this.reservation, 'destroy', () => {
                this.reservation = null;
            });
            this.layout.addChrome(this.reservation, {affectsStruts: true,
                ...('affectsInputRegion' in this.original ? {affectsInputRegion: false} : {})});
        }
        this.reservation?.set_position(Math.round(x), Math.round(y));
        this.reservation?.set_size(Math.round(width), Math.max(0, bottom - Math.round(y)));
    }

    restore() {
        if (!this.original)
            return;
        this.layout.untrackChrome(this.box);
        if (this.box.get_parent())
            this.layout.trackChrome(this.box, this.original);
        this.original = null;
        this.reservation?.destroy();
        this.reservation = null;
    }

    destroy() {
        if (this.later)
            global.compositor.get_laters().remove(this.later);
        this.later = 0;
        this.signals.clear();
        this.restore();
    }
}
