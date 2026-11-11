// SPDX-License-Identifier: GPL-3.0-only
import Gio from 'gi://Gio';
import St from 'gi://St';
import {Signals} from '../core/render/signals.js';

export default class ShadowsModule {
    constructor({settings, logger}) {
        Object.assign(this, {settings, logger});
        this.signals = new Signals();
    }

    enable() {
        this.context = St.ThemeContext.get_for_stage(global.stage);
        this.signals.connect(this.settings, 'changed', (_settings, key) => {
            if (key.startsWith('shadow-'))
                this.sync();
        });
        this.signals.connect(this.context, 'changed', () => this.sync());
        const [file, stream] = Gio.File.new_tmp('gse-icon-shadows-XXXXXX.css');
        this.file = file;
        stream.close(null);
        this.sync();
    }

    _unload() {
        for (const theme of new Set([this.theme, this.context.get_theme()]))
            theme?.unload_stylesheet(this.file);
    }

    sync() {
        if (this.updating)
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
        this.updating = true;
        try {
            this._unload();
            this.file.replace_contents(css, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            if (css)
                theme.load_stylesheet(this.file);
            this.css = css;
            this.theme = theme;
        } finally {
            this.updating = false;
        }
    }

    disable() {
        this.signals.clear();
        if (this.file) {
            this._unload();
            this.file.delete(null);
        }
        this.file = null;
        this.theme = null;
        this.context = null;
    }
}
