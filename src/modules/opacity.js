// SPDX-License-Identifier: GPL-3.0-only
import Gio from 'gi://Gio';
import {readAppearance} from '../core/appearance.js';
import {Signals} from '../core/render/signals.js';
import {ResourceScope} from '../core/utils.js';
import {integrationJob} from '../core/integrationJobs.js';
import {EFFECT_KEYS, WINDOW_KEYS} from '../core/appearanceKeys.js';

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
                this.signals.connect(this.ptyxis, `changed::${key}`, () => this.sync(['ptyxis']));
        }
        const parts = new Set();
        const sync = this.scope.debounce(120, () => { this.sync([...parts]); parts.clear(); });
        const windowSync = this.scope.debounce(0, () => {
            const effectOnly = !this._windowSelectionDirty;
            this._windowSelectionDirty = false;
            this._syncWindowBlur(effectOnly);
        });
        this.signals.connect(this.settings, 'changed', (_settings, key) => {
            if (key === 'opacity-gtk-settings-sidebar')
                parts.add('launcher');
            if (key.startsWith('opacity-gtk-') || key === 'gtk-background-opacity')
                parts.add('gtk');
            if (key === 'opacity-ptyxis' || key === 'gtk-background-opacity')
                parts.add('ptyxis');
            if (parts.size)
                sync();
            if (WINDOW_KEYS.has(key) || EFFECT_KEYS.has(key)) {
                this._windowSelectionDirty ||= WINDOW_KEYS.has(key);
                windowSync();
            }
        });
        this.active = true;
        this._syncWindowBlur();
        this.sync();
    }

    _syncWindowBlur(effectOnly = false) {
        const appearance = readAppearance(this.settings);
        const wanted = this.active && this.settings.get_boolean('windows-blur') &&
            this.settings.get_double('gtk-background-opacity') < 1 &&
            (appearance.capture || appearance.frosted) &&
            ['opacity-gtk-files-sidebar', 'opacity-gtk-settings-sidebar', 'opacity-gtk-menus', 'opacity-ptyxis']
                .some(key => this.settings.get_boolean(key));
        const preference = appearance.capture ? 'combined' : 'economical';
        if (!wanted || (this._windowPreference !== preference && this.windowBlur)) {
            this._windowToken = (this._windowToken ?? 0) + 1;
            this._windowLoading = false;
            this.windowBlur?.destroy();
            this.windowBlur = null;
        }
        if (!wanted)
            return;
        if (this.windowBlur) {
            this.windowBlur.sync(effectOnly);
            return;
        }
        if (this._windowLoading && this._windowPreference === preference)
            return;
        this._windowPreference = preference;
        this._windowLoading = true;
        const token = this._windowToken = (this._windowToken ?? 0) + 1;
        Promise.all([import('../core/windowSurfaces.js'), import('../core/blurBackend.js')])
            .then(async ([{WindowSurfaces}, {loadBackend}]) => {
                const backend = appearance.capture ? await loadBackend(preference) : null;
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

    sync(parts = ['gtk', 'ptyxis', 'launcher'], restore = false) {
        const values = Object.fromEntries(['opacity-gtk-files-sidebar', 'opacity-gtk-settings-sidebar',
            'opacity-gtk-menus', 'opacity-ptyxis'].map(key => [key, !restore && this.settings.get_boolean(key)]));
        values['gtk-background-opacity'] = this.settings.get_double('gtk-background-opacity');
        this.pending = integrationJob('integrations', {parts, values}, error => this.logger.error('Application integration', error));
        return this.pending;
    }

    disable() {
        this.active = false;
        this._windowToken = (this._windowToken ?? 0) + 1;
        this.windowBlur?.destroy();
        this.windowBlur = null;
        this.signals.clear();
        this.scope.dispose();
        this.ptyxis = null;
        return this.sync(['gtk', 'ptyxis', 'launcher'], true);
    }
}
