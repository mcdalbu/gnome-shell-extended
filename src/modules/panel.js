// SPDX-License-Identifier: GPL-3.0-only
import Meta from 'gi://Meta';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Signals} from '../core/render/signals.js';
import {ResourceScope} from '../core/utils.js';
import {StyleLease} from '../core/style.js';
import {childSignal} from '../core/actors.js';

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
            if (key.startsWith('panel-'))
                this.sync();
        });
        this.signals.connect(St.ThemeContext.get_for_stage(global.stage), 'changed', () => this.sync(true));
        this.signals.connect(Main.layoutManager, 'monitors-changed', this.queue);
        this.signals.connect(Main.overview, 'showing', this.queue);
        this.signals.connect(Main.overview, 'hidden', this.queue);
        this.sync(true);
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
            this._track(this.settings.get_boolean('panel-auto-opacity'));
            if (!this.color || themeChanged) {
                this.style.restore();
                const color = this.panel.get_theme_node().get_background_color();
                this.color = [color.red, color.green, color.blue];
            }
            let key = 'panel-opacity';
            if (this.tracked && !Main.overview.visible) {
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
            this.style.set(`background-color: rgba(${color.join(',')},${alpha}); color: ${light ? '#202024' : '#ffffff'}; background-image: none; transition-duration: 150ms;`);
            const foreground = light ? '#202024' : '#ffffff';
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
        this.signals.clear();
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
    }
}
