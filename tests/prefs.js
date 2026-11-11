// SPDX-License-Identifier: GPL-3.0-only
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource')._register();
const root = ARGV[0];
const {default: Preferences} = await import(`file://${root}/prefs.js`);
const metadata = JSON.parse(new TextDecoder().decode(GLib.file_get_contents(`${root}/metadata.json`)[1]));
metadata.path = root;
metadata.dir = Gio.File.new_for_path(root);
Adw.init();
const application = new Adw.Application({application_id: 'org.gnome.ShellExtended.PreferencesTest'});
application.register(null);
const prefs = new Preferences(metadata);
const window = new Adw.PreferencesWindow({application, title: 'Gnome Shell Extended'});
const addedPages = [];
const addPage = window.add.bind(window);
window.add = value => { addedPages.push(value); addPage(value); };
prefs.fillPreferencesWindow(window);
const settings = prefs.getSettings();
const controls = new Map();
const pages = new Set();
function visit(widget) {
    if (widget.name?.startsWith('setting-'))
        controls.set(widget.name.slice(8), widget);
    if (widget instanceof Adw.PreferencesPage)
        pages.add(widget.name);
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling())
        visit(child);
}
for (const page of addedPages)
    visit(page);
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
assert(pages.size === 6, 'Six preferences pages');
for (const key of settings.settings_schema.list_keys()) {
    const control = controls.get(key);
    assert(control, `Missing control ${key}`);
    const type = settings.get_value(key).get_type_string();
    if (type === 'b') {
        control.active = !control.active;
        assert(control.active === settings.get_boolean(key), `Boolean write ${key}`);
        settings.set_boolean(key, !control.active);
        assert(control.active === settings.get_boolean(key), `Boolean read ${key}`);
    } else if (type === 'd' || type === 'i') {
        const value = control.adjustment.upper / 2;
        control.value = value;
        assert(settings.get_value(key).deep_unpack() === control.value, `Numeric write ${key}`);
        const lower = control.adjustment.lower;
        if (type === 'd')
            settings.set_double(key, lower);
        else
            settings.set_int(key, lower);
        assert(control.value === lower, `Numeric read ${key}`);
    } else {
        control.selected = 1;
        const changed = settings.get_string(key);
        settings.reset(key);
        assert(settings.get_string(key) !== changed && control.selected === 0, `Choice binding ${key}`);
    }
    settings.reset(key);
}
assert(controls.has('opacity-gtk-settings-sidebar'), 'Settings integration control');
window.present();
window.set_visible_page_name('blur');
const loop = new GLib.MainLoop(null, false);
const ready = GLib.getenv('GSE_PREFS_READY');
if (ready) {
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
        GLib.file_set_contents(ready, 'ready');
        return GLib.SOURCE_REMOVE;
    });
}
GLib.timeout_add(GLib.PRIORITY_DEFAULT, ready ? 2000 : 300, () => {
    window.close();
    loop.quit();
    return GLib.SOURCE_REMOVE;
});
loop.run();
console.log(`PASS: ${pages.size} pages, ${controls.size} controls, read/write bindings and close.`);
