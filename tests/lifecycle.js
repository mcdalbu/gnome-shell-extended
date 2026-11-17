// SPDX-License-Identifier: GPL-3.0-only
import GLib from 'gi://GLib';
import {ModuleManager} from '../src/core/moduleManager.js';
import {ResourceScope} from '../src/core/utils.js';
import {watchWindowMotion, windowMotionActive, WindowMotion} from '../src/core/render/windowMotion.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}

// Native grabs temporarily bypass regional buffering, including the dock's
// settling animation, and must leave no display signals on extension disable.
{
    const callbacks = new Map();let next = 0, now = 0, redraws = 0;
    const display = {connect: (name, fn) => { callbacks.set(++next,{name,fn}); return next; },
        disconnect: id => callbacks.delete(id)};
    const emit = (name, op) => {for(const {name:n,fn} of callbacks.values())if(n===name)fn(display,null,op)};
    const ops = {MOVING:1,MOVING_UNCONSTRAINED:2,KEYBOARD_MOVING:3,RESIZING_N:4,KEYBOARD_RESIZING_SE:5,POPUP:6};
    const start = () => watchWindowMotion(display,ops,()=>now,()=>redraws++);
    const stop = start();
    emit('grab-op-begin',ops.POPUP);assert(!windowMotionActive(),'Popup leaves regional rendering enabled');
    for (const op of [1,2,3,4,5]) {
        emit('grab-op-begin',op);assert(windowMotionActive(),'Pointer and keyboard geometry grabs bypass regional buffering');
        emit('grab-op-end',op);assert(windowMotionActive(),'Dock settling stays on compatible redraws');
        now+=250001;assert(!windowMotionActive(),'Regional redraw resumes without a timer or polling');
    }
    assert(redraws===5,'Exactly one final redraw per geometry grab');
    emit('grab-op-begin',ops.MOVING);stop();stop();
    assert(!windowMotionActive() && callbacks.size===0,'Disable mid-grab clears state and signals');
    const stopAgain=start();assert(!windowMotionActive(),'Re-enable starts with clean motion state');stopAgain();
    let count=0;
    try {new WindowMotion({...display,connect:(...args)=>{
        if(++count===2)throw Error('second signal failed');return display.connect(...args);
    }},ops,()=>now,()=>{});} catch {}
    assert(callbacks.size===0,'Partly constructed watcher cleans its first signal');
}

class Settings {
    constructor(values) {
        this.values = values;
        this.signals = new Map();
        this.next = 1;
    }
    get_boolean(key) { return this.values[key] ?? false; }
    connect(signal, callback) {
        const id = this.next++;
        this.signals.set(id, {signal, callback});
        return id;
    }
    disconnect(id) { this.signals.delete(id); }
    set(key, value) {
        this.values[key] = value;
        for (const entry of [...this.signals.values()]) {
            if (entry.signal === `changed::${key}`)
                entry.callback();
        }
    }
}
const errors = [];
const logger = {error: (...args) => errors.push(args)};
let enabled = 0;
let disabled = 0;
let imports = 0;
class Module {
    enable() { enabled++; }
    disable() { disabled++; }
}
const settings = new Settings({'panel-enabled': false});
const manager = new ModuleManager(settings, {
    panel: () => { imports++; return {default: Module}; },
}, logger);
manager.enable();
await manager.settled();
assert(imports === 0, 'Disabled modules must not import');
settings.set('panel-enabled', true);
await manager.settled();
manager.enable();
assert(imports === 1 && enabled === 1, 'Enable must be idempotent');
settings.set('panel-enabled', false);
assert(disabled === 1, 'Toggle off must clean module');
settings.set('panel-enabled', true);
await manager.settled();
manager.disable();
manager.disable();
assert(disabled === 2 && settings.signals.size === 0, 'Disable must clean all signals once');
manager.enable();
await manager.settled();
manager.disable();
assert(enabled === 3 && disabled === 3, 'Manager must support a new lifecycle');

// Disable detaches synchronously while restoration finishes asynchronously.
let finishCleanup;
const asynchronous = new ModuleManager(new Settings({'panel-enabled':true}), {
    panel: () => ({default:class {
        enable() {}
        disable() { return new Promise(done=>{finishCleanup=done}); }
    }}),
},logger);
asynchronous.enable();await asynchronous.settled();asynchronous.disable();
assert(asynchronous._slots.size===0 && asynchronous._cleanups.size===1,'Track detached restoration');
let cleanupSettled=false;
const cleanupWait=asynchronous.settled().then(()=>{cleanupSettled=true});
await Promise.resolve();
assert(!cleanupSettled,'Settled must wait for asynchronous restoration');
finishCleanup();await cleanupWait;
assert(asynchronous._cleanups.size===0,'Completed restoration must release its references');

// Import finishes after disable: it must not instantiate or touch the Shell.
let resolve;
let constructed = 0;
const raceSettings = new Settings({'blur-enabled': true});
const race = new ModuleManager(raceSettings, {
    blur: () => new Promise(done => { resolve = done; }),
}, logger);
race.enable();
const pending = race.settled();
await Promise.resolve();
race.disable();
resolve({default: class { constructor() { constructed++; } }});
await pending;
assert(constructed === 0 && raceSettings.signals.size === 0, 'Late import must be invalidated');

// Toggle twice while first import is unresolved: only the current slot wins.
const loads = [];
const toggles = new Settings({'blur-enabled': true});
const switching = new ModuleManager(toggles, {
    blur: () => new Promise(done => loads.push(done)),
}, logger);
switching.enable();
const oldLoad = switching.settled();
await Promise.resolve();
toggles.set('blur-enabled', false);
toggles.set('blur-enabled', true);
const newLoad = switching.settled();
await Promise.resolve();
loads[0]({default: Module});
loads[1]({default: Module});
await Promise.all([oldLoad, newLoad]);
assert(enabled === 4, 'Superseded load must never enable');
switching.disable();

// A partially enabled module must clean up; a broken cleanup cannot block others.
let partialCleaned = false;
let healthyCleaned = false;
const failures = new ModuleManager(new Settings({
    'panel-enabled': true, 'blur-enabled': true, 'docks-enabled': true,
}), {
    panel: () => ({default: class {
        enable() { throw new Error('partial enable'); }
        disable() { partialCleaned = true; }
    }}),
    blur: () => ({default: class {
        enable() {}
        disable() { healthyCleaned = true; }
    }}),
    docks: () => ({default: class {
        enable() {}
        disable() { throw new Error('cleanup'); }
    }}),
}, logger);
failures.enable();
await failures.settled();
failures.disable();
assert(partialCleaned && healthyCleaned && errors.length === 2, 'Failures must remain isolated');

const sessionSettings = new Settings({'blur-enabled': true, 'panel-enabled': true});
const session = new ModuleManager(sessionSettings, {
    blur: () => ({default: Module}), panel: () => ({default: Module}),
}, logger);
session.enable();
await session.settled();
session.setSuspended(true);
assert(session._slots.has('blur') && !session._slots.has('panel'), 'Lock suspends foreground modules');
session.setSuspended(false);
await session.settled();
assert(session._slots.has('panel'), 'Unlock restores configured modules');
session.disable();
assert(sessionSettings.signals.size === 0, 'Session lifecycle cleans signals');

const scopeErrors = [];
const scope = new ResourceScope(error => scopeErrors.push(error));
const object = new Settings({});
scope.connect(object, 'changed::test', () => {});
let effectDisposed = 0;
let ownedEffect = null;
const effect = {run_dispose() { effectDisposed++; }};
const actor = {
    get_effect() { return ownedEffect; },
    add_effect_with_name(_name, value) { ownedEffect = value; },
    remove_effect(value) { assert(value === effect, 'Effect ownership'); ownedEffect = null; },
};
scope.effect(actor, 'gse-test', effect);
let calls = 0;
const debounce = scope.debounce(5, value => { calls += value; });
debounce(1);
debounce(2);
const loop = new GLib.MainLoop(null, false);
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30, () => {
    assert(calls === 2, 'Debounce must coalesce and use newest arguments');
    debounce(10);
    scope.own(() => { throw new Error('cleanup failure'); });
    scope.dispose();
    scope.dispose();
    debounce(10); // Inert after dispose.
    assert(effectDisposed === 1 && ownedEffect === null, 'Effect must detach and dispose once');
    assert(object.signals.size === 0 && scopeErrors.length === 1, 'Cleanup must continue after failure');
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30, () => {
        assert(calls === 2, 'Disposed debounce must cancel pending callbacks');
        loop.quit();
        return GLib.SOURCE_REMOVE;
    });
    return GLib.SOURCE_REMOVE;
});
loop.run();
console.log('PASS: lazy loading, lifecycle races, failure isolation, signals, effects and debounce.');
