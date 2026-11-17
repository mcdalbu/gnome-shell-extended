# SPDX-License-Identifier: GPL-3.0-only
"""Measure Settings sidebar alpha with a pre-existing legacy launcher overlay."""
import json
import os
from pathlib import Path
import signal
import subprocess
import time


def run(evaluate, wait, check, screenshot, results, ROOT, log):
    import gi
    gi.require_version('GdkPixbuf', '2.0')
    from gi.repository import Gio, GLib, GdkPixbuf

    config = Path(evaluate('GLib.get_user_config_dir()'))
    data = Path(evaluate('GLib.get_user_data_dir()'))
    legacy = config / 'gnome-extended/settings-overlay'
    legacy.mkdir(parents=True, exist_ok=True)
    template = subprocess.check_output([
        '/usr/bin/gresource', 'extract', '/usr/bin/gnome-control-center',
        '/org/gnome/Settings/gtk/cc-window.ui'], text=True)
    marker = '<template class="CcWindow" parent="AdwApplicationWindow">'
    assert marker in template, 'Installed Settings template changed'
    (legacy / 'cc-window.ui').write_text(template.replace(
        marker, marker + '<style><class name="gnome-extended-settings"/></style>', 1))
    service = data / 'dbus-1/services/org.gnome.Settings.service'
    service.parent.mkdir(parents=True, exist_ok=True)
    original_service = (
        '[D-BUS Service]\nName=org.gnome.Settings\n'
        'Exec=/usr/bin/env ' + GLib.shell_quote(
            f'G_RESOURCE_OVERLAYS=/org/gnome/Settings/gtk={legacy}') +
        ' /usr/bin/gnome-control-center --gapplication-service\n')
    service.write_text(original_service)
    css_file = config / 'gtk-4.0/gtk.css'
    css_file.parent.mkdir(parents=True, exist_ok=True)
    css_file.write_text('''/* Existing legacy integration, preserved by the new integration. */
window.gnome-extended-settings { background-color: transparent; }
window.gnome-extended-settings .content-pane { background-color: @window_bg_color; }
window.gnome-extended-settings .sidebar-pane { background-color: alpha(@window_bg_color, 0.67); }
''')
    evaluate('''globalThis.settingsOpacitySaved=Object.fromEntries([
        'opacity-enabled','opacity-gtk-settings-sidebar','gtk-background-opacity',
        'windows-blur','refraction-enabled','frosted-glass-enabled'
        ].map(k=>[k,cfg.get_value(k)]));
        cfg.set_boolean('windows-blur',false);
        cfg.set_boolean('refraction-enabled',false);
        cfg.set_boolean('frosted-glass-enabled',false);
        scene.hide();
        globalThis.settingsOpacityBackground=new St.Widget({
            width:global.stage.width,height:global.stage.height,
            style:'background-color: black;'});
        global.window_group.add_child(settingsOpacityBackground);
        cfg.set_boolean('opacity-enabled',true);
        cfg.set_boolean('opacity-gtk-settings-sidebar',true);''')
    wait("ext._manager._slots.get('opacity')?.instance")
    wait("(()=>{try{return new TextDecoder().decode(GLib.file_get_contents(" +
         json.dumps(str(service)) + ")[1]).includes('gnome-shell-extended/settings-overlay')}catch{return false}})()")
    display_env = dict(os.environ, WAYLAND_DISPLAY=evaluate('GLib.getenv("WAYLAND_DISPLAY")'),
                       GSETTINGS_BACKEND='memory', GTK_A11Y='none')
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    pid = None
    measurements = []

    def stop_settings():
        nonlocal pid
        if pid is not None:
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            pid = None
            wait("!global.get_window_actors().some(a=>a.meta_window.get_gtk_application_id()==='org.gnome.Settings')")
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                owned = bus.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus',
                    'org.freedesktop.DBus', 'NameHasOwner',
                    GLib.Variant('(s)', ('org.gnome.Settings',)),
                    None, Gio.DBusCallFlags.NONE, 5000, None).unpack()[0]
                if not owned:
                    return
                time.sleep(.05)
            raise AssertionError('Settings D-Bus name was not released')

    def pixels(path, rect):
        image = GdkPixbuf.Pixbuf.new_from_file(str(path))
        values = image.get_pixels()
        stride, channels = image.get_rowstride(), image.get_n_channels()
        scale = image.get_width() / evaluate('global.stage.width')
        x, y = (round(v * scale) for v in rect)
        return [values[yy*stride+xx*channels+c]
                for yy in range(y, y+10) for xx in range(x, x+10) for c in range(3)]

    try:
        for alpha in [0, .45, .9, 1]:
            evaluate(f"cfg.set_double('gtk-background-opacity',{alpha})")
            # The debounce writes user GTK CSS before each new process loads it.
            expected = f'alpha(@window_bg_color, {alpha:g})'
            wait("(()=>{try{return new TextDecoder().decode(GLib.file_get_contents(" +
                 json.dumps(str(css_file)) + ")[1]).includes('window.gse-settings-window') && "
                 "new TextDecoder().decode(GLib.file_get_contents(" + json.dumps(str(css_file)) +
                 ")[1]).includes(" + json.dumps(expected) + ")}catch{return false}})()")
            bus.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus',
                'org.freedesktop.DBus', 'StartServiceByName',
                GLib.Variant('(su)', ('org.gnome.Settings', 0)),
                None, Gio.DBusCallFlags.NONE, 10000, None)
            pid = bus.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus',
                'org.freedesktop.DBus', 'GetConnectionUnixProcessID',
                GLib.Variant('(s)', ('org.gnome.Settings',)),
                None, Gio.DBusCallFlags.NONE, 5000, None).unpack()[0]
            subprocess.run(['gnome-control-center', 'multitasking'], env=display_env,
                           stdout=log, stderr=log, check=True, timeout=10)
            wait("global.get_window_actors().some(a=>a.meta_window.get_gtk_application_id()==='org.gnome.Settings')")
            evaluate("globalThis.settingsOpacityActor=global.get_window_actors().find(a=>a.meta_window.get_gtk_application_id()==='org.gnome.Settings');settingsOpacityActor.meta_window.move_frame(true,150,150);global.window_group.set_child_below_sibling(settingsOpacityBackground,settingsOpacityActor)")
            time.sleep(.6)
            check(f'settings-opacity-{alpha:g}-actor-opaque', 'settingsOpacityActor.opacity===255')
            rect = evaluate('(()=>{const r=settingsOpacityActor.meta_window.get_frame_rect();return [r.x,r.y,r.width,r.height]})()')
            shots = []
            for color in ['black', 'white']:
                evaluate(f"settingsOpacityBackground.set_style('background-color: {color};')")
                time.sleep(.15)
                shots.append(screenshot(f'settings-opacity-{alpha:g}-{color}'))
            x, y, width, height = rect
            measured = {}
            for name, point in [('sidebar', (x+25, y+height-45)),
                                ('content', (x+width-30, y+height-45))]:
                black, white = (pixels(path, point) for path in shots)
                measured[name] = 1 - sum(b-a for a, b in zip(black, white)) / (255*len(black))
            measurements.append({'configured': alpha, **measured})
            results['settings-opacity-measurements'] = measurements
            stop_settings()
        for measured in measurements:
            assert abs(measured['sidebar']-measured['configured']) < .03, measured
            assert abs(measured['content']-1) < .01, measured
        check('settings-opacity-no-window-effects', "!ext._manager._slots.get('opacity').instance.windowBlur")
    finally:
        stop_settings()
        evaluate('''settingsOpacityBackground.destroy();scene.show();
            for(const [key,value] of Object.entries(settingsOpacitySaved))cfg.set_value(key,value);''')
        wait("(()=>{try{return new TextDecoder().decode(GLib.file_get_contents(" +
             json.dumps(str(service)) + ")[1])===" + json.dumps(original_service) +
             "}catch{return false}})()")
        check('settings-opacity-legacy-launcher-restored',
              "new TextDecoder().decode(GLib.file_get_contents(" + json.dumps(str(service)) +
              ")[1])===" + json.dumps(original_service))
