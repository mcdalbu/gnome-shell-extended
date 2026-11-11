// SPDX-License-Identifier: GPL-3.0-only
import {MODULE_KEYS} from './config.js';

export class ModuleManager {
    constructor(settings, loaders, logger) {
        this._settings = settings;
        this._loaders = loaders;
        this._logger = logger;
        this._slots = new Map();
        this._signals = [];
        this._active = false;
    }

    enable() {
        if (this._active)
            return;
        this._active = true;
        for (const name of Object.keys(this._loaders)) {
            const key = MODULE_KEYS[name];
            if (!key)
                throw new Error(`Unknown module: ${name}`);
            this._signals.push(this._settings.connect(`changed::${key}`, () => {
                this._sync(name);
            }));
            this._sync(name);
        }
    }

    _sync(name) {
        if (!this._active)
            return;
        const previous = this._slots.get(name);
        if (!this._settings.get_boolean(MODULE_KEYS[name]) || (this._suspended && name !== 'blur')) {
            this._slots.delete(name); // Invalidates pending imports too.
            if (previous?.instance)
                this._dispose(name, previous.instance);
            return;
        }
        if (previous)
            return;
        const slot = {instance: null};
        this._slots.set(name, slot);
        // Start from a promise to catch synchronous loader failures as well.
        slot.pending = Promise.resolve().then(() => {
            if (!this._active || this._slots.get(name) !== slot)
                return null;
            return this._loaders[name]();
        }).then(exports => {
            if (!exports || !this._active || this._slots.get(name) !== slot)
                return;
            const instance = new exports.default({
                settings: this._settings,
                logger: this._logger,
            });
            slot.instance = instance;
            // Module enable/disable are synchronous; async imports are owned here.
            instance.enable();
            this._logger.debug?.(`Enabled module ${name}`);
        }).catch(error => {
            if (this._slots.get(name) === slot) {
                this._slots.delete(name);
                if (slot.instance)
                    this._dispose(name, slot.instance);
            }
            this._logger.error(`Module ${name} failed`, error);
        }).finally(() => {
            slot.pending = null;
        });
    }

    _dispose(name, instance) {
        try {
            instance.disable();
            this._logger.debug?.(`Disabled module ${name}`);
        } catch (error) {
            this._logger.error(`Module ${name} cleanup failed`, error);
        }
    }

    // Useful for lifecycle tests; the Shell never blocks waiting for an import.
    async settled() {
        await Promise.all([...this._slots.values()].map(slot => slot.pending));
    }

    setSuspended(suspended) {
        this._suspended = suspended;
        for (const name of Object.keys(this._loaders))
            this._sync(name);
    }

    disable() {
        this._active = false;
        for (const id of this._signals.splice(0)) {
            try {
                this._settings.disconnect(id);
            } catch (error) {
                this._logger.error('Settings signal cleanup failed', error);
            }
        }
        const slots = [...this._slots.entries()].reverse();
        this._slots.clear();
        for (const [name, slot] of slots) {
            if (slot.instance)
                this._dispose(name, slot.instance);
        }
    }
}
