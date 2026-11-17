// SPDX-License-Identifier: GPL-3.0-only
import Gio from 'gi://Gio';
import St from 'gi://St';
import GLib from 'gi://GLib';
import {Signals} from '../core/render/signals.js';
import {ResourceScope} from '../core/utils.js';

export default class ShadowsModule {
    constructor({settings, logger}) {
        Object.assign(this, {settings, logger});
        this.signals = new Signals();
        this.scope = new ResourceScope();
        this.pending = Promise.resolve();
    }

    enable() {
        this.context = St.ThemeContext.get_for_stage(global.stage);
        this.active = true;
        const sync = this.scope.debounce(30, () => this.sync());
        this.signals.connect(this.settings, 'changed', (_settings, key) => {
            if (key.startsWith('shadow-'))
                sync();
        });
        this.signals.connect(this.context, 'changed', () => this.sync());
        this.file = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_tmp_dir(), `gse-icon-shadows-${GLib.uuid_string_random()}.css`]));
        this.sync();
    }

    _unload() {
        for (const theme of new Set([this.theme, this.context.get_theme()]))
            theme?.unload_stylesheet(this.file);
    }

    sync() {
        if (this.updating || !this.active)
            return;
        const theme = this.context.get_theme();
        const shadow = `${this.settings.get_int('shadow-offset-x')}px ${this.settings.get_int('shadow-offset-y')}px ` +
            `${this.settings.get_int('shadow-radius')}px rgba(0,0,0,${this.settings.get_double('shadow-opacity')})`;
        const rules = [];
        if (this.settings.get_boolean('shadow-app-grid'))
            rules.push(`.apps-scroll-view .overview-icon StIcon, .app-folder-dialog .overview-icon StIcon { icon-shadow: ${shadow}; }`);
        if (this.settings.get_boolean('shadow-dock'))
            rules.push(`#dashtodockContainer .overview-icon StIcon, .dashtodock .overview-icon StIcon, .dash-to-dock .overview-icon StIcon { icon-shadow: ${shadow}; }`);
        if (this.settings.get_boolean('shadow-alt-tab'))
            rules.push(`.switcher-list .alt-tab-app StIcon { icon-shadow: ${shadow}; }`);
        const css = rules.join('\n');
        if (this.theme === theme && this.css === css)
            return;
        this.desired = {theme, css};
        if (!this.writing)
            this.pending = this._write();
    }

    async _write() {
        this.writing = true;
        try {
            while (this.active && this.desired) {
                const {theme, css} = this.desired;
                this.desired = null;
                await new Promise((resolve, reject) => this.file.replace_contents_bytes_async(
                    new GLib.Bytes(new TextEncoder().encode(css)), null, false, Gio.FileCreateFlags.PRIVATE, null,
                    (file, result) => { try { file.replace_contents_finish(result); resolve(); } catch (error) { reject(error); } }));
                if (!this.active || this.desired)
                    continue;
                this.updating = true;
                try {
                    this._unload();
                    if (css)
                        theme.load_stylesheet(this.file);
                    this.css = css;
                    this.theme = theme;
                } finally { this.updating = false; }
            }
        } catch (error) {
            this.logger.error('Shadow stylesheet', error);
        } finally { this.writing = false; }
    }

    disable() {
        this.active = false;
        this.desired = null;
        this.signals.clear();
        this.scope.dispose();
        if (this.file) {
            this._unload();
        }
        const file = this.file;
        return this.pending.then(() => new Promise(resolve => {
            if (!file) { resolve(); return; }
            file.delete_async(GLib.PRIORITY_DEFAULT, null, (source, result) => {
                try { source.delete_finish(result); }
                catch (error) { if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) this.logger.error('Shadow cleanup', error); }
                resolve();
            });
        }));
    }
}
