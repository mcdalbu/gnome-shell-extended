// SPDX-License-Identifier: GPL-3.0-only
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const BEGIN = '/* BEGIN Gnome Shell Extended */';
const END = '/* END Gnome Shell Extended */';

export function gtkCss(settings) {
    const alpha = settings.get_double('gtk-background-opacity');
    const rules = [];
    if (settings.get_boolean('opacity-gtk-files-sidebar')) {
        rules.push(`window.nautilus-window { background-color: transparent; }
window.nautilus-window .content-pane { background-color: @view_bg_color; }
window.nautilus-window .sidebar-pane { background-color: alpha(@window_bg_color, ${alpha}); }`);
    }
    if (settings.get_boolean('opacity-gtk-menus'))
        rules.push(`popover.menu > contents { background-color: alpha(@theme_bg_color, ${alpha}); }`);
    if (settings.get_boolean('opacity-gtk-settings-sidebar')) {
        rules.push(`window.gse-settings-window { background-color: transparent; }
window.gse-settings-window .content-pane { background-color: @window_bg_color; }
window.gse-settings-window .sidebar-pane { background-color: alpha(@window_bg_color, ${alpha}); }`);
    }
    return rules.join('\n');
}

export function replaceBlock(original, css) {
    const start = original.indexOf(BEGIN);
    const end = original.indexOf(END);
    if ((start < 0) !== (end < 0) || (start >= 0 && (end < start ||
        original.indexOf(BEGIN, start + BEGIN.length) >= 0 || original.indexOf(END, end + END.length) >= 0)))
        throw new Error('Bloco GTK incompleto ou duplicado; arquivo preservado.');
    const replacement = css ? `${BEGIN}\n${css}\n${END}` : '';
    if (start >= 0)
        return original.slice(0, start) + replacement + original.slice(end + END.length);
    if (!css)
        return original;
    return original + (original && !original.endsWith('\n') ? '\n' : '') + replacement;
}

export function writeGtkStyle(css) {
    const directory = GLib.build_filenamev([GLib.get_user_config_dir(), 'gtk-4.0']);
    const file = Gio.File.new_for_path(`${directory}/gtk.css`);
    let original = '';
    let etag = null;
    try {
        const [, bytes, tag] = file.load_contents(null);
        original = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
        etag = tag;
    } catch (error) {
        if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            throw error;
    }
    const result = replaceBlock(original, css);
    if (result === original)
        return;
    GLib.mkdir_with_parents(directory, 0o700);
    // Optimistic concurrency: fail instead of replacing a concurrent edit.
    file.replace_contents(result, etag, true, Gio.FileCreateFlags.PRIVATE, null);
}
