// SPDX-License-Identifier: GPL-2.0-or-later
// One GObject signal crossing per stage phase, shared by all surfaces.
const phases = new Map();

export class FrameSignals {
    constructor() {
        this._subscriptions = [];
    }

    connect(stage, signal, callback) {
        let phase = phases.get(signal);
        if (!phase) {
            phase = {stage, callbacks: new Set()};
            phase.id = stage.connect(signal, (...args) => {
                for (const handler of [...phase.callbacks]) {
                    if (phase.callbacks.has(handler)) {
                        try {
                            handler(...args);
                        } catch (error) {
                            logError(error);
                        }
                    }
                }
            });
            phases.set(signal, phase);
        }
        phase.callbacks.add(callback);
        this._subscriptions.push([signal, callback]);
    }

    clear() {
        for (const [signal, callback] of this._subscriptions.splice(0)) {
            const phase = phases.get(signal);
            phase.callbacks.delete(callback);
            if (!phase.callbacks.size) {
                phase.stage.disconnect(phase.id);
                phases.delete(signal);
            }
        }
    }
}
