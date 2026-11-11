// SPDX-License-Identifier: GPL-3.0-only
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {MODULE_LOADERS} from './core/config.js';
import {Logger} from './core/logger.js';
import {ModuleManager} from './core/moduleManager.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class GnomeShellExtended extends Extension {
    enable() {
        const settings = this.getSettings();
        this._manager = new ModuleManager(settings, MODULE_LOADERS,
            new Logger(settings.get_boolean('debug-logging')));
        try {
            this._manager.setSuspended(Main.sessionMode.isLocked);
            this._manager.enable();
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
    }
}
