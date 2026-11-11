// SPDX-License-Identifier: GPL-3.0-only
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Signals} from './render/signals.js';
import {childSignal} from './actors.js';
import {applyBlurParameters, radiusProperty} from './blurBackend.js';

export class Backgrounds {
    constructor(settings, logger) {
        Object.assign(this, {settings, logger});
        this.signals = new Signals();
        this.overviewSignals = new Signals();
        this.managers = [];
        this.effects = [];
        this.locks = new Map();
        this.dialogs = new Map();
    }

    enable() {
        this.signals.connect(Main.overview, 'showing', () => this._overview());
        this.signals.connect(Main.overview, 'hidden', () => this._clearOverview());
        this.signals.connect(Main.sessionMode, 'updated', () => this._locks());
        this.signals.connect(Main.layoutManager, 'monitors-changed', () => {
            this._clearOverview();
            this.sync();
        });
        this.signals.connect(St.ThemeContext.get_for_stage(global.stage), 'notify::scale-factor', () => this.sync());
        const container = Main.screenShield?._lockDialogGroup;
        if (container)
            this.signals.connect(container, childSignal(container), (_container, dialog) => this._dialog(dialog));
        this.sync();
    }

    _update(effect) {
        applyBlurParameters(effect, radiusProperty(Shell), this.settings.get_int('blur-radius'),
            St.ThemeContext.get_for_stage(global.stage).scale_factor,
            this.settings.get_double('blur-brightness') * 100);
    }

    _effect() {
        const effect = new Shell.BlurEffect({mode: Shell.BlurMode.ACTOR});
        this._update(effect);
        return effect;
    }

    _overview() {
        if (!this.settings.get_boolean('blur-overview') || this.group ||
            this.settings.get_string('blur-backend') === 'off')
            return;
        const adjustment = Main.overview._overview?.controls?._stateAdjustment;
        if (!adjustment)
            return;
        this.group = new Meta.BackgroundGroup({name: 'gse-overview-wallpaper'});
        Main.layoutManager.overviewGroup.insert_child_at_index(this.group, 0);
        for (const [monitorIndex, monitor] of Main.layoutManager.monitors.entries()) {
            const widget = new St.Widget({x: monitor.x, y: monitor.y,
                width: monitor.width, height: monitor.height, reactive: false});
            this.group.add_child(widget);
            const effect = this._effect();
            widget.add_effect_with_name('gse-wallpaper-blur', effect);
            this.effects.push([widget, effect]);
            this.managers.push(new Background.BackgroundManager({container: widget, monitorIndex, controlPosition: false}));
        }
        const fade = () => { this.group.opacity = Math.round(255 * Math.min(1, Math.max(0, adjustment.value))); };
        this.overviewSignals.connect(adjustment, 'notify::value', fade);
        fade();
    }

    _clearOverview() {
        this.overviewSignals.clear();
        for (const manager of this.managers)
            manager.destroy();
        this.managers = [];
        for (const [actor, effect] of this.effects) {
            actor.remove_effect(effect);
            effect.run_dispose();
        }
        this.effects = [];
        this.group?.destroy();
        this.group = null;
    }

    _dialog(dialog) {
        if (this.dialogs.has(dialog))
            return;
        const signals = new Signals();
        this.dialogs.set(dialog, signals);
        signals.connect(dialog, 'notify::mapped', () => this._scanDialog(dialog));
        signals.connect(dialog, 'destroy', () => {
            signals.clear();
            this.dialogs.delete(dialog);
        });
        this._scanDialog(dialog);
    }

    _scanDialog(dialog) {
        const group = dialog._backgroundGroup;
        if (!group)
            return;
        if (!this.dialogs.get(dialog).group) {
            const signals = this.dialogs.get(dialog);
            signals.group = group;
            signals.connect(group, childSignal(group), () => this._locks());
        }
        for (const actor of group.get_children()) {
            if (!this.settings.get_boolean('blur-lock-screen') || this.locks.has(actor) ||
                this.settings.get_string('blur-backend') === 'off')
                continue;
            const native = actor.get_effect('blur');
            if (!native)
                continue;
            const effect = this._effect();
            const signals = new Signals();
            const record = {native, enabled: native.enabled, effect, signals};
            this.locks.set(actor, record);
            signals.connect(actor, 'destroy', () => this._removeLock(actor, true));
            native.enabled = false;
            actor.add_effect_with_name('gse-lock-blur', effect);
        }
    }

    _locks() {
        for (const dialog of Main.screenShield?._lockDialogGroup?.get_children() ?? []) {
            this._dialog(dialog);
            this._scanDialog(dialog);
        }
    }

    _removeLock(actor, destroyed = false) {
        const record = this.locks.get(actor);
        if (!record)
            return;
        this.locks.delete(actor);
        record.signals.clear();
        if (!destroyed) {
            actor.remove_effect(record.effect);
            record.effect.run_dispose();
            if (!record.native.enabled)
                record.native.enabled = record.enabled;
        }
    }

    sync() {
        if (!this.settings.get_boolean('blur-overview') || this.settings.get_string('blur-backend') === 'off')
            this._clearOverview();
        else if (Main.overview.visible)
            this._overview();
        if (!this.settings.get_boolean('blur-lock-screen') || this.settings.get_string('blur-backend') === 'off') {
            for (const actor of this.locks.keys())
                this._removeLock(actor);
        }
        this._locks();
        for (const [, effect] of this.effects)
            this._update(effect);
        for (const record of this.locks.values())
            this._update(record.effect);
    }

    disable() {
        this.signals.clear();
        this._clearOverview();
        for (const actor of this.locks.keys())
            this._removeLock(actor);
        for (const signals of this.dialogs.values())
            signals.clear();
        this.dialogs.clear();
    }
}
