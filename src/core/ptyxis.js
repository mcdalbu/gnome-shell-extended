// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

function ptyxisSchemas() {
    const source = Gio.SettingsSchemaSource.get_default();
    const root = source.lookup('org.gnome.Ptyxis', true);
    const profile = source.lookup('org.gnome.Ptyxis.Profile', true);
    return root && profile?.has_key('opacity') ? {root, profile} : null;
}

// Persist originals before changing profiles, so disabling after a logout or
// crash can still restore both explicit values and the original unset default.
export function syncPtyxisOpacity(settings, rootSettings) {
    try {
        return applyPtyxisOpacity(settings, rootSettings);
    } catch (error) {
        // Re-read persisted originals if another process updated the backup
        // between loading and replacing it.
        if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.WRONG_ETAG))
            return applyPtyxisOpacity(settings, rootSettings);
        throw error;
    }
}

function applyPtyxisOpacity(settings, rootSettings) {
    const schemas = ptyxisSchemas();
    if (!schemas)
        return false;
    const root = rootSettings ?? new Gio.Settings({settings_schema: schemas.root});
    const directory = GLib.build_filenamev([GLib.get_user_config_dir(), 'gnome-shell-extended']);
    const file = Gio.File.new_for_path(GLib.build_filenamev([directory, 'ptyxis-opacity.json']));
    let original = '';
    let etag = null;
    let backup = {version: 1, profiles: {}};
    try {
        const [, bytes, loadedEtag] = file.load_contents(null);
        original = new TextDecoder('utf-8', {fatal:true}).decode(bytes);
        backup = JSON.parse(original);
        etag = loadedEtag;
        if (backup.version !== 1 || !backup.profiles || typeof backup.profiles !== 'object' || Array.isArray(backup.profiles))
            throw new Error('Backup da opacidade do Ptyxis inválido; o arquivo foi preservado.');
    } catch (error) {
        if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            throw error;
    }
    const validUuid = uuid => /^(?:[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.test(uuid);
    const profile = uuid => new Gio.Settings({settings_schema: schemas.profile,
        path: `/org/gnome/Ptyxis/Profiles/${uuid}/`});
    const write = () => {
        const result = JSON.stringify(backup, null, 2) + '\n';
        if (result === original)
            return;
        GLib.mkdir_with_parents(directory, 0o700);
        const [, newEtag] = file.replace_contents(result, etag, false, Gio.FileCreateFlags.PRIVATE, null);
        original = result;
        etag = newEtag;
    };
    let changed = false;
    if (settings.get_boolean('opacity-ptyxis')) {
        const opacity = settings.get_double('gtk-background-opacity');
        const uuids = new Set([...root.get_strv('profile-uuids'), root.get_string('default-profile-uuid')]);
        const profiles = [];
        for (const uuid of uuids) {
            if (!validUuid(uuid))
                continue;
            const source = profile(uuid);
            if (!source.is_writable('opacity'))
                throw new Error('A opacidade de um perfil do Ptyxis está bloqueada.');
            let record = backup.profiles[uuid];
            if (!record) {
                record = {value: source.get_user_value('opacity')?.deep_unpack() ?? null, applied: []};
                backup.profiles[uuid] = record;
            }
            if ((!Array.isArray(record.applied) || !record.applied.every(value =>
                typeof value === 'number' && value >= 0 && value <= 1)) || (record.value !== null &&
                (typeof record.value !== 'number' || record.value < 0 || record.value > 1)))
                throw new Error('Backup de perfil do Ptyxis inválido; o arquivo foi preservado.');
            if (!record.applied.includes(opacity))
                record.applied.push(opacity);
            profiles.push(source);
        }
        if (profiles.length || original)
            write();
        for (const source of profiles) {
            if (Math.abs(source.get_double('opacity') - opacity) <= 0.000001)
                continue;
            if (!source.set_double('opacity', opacity))
                throw new Error('Não foi possível aplicar a opacidade do Ptyxis.');
            changed = true;
        }
    } else if (Object.keys(backup.profiles).length) {
        for (const [uuid, record] of Object.entries(backup.profiles)) {
            if (!validUuid(uuid) || (!Array.isArray(record.applied) || !record.applied.every(value =>
                typeof value === 'number' && value >= 0 && value <= 1)) ||
                (record.value !== null && (typeof record.value !== 'number' || record.value < 0 || record.value > 1)))
                throw new Error('Backup de perfil do Ptyxis inválido; o arquivo foi preservado.');
            const source = profile(uuid);
            // Preserve a manual change made outside this integration.
            const current = source.get_double('opacity');
            if (record.applied.some(value => Math.abs(current - value) < 0.000001)) {
                if (!source.is_writable('opacity'))
                    throw new Error('Não foi possível restaurar um perfil bloqueado do Ptyxis.');
                if (record.value === null)
                    source.reset('opacity');
                else if (!source.set_double('opacity', record.value))
                    throw new Error('Não foi possível restaurar a opacidade anterior do Ptyxis.');
                changed = true;
            }
        }
        // Keep the recovery record until the restored values reach dconf.
        if (changed)
            Gio.Settings.sync();
        changed = false;
        backup.profiles = {};
        write();
    }
    if (changed)
        Gio.Settings.sync();
    return true;
}

