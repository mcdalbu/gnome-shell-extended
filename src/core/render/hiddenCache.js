// SPDX-License-Identifier: GPL-3.0-only
import GLib from 'gi://GLib';

// Bounded warm storage, shared by hidden docks/windows and wallpaper. Expiry
// releases GPU references only; it must never request a compositor frame.
const entries = new Map();
const MAX_BYTES = 128 * 1024 * 1024;
let timer = 0;

function schedule() {
    if (timer)
        GLib.Source.remove(timer);
    timer = 0;
    if (!entries.size)
        return;
    const deadline = Math.min(...[...entries.values()].map(e => e.deadline));
    timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
        Math.max(1, Math.ceil((deadline - GLib.get_monotonic_time()) / 1000)), () => {
            timer = 0;
            const now = GLib.get_monotonic_time();
            for (const [owner, entry] of entries) {
                if (entry.deadline <= now) {
                    entries.delete(owner);
                    entry.release();
                }
            }
            schedule();
            return GLib.SOURCE_REMOVE;
        });
}

export function forgetHidden(owner) {
    if (entries.delete(owner))
        schedule();
}

export function retainHidden(owner, bytes, release) {
    if (entries.has(owner))
        return;
    entries.set(owner, {bytes, release, deadline: GLib.get_monotonic_time() + 5e6});
    let total = [...entries.values()].reduce((n, e) => n + e.bytes, 0);
    for (const [key, entry] of entries) {
        if (total <= MAX_BYTES)
            break;
        entries.delete(key);
        total -= entry.bytes;
        entry.release();
    }
    schedule();
}

export function captureBytes(captures) {
    let bytes = 0;
    for (const {effect} of captures.values())
        bytes += effect.estimatedBytes?.() ?? 0;
    return bytes;
}

export function hiddenCacheState() {
    return {entries: entries.size, bytes: [...entries.values()].reduce((n, e) => n + e.bytes, 0), timer: !!timer};
}
