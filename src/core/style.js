// SPDX-License-Identifier: GPL-3.0-only
export function appendStyle(original, addition) {
    const base = (original ?? '').trim().replace(/;+\s*$/, '');
    return base ? `${base}; ${addition}` : addition;
}

// A style lease follows external edits and restores only its own suffix.
export class StyleLease {
    constructor(actor) {
        this.actor = actor;
        this.original = actor.get_style();
        this.applied = undefined;
    }

    set(css) {
        const current = this.actor.get_style();
        if (this.applied === undefined || current !== this.applied)
            this.original = current;
        const next = appendStyle(this.original, css);
        this.applied = next;
        if (current !== next)
            this.actor.set_style(next);
    }

    restore() {
        if (this.actor.get_style() === this.applied)
            this.actor.set_style(this.original);
        this.applied = undefined;
    }
}
