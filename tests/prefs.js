// SPDX-License-Identifier: GPL-3.0-only
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource')._register();
const root = ARGV[0];
const {LEGACY_APPEARANCE_KEYS} = await import(`file://${root}/core/appearance.js`);
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
    if (LEGACY_APPEARANCE_KEYS.includes(key)) {
        assert(!controls.has(key), `Legacy setting hidden ${key}`);
        continue;
    }
    const control = controls.get(key);
    assert(control, `Missing control ${key}`);
    const type = settings.get_value(key).get_type_string();
    if (type === 'b') {
        control.active = !control.active;
        assert(control.active === settings.get_boolean(key), `Boolean write ${key}`);
        settings.set_boolean(key, !control.active);
        assert(control.active === settings.get_boolean(key), `Boolean read ${key}`);
    } else if (type === 'd' || type === 'i') {
        const slider = control instanceof Gtk.Scale;
        const valueTarget = slider ? control.adjustment : control;
        valueTarget.value = slider ? 150 : control.adjustment.upper / 2;
        assert(settings.get_value(key).deep_unpack() === valueTarget.value, `Numeric write ${key}`);
        const lower = control.adjustment.lower;
        if (type === 'd')
            settings.set_double(key, lower);
        else
            settings.set_int(key, lower);
        assert(valueTarget.value === lower, `Numeric read ${key}`);
    } else {
        control.selected = 1;
        const changed = settings.get_string(key);
        settings.reset(key);
        assert(settings.get_string(key) !== changed && control.selected === 0, `Choice binding ${key}`);
    }
    settings.reset(key);
}
assert(controls.has('opacity-gtk-settings-sidebar'), 'Settings integration control');
settings.set_boolean('panel-auto-opacity', false);
assert(!controls.get('panel-maximized-opacity').visible && !controls.get('panel-fullscreen-opacity').visible,
    'Panel window-specific opacities are hidden in manual mode');
settings.reset('panel-auto-opacity');
for (const enabled of [false, true]) {
    settings.set_boolean('panel-blur', enabled);
    assert(controls.get('panel-static-blur').sensitive === enabled, 'Static source follows panel effects');
}
settings.reset('panel-blur');
for (const blur of [false, true]) {
    for (const distortion of [false, true]) {
        settings.set_boolean('blur-filter-enabled', blur);
        settings.set_boolean('refraction-enabled', distortion);
        assert(controls.get('blur-method').sensitive === blur, 'Blur method follows blur toggle');
        assert(controls.get('blur-radius').sensitive === blur, 'Blur radius follows blur toggle');
        assert(controls.get('refraction-strength').sensitive === distortion, 'Distortion strength independent');
        assert(controls.get('refraction-style').sensitive === distortion, 'Glass model follows distortion toggle');
        assert(controls.get('refraction-enabled').sensitive, 'Distortion toggle always available');
        assert(controls.get('blur-filter-enabled').sensitive, 'Blur toggle always available');
        assert(controls.get('blur-resolution').visible === blur, 'Resolution only appears for blur');
        assert(controls.get('blur-refresh-rate').visible === (blur || distortion), 'Refresh only appears for capture effects');
    }
}
assert(controls.get('refraction-style').model.get_string(1)==='Liquid', 'Liquid display name');
controls.get('refraction-style').selected=1;
assert(settings.get_string('refraction-style')==='liquid', 'Liquid choice writes preference');
const highlight = controls.get('refraction-highlight');
assert(highlight instanceof Gtk.Scale && highlight.adjustment.value === 100 &&
    highlight.adjustment.lower === 0 && highlight.adjustment.upper === 200, 'Liquid slider range and default');
assert(highlight.is_sensitive(), 'Liquid slider is available when distortion is enabled');
settings.reset('refraction-style');
assert(!highlight.is_sensitive(), 'Contour does not use the Liquid slider');
for (const enabled of [false,true]) for (const method of ['box','fast-gaussian','kawase']) {
    settings.set_boolean('blur-filter-enabled',enabled);settings.set_string('blur-method',method);
    assert(controls.get('blur-samples').sensitive===(enabled && method==='fast-gaussian'), 'Sample selector sensitivity');
    assert(controls.get('blur-iterations').sensitive===(enabled && method==='fast-gaussian'), 'Iteration control sensitivity');
    assert(controls.get('blur-kawase-iterations').sensitive===(enabled && method==='kawase'), 'Kawase iteration control sensitivity');
}
for (const [index,value] of ['13','9','5'].entries()) {
    controls.get('blur-samples').selected=index;
    assert(settings.get_string('blur-samples')===value, 'Samples write binding');
}
for (const key of ['blur-filter-enabled','refraction-enabled','blur-method','blur-samples'])
    settings.reset(key);
window.present();
window.set_visible_page_name('blur');
const loop = new GLib.MainLoop(null, false);
const ready = GLib.getenv('GSE_PREFS_READY');
if (ready) {
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
        GLib.file_set_contents(ready, 'ready');
        return GLib.SOURCE_REMOVE;
    });
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
        if (!GLib.file_test(`${ready}.close`, GLib.FileTest.EXISTS))
            return GLib.SOURCE_CONTINUE;
        window.close();
        loop.quit();
        return GLib.SOURCE_REMOVE;
    });
}
GLib.timeout_add(GLib.PRIORITY_DEFAULT, ready ? 15000 : 300, () => {
    window.close();
    loop.quit();
    return GLib.SOURCE_REMOVE;
});
loop.run();
console.log(`PASS: ${pages.size} pages, ${controls.size} controls, read/write bindings and close.`);
