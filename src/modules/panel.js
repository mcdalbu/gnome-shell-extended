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
        this.overviewActive = Main.overview.visible;
        this.overviewClosing = this.overviewActive && !Main.overview.visibleTarget;
        // Use the same frame-clock owner as the dock, including mixed-scale
        // views; otherwise their timelines can advance one view apart.
        this.fade = new St.Adjustment({actor: Main.uiGroup, lower: 0, upper: 1,
            value: this.overviewActive ? 0 : 1});
        this.signals.connect(this.fade, 'notify::value', () => this._applyAppearance());
        this.binding = new SurfaceBinding({box: this.panel, anchor: Main.layoutManager.panelBox,
            settings: this.settings, logger: this.logger,
            enabled: () => !this.disabled && !this.overviewActive &&
                this.settings.get_boolean('panel-blur') && this.settings.get_boolean('blur-enabled') &&
                this.settings.get_int('blur-radius') > 0 && this.settings.get_string('blur-backend') !== 'off' &&
                (this.appearance?.alpha ?? 1) < 1,
            options: {manageStyle: false, opacity: () => this.appearance?.alpha ?? 1,
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
        this.signals.connect(Main.overview, 'hiding', () => this._startReturn());
        this.signals.connect(Main.overview, 'hidden', () => this._returnFromOverview());
        if (this.overviewClosing)
            this._startReturn();
        else
            this.sync(true);
    }

    _restoreAppearance() {
        this.binding?.sync();
        this.style.restore();
        for (const style of this.foregrounds.values())
            style.restore();
    }

    _suspendForOverview() {
        this.overviewActive = true;
        this.overviewClosing = false;
        if (this._returnLater)
            global.compositor.get_laters().remove(this._returnLater);
        this._returnLater = 0;
        this.fade.remove_transition('value');
        this.fade.value = 0;
        this.returning = false;
        this._restoreAppearance();
        this._track(false);
    }

    _startReturn() {
        this.overviewActive = false;
        this.overviewClosing = true;
        this.returning = true;
        this.fade.remove_transition('value');
        this.fade.value = 0;
        this.sync(true);
        // Match the legacy transition: return during Overview's closing
        // animation, not an additional delay after it has already closed.
        this.fade.ease(1, {duration: 250, mode: Clutter.AnimationMode.EASE_IN_OUT_CUBIC,
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
        // Shell resets Main.panel.style after emitting hidden. Reapply the
        // current fade value after that handler, without restarting the fade.
        this._returnLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._returnLater = 0;
            if (this.disabled || this.overviewActive || Main.overview.visible)
                return false;
            this.sync(true);
            return false;
        });
    }

    _applyAppearance() {
        if (this.disabled || this.overviewActive || !this.appearance)
            return;
        const {color, foreground, alpha} = this.appearance;
        const visibleAlpha = alpha * this.fade.value;
        this.style.set(`background-color: rgba(${color.join(',')},${visibleAlpha}); color: ${foreground}; background-image: none; transition-duration: ${this.returning ? 0 : 150}ms;`);
        this.binding?.surface?.setFade(this.fade.value);
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
            if (this.overviewActive || (Main.overview.visible && !this.overviewClosing)) {
                this._restoreAppearance();
                this._track(false);
                return;
            }
            this._track(this.settings.get_boolean('panel-auto-opacity'));
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
                    this.foregrounds.get(actor).set(`color: ${foreground};`);
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
    }
}
