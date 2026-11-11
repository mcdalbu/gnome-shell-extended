// SPDX-License-Identifier: GPL-2.0-or-later
import GObject from 'gi://GObject';

// Explicit ownership also works for emitters which are not GObjects.
export class Signals {
    constructor() {
        this._connections = [];
        this._destroyHandlers = new Map();
    }

    connect(object, signal, callback) {
        if (object instanceof GObject.Object && GObject.signal_lookup('destroy', object) &&
            !this._destroyHandlers.has(object)) {
            // Observe destruction before user callbacks. Native disposal removes
            // those handlers itself; never disconnect them through a stale actor.
            const destroyId = object.connect('destroy', () => {
                this._connections = this._connections.filter(([source]) => source !== object);
                this._destroyHandlers.delete(object);
            });
            this._destroyHandlers.set(object, destroyId);
        }
        const id = object.connect(signal, callback);
        this._connections.push([object, id]);
        return id;
    }

    clear() {
        for (const [object, id] of this._connections.splice(0))
            object.disconnect(id);
        for (const [object, id] of this._destroyHandlers)
            object.disconnect(id);
        this._destroyHandlers.clear();
    }
}
