// SPDX-License-Identifier: GPL-3.0-only
export class Logger {
    constructor(debug = false) {
        this.debugEnabled = debug;
    }

    debug(message) {
        if (this.debugEnabled)
            console.debug(`[Gnome Shell Extended] ${message}`);
    }

    error(message, error) {
        console.error(`[Gnome Shell Extended] ${message}: ${error?.stack ?? error}`);
    }
}
