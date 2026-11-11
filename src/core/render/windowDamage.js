// SPDX-License-Identifier: GPL-2.0-or-later
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import {Signals} from './signals.js';

export function windowBounds(actor) {
    if (!actor.mapped || !actor.visible)
        return null;
    const [x, y] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    return {x, y, right: x + width, bottom: y + height};
}

export function boundsIntersect(a, b, margin = 0) {
    // An unavailable transform must not suppress a repaint.
    if (![a.x, a.y, a.right, a.bottom, b.x, b.y, b.right, b.bottom].every(Number.isFinite))
        return true;
    return a.x < b.right + margin && a.right > b.x - margin &&
        a.y < b.bottom + margin && a.bottom > b.y - margin;
}

// Keep one set of source-window signals, regardless of how many backdrops
// sample them. Hidden backdrops release their subscription.
class WindowDamage {
    constructor() {
        this._subscribers = new Set();
        this._signals = new Signals();
        this._geometrySignals = new Signals();
        this._geometryActors = new WeakSet();
        this._bounds = new WeakMap();
        this._windows = new Map();
        this._dirty = new Set();
        this._removedBounds = [];
        this._later = 0;
    }

    subscribe(callback) {
        this._subscribers.add(callback);
        if (this._subscribers.size === 1)
            this._start();
        return () => {
            this._subscribers.delete(callback);
            if (!this._subscribers.size)
                this._stop();
        };
    }

    boundsFor(actor) {
        if (!this._windows.has(actor))
            return windowBounds(actor);
        if (!this._bounds.has(actor))
            this._bounds.set(actor, windowBounds(actor));
        return this._bounds.get(actor);
    }

    _start() {
        for (const group of new Set([global.window_group, global.top_window_group])) {
            if (!group)
                continue;
            this._watchAncestors(group);
            const added = GObject.signal_lookup('child-added', group) ? 'child-added' : 'actor-added';
            const removed = added === 'child-added' ? 'child-removed' : 'actor-removed';
            this._signals.connect(group, added, (_group, actor) => this._track(actor));
            this._signals.connect(group, removed, (_group, actor) => this._untrack(actor));
        }
        for (const actor of global.get_window_actors())
            this._track(actor);
    }

    _watchAncestors(actor) {
        for (let ancestor = actor; ancestor; ancestor = ancestor.get_parent()) {
            if (this._geometryActors.has(ancestor))
                continue;
            this._geometryActors.add(ancestor);
            const invalidate = () => {
                this._bounds = new WeakMap();
                for (const record of this._windows.values())
                    this._dirty.add(record);
                this._queueFlush();
            };
            for (const property of ['allocation', 'translation-x', 'translation-y',
                'scale-x', 'scale-y', 'rotation-angle-x', 'rotation-angle-y',
                'rotation-angle-z', 'pivot-point', 'transform', 'child-transform'])
                this._geometrySignals.connect(ancestor, `notify::${property}`, invalidate);
            this._geometrySignals.connect(ancestor, 'parent-set', () => {
                this._watchAncestors(ancestor.get_parent());
                invalidate();
            });
        }
    }

    _track(actor) {
        if (!actor.get_meta_window || this._windows.has(actor))
            return;
        const record = {actor, bounds: null, signals: new Signals()};
        this._windows.set(actor, record);
        const damaged = () => {
            this._dirty.add(record);
            this._queueFlush();
        };
        const update = () => {
            this._bounds.delete(actor);
            this._dirty.add(record);
            this._queueFlush();
        };
        for (const signal of ['notify::allocation', 'notify::visible', 'notify::mapped',
            'notify::opacity', 'notify::translation-x', 'notify::translation-y',
            'notify::scale-x', 'notify::scale-y', 'notify::rotation-angle-x',
            'notify::rotation-angle-y', 'notify::rotation-angle-z',
            'notify::pivot-point', 'notify::transform'])
            record.signals.connect(actor, signal, update);
        if (GObject.signal_lookup('damaged', actor))
            record.signals.connect(actor, 'damaged', damaged);
        record.signals.connect(actor, 'parent-set', () => {
            this._watchAncestors(actor.get_parent());
            update();
        });
        record.signals.connect(actor, 'destroy', () => this._untrack(actor));
        this._watchAncestors(actor.get_parent());
        update();
    }

    _untrack(actor) {
        const record = this._windows.get(actor);
        if (!record)
            return;
        this._windows.delete(actor);
        this._bounds.delete(actor);
        this._dirty.delete(record);
        record.signals.clear();
        if (record.bounds) {
            this._removedBounds.push(record.bounds);
            this._queueFlush();
        }
    }

    _queueFlush() {
        if (!this._later) {
            this._later = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
                this._later = 0;
                this._flush();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _flush() {
        const changed = this._removedBounds.splice(0);
        for (const record of this._dirty) {
            if (record.bounds)
                changed.push(record.bounds);
            record.bounds = this.boundsFor(record.actor);
            if (record.bounds)
                changed.push(record.bounds);
        }
        this._dirty.clear();
        if (changed.length) {
            for (const callback of this._subscribers)
                callback(changed);
        }
    }

    _stop() {
        if (this._later)
            global.compositor.get_laters().remove(this._later);
        this._later = 0;
        this._geometrySignals.clear();
        this._geometryActors = new WeakSet();
        this._signals.clear();
        this._bounds = new WeakMap();
        for (const {signals} of this._windows.values())
            signals.clear();
        this._windows.clear();
        this._dirty.clear();
        this._removedBounds.length = 0;
    }
}

export const windowDamage = new WindowDamage();
