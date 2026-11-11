// SPDX-License-Identifier: GPL-3.0-only
import Gio from 'gi://Gio';
import {Signals} from '../core/render/signals.js';
import {ResourceScope} from '../core/utils.js';
import {gtkCss, writeGtkStyle} from '../core/gtkStyle.js';
import {syncPtyxisOpacity} from '../core/ptyxis.js';
import {syncSettingsLauncher, clearSettingsLauncherCache} from '../core/settingsLauncher.js';

export default class OpacityModule {
    constructor({settings, logger}) {
        Object.assign(this, {settings, logger});
        this.signals = new Signals();
        this.scope = new ResourceScope(error => logger.error('Opacity cleanup', error));
    }

    enable() {
        const source = Gio.SettingsSchemaSource.get_default();
        const root = source.lookup('org.gnome.Ptyxis', true);
        if (root?.has_key('profile-uuids') && root.has_key('default-profile-uuid')) {
            this.ptyxis = new Gio.Settings({settings_schema: root});
            for (const key of ['profile-uuids', 'default-profile-uuid'])
                this.signals.connect(this.ptyxis, `changed::${key}`, () => this.sync());
        }
        const sync = this.scope.debounce(120, () => this.sync());
        this.signals.connect(this.settings, 'changed', (_settings, key) => {
            if (key === 'opacity-gtk-settings-sidebar')
                this._launcher();
            if (key.startsWith('opacity-') || key === 'gtk-background-opacity')
                sync();
            if (key.startsWith('opacity-') || key.startsWith('blur-') ||
                ['windows-blur', 'update-frequency', 'gtk-background-opacity'].includes(key))
                this._syncWindowBlur();
        });
        this.active = true;
        this._launcher();
        this._syncWindowBlur();
        this.sync();
    }

    _syncWindowBlur() {
        const wanted = this.active && this.settings.get_boolean('windows-blur') &&
            this.settings.get_double('gtk-background-opacity') < 1 &&
            this.settings.get_string('blur-backend') !== 'off' &&
            ['opacity-gtk-files-sidebar', 'opacity-gtk-settings-sidebar', 'opacity-gtk-menus', 'opacity-ptyxis']
                .some(key => this.settings.get_boolean(key));
        const preference = this.settings.get_string('blur-backend');
        if (!wanted || (this._windowPreference !== preference && this.windowBlur)) {
            this._windowToken = (this._windowToken ?? 0) + 1;
            this._windowLoading = false;
            this.windowBlur?.destroy();
            this.windowBlur = null;
        }
        if (!wanted)
            return;
        if (this.windowBlur) {
            this.windowBlur.sync();
            return;
        }
        if (this._windowLoading && this._windowPreference === preference)
            return;
        this._windowPreference = preference;
        this._windowLoading = true;
        const token = this._windowToken = (this._windowToken ?? 0) + 1;
        Promise.all([import('../core/windowSurfaces.js'), import('../core/blurBackend.js')])
            .then(async ([{WindowSurfaces}, {loadBackend}]) => {
                const backend = await loadBackend(preference);
                if (!this.active || token !== this._windowToken)
                    return;
                this.windowBlur = new WindowSurfaces(this.settings, backend);
                this.windowBlur.start();
                this._windowLoading = false;
            }).catch(error => {
                if (token === this._windowToken) {
                    this.windowBlur?.destroy();
                    this.windowBlur = null;
                    this._windowLoading = false;
                    this.logger.error('Window blur', error);
                }
            });
    }

    _launcher(enabled = true) {
        try {
            syncSettingsLauncher(enabled ? this.settings : {get_boolean: () => false});
        } catch (error) {
            this.logger.error('Settings application integration', error);
        }
    }

    sync() {
        try {
            writeGtkStyle(gtkCss(this.settings));
        } catch (error) {
            this.logger.error('GTK style update', error);
        }
        try {
            syncPtyxisOpacity(this.settings, this.ptyxis);
        } catch (error) {
            this.logger.error('Ptyxis profile update', error);
        }
    }

    disable() {
        this.active = false;
        this._windowToken = (this._windowToken ?? 0) + 1;
        this.windowBlur?.destroy();
        this.windowBlur = null;
        this.signals.clear();
        this.scope.dispose();
        this._launcher(false);
        clearSettingsLauncherCache();
        try {
            writeGtkStyle('');
        } catch (error) {
            this.logger.error('GTK style restore', error);
        }
        try {
            syncPtyxisOpacity({get_boolean: () => false}, this.ptyxis);
        } catch (error) {
            this.logger.error('Ptyxis profile restore', error);
        }
        this.ptyxis = null;
    }
}
