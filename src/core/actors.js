// SPDX-License-Identifier: GPL-3.0-only
import GObject from 'gi://GObject';
import {Signals} from './render/signals.js';
import {StyleLease} from './style.js';

export function childSignal(actor) {
    return GObject.signal_lookup('child-added', actor) ? 'child-added' : 'actor-added';
}

export function findActor(root, predicate, depth = 8) {
    if (!root)
        return null;
    if (predicate(root))
        return root;
    if (depth > 0) {
        for (const child of root.get_children()) {
            const result = findActor(child, predicate, depth - 1);
            if (result)
                return result;
        }
    }
    return null;
}

// Actor visibility is the lazy-loading boundary, not extension enable().
export class SurfaceBinding {
    constructor({box, anchor, menu, settings, logger, enabled, options, onDestroy}) {
        Object.assign(this, {box, anchor, menu, settings, logger, enabled, options, onDestroy});
        this.signals = new Signals();
        this.token = 0;
        this.closed = false;
        this.signals.connect(box, 'notify::mapped', () => this.sync());
        this.signals.connect(box, 'destroy', () => this.destroy(true));
        if (anchor !== box) {
            this.signals.connect(anchor, 'notify::mapped', () => this.sync());
            this.signals.connect(anchor, 'destroy', () => this.destroy(true));
        }
        if (menu) {
            this.arrowStyle = new StyleLease(menu.actor);
            this.signals.connect(menu, 'open-state-changed', () => this.sync());
        }
        this.sync();
    }

    sync() {
        if (this.closed)
            return;
        const active = this.enabled() && this.box.mapped && this.anchor.mapped &&
            (!this.menu || this.menu.isOpen);
        if (!active) {
            this.token++;
            this.loading = false;
            this.surface?.destroy();
            this.surface = null;
            this.arrowStyle?.restore();
            return;
        }
        this.arrowStyle?.set('-arrow-background-color: transparent;');
        const alpha = this.options?.opacity?.() ?? this.settings.get_double('surface-opacity');
        const kind = this.options?.blur?.() !== false && alpha < 1 &&
            this.settings.get_int('blur-radius') > 0 &&
            this.settings.get_string('blur-backend') !== 'off' ? 'blur' : 'tint';
        if (kind !== this.surfaceKind) {
            this.token++;
            this.loading = false;
            this.surface?.destroy();
            this.surface = null;
            this.surfaceKind = kind;
        }
        if (this.surface) {
            this.surface.update();
            return;
        }
        if (this.loading)
            return;
        const token = ++this.token;
        this.loading = true;
        import(kind === 'blur' ? './surface.js' : './tintSurface.js').then(exports => {
            if (this.closed || token !== this.token)
                return;
            this.loading = false;
            if (this.enabled() && this.box.mapped && this.anchor.get_parent())
                this.surface = new (kind === 'blur' ? exports.Surface : exports.TintSurface)(
                    this.box, this.anchor, this.settings, this.logger, this.options);
        }).catch(error => {
            if (!this.closed && token === this.token) {
                this.loading = false;
                this.logger.error('Surface activation', error);
            }
        });
    }

    destroy(actorDestroyed = false) {
        if (this.closed)
            return;
        this.closed = true;
        this.token++;
        this.signals.clear();
        this.surface?.destroy(actorDestroyed);
        this.surface = null;
        if (!actorDestroyed)
            this.arrowStyle?.restore();
        this.onDestroy?.();
    }
}
