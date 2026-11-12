// SPDX-License-Identifier: GPL-3.0-only
import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Signals} from '../core/render/signals.js';
import {ResourceScope} from '../core/utils.js';
import {StyleLease} from '../core/style.js';
import {SurfaceBinding, childSignal} from '../core/actors.js';

export default class PanelModule {
    constructor({settings, logger}) {
        Object.assign(this, {settings, logger});
        this.signals = new Signals();
        this.tracking = new Signals();
        this.windows = new Map();
        this.foregrounds = new Map();
        this.scope = new ResourceScope(error => logger.error('Panel cleanup', error));
    }

    enable() {
        this.panel = Main.panel;
        this.signals.connect(this.panel, 'destroy', () => {
            this.panelDestroyed = true;
            this.disable();
        });
        this.style = new StyleLease(this.panel);
        // Paint the extra row as a sibling, outside the panel's layout and
        // input region. This also works when panel blur is disabled or opaque.
        this.bottomExtension = new St.Widget({name: 'gse-panel-bottom-extension', reactive: false});
        Main.layoutManager.panelBox.get_parent().insert_child_above(this.bottomExtension, Main.layoutManager.panelBox);
        this.signals.connect(this.bottomExtension, 'destroy', () => {
            this.bottomExtension = null;
        });
        for (const actor of [this.panel, Main.layoutManager.panelBox]) {
            for (const property of ['allocation', 'mapped', 'opacity'])
                this.signals.connect(actor, `notify::${property}`, () => this._syncBottomExtension());
        }
        this.overviewActive = Main.overview.visible;
        this.overviewClosing = this.overviewActive && !Main.overview.visibleTarget;
        // Use the same frame-clock owner as the dock, including mixed-scale
        // views; otherwise their timelines can advance one view apart.
        this.fade = new St.Adjustment({actor: Main.uiGroup, lower: 0, upper: 1,
            value: this.overviewActive ? 0 : 1});
        this.signals.connect(this.fade, 'notify::value', () => this._applyAppearance());
        this.binding = new SurfaceBinding({box: this.panel, anchor: Main.layoutManager.panelBox,
            settings: this.settings, logger: this.logger,
            enabled: () => !this.disabled && !this.returnPending && (!this.overviewActive || this.overviewOpening) &&
                this.settings.get_boolean('panel-blur') && this.settings.get_boolean('blur-enabled') &&
                this.settings.get_int('blur-radius') > 0 && this.settings.get_string('blur-backend') !== 'off' &&
                (this.appearance?.alpha ?? 1) < 1,
            options: {manageStyle: false, opacity: () => this.appearance?.alpha ?? 1,
                extraBottom: () => this.settings.get_boolean('panel-extend-bottom') ? 1 : 0,
                fade: () => this.fade.value},
        });
        this.interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this.signals.connect(this.interface, 'changed::color-scheme', () => this.sync(true));
        if (St.Settings.list_properties().some(p => p.name === 'color-scheme'))
            this.signals.connect(St.Settings.get(), 'notify::color-scheme', () => this.sync(true));
        this.queue = this.scope.debounce(this.settings.get_int('resize-debounce-ms'), () => this.sync());
        for (const box of [this.panel._leftBox, this.panel._centerBox, this.panel._rightBox]) {
            if (box)
                this.signals.connect(box, childSignal(box), this.queue);
        }
        this.signals.connect(this.settings, 'changed', (_settings, key) => {
            if (key.startsWith('panel-') || key.startsWith('blur-') || key === 'update-frequency')
                this.sync();
        });
        this.signals.connect(St.ThemeContext.get_for_stage(global.stage), 'changed', () => this.sync(true));
        this.signals.connect(Main.layoutManager, 'monitors-changed', this.queue);
        this.signals.connect(Main.overview, 'showing', () => this._suspendForOverview());
        this.signals.connect(Main.overview, 'shown', () => this._finishSuspend());
        this.signals.connect(Main.overview, 'hiding', () => this._prepareReturn());
        this.signals.connect(Main.overview, 'hidden', () => this._returnFromOverview());
        if (this.overviewClosing)
            this._prepareReturn();
        else
            this.sync(true);
    }

    _restoreAppearance() {
        this.bottomExtension?.hide();
        this.binding?.sync();
        this.style.restore();
        for (const style of this.foregrounds.values())
            style.restore();
    }

    _suspendForOverview() {
        this.openingAppearance = this.renderedAppearance ?? this.appearance;
        this.overviewActive = true;
        this.overviewOpening = true;
        this.overviewClosing = false;
        if (this._returnLater)
            global.compositor.get_laters().remove(this._returnLater);
        this._returnLater = 0;
        this.fade.remove_transition('value');
        this.returning = false;
        this.returnPending = false;
        // Preserve the current rendered tint when reversing a desktop reveal.
        // The opening fade then starts at that exact color/alpha, not the
        // normal panel target multiplied by a different progress value.
        this.fade.value = 1;
        this._track(false);
        this.fade.ease(0, {duration: 250, mode: Clutter.AnimationMode.EASE_IN_OUT_CUBIC,
            onComplete: () => this._finishSuspend()});
    }

    _finishSuspend() {
        if (this.disabled || !this.overviewActive)
            return;
        this.overviewOpening = false;
        this.openingAppearance = null;
        this.fade.remove_transition('value');
        this.fade.value = 0;
        this._restoreAppearance();
    }

    _prepareReturn() {
        const background = Main.layoutManager.overviewGroup.get_theme_node().get_background_color();
        const foreground = this.panel.get_theme_node().get_foreground_color();
        this.overviewColor = [background.red, background.green, background.blue];
        this.overviewForeground = [foreground.red, foreground.green, foreground.blue];
        this.overviewActive = false;
        this.overviewOpening = false;
        this.overviewClosing = true;
        this.returnPending = true;
        this.returning = false;
        this.fade.remove_transition('value');
        this.fade.value = 0;
        this._track(false);
        this._applyAppearance();
        this.binding.sync();
    }

    _startReturn() {
        this.returnPending = false;
        this.returning = true;
        this.fade.value = 0;
        this.sync(true);
        // The Overview backdrop is gone now. Reveal the desktop by fading its
        // opaque color into the configured translucent tint over a full 250ms.
        this.fade.ease(1, {duration: 250, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.returning = false;
                this._applyAppearance();
            }});
    }

    _returnFromOverview() {
        this.overviewActive = false;
        this.overviewClosing = false;
        if (this._returnLater)
            global.compositor.get_laters().remove(this._returnLater);
        // Shell resets Main.panel.style after emitting hidden. Start the
        // desktop reveal after that cleanup, once its backdrop is gone.
        this._returnLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._returnLater = 0;
            if (this.disabled || this.overviewActive || Main.overview.visible)
                return false;
            if (!this.returnPending) {
                this.sync(true);
                return false;
            }
            this._startReturn();
            return false;
        });
    }

    _applyAppearance() {
        if (this.disabled || (this.overviewActive && !this.overviewOpening))
            return;
        if (this.returnPending) {
            this.bottomExtension?.hide();
            this.style.set('background-color: transparent; background-image: none; transition-duration: 0ms;');
            for (const style of this.foregrounds.values())
                style.restore();
            return;
        }
        if (!this.appearance)
            return;
        let {color, foreground, alpha} = this.overviewOpening && this.openingAppearance
            ? this.openingAppearance : this.appearance;
        const progress = this.fade.value;
        let visibleAlpha = alpha * progress;
        if (this.returning) {
            // Premultiplied composition of an opaque Overview-color cover
            // over the final tint. This preserves the visible starting color
            // without an extra actor, texture or a faded foreground layer.
            visibleAlpha = 1 - (1 - alpha) * progress;
            color = color.map((c, i) => Math.round(((1 - progress) * this.overviewColor[i] +
                progress * alpha * c) / Math.max(visibleAlpha, 1 / 255)));
            const target = this.appearance.foreground.slice(1).match(/../g).map(c => parseInt(c, 16));
            foreground = `rgb(${target.map((c, i) => Math.round(this.overviewForeground[i] *
                (1 - progress) + c * progress)).join(',')})`;
        }
        this.currentForeground = foreground;
        this.renderedAppearance = {color, foreground, alpha: visibleAlpha};
        this._syncBottomExtension();
        this.style.set(`background-color: rgba(${color.join(',')},${visibleAlpha}); color: ${foreground}; background-image: none; transition-duration: ${this.returning || this.overviewOpening ? 0 : 150}ms;`);
        for (const style of this.foregrounds.values())
            style.set(`color: ${foreground};`);
        this.binding?.surface?.setFade(this.fade.value);
    }

    _syncBottomExtension() {
        const strip = this.bottomExtension;
        if (!strip)
            return;
        const visible = !this.disabled && this.panel.mapped && !this.returnPending &&
            (!this.overviewActive || this.overviewOpening) &&
            this.settings.get_boolean('panel-extend-bottom') && this.renderedAppearance;
        if (!visible) {
            strip.hide();
            return;
        }
        const [x, y] = this.panel.get_transformed_position();
        const [width, height] = this.panel.get_transformed_size();
        const parent = strip.get_parent();
        const [ok, left, top] = parent.transform_stage_point(x, y + height);
        const [end, right, bottom] = parent.transform_stage_point(x + width, y + height + 1);
        if (!ok || !end || ![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) {
            strip.hide();
            return;
        }
        strip.set_position(left, top);
        strip.set_size(right - left, bottom - top);
        strip.opacity = Math.min(255, Math.round(255 * this.panel.get_paint_opacity() /
            Math.max(1, parent.get_paint_opacity())));
        const {color, alpha} = this.renderedAppearance;
        const style = `background-color: rgba(${color.join(',')},${alpha}); transition-duration: ${this.returning || this.overviewOpening ? 0 : 150}ms;`;
        if (strip.get_style() !== style)
            strip.set_style(style);
        strip.show();
    }

    _watch(window) {
        if (!window || this.windows.has(window))
            return;
        const signals = new Signals();
        this.windows.set(window, signals);
        for (const signal of ['notify::maximized-horizontally', 'notify::maximized-vertically',
            'notify::fullscreen', 'notify::minimized', 'workspace-changed', 'position-changed'])
            signals.connect(window, signal, this.queue);
        signals.connect(window, 'unmanaged', () => {
            signals.clear();
            this.windows.delete(window);
            this.queue();
        });
    }

    _track(enabled) {
        if (enabled === this.tracked)
            return;
        this.tracked = enabled;
        this.tracking.clear();
        for (const signals of this.windows.values())
            signals.clear();
        this.windows.clear();
        if (!enabled)
            return;
        this.tracking.connect(global.display, 'window-created', (_display, window) => {
            this._watch(window);
            this.queue();
        });
        this.tracking.connect(global.display, 'window-entered-monitor', this.queue);
        this.tracking.connect(global.display, 'window-left-monitor', this.queue);
        this.tracking.connect(global.workspace_manager, 'active-workspace-changed', this.queue);
        for (const actor of global.get_window_actors())
            this._watch(actor.get_meta_window());
    }

    sync(themeChanged = false) {
        if (this.updating || this.disabled)
            return;
        this.updating = true;
        try {
            if (themeChanged)
                this.color = null;
            if (this.returnPending) {
                this._applyAppearance();
                this.binding.sync();
                return;
            }
            if ((this.overviewActive || (Main.overview.visible && !this.overviewClosing)) && !this.overviewOpening) {
                this._restoreAppearance();
                this._track(false);
                return;
            }
            this._track(!this.overviewActive && this.settings.get_boolean('panel-auto-opacity'));
            if (!this.color || themeChanged) {
                this.style.restore();
                const color = this.panel.get_theme_node().get_background_color();
                this.color = [color.red, color.green, color.blue];
            }
            let key = 'panel-opacity';
            if (this.tracked && (!Main.overview.visible || this.overviewClosing)) {
                const monitor = Main.layoutManager.findMonitorForActor(this.panel)?.index ?? Main.layoutManager.primaryIndex;
                const workspace = global.workspace_manager.get_active_workspace();
                const windows = [...this.windows.keys()].filter(window => !window.minimized &&
                    window.get_monitor() === monitor && window.located_on_workspace(workspace) &&
                    [Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG].includes(window.get_window_type()));
                if (windows.some(window => window.is_fullscreen()))
                    key = 'panel-fullscreen-opacity';
                else if (windows.some(window => window.maximized_horizontally && window.maximized_vertically))
                    key = 'panel-maximized-opacity';
            }
            const mode = this.settings.get_string('panel-style');
            const light = mode === 'light' || (mode === 'theme' &&
                this.interface.get_string('color-scheme') !== 'prefer-dark');
            // Native panel CSS can stay black even when applications use the
            // light scheme. Supply a matching fallback and foreground contrast.
            const color = mode !== 'theme' ? (light ? [246, 245, 244] : [25, 25, 28]) :
                light && this.color.every(c => c < 100) ? [246, 245, 244] :
                    !light && this.color.every(c => c > 180) ? [25, 25, 28] : this.color;
            const alpha = this.settings.get_double(key);
            const foreground = light ? '#202024' : '#ffffff';
            this.appearance = {color, foreground, alpha};
            this._applyAppearance();
            this.binding.sync();
            const visit = (actor, depth) => {
                if (actor.has_style_class_name?.('panel-button')) {
                    if (!this.foregrounds.has(actor)) {
                        this.foregrounds.set(actor, new StyleLease(actor));
                        this.signals.connect(actor, 'destroy', () => this.foregrounds.delete(actor));
                    }
                    // The native panel-button rule supplies its own color,
                    // overriding the color inherited from the panel itself.
                    this.foregrounds.get(actor).set(`color: ${this.currentForeground ?? foreground};`);
                    return;
                }
                if (depth > 0) {
                    for (const child of actor.get_children())
                        visit(child, depth - 1);
                }
            };
            visit(this.panel, 4);
        } finally {
            this.updating = false;
        }
    }

    disable() {
        if (this.disabled)
            return;
        this.disabled = true;
        this.binding?.destroy(this.panelDestroyed);
        this.binding = null;
        if (this._returnLater)
            global.compositor.get_laters().remove(this._returnLater);
        this._returnLater = 0;
        this.fade?.remove_transition('value');
        this.signals.clear();
        this.bottomExtension?.destroy();
        this.bottomExtension = null;
        this.fade?.run_dispose();
        this.fade = null;
        this.tracking.clear();
        this.scope.dispose();
        for (const signals of this.windows.values())
            signals.clear();
        this.windows.clear();
        if (!this.panelDestroyed)
            this.style?.restore();
        if (!this.panelDestroyed) {
            for (const style of this.foregrounds.values())
                style.restore();
        }
        this.foregrounds.clear();
        this.interface = null;
        this.appearance = null;
        this.renderedAppearance = null;
        this.openingAppearance = null;
    }
}
