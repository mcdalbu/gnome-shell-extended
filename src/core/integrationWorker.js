// SPDX-License-Identifier: GPL-3.0-only
// This entry point runs in a separate GJS process, never in the compositor.
import System from 'system';
import {gtkCss, writeGtkStyle} from './gtkStyle.js';
import {syncPtyxisOpacity} from './ptyxis.js';
import {syncSettingsLauncher} from './settingsLauncher.js';

try {
    const job = JSON.parse(ARGV[0]);
    const settings = {get_boolean: key => !!job.values[key], get_double: key => job.values[key]};
    const errors = [];
    for (const part of job.parts) {
        try {
            if (part === 'gtk')
                writeGtkStyle(gtkCss(settings), job.removeLegacyGtkStyles);
            else if (part === 'ptyxis')
                syncPtyxisOpacity(settings);
            else if (part === 'launcher')
                syncSettingsLauncher(settings);
        } catch (error) { errors.push(`${part}: ${error.message}`); }
    }
    if (errors.length)
        throw new Error(errors.join('\n'));
} catch (error) {
    printerr(error.message);
    System.exit(1);
}
