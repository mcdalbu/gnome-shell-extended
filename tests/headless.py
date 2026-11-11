#!/usr/bin/python3
# SPDX-License-Identifier: GPL-3.0-only
"""Smoke test in a private D-Bus/headless Wayland desktop, never the user session."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
UUID = 'gnome-shell-extended@mcda'
OUTPUT = ROOT / 'validation'
if os.environ.get('GSE_TEST_FLICKER'):
    VARIANT = 'flicker-blur' if os.environ.get('GSE_TEST_FLICKER_BLUR') else 'flicker'
elif os.environ.get('GSE_TEST_REGRESSIONS'):
    VARIANT = 'regressions'
elif os.environ.get('GSE_TEST_NO_OPTIONAL'):
    VARIANT = 'fallback'
else:
    VARIANT = 'single'
if os.environ.get('GSE_TEST_MULTI'):
    VARIANT += '-multi'



def stage():
    with tempfile.TemporaryDirectory(prefix='gse-headless-', ignore_cleanup_errors=True) as directory:
        base = Path(directory)
        target = base / 'data/gnome-shell/extensions' / UUID
        shutil.copytree(ROOT / 'build' / UUID, target)
        if os.environ.get('GSE_TEST_REGRESSIONS'):
            dock = target.parent / 'dash-to-dock-extended@local'
            shutil.copytree(ROOT.parent / 'dash-to-dock-extended', dock,
                            ignore=shutil.ignore_patterns('.git', 'tests', 'validation', '*.zip'))
            subprocess.run(['glib-compile-schemas', '--strict', str(dock / 'schemas')], check=True)
        if os.environ.get('GSE_TEST_NO_OPTIONAL'):
            backend = target / 'core/blurBackend.js'
            backend.write_text(backend.read_text().replace('gi://Blur', 'gi://GseMissingBlur'))
        helper = target.parent / 'gse-test-helper@local'
        helper.mkdir()
        (helper / 'metadata.json').write_text(json.dumps({
            'uuid': helper.name, 'name': 'Private integration helper',
            'description': 'Test bus only', 'shell-version': ['50', '51'],
        }))
        (helper / 'extension.js').write_text('''
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
export default class Helper extends Extension {
    enable() { global.context.unsafe_mode = true; }
    disable() { global.context.unsafe_mode = false; }
}
''')
        (base / 'runtime').mkdir(mode=0o700)
        if os.environ.get('GSE_TEST_MULTI'):
            # Private monitor profile exercises two different fractional scales.
            import xml.etree.ElementTree as ET
            monitors = ET.Element('monitors', version='2')
            configuration = ET.SubElement(monitors, 'configuration')
            ET.SubElement(configuration, 'layoutmode').text = 'logical'
            left = 0
            for index, (width, height, scale) in enumerate([(1440, 1000, 1.25), (1440, 900, 1.5)]):
                logical = ET.SubElement(configuration, 'logicalmonitor')
                for key, value in [('x', left), ('y', 0), ('scale', scale), ('primary', 'yes' if index == 0 else 'no')]:
                    ET.SubElement(logical, key).text = str(value)
                monitor = ET.SubElement(logical, 'monitor')
                identity = ET.SubElement(monitor, 'monitorspec')
                for key, value in [('connector', f'Meta-{index}'), ('vendor', 'MetaVendor'), ('product', 'MetaVirtualMonitor'), ('serial', f'0x{index:02x}')]:
                    ET.SubElement(identity, key).text = value
                mode = ET.SubElement(monitor, 'mode')
                for key, value in [('width', width), ('height', height), ('rate', '60.000')]:
                    ET.SubElement(mode, key).text = str(value)
                left += round(width / scale)
            (base / 'config').mkdir(exist_ok=True)
            ET.ElementTree(monitors).write(base / 'config/monitors.xml', encoding='unicode')
        env = dict(os.environ, GSE_TEST_CHILD='1', XDG_DATA_HOME=str(base / 'data'),
                   XDG_CONFIG_HOME=str(base / 'config'), XDG_CACHE_HOME=str(base / 'cache'),
                   XDG_STATE_HOME=str(base / 'state'), XDG_RUNTIME_DIR=str(base / 'runtime'))
        if os.environ.get('GSE_TEST_FLICKER'):
            from frame_probe import build_probe
            env.update(build_probe(base))
        for key in ['DISPLAY', 'WAYLAND_DISPLAY', 'DBUS_STARTER_ADDRESS', 'DBUS_STARTER_BUS_TYPE']:
            env.pop(key, None)
        try:
            return subprocess.call(['dbus-run-session', '--', '/usr/bin/python3', __file__], env=env)
        finally:
            mount = base / 'runtime/doc'
            if os.path.ismount(mount):
                subprocess.run(['fusermount3', '-u', str(mount)], check=False)


def test():
    import gi
    gi.require_version('Gio', '2.0')
    from gi.repository import Gio, GLib
    shell_settings = Gio.Settings.new('org.gnome.shell')
    extensions = ['gse-test-helper@local', UUID]
    if os.environ.get('GSE_TEST_REGRESSIONS'):
        dock_path = Path(os.environ['XDG_DATA_HOME']) / 'gnome-shell/extensions/dash-to-dock-extended@local/schemas'
        dock_source = Gio.SettingsSchemaSource.new_from_directory(str(dock_path), Gio.SettingsSchemaSource.get_default(), False)
        dock_schema = dock_source.lookup('org.gnome.shell.extensions.dash-to-dock-extended', False)
        dock_settings = Gio.Settings.new_full(dock_schema, None, None)
        for key, value in [('dock-fixed', False), ('intellihide', True), ('autohide', True),
                           ('require-pressure-to-show', False), ('disable-overview-on-startup', False),
                           ('show-mounts', False), ('show-trash', False)]:
            if dock_schema.has_key(key):
                dock_settings.set_boolean(key, value)
        dock_settings.set_enum('dock-position', 2)
        dock_settings.set_enum('intellihide-mode', 0)
        extensions.insert(1, 'dash-to-dock-extended@local')
    shell_settings.set_strv('enabled-extensions', extensions)
    shell_settings.set_boolean('disable-user-extensions', False)
    shell_settings.set_string('welcome-dialog-last-shown-version', '999')
    Gio.Settings.new('org.gnome.desktop.search-providers').set_boolean('disable-external', True)
    Gio.Settings.new('org.gnome.desktop.notifications').set_boolean('show-banners', False)
    # A newly created virtual pointer starts at (0,0). It must not open the
    # Overview through the hot corner while testing a dock at the bottom edge.
    Gio.Settings.new('org.gnome.desktop.interface').set_boolean('enable-hot-corners', False)
    if os.environ.get('GSE_TEST_MULTI'):
        mutter = Gio.Settings.new('org.gnome.mutter')
        if mutter.props.settings_schema.has_key('experimental-features'):
            mutter.set_strv('experimental-features', ['scale-monitor-framebuffer'])
    Gio.Settings.sync()
    OUTPUT.mkdir(exist_ok=True)
    results = {'gnome-shell': subprocess.check_output(['gnome-shell', '--version'], text=True).strip()}
    log = (OUTPUT / f'{VARIANT}-session.log').open('w')
    command = ['gnome-shell', '--headless', '--wayland', '--no-x11', '--virtual-monitor=1440x1000']
    if os.environ.get('GSE_TEST_MULTI'):
        command.append('--virtual-monitor=1440x900')
    shell = subprocess.Popen(command, stdout=log, stderr=log)
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)

    def evaluate(code):
        ok, value = bus.call_sync('org.gnome.Shell', '/org/gnome/Shell', 'org.gnome.Shell', 'Eval',
            GLib.Variant('(s)', (code,)), GLib.VariantType.new('(bs)'), Gio.DBusCallFlags.NONE, 10000, None).unpack()
        if not ok:
            raise RuntimeError(value)
        return json.loads(value) if value else None

    def wait(code, timeout=15):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if shell.poll() is not None:
                raise RuntimeError('Headless Shell exited; inspect session log')
            try:
                if evaluate(f'Boolean({code})'):
                    return
            except Exception:
                pass
            time.sleep(0.1)
        raise RuntimeError('Timed out: ' + code)

    def check(name, code):
        value = evaluate(code)
        results[name] = value
        if not value:
            raise AssertionError(name)

    def screenshot(name):
        path = OUTPUT / (VARIANT + '-' + name + '.png')
        evaluate('globalThis.gseCapture=false; (async()=>{'
            f'const stream=Gio.File.new_for_path({json.dumps(str(path))}).replace(null,false,Gio.FileCreateFlags.REPLACE_DESTINATION,null);'
            'await new Shell.Screenshot().screenshot(false,stream);stream.close(null);globalThis.gseCapture=true;})()')
        wait('gseCapture')

    try:
        wait(f'Main.extensionManager.lookup({json.dumps(UUID)})?.state === 1')
        evaluate("(async()=>{for(const name of ['St','Gio','GLib','Shell','Meta','Clutter']) globalThis[name]=(await import('gi://'+name)).default;globalThis.gseImportsReady=true;})()")
        wait('globalThis.gseImportsReady')
        wait('!Main.layoutManager._startingUp && !Main.overview.animationInProgress')
        results['view-scales'] = evaluate('global.stage.peek_stage_views().map(view=>view.get_scale())')
        if os.environ.get('GSE_TEST_MULTI'):
            assert sorted(results['view-scales']) == [1.25, 1.5], results['view-scales']
        evaluate(f'globalThis.ext=Main.extensionManager.lookup({json.dumps(UUID)}).stateObj; '
                 'globalThis.cfg=ext.getSettings();Main.overview.hide();')
        wait('ext._manager._slots.get("panel")?.instance && ext._manager._slots.get("blur")?.instance')
        evaluate("cfg.set_string('blur-backend','native')")
        time.sleep(0.8)
        check('modules-active', 'ext._manager._slots.size === 2')
        # Deliberately striped scene makes blur visible in the screenshots.
        evaluate('''globalThis.scene=new St.Widget({name:'gse-test-scene',width:1440,height:1000,reactive:false});
            for(let x=0;x<1440;x+=40) scene.add_child(new St.Widget({x,y:32,width:40,height:968,
                style:`background-color:${x%80?'#7a4189':'#3b818a'};`}));
            Main.uiGroup.insert_child_above(scene,global.window_group);''')
        if os.environ.get('GSE_TEST_REGRESSIONS'):
            from regressions import run_dock
            early_env = dict(os.environ, WAYLAND_DISPLAY=evaluate('GLib.getenv("WAYLAND_DISPLAY")'), GTK_A11Y='none')
            run_dock(evaluate, wait, check, screenshot, results, ROOT, OUTPUT, VARIANT, early_env, log)
        evaluate('Main.panel.statusArea.dateMenu.menu.open();')
        wait('ext._manager._slots.get("blur").instance.bindings.get(Main.panel.statusArea.dateMenu.menu.actor)?.surface?._state.captures.size > 0')
        check('calendar-text-opacity', 'Main.panel.statusArea.dateMenu.menu.box.opacity === 255')
        screenshot('calendar')
        evaluate("cfg.set_string('blur-backend','lightweight');cfg.set_int('update-frequency',15)")
        wait("ext._manager._slots.get('blur').instance.bindings.get(Main.panel.statusArea.dateMenu.menu.actor)?.surface?.backend && !ext._manager._slots.get('blur').instance.bindings.get(Main.panel.statusArea.dateMenu.menu.actor).surface._loading")
        results['optional-backend'] = evaluate("ext._manager._slots.get('blur').instance.bindings.get(Main.panel.statusArea.dateMenu.menu.actor).surface.backend.name")
        if os.environ.get('GSE_TEST_NO_OPTIONAL'):
            assert results['optional-backend'] == 'native'
        if results['optional-backend'] == 'lightweight':
            wait("[...ext._manager._slots.get('blur').instance.bindings.get(Main.panel.statusArea.dateMenu.menu.actor).surface._state.captures.values()].every(c=>c.effect.frame_divisor===4)")
            evaluate("cfg.set_int('update-frequency',1)")
            check('backend-rate-clamped', "[...ext._manager._slots.get('blur').instance.bindings.get(Main.panel.statusArea.dateMenu.menu.actor).surface._state.captures.values()].every(c=>c.effect.frame_divisor<=4)")
        evaluate("cfg.set_string('blur-backend','off')")
        check('backend-off-clears-captures', "(ext._manager._slots.get('blur').instance.bindings.get(Main.panel.statusArea.dateMenu.menu.actor).surface?._state?.captures.size??0)===0")
        evaluate("cfg.set_string('blur-backend','native');cfg.set_int('update-frequency',0)")
        evaluate('Main.panel.statusArea.dateMenu.menu.close();')
        wait('!ext._manager._slots.get("blur").instance.bindings.get(Main.panel.statusArea.dateMenu.menu.actor)?.surface')
        evaluate('Main.panel.statusArea.quickSettings.menu.open();')
        wait('ext._manager._slots.get("blur").instance.bindings.get(Main.panel.statusArea.quickSettings.menu.actor)?.surface?._state.captures.size > 0')
        screenshot('quick-settings')
        evaluate('Main.panel.statusArea.quickSettings.menu.close();')
        if os.environ.get('GSE_TEST_REGRESSIONS'):
            from regressions import test_menu_close
            test_menu_close(evaluate, wait, check, results)
        check('panel-style', "Main.panel.get_style().includes('rgba(')")
        evaluate("globalThis.bindingFor=box=>[...ext._manager._slots.get('blur').instance.bindings.values()].find(b=>b.box===box); cfg.set_boolean('blur-dialogs',true);cfg.set_boolean('blur-osd',true);cfg.set_boolean('blur-screenshot',true);cfg.set_boolean('blur-menus',true)")
        evaluate("(async()=>{globalThis.DialogModule=await import('resource:///org/gnome/shell/ui/modalDialog.js');globalThis.PopupModule=await import('resource:///org/gnome/shell/ui/popupMenu.js');globalThis.Clutter=(await import('gi://Clutter')).default;})()")
        wait('globalThis.DialogModule && globalThis.PopupModule && globalThis.Clutter')
        evaluate("globalThis.dialog=new DialogModule.ModalDialog({destroyOnClose:false});dialog.contentLayout.add_child(new St.Label({text:'Gnome Shell Extended'}));dialog.addButton({label:'Close',action:()=>dialog.close()});dialog.open();")
        wait('bindingFor(dialog.dialogLayout._dialog ?? dialog.dialogLayout)?.surface?._state.captures.size > 0')
        check('dialog-foreground-opacity', 'dialog.contentLayout.opacity === 255')
        check('dialog-background-alpha', '((dialog.dialogLayout._dialog ?? dialog.dialogLayout).get_theme_node().get_background_color().alpha)<255')
        screenshot('dialog')
        if os.environ.get('GSE_TEST_REGRESSIONS'):
            from regressions import test_surface_pixels
            test_surface_pixels(evaluate, wait, screenshot, results, OUTPUT, VARIANT,
                                '(dialog.dialogLayout._dialog ?? dialog.dialogLayout)', 'dialog')
        evaluate('dialog.close();')
        wait('!bindingFor(dialog.dialogLayout._dialog ?? dialog.dialogLayout)?.surface')
        evaluate('dialog.destroy();')
        evaluate("globalThis.popup=new PopupModule.PopupMenu(Main.panel,0.5,St.Side.TOP);popup.addMenuItem(new PopupModule.PopupMenuItem('GSE menu'));Main.uiGroup.add_child(popup.actor);popup.open();")
        wait('bindingFor(popup.box)?.surface?._state.captures.size > 0')
        check('generic-menu-discovery', 'popup.box.opacity === 255')
        evaluate('popup.close();popup.destroy();')
        evaluate("Main.osdWindowManager._showOsdWindow(0,new Gio.ThemedIcon({name:'audio-volume-high-symbolic'}),'GSE volume',0.5,1);")
        wait('Main.osdWindowManager._osdWindows.some(w=>bindingFor(w._hbox)?.surface?._state.captures.size > 0)')
        check('osd-discovery', 'Main.osdWindowManager._osdWindows.some(w=>bindingFor(w._hbox)?.surface)')
        evaluate('Main.osdWindowManager.hideAll();')
        evaluate('Main.screenshotUI.open();')
        wait('bindingFor(Main.screenshotUI._panel)?.surface?._state.captures.size > 0')
        screenshot('screenshot-ui')
        check('screenshot-discovery', 'Main.screenshotUI._panel.opacity === 255')
        evaluate('Main.screenshotUI.close();')
        evaluate("cfg.set_boolean('blur-notifications',true); Gio.Settings.new('org.gnome.desktop.notifications').set_boolean('show-banners',true);(async()=>{globalThis.Tray=await import('resource:///org/gnome/shell/ui/messageTray.js');})()")
        wait('globalThis.Tray')
        evaluate("globalThis.noticeSource=new Tray.Source({title:'GSE test'});Main.messageTray.add(noticeSource);globalThis.notice=new Tray.Notification({source:noticeSource,title:'Notification blur',body:'Sharp text',urgency:Tray.Urgency.CRITICAL});noticeSource.addNotification(notice)")
        wait('bindingFor(Main.messageTray._banner)?.surface?._state.captures.size > 0')
        check('notification-discovery', 'Main.messageTray._banner.opacity === 255')
        screenshot('notification')
        evaluate("notice.destroy();Gio.Settings.new('org.gnome.desktop.notifications').set_boolean('show-banners',false)")
        evaluate("cfg.set_boolean('blur-folders',true);globalThis.folderSettings=Gio.Settings.new('org.gnome.desktop.app-folders');globalThis.folderConfig=new Gio.Settings({schema_id:'org.gnome.desktop.app-folders.folder',path:'/org/gnome/desktop/app-folders/folders/GseTest/'});folderConfig.set_string('name','GSE test');folderConfig.set_strv('apps',Shell.AppSystem.get_default().get_installed().slice(0,4).map(a=>a.get_id()));folderSettings.set_strv('folder-children',['GseTest']);Main.overview.showApps()");
        wait("Main.overview._overview.controls._appDisplay._folderIcons.some(icon=>icon.id==='GseTest')")
        evaluate("globalThis.folder=Main.overview._overview.controls._appDisplay._folderIcons.find(icon=>icon.id==='GseTest');folder.open()")
        wait('bindingFor(folder._dialog?._viewBox)?.surface?._state.captures.size > 0')
        check('folder-discovery', 'folder._dialog._viewBox.opacity === 255')
        screenshot('folder')
        evaluate('folder._dialog.popdown();Main.overview.hide();folderSettings.reset("folder-children")')
        evaluate("cfg.set_boolean('shadows-enabled',true);cfg.set_boolean('shadow-app-grid',true);cfg.set_boolean('shadow-alt-tab',true)")
        wait('ext._manager._slots.get("shadows")?.instance?.css?.includes("icon-shadow:")')
        check('shadows-stylesheet-loaded', 'ext._manager._slots.get("shadows").instance.file.query_exists(null)')
        evaluate("cfg.set_boolean('docks-enabled',true);cfg.set_boolean('dock-blur',true);cfg.set_boolean('dock-invisible-overview',true)")
        wait('ext._manager._slots.get("docks")?.instance')
        # Contract fixture models the real dock background separately from icons.
        evaluate('''globalThis.dock=new St.Widget({name:'dashtodockContainer',x:20,y:700,width:400,height:90});
            globalThis.dockBg=new St.Widget({style_class:'dash-background',width:400,height:90,
                style:'background-color: rgb(30,30,35); border-radius: 20px;'});
            dock.add_child(dockBg);dock.add_child(new St.Label({text:'Dock fixture • icons stay opaque',x:20,y:30}));
            Main.uiGroup.add_child(dock);''')
        wait('ext._manager._slots.get("docks").instance.records.get(dock)?.binding.surface?._state.captures.size > 0')
        screenshot('dock')
        evaluate("cfg.set_boolean('blur-overview',true);Main.overview.show();")
        wait('ext._manager._slots.get("blur").instance.backgrounds?.group')
        check('dock-invisible-overview', "dockBg.get_style().includes('box-shadow: none') && !ext._manager._slots.get('docks').instance.records.get(dock).binding.surface")
        screenshot('overview')
        evaluate('Main.overview.hide();')
        wait('ext._manager._slots.get("docks").instance.records.get(dock).binding.surface')
        evaluate("cfg.set_boolean('opacity-enabled',true);cfg.set_boolean('opacity-gtk-files-sidebar',true);cfg.set_boolean('opacity-gtk-menus',true);cfg.set_boolean('opacity-ptyxis',true);cfg.set_boolean('opacity-gtk-settings-sidebar',true)")
        evaluate("cfg.set_double('gtk-background-opacity',0.45)")
        wait('ext._manager._slots.get("opacity")?.instance')
        time.sleep(0.5)
        check('gtk-owned-block', "new TextDecoder().decode(GLib.file_get_contents(GLib.get_user_config_dir()+'/gtk-4.0/gtk.css')[1]).includes('BEGIN Gnome Shell Extended')")
        # Run GTK preferences inside this private compositor and with a memory backend.
        display_env = dict(os.environ, WAYLAND_DISPLAY=evaluate('GLib.getenv("WAYLAND_DISPLAY")'), GSETTINGS_BACKEND='memory')
        display_env['GI_TYPELIB_PATH'] = '/usr/lib64/gnome-shell/girepository-1.0:' + os.environ.get('GI_TYPELIB_PATH', '')
        display_env['LD_LIBRARY_PATH'] = '/usr/lib64/gnome-shell:' + os.environ.get('LD_LIBRARY_PATH', '')
        display_env['GTK_A11Y'] = 'none'
        check('settings-overlay-generated', "Gio.File.new_for_path(GLib.get_user_config_dir()+'/gnome-shell-extended/settings-overlay/cc-window.ui').query_exists(null)")
        bus.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
                      'StartServiceByName', GLib.Variant('(su)', ('org.gnome.Settings', 0)),
                      None, Gio.DBusCallFlags.NONE, 10000, None)
        settings_pid = bus.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
                                    'GetConnectionUnixProcessID', GLib.Variant('(s)', ('org.gnome.Settings',)),
                                    None, Gio.DBusCallFlags.NONE, 5000, None).unpack()[0]
        try:
            subprocess.run(['gnome-control-center', 'multitasking'], env=display_env,
                           stdout=log, stderr=log, check=True, timeout=10)
            wait("global.get_window_actors().some(actor=>actor.meta_window.get_gtk_application_id()==='org.gnome.Settings')")
            wait("ext._manager._slots.get('opacity').instance.windowBlur?._visible.size > 0")
            check('window-backdrop-created', "ext._manager._slots.get('opacity').instance.windowBlur._windows.get(global.get_window_actors().find(a=>a.meta_window.get_gtk_application_id()==='org.gnome.Settings'))?.captures.size>0")
            evaluate("globalThis.settingsActor=global.get_window_actors().find(actor=>actor.meta_window.get_gtk_application_id()==='org.gnome.Settings');scene.get_parent().remove_child(scene);global.window_group.insert_child_below(scene,settingsActor)")
            time.sleep(0.8)
            check('settings-actor-opacity', "global.get_window_actors().find(actor=>actor.meta_window.get_gtk_application_id()==='org.gnome.Settings').opacity===255")
            screenshot('settings-sidebar-scene')
            evaluate('scene.hide()')
            time.sleep(0.2)
            screenshot('settings-sidebar-wallpaper')
            from gi.repository import GdkPixbuf
            first = GdkPixbuf.Pixbuf.new_from_file(str(OUTPUT / f'{VARIANT}-settings-sidebar-scene.png'))
            second = GdkPixbuf.Pixbuf.new_from_file(str(OUTPUT / f'{VARIANT}-settings-sidebar-wallpaper.png'))
            rect = evaluate('(()=>{const r=settingsActor.meta_window.get_frame_rect();return [r.x,r.y,r.width,r.height]})()')
            scale = first.get_width() / evaluate('global.stage.width')
            a, b = first.get_pixels(), second.get_pixels()
            stride, channels = first.get_rowstride(), first.get_n_channels()
            def difference(x, y):
                x, y = round(x * scale), round(y * scale)
                return sum(abs(a[yy*stride+xx*channels+c]-b[yy*stride+xx*channels+c])
                           for yy in range(y, y+10) for xx in range(x, x+10) for c in range(3)) / 300
            sidebar = difference(rect[0]+25, rect[1]+rect[3]-45)
            content = difference(rect[0]+rect[2]-30, rect[1]+rect[3]-45)
            results['settings-pixel-difference'] = {'sidebar': sidebar, 'content': content}
            assert sidebar > 5 and content < 1, results['settings-pixel-difference']
        finally:
            import signal
            os.kill(settings_pid, signal.SIGTERM)
            evaluate('scene.show();scene.get_parent().remove_child(scene);Main.uiGroup.insert_child_above(scene,global.window_group)')
        # Preferences should be captured after their opening animation finishes.
        ready = OUTPUT / f'{VARIANT}-prefs-ready'
        ready.unlink(missing_ok=True)
        close_ready = Path(str(ready)+'.close')
        close_ready.unlink(missing_ok=True)
        evaluate('scene.hide()')
        prefs_env = dict(display_env, GSE_PREFS_READY=str(ready))
        prefs = subprocess.Popen(['gjs', '-m', str(ROOT / 'tests/prefs.js'), str(ROOT / 'build' / UUID)],
                                 env=prefs_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            deadline = time.monotonic() + 15
            while not ready.exists() and prefs.poll() is None and time.monotonic() < deadline:
                time.sleep(0.05)
            if ready.exists():
                wait("global.get_window_actors().some(actor=>actor.mapped && actor.meta_window.get_title()==='Gnome Shell Extended')")
                time.sleep(0.6)
                screenshot('preferences')
                close_ready.touch()
            stdout, stderr = prefs.communicate(timeout=10)
            results['preferences'] = {'passed': prefs.returncode == 0, 'output': (stdout + stderr).strip()}
            if prefs.returncode:
                raise RuntimeError(stderr)
        finally:
            if prefs.poll() is None:
                prefs.terminate()
                prefs.wait(timeout=5)
            ready.unlink(missing_ok=True)
            close_ready.unlink(missing_ok=True)
            evaluate('scene.show()')
        window_process = subprocess.Popen(['gjs', '-m', str(ROOT / 'tests/window.js')],
                                          env=display_env, stdout=log, stderr=log)
        try:
            wait("global.get_window_actors().some(a=>a.meta_window.get_title()==='GSE policy test')")
            evaluate("cfg.set_boolean('blur-alt-tab',true);(async()=>{globalThis.AltTab=await import('resource:///org/gnome/shell/ui/altTab.js');})()")
            wait('globalThis.AltTab')
            evaluate("globalThis.switcherKeyboard=global.stage.get_context().get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);switcherKeyboard.notify_keyval(GLib.get_monotonic_time(),Clutter.KEY_Alt_L,Clutter.KeyState.PRESSED)")
            wait('(global.get_pointer()[2] & Clutter.ModifierType.MOD1_MASK)!==0')
            for kind in ['WindowSwitcherPopup', 'AppSwitcherPopup']:
                evaluate(f"globalThis.switcher=new AltTab.{kind}();switcher.show(false,'switch-windows',Clutter.ModifierType.MOD1_MASK)")
                wait('bindingFor(switcher._switcherList)?.surface?._state.captures.size > 0')
                check(kind + '-foreground-opacity', 'switcher._switcherList.opacity===255')
                check(kind + '-background-alpha', 'switcher._switcherList.get_theme_node().get_background_color().alpha<255')
                screenshot(kind)
                if os.environ.get('GSE_TEST_REGRESSIONS'):
                    test_surface_pixels(evaluate, wait, screenshot, results, OUTPUT, VARIANT,
                                        'switcher._switcherList', kind)
                    if kind == 'AppSwitcherPopup':
                        wait('switcher._thumbnails?.mapped && bindingFor(switcher._thumbnails)?.surface?.backend')
                        test_surface_pixels(evaluate, wait, screenshot, results, OUTPUT, VARIANT,
                                            'switcher._thumbnails', 'AltTab-previews')
                evaluate('switcher.fadeAndDestroy()')
                time.sleep(0.25)
            evaluate('switcherKeyboard.notify_keyval(GLib.get_monotonic_time(),Clutter.KEY_Alt_L,Clutter.KeyState.RELEASED)')
            evaluate("globalThis.policyWindow=global.get_window_actors().find(a=>a.meta_window.get_title()==='GSE policy test').meta_window;policyWindow.maximize()")
            wait("Main.panel.get_style().includes(',1);')")
            check('panel-maximized-policy', 'policyWindow.maximized_horizontally && policyWindow.maximized_vertically')
            evaluate('policyWindow.make_fullscreen()')
            wait("Main.panel.get_style().includes(',0);')")
            check('panel-fullscreen-policy', 'policyWindow.is_fullscreen()')
        finally:
            window_process.terminate()
            window_process.wait(timeout=5)
        # Wallpaper-only lock adapter fixture; does not lock the actual login session.
        evaluate("cfg.set_boolean('blur-lock-screen',true);globalThis.lockFixture=new St.Widget();globalThis.lockBgGroup=new St.Widget();globalThis.lockBg=new St.Widget({width:300,height:200});globalThis.nativeLockBlur=new Shell.BlurEffect({mode:Shell.BlurMode.ACTOR});lockBg.add_effect_with_name('blur',nativeLockBlur);lockFixture._backgroundGroup=lockBgGroup;lockBgGroup.add_child(lockBg);lockFixture.add_child(lockBgGroup);Main.screenShield._lockDialogGroup.add_child(lockFixture)")
        wait("lockBg.get_effect('gse-lock-blur') && !nativeLockBlur.enabled")
        evaluate("cfg.set_boolean('blur-lock-screen',false)")
        check('lock-native-effect-restored', "nativeLockBlur.enabled && !lockBg.get_effect('gse-lock-blur')")
        evaluate('lockFixture.destroy()')
        time.sleep(0.5)
        evaluate("globalThis.idleFrames=0;globalThis.idleProbe=global.stage.connect('after-paint',()=>idleFrames++)")
        time.sleep(0.5)
        results['idle-frames'] = evaluate('idleFrames')
        evaluate('global.stage.disconnect(idleProbe)')
        assert results['idle-frames'] <= 3, 'Unexpected idle redraw loop'
        if os.environ.get('GSE_TEST_REGRESSIONS'):
            from regressions import run
            run(evaluate, wait, check, screenshot, results, ROOT, OUTPUT, VARIANT, display_env, log)
        # All foreground modules and resources must disappear on disable.
        evaluate('globalThis.oldManager=ext._manager;globalThis.oldPanelStyle=ext._manager._slots.get("panel").instance.style.original; ext.disable();')
        check('disable-slots-empty', 'oldManager._slots.size === 0 && oldManager._signals.length === 0')
        check('disable-panel-restored', 'Main.panel.get_style() === oldPanelStyle')
        check('disable-dock-restored', "dockBg.get_style() === 'background-color: rgb(30,30,35); border-radius: 20px;'")
        check('disable-backdrops-removed', "!Main.uiGroup.get_children().some(a=>a.name==='gse-surface')")
        check('disable-gtk-restored', "!new TextDecoder().decode(GLib.file_get_contents(GLib.get_user_config_dir()+'/gtk-4.0/gtk.css')[1]).includes('BEGIN Gnome Shell Extended')")
        check('disable-settings-launcher-restored', "!Gio.File.new_for_path(GLib.get_user_data_dir()+'/dbus-1/services/org.gnome.Settings.service').query_exists(null)")
        for _ in range(10):
            evaluate('ext.enable();')
            wait('ext._manager._slots.get("blur")?.instance && ext._manager._slots.get("panel")?.instance')
            evaluate('ext.disable();')
        check('repeat-disable-clean', "!Main.uiGroup.get_children().some(a=>a.name==='gse-surface')")
        evaluate('dock.destroy();scene.destroy();')
        results['passed'] = True
        print(json.dumps(results, indent=2))
    finally:
        (OUTPUT / f'{VARIANT}-results.json').write_text(json.dumps(results, indent=2)+'\n')
        shell.terminate()
        try:
            shell.wait(timeout=10)
        except subprocess.TimeoutExpired:
            shell.kill()
            shell.wait()
        log.close()


if __name__ == '__main__':
    sys.exit(test() if os.environ.get('GSE_TEST_CHILD') else stage())
