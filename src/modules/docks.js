// SPDX-License-Identifier: GPL-3.0-only
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Signals} from '../core/render/signals.js';
import {ResourceScope} from '../core/utils.js';
import {StyleLease} from '../core/style.js';
import {SurfaceBinding, childSignal, findActor} from '../core/actors.js';

export default class DocksModule {
    constructor({settings, logger}) {
        Object.assign(this, {settings, logger});
        this.signals = new Signals();
        this.scope = new ResourceScope(error => logger.error('Dock cleanup', error));
        this.records = new Map();
    }

    enable() {
        this.active = true;
        this.overviewActive = Main.overview.visible;
        this.fade = new St.Adjustment({actor: Main.uiGroup, lower: 0, upper: 1,
            value: this._hideRequested() ? 0 : 1});
        this.signals.connect(this.fade, 'notify::value', () => {
            for (const record of this.records.values())
                this._applyFade(record);
        });
        this.scan = this.scope.debounce(this.settings.get_int('resize-debounce-ms'), () => this._scan());
        this.signals.connect(Main.uiGroup, childSignal(Main.uiGroup), this.scan);
        this.signals.connect(Main.extensionManager, 'extension-state-changed', this.scan);
        this.signals.connect(Main.layoutManager, 'monitors-changed', this.scan);
        this.signals.connect(Main.overview, 'showing', () => {
            this.overviewActive = true;
            this._animateOverview();
        });
        this.signals.connect(Main.overview, 'hiding', () => this._startReturn());
        this.signals.connect(Main.overview, 'hidden', () => {
            // Dock themes also update at the end of Overview. Commit after
            // their handlers, preserving the current fade rather than restarting.
            if (this._returnLater)
                global.compositor.get_laters().remove(this._returnLater);
            this._returnLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
                this._returnLater = 0;
                if (this.active && !this.overviewActive)
                    this.sync();
                return false;
            });
        });
        this.signals.connect(this.settings, 'changed', (_settings, key) => {
            if (key === 'dock-invisible-overview')
                this._animateOverview();
            else if (key.startsWith('dock-') || key.startsWith('blur-') || key === 'update-frequency')
                this.sync();
        });
        this._scan();
        if (this.overviewActive && !Main.overview.visibleTarget)
            this._startReturn();
    }

    _startReturn() {
        this.overviewActive = false;
        this._animateOverview();
    }

    _animateOverview() {
        this.fade.remove_transition('value');
        this.sync();
        const target = this._hideRequested() ? 0 : 1;
        if (this.fade.value !== target)
            this.fade.ease(target, {duration: 250, mode: Clutter.AnimationMode.EASE_IN_OUT_CUBIC,
                onComplete: () => this.sync()});
    }

    _applyFade(record) {
        // Only the decorative background fades. Its border, inset shadow and
        // outline follow the same opacity; icons live in separate dock actors.
        if (record.appliedOpacity === undefined || record.box.opacity !== record.appliedOpacity)
            record.originalOpacity = record.box.opacity;
        record.appliedOpacity = Math.round(record.originalOpacity * this.fade.value);
        record.box.opacity = record.appliedOpacity;
    }

    _scan() {
        const visit = (actor, depth = 0) => {
            if (actor === Main.layoutManager.overviewGroup || actor === Main.layoutManager.panelBox || actor.name?.startsWith('gse-'))
                return;
            const isDock = actor.name === 'dashtodockContainer' ||
                actor.has_style_class_name?.('dashtodock') || actor.has_style_class_name?.('dash-to-dock');
            if (isDock) {
                const box = findActor(actor, child => child.has_style_class_name?.('dash-background'));
                if (this.records.has(actor) && this.records.get(actor).box !== box)
                    this._drop(actor);
                if (box && !this.records.has(actor))
                    this._watch(actor, box);
                return;
            }
            if (depth < 3) {
                for (const child of actor.get_children())
                    visit(child, depth + 1);
            }
        };
        for (const actor of Main.uiGroup.get_children())
            visit(actor);
        this.sync();
    }

    _hideRequested() {
        return this.settings.get_boolean('dock-invisible-overview') && this.overviewActive;
    }

    _invisible() {
        return this._hideRequested() && this.fade.value === 0;
    }

    _watch(actor, box) {
        const signals = new Signals();
        const record = {actor, box, signals, style: new StyleLease(box)};
        this.records.set(actor, record);
        this._applyFade(record);
        signals.connect(actor, childSignal(actor), this.scan);
        signals.connect(actor, 'destroy', () => this._drop(actor, true));
        signals.connect(box, 'destroy', () => {
            this._drop(actor, true);
            this.scan();
        });
        record.binding = new SurfaceBinding({box, anchor: actor,
            settings: this.settings, logger: this.logger,
            enabled: () => this.active && !this._invisible(),
            options: {dock: true, opacity: () => this.settings.get_double('dock-opacity'),
                blur: () => this.settings.get_boolean('dock-blur')},
        });
    }

    sync() {
        for (const record of this.records.values()) {
            this._applyFade(record);
            if (this._invisible()) {
                record.binding.sync();
                record.style.set('background-color: transparent; background-image: none; box-shadow: none; border-color: transparent;');
            } else {
                record.style.restore();
                record.binding.sync();
            }
        }
    }

    _drop(actor, destroyed = false) {
        const record = this.records.get(actor);
        if (!record)
            return;
        this.records.delete(actor);
        record.signals.clear();
        record.binding?.destroy(destroyed);
        if (!destroyed) {
            record.style.restore();
            if (record.box.opacity === record.appliedOpacity)
                record.box.opacity = record.originalOpacity;
        }
    }

    disable() {
        this.active = false;
        if (this._returnLater)
            global.compositor.get_laters().remove(this._returnLater);
        this._returnLater = 0;
        this.fade?.remove_transition('value');
        this.signals.clear();
        this.fade?.run_dispose();
        this.fade = null;
        this.scope.dispose();
        for (const actor of this.records.keys())
            this._drop(actor);
    }
}
