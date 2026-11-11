// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

let cachedTemplate;
let cachedBinary;
const CLASS_NAME = 'gse-settings-window';

export function clearSettingsLauncherCache() {
    cachedTemplate = undefined;
    cachedBinary = undefined;
}

function read(file) {
    try {
        const [, bytes] = file.load_contents(null);
        return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    } catch (error) {
        if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            return null;
        throw error;
    }
}

function write(file, text, expected = undefined) {
    let current = null;
    let etag = null;
    try {
        const [, bytes, tag] = file.load_contents(null);
        current = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
        etag = tag;
    } catch (error) {
        if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            throw error;
    }
    if (expected !== undefined && current !== expected)
        throw new Error('O lançador mudou durante a atualização; arquivo preservado.');
    if (current === text)
        return false;
    GLib.mkdir_with_parents(file.get_parent().get_path(), 0o700);
    file.replace_contents(text, etag, false, Gio.FileCreateFlags.PRIVATE, null);
    return true;
}

export function settingsWindowTemplate(original) {
    const template = /<template\b[^>]*\bclass="CcWindow"[^>]*>/;
    if (!template.test(original))
        throw new Error('Template do Configurações incompatível; o aplicativo foi preservado.');
    return original.replace(template, match => `${match}<style><class name="${CLASS_NAME}"/></style>`);
}

function overlayTemplate(binary) {
    const info = Gio.File.new_for_path(binary).query_info('time::modified,standard::size', Gio.FileQueryInfoFlags.NONE, null);
    const signature = `${binary}:${info.get_attribute_uint64('time::modified')}:${info.get_size()}`;
    if (signature !== cachedBinary) {
        const extractor = Gio.File.new_for_path('/usr/bin/gresource').query_exists(null)
            ? '/usr/bin/gresource' : GLib.find_program_in_path('gresource');
        if (!extractor)
            throw new Error('Não foi possível localizar gresource para configurar o aplicativo.');
        const process = Gio.Subprocess.new([extractor, 'extract', binary, '/org/gnome/Settings/gtk/cc-window.ui'],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        const [, output] = process.communicate_utf8(null, null);
        if (!process.get_successful())
            throw new Error('Não foi possível ler o template do Configurações instalado.');
        cachedTemplate = settingsWindowTemplate(output);
        cachedBinary = signature;
    }
    return cachedTemplate;
}

// CcWindow has no application-specific CSS class. Add one only to this
// process's resource template, using a reversible user D-Bus launcher override.
export function syncSettingsLauncher(settings) {
    const config = GLib.build_filenamev([GLib.get_user_config_dir(), 'gnome-shell-extended']);
    const stateFile = Gio.File.new_for_path(GLib.build_filenamev([config, 'settings-launcher.json']));
    if (!settings.get_boolean('opacity-gtk-settings-sidebar') && !stateFile.query_exists(null))
        return;
    GLib.mkdir_with_parents(config, 0o700);
    const lock = Gio.File.new_for_path(GLib.build_filenamev([config, 'settings-launcher.lock']));
    let stream;
    try {
        stream = lock.create(Gio.FileCreateFlags.PRIVATE, null);
    } catch (error) {
        if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
            throw error;
        const owner = read(lock)?.trim();
        if (!/^[0-9]+$/.test(owner ?? ''))
            throw new Error('Bloqueio do lançador do Configurações inválido; o arquivo foi preservado.');
        if (GLib.file_test(`/proc/${owner}`, GLib.FileTest.EXISTS))
            return;
        lock.delete(null);
        stream = lock.create(Gio.FileCreateFlags.PRIVATE, null);
    }
    try {
        stream.write_all(new TextEncoder().encode(String(new Gio.Credentials().get_unix_pid())), null);
        stream.close(null);
        applySettingsLauncher(settings);
    } finally {
        if (!stream.is_closed())
            stream.close(null);
        lock.delete(null);
    }
}

function applySettingsLauncher(settings) {
    const config = GLib.build_filenamev([GLib.get_user_config_dir(), 'gnome-shell-extended']);
    const overlay = GLib.build_filenamev([config, 'settings-overlay']);
    const service = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_data_dir(), 'dbus-1', 'services', 'org.gnome.Settings.service']));
    const stateFile = Gio.File.new_for_path(GLib.build_filenamev([config, 'settings-launcher.json']));
    const stored = read(stateFile);
    let state = stored === null ? null : JSON.parse(stored);
    if (state && (state.version !== 1 || !Array.isArray(state.installed) ||
        (state.original !== null && typeof state.original !== 'string')))
        throw new Error('Backup do lançador do Configurações inválido; os arquivos foram preservados.');
    const current = read(service);
    const hash = text => GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, text, -1);
    let changed = false;
    if (settings.get_boolean('opacity-gtk-settings-sidebar')) {
        const binary = GLib.find_program_in_path('gnome-control-center');
        if (!binary)
            throw new Error('O aplicativo Configurações não está instalado.');
        const template = overlayTemplate(binary);
        const templateFile = Gio.File.new_for_path(GLib.build_filenamev([overlay, 'cc-window.ui']));
        if (current !== null && state && !state.installed.includes(hash(current)) && current !== state.original)
            throw new Error('O lançador do Configurações foi alterado manualmente; o arquivo foi preservado.');
        const baseline = state ? state.original : current;
        const keyFile = new GLib.KeyFile();
        const serviceData = baseline ?? '[D-BUS Service]\nName=org.gnome.Settings\n';
        keyFile.load_from_data(serviceData, new TextEncoder().encode(serviceData).length, GLib.KeyFileFlags.KEEP_COMMENTS);
        const existingOverlay = GLib.getenv('G_RESOURCE_OVERLAYS');
        const resourceOverlay = `/org/gnome/Settings/gtk=${overlay}${existingOverlay ? `:${existingOverlay}` : ''}`;
        const originalExec = keyFile.get_keys('D-BUS Service')[0].includes('Exec')
            ? keyFile.get_string('D-BUS Service', 'Exec') : `${GLib.shell_quote(binary)} --gapplication-service`;
        keyFile.set_string('D-BUS Service', 'Exec', `/usr/bin/env ${GLib.shell_quote(`G_RESOURCE_OVERLAYS=${resourceOverlay}`)} ${originalExec}`);
        const [replacement] = keyFile.to_data();
        state ??= {version:1, original:current, installed:[]};
        if (!state.installed.includes(hash(replacement)))
            state.installed.push(hash(replacement));
        write(stateFile, JSON.stringify(state, null, 2) + '\n');
        write(templateFile, template);
        changed = write(service, replacement, current);
    } else if (state) {
        if (current !== null && state.installed.includes(hash(current))) {
            if (state.original === null) {
                service.delete(null);
                changed = true;
            } else {
                changed = write(service, state.original, current);
            }
        }
        stateFile.delete(null);
    }
    if (changed) {
        try {
            Gio.DBus.session.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus',
                'org.freedesktop.DBus', 'ReloadConfig', null, null, Gio.DBusCallFlags.NONE, 1000, null);
        } catch {
            // Session buses also monitor service directories for changes.
        }
    }
}
