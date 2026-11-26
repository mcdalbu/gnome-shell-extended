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
import {PanelGap} from '../core/panelGap.js';
import {EFFECT_KEYS} from '../core/appearanceKeys.js';

export default class PanelModule {
    constructor({settings, logger}) {
        Object.assign(this, {settings, logger});
        this.signals = new Signals();
        this.tracking = new Signals();
        this.windows = new Map();
        this.foregrounds = new Map();
        this.foregroundShadow = null;
        this.scope = new ResourceScope(error => logger.error('Panel cleanup', error));
    }

    enable() {
        this.panel = Main.panel;
        this.signals.connect(this.panel, 'destroy', () => {
            this.panelDestroyed = true;
            this.disable();
        });
        this.style = new StyleLease(this.panel);
        this.gap = new PanelGap(this.panel, this.settings);
        this.tint = new St.Adjustment({actor: Main.uiGroup, lower: 0, upper: 1});
        this.signals.connect(this.tint, 'notify::value', () => this._applyAppearance());
        this.signals.connect(this.panel, 'notify::mapped', () => this._panelMapped());
        this.binding = new SurfaceBinding({box: this.panel, anchor: Main.layoutManager.panelBox,
            settings: this.settings, logger: this.logger,
            enabled: () => !this.disabled && !this._overviewOwnsPanel() &&
                this.settings.get_boolean('panel-blur') && this.settings.get_boolean('blur-enabled') &&
                this._blurAlpha() < 1,
            options: {manageStyle: false, refraction: false, topEdgeCapture: true, opacity: () => this._blurAlpha(),
                wallpaper: () => this.settings.get_boolean('panel-static-blur')},
        });
        this.interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this.signals.connect(this.interface, 'changed::color-scheme', () => this.sync(true));
        if (St.Settings.list_properties().some(p => p.name === 'color-scheme'))
            this.signals.connect(St.Settings.get(), 'notify::color-scheme', () => this.sync(true));
        this.queue = this.scope.debounce(this.settings.get_int('resize-debounce-ms'), () => this.sync());
        this.queueWindow = this.scope.debounce(0, () => this.sync());
        for (const box of [this.panel._leftBox, this.panel._centerBox, this.panel._rightBox]) {
            if (box)
                this.signals.connect(box, childSignal(box), () => {
                    this._buttonsDirty = true;
                    this.queue();
                });
        }
        const settingsSync = this.scope.debounce(0, () => this.sync());
        this.signals.connect(this.settings, 'changed', (_settings, key) => {
            if (key.startsWith('panel-') || EFFECT_KEYS.has(key) || ['blur-enabled', 'blur-render-area'].includes(key))
                settingsSync();
        });
        this.signals.connect(St.ThemeContext.get_for_stage(global.stage), 'changed', () => this.sync(true));
        this.signals.connect(Main.layoutManager, 'monitors-changed', this.queue);
        this.signals.connect(Main.overview, 'showing', () => this.sync());
        this.signals.connect(Main.overview, 'hidden', () => this._returnFromOverview());
        this.sync(true);
    }

    _overviewOwnsPanel() {
        return Main.overview.visible || !!this._returnLater;
    }

    _restoreAppearance() {
        this.binding?.sync();
        this.style.restore();
        this._setForegroundShadow();
        for (const style of this.foregrounds.values())
            style.restore();
    }

    _setForegroundShadow(styleClass = null) {
        if (styleClass === this.foregroundShadow)
            return;
        if (this.foregroundShadow)
            this.panel.remove_style_class_name(this.foregroundShadow);
        this.foregroundShadow = styleClass;
        if (styleClass)
            this.panel.add_style_class_name(styleClass);
    }

    _returnFromOverview() {
        if (this._returnLater)
            return;
        // Shell resets the panel's inline style after emitting 'hidden'.
        this._returnLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._returnLater = 0;
            this.sync(true);
            return false;
        });
    }

    _applyAppearance() {
        if (this.disabled || this._overviewOwnsPanel() || !this.appearance)
            return;
        const {color, foreground} = this.appearance;
        this.style.set(`background-color: rgba(${color.join(',')},${this.tint.value}); color: ${foreground}; background-image: none; transition-duration: 0ms;`);
        for (const style of this.foregrounds.values())
            style.set(`color: ${foreground};`);
    }

    _blurAlpha() {
        // Keep the backdrop alive until the animated tint is fully opaque.
        return this.appearance ? Math.min(this.appearance.alpha, this.tint.value) : 1;
    }

    _panelMapped() {
        if (!this.panel.mapped) {
            this.fullscreenUnmapped = Main.layoutManager.findMonitorForActor(this.panel)?.inFullscreen ??
                Main.layoutManager.primaryMonitor?.inFullscreen;
            return;
        }
        if (!this.fullscreenUnmapped || Main.layoutManager.primaryMonitor?.inFullscreen)
            return;
        this.fullscreenUnmapped = false;
        if (this._overviewOwnsPanel())
            return;
        this.tint.remove_transition('value');
        this.tint.value = 0;
        this.resumeTint = true;
        this._appearanceSignature = null;
        this.sync();
    }

    _watch(window) {
        if (!window || this.windows.has(window))
            return;
        const signals = new Signals();
        this.windows.set(window, signals);
        for (const signal of ['notify::maximized-horizontally', 'notify::maximized-vertically',
            'notify::fullscreen', 'notify::minimized', 'workspace-changed'])
            signals.connect(window, signal, this.queueWindow);
        signals.connect(window, 'unmanaged', () => {
            signals.clear();
            this.windows.delete(window);
            this.queueWindow();
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
            this.queueWindow();
        });
        this.tracking.connect(global.display, 'window-entered-monitor', this.queueWindow);
        this.tracking.connect(global.display, 'window-left-monitor', this.queueWindow);
        this.tracking.connect(global.workspace_manager, 'active-workspace-changed', this.queueWindow);
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
            if (this._overviewOwnsPanel()) {
                this.appearance = null;
                this._appearanceSignature = null;
                this.resumeTint = false;
                this.tint.remove_transition('value');
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
            if (this.tracked) {
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
            const shadow = this.settings.get_boolean('panel-foreground-shadow')
                ? (light ? 'gse-panel-shadow-light' : 'gse-panel-shadow-dark') : null;
            // A window event often leaves the panel unchanged. Do not restart
            // style/layout/capture work in that case. Theme and child changes
            // still need a full pass.
            const signature = JSON.stringify([color, foreground, alpha, shadow,
                this.settings.get_boolean('panel-blur'), this.settings.get_boolean('panel-static-blur'), this.settings.get_boolean('blur-enabled'),
                this.settings.get_int('blur-radius'), this.settings.get_double('blur-brightness'),
                this.settings.get_boolean('blur-filter-enabled'), this.settings.get_string('blur-method'), this.settings.get_string('blur-samples'),
                this.settings.get_string('blur-render-area'),
                this.settings.get_string('blur-resolution'), this.settings.get_string('blur-refresh-rate'),
                this.settings.get_int('blur-iterations'), this.settings.get_int('blur-kawase-iterations'),
                this.settings.get_boolean('frosted-glass-enabled')]);
            if (!themeChanged && !this._buttonsDirty && signature === this._appearanceSignature)
                return;
            this._appearanceSignature = signature;
            this._buttonsDirty = false;
            this._setForegroundShadow(shadow);
            const initial = !this.appearance;
            const targetChanged = this.appearance?.alpha !== alpha || this.resumeTint;
            this.resumeTint = false;
            this.appearance = {color, foreground, alpha};
            if (initial) {
                this.tint.value = alpha;
            } else if (targetChanged) {
                this.tint.remove_transition('value');
                if (this.tint.value !== alpha)
                    this.tint.ease(alpha, {duration: 250, mode: Clutter.AnimationMode.EASE_IN_OUT_CUBIC,
                        onComplete: () => this.binding.sync()});
            }
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
        this.gap?.destroy();
        this.gap = null;
        this.binding?.destroy(this.panelDestroyed);
        this.binding = null;
        if (this._returnLater)
            global.compositor.get_laters().remove(this._returnLater);
        this._returnLater = 0;
        this.tint?.remove_transition('value');
        this.signals.clear();
        this.tint?.run_dispose();
        this.tint = null;
        this.tracking.clear();
        this.scope.dispose();
        for (const signals of this.windows.values())
            signals.clear();
        this.windows.clear();
        if (!this.panelDestroyed) {
            this.style?.restore();
            this._setForegroundShadow();
            for (const style of this.foregrounds.values())
                style.restore();
        }
        this.foregrounds.clear();
        this.interface = null;
        this.appearance = null;
    }
}
