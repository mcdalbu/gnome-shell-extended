// SPDX-License-Identifier: GPL-3.0-only
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {migrateAppearance} from './core/appearance.js';
import {MODULE_LOADERS} from './core/config.js';
import {Logger} from './core/logger.js';
import {ModuleManager} from './core/moduleManager.js';
import {watchWindowMotion} from './core/render/windowMotion.js';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class GnomeShellExtended extends Extension {
    enable() {
        const settings = this.getSettings();
        migrateAppearance(settings);
        this._manager = new ModuleManager(settings, MODULE_LOADERS,
            new Logger(settings.get_boolean('debug-logging')));
        try {
            this._stopMotion = watchWindowMotion(global.display, Meta.GrabOp,
                () => GLib.get_monotonic_time(), () => {
                    if (settings.get_string('blur-render-area') === 'elements')
                        global.stage.queue_redraw();
                });
            this._manager.setSuspended(Main.sessionMode.isLocked);
            this._manager.enable();
            // An already disabled opacity module has no instance to restore GTK.
            if (!settings.get_boolean('opacity-enabled')) {
                const manager = this._manager;
                void import('./core/integrationJobs.js').then(({syncIntegrations}) => {
                    if (this._manager === manager && !settings.get_boolean('opacity-enabled'))
                        return syncIntegrations(['gtk'], {}, error => logError(error));
                }).catch(logError);
            }
            this._sessionId = Main.sessionMode.connect('updated', () => {
                this._manager.setSuspended(Main.sessionMode.isLocked);
            });
        } catch (error) {
            this.disable();
            throw error;
        }
    }

    disable() {
        // unlock-dialog keeps only the wallpaper blur alive. Foreground modules
        // are suspended while locked; no authentication widgets are modified.
        if (this._sessionId)
            Main.sessionMode.disconnect(this._sessionId);
        this._sessionId = 0;
        this._manager?.disable();
        this._manager = null;
        this._stopMotion?.();
        this._stopMotion = null;
    }
}
