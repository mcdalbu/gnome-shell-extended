// SPDX-License-Identifier: GPL-3.0-only
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {integrationJob, integrationsSettled} from '../src/core/integrationJobs.js';
import {StyleLease} from '../src/core/style.js';
import {replaceBlock, writeGtkStyle} from '../src/core/gtkStyle.js';
import {syncPtyxisOpacity} from '../src/core/ptyxis.js';
import {syncSettingsLauncher, settingsWindowTemplate, settingsLauncherExec} from '../src/core/settingsLauncher.js';
function assert(value, message) {
    if (!value)
        throw new Error(message);
}
let style = 'color: white;';
const actor = {get_style: () => style, set_style: value => { style = value; }};
const lease = new StyleLease(actor);
lease.set('background-color: black;');
lease.restore();
assert(style === 'color: white;', 'Restore original style');
lease.set('background-color: black;');
style = 'color: red;';
lease.restore();
assert(style === 'color: red;', 'Preserve concurrent edit');
lease.set('background-color: black;');
lease.restore();
assert(style === 'color: red;', 'Follow changed original');
const original = '/* Existing user CSS */\nlabel { color: red; }\n';
const modified = replaceBlock(original, 'popover { color: white; }');
assert(replaceBlock(modified, '') === original, 'Remove owned block');
assert(replaceBlock(modified, 'popover { color: white; }') === modified, 'Idempotent block');
let failed = false;
try { replaceBlock('/* BEGIN Gnome Shell Extended */', 'css'); } catch { failed = true; }
assert(failed, 'Reject malformed block');
const directory = `${GLib.get_user_config_dir()}/gtk-4.0`;
GLib.mkdir_with_parents(directory, 0o700);
GLib.file_set_contents(`${directory}/gtk.css`, original);
writeGtkStyle('popover { color: white; }');
writeGtkStyle('');
assert(new TextDecoder().decode(GLib.file_get_contents(`${directory}/gtk.css`)[1]) === original, 'GTK roundtrip');
const legacySidebars = ['Nautilus sidebar', 'Settings sidebar'].map((sidebar, index) =>
    `/* BEGIN GNOME Extended: ${sidebar} */\nwindow.${index ? 'gnome-extended-settings' : 'nautilus-window'} { background-color: transparent; }\n/* END GNOME Extended: ${sidebar} */`);
const legacyMenus = '/* BEGIN GNOME Extended: GTK4 context menus */\npopover.menu { color: white; }\n/* END GNOME Extended: GTK4 context menus */\n';
const legacyCss = original + legacySidebars.join('') + legacyMenus;
GLib.file_set_contents(`${directory}/gtk.css`, legacyCss);
writeGtkStyle('popover { color: white; }');
writeGtkStyle('');
assert(new TextDecoder().decode(GLib.file_get_contents(`${directory}/gtk.css`)[1]) === legacyCss,
    'Preserve styles owned by an enabled legacy extension');
const migrationErrors = [];
integrationJob('test', {parts: ['gtk'], values: {}, removeLegacyGtkStyles: true}, error => migrationErrors.push(error.message));
await integrationsSettled();
assert(migrationErrors.length === 0, migrationErrors.join('\n'));
assert(new TextDecoder().decode(GLib.file_get_contents(`${directory}/gtk.css`)[1]) === original + '\n',
    'Disabled GTK integration removes stale sidebar and menu blocks and preserves unrelated CSS');
GLib.file_set_contents(`${directory}/gtk.css`, original);
assert(settingsWindowTemplate('<interface><template class="CcWindow" parent="AdwApplicationWindow"></template></interface>').includes('gse-settings-window'), 'Settings scoped class');
const overlay = '/tmp/current Settings overlay';
for (const prefix of [
    '',
    "/usr/bin/env 'G_RESOURCE_OVERLAYS=/org/gnome/Settings/gtk=/old:/other=/keep' ",
    "/usr/bin/env 'G_RESOURCE_OVERLAYS=/outer=/keep' /usr/bin/env -i 'G_RESOURCE_OVERLAYS=/org/gnome/Settings/gtk=/old:/other=/keep' ",
]) {
    const command = settingsLauncherExec(`${prefix}/usr/bin/printenv G_RESOURCE_OVERLAYS`, overlay);
    const [, argv] = GLib.shell_parse_argv(command);
    const process = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
    const [, output] = process.communicate_utf8(null, null);
    assert(process.get_successful(), 'Wrapped launcher executes');
    assert(output.trim().startsWith(`/org/gnome/Settings/gtk=${overlay}`), 'Current Settings overlay wins over legacy env');
    assert(!output.includes('=/old'), 'Remove conflicting Settings mapping');
    if (prefix)
        assert(output.trim().endsWith(':/other=/keep'), 'Preserve unrelated inner overlays');
}
const literal = settingsLauncherExec("/usr/bin/printf '%s' 'G_RESOURCE_OVERLAYS=application argument'", overlay);
const [, literalArgv] = GLib.shell_parse_argv(literal);
const literalProcess = Gio.Subprocess.new(literalArgv, Gio.SubprocessFlags.STDOUT_PIPE);
assert(literalProcess.communicate_utf8(null, null)[1] === 'G_RESOURCE_OVERLAYS=application argument', 'Preserve application arguments');
if (GLib.find_program_in_path('gnome-control-center')) {
    syncSettingsLauncher({get_boolean: () => true});
    const service = Gio.File.new_for_path(`${GLib.get_user_data_dir()}/dbus-1/services/org.gnome.Settings.service`);
    assert(service.query_exists(null), 'Settings launcher created');
    syncSettingsLauncher({get_boolean: () => false});
    assert(!service.query_exists(null), 'Settings launcher removed');
    const custom = '[D-BUS Service]\nName=org.gnome.Settings\nExec=/usr/bin/env G_RESOURCE_OVERLAYS=/org/gnome/Settings/gtk=/old /usr/bin/gnome-control-center --gapplication-service\n# Custom launcher\n';
    service.replace_contents(custom, null, false, Gio.FileCreateFlags.PRIVATE, null);
    syncSettingsLauncher({get_boolean: () => true});
    syncSettingsLauncher({get_boolean: () => false});
    assert(new TextDecoder().decode(service.load_contents(null)[1]) === custom, 'Restore custom launcher exactly');
    syncSettingsLauncher({get_boolean: () => true});
    const edited = new TextDecoder().decode(service.load_contents(null)[1]) + '# External edit\n';
    service.replace_contents(edited, null, false, Gio.FileCreateFlags.PRIVATE, null);
    syncSettingsLauncher({get_boolean: () => false});
    assert(new TextDecoder().decode(service.load_contents(null)[1]) === edited, 'Preserve concurrent launcher edit');
    console.log('PASS: Settings resource overlay and launcher restoration.');
}
const source = Gio.SettingsSchemaSource.get_default();
const rootSchema = source.lookup('org.gnome.Ptyxis', true);
const profileSchema = source.lookup('org.gnome.Ptyxis.Profile', true);
if (rootSchema && profileSchema?.has_key('opacity')) {
    const uuid = '00000000-0000-0000-0000-000000000001';
    const root = new Gio.Settings({settings_schema: rootSchema});
    root.set_strv('profile-uuids', [uuid]);
    root.set_string('default-profile-uuid', uuid);
    const profile = new Gio.Settings({settings_schema: profileSchema, path: `/org/gnome/Ptyxis/Profiles/${uuid}/`});
    profile.reset('opacity');
    const unset = profile.get_double('opacity');
    const enabled = {get_boolean: () => true, get_double: () => 0.4};
    const disabled = {get_boolean: () => false};
    syncPtyxisOpacity(enabled, root);
    assert(profile.get_double('opacity') === 0.4, 'Apply profile opacity');
    syncPtyxisOpacity(disabled, root);
    assert(profile.get_user_value('opacity') === null && profile.get_double('opacity') === unset, 'Restore unset default');
    profile.set_double('opacity', 0.7);
    syncPtyxisOpacity(enabled, root);
    profile.set_double('opacity', 0.9);
    syncPtyxisOpacity(disabled, root);
    assert(profile.get_double('opacity') === 0.9, 'Preserve external profile edit');
    console.log('PASS: Ptyxis restoration and concurrent profile edits.');
} else {
    console.log('SKIP: Ptyxis schemas absent.');
}
console.log('PASS: style leases, GTK markers and file roundtrip.');

// Real subprocess transactions: a queued restore must follow an in-flight
// apply, and merged pending parts must use the newest complete snapshot.
const errors = [];
const job = (parts, enabled, alpha=.4) => ({parts,values:{
    'opacity-gtk-files-sidebar':enabled,'opacity-gtk-settings-sidebar':false,
    'opacity-gtk-menus':enabled,'opacity-ptyxis':false,'gtk-background-opacity':alpha}});
for (let i=0;i<20;i++)
    integrationJob('test',job(['gtk'],true,.2+i*.01),error=>errors.push(error.message));
integrationJob('test',job(['gtk','launcher'],false),error=>errors.push(error.message));
await integrationsSettled();
assert(errors.length===0,errors.join('\n'));
assert(!new TextDecoder().decode(GLib.file_get_contents(`${directory}/gtk.css`)[1]).includes('BEGIN Gnome Shell Extended'),
    'Serialized final restore wins over queued applies');
integrationJob('test',job(['gtk'],true,.37),error=>errors.push(error.message));
await integrationsSettled();
assert(new TextDecoder().decode(GLib.file_get_contents(`${directory}/gtk.css`)[1]).includes('0.37'), 'Latest snapshot applies');
writeGtkStyle('');
console.log('PASS: asynchronous integration coalescing and serialized final restoration.');
