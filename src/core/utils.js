// SPDX-License-Identifier: GPL-3.0-only
import GLib from 'gi://GLib';

// One scope per module or visible surface. Dispose before dropping the actor.
export class ResourceScope {
    constructor(onError = error => console.error(error)) {
        this._cleanups = new Set();
        this._closed = false;
        this._onError = onError;
    }

    own(cleanup) {
        if (this._closed)
            throw new Error('ResourceScope already disposed');
        this._cleanups.add(cleanup);
        return cleanup;
    }

    connect(object, signal, callback) {
        if (this._closed)
            throw new Error('ResourceScope already disposed');
        const id = object.connect(signal, callback);
        this.own(() => object.disconnect(id));
        return id;
    }

    effect(actor, name, effect) {
        if (this._closed)
            throw new Error('ResourceScope already disposed');
        if (actor.get_effect(name))
            throw new Error(`Effect name already owned: ${name}`);
        actor.add_effect_with_name(name, effect);
        this.own(() => {
            try {
                if (actor.get_effect(name) === effect)
                    actor.remove_effect(effect);
            } finally {
                // Clutter.Effect is a GObject, not an actor with destroy().
                effect.run_dispose();
            }
        });
        return effect;
    }

    debounce(delayMs, callback) {
        if (this._closed)
            throw new Error('ResourceScope already disposed');
        let sourceId = 0;
        const cancel = () => {
            if (sourceId) {
                GLib.Source.remove(sourceId);
                sourceId = 0;
            }
        };
        this.own(cancel);
        return (...args) => {
            if (this._closed)
                return;
            cancel();
            sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
                sourceId = 0;
                callback(...args);
                return GLib.SOURCE_REMOVE;
            });
        };
    }

    dispose() {
        if (this._closed)
            return;
        this._closed = true;
        for (const cleanup of [...this._cleanups].reverse()) {
            try {
                cleanup();
            } catch (error) {
                this._onError(error);
            }
        }
        this._cleanups.clear();
    }
}
