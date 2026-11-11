# SPDX-License-Identifier: GPL-3.0-only
"""Regression coverage against real Shell surfaces and the local dock fork."""
import math
import subprocess
import time


def run(evaluate, wait, check, screenshot, results, root, output, variant, display_env, log):
    # Color scheme changes must work without restarting the extension.
    evaluate("globalThis.interfaceSettings=Gio.Settings.new('org.gnome.desktop.interface');cfg.set_string('panel-style','theme');interfaceSettings.set_string('color-scheme','prefer-dark')")
    time.sleep(0.3)
    dark = evaluate("(()=>{const c=Main.panel.get_theme_node().get_background_color();return [c.red,c.green,c.blue]})()")
    evaluate("interfaceSettings.set_string('color-scheme','default')")
    time.sleep(0.3)
    light = evaluate("(()=>{const c=Main.panel.get_theme_node().get_background_color();return [c.red,c.green,c.blue]})()")
    results['panel-colors'] = {'dark': dark, 'light': light}
    assert sum(light) > sum(dark) + 200
    check('panel-light-foreground', "Main.panel.get_style().includes('#202024')")
    check('panel-button-light-foreground', "Main.panel.statusArea.dateMenu.get_theme_node().get_foreground_color().red < 100")
    evaluate("interfaceSettings.set_string('color-scheme','prefer-dark')")

    # The control backdrop must sample the screenshot texture, not sit beneath it.
    evaluate("cfg.set_double('surface-opacity',0.15);cfg.set_int('blur-radius',48);cfg.set_double('blur-brightness',1);Main.screenshotUI.open()")
    wait('bindingFor(Main.screenshotUI._panel)?.surface?._state.captures.size>0')
    time.sleep(0.4)
    screenshot('capture-blurred')
    rect = evaluate('(()=>{const p=Main.screenshotUI._panel;return [...p.get_transformed_position(),...p.get_transformed_size()]})()')
    evaluate("cfg.set_int('blur-radius',0)")
    time.sleep(0.3)
    screenshot('capture-sharp')
    from gi.repository import GdkPixbuf
    def contrast(name):
        image = GdkPixbuf.Pixbuf.new_from_file(str(output / f'{variant}-{name}.png'))
        data, stride, channels = image.get_pixels(), image.get_rowstride(), image.get_n_channels()
        scale = image.get_width() / evaluate('global.stage.width')
        left, top, width, _height = rect
        points = [tuple(data[y*stride+x*channels+c] for c in range(3))
                  for y in range(round((top+5)*scale), round((top+9)*scale))
                  for x in range(round((left+35)*scale), round((left+width-35)*scale))]
        averages = [sum(p[c] for p in points)/len(points) for c in range(3)]
        return math.sqrt(sum(sum((p[c]-averages[c])**2 for c in range(3)) for p in points)/len(points))
    blurred, sharp = contrast('capture-blurred'), contrast('capture-sharp')
    results['screenshot-contrast'] = {'blurred': blurred, 'sharp': sharp}
    assert blurred < sharp * 0.8, results['screenshot-contrast']
    evaluate("Main.screenshotUI.close(true);cfg.set_int('blur-radius',24);cfg.set_double('surface-opacity',0.85);cfg.set_double('blur-brightness',0.8)")

    # A mapped dock with a zero clip must release its painted pixels, then return.
    evaluate('dock.set_clip(0,0,0,0)')
    wait("!ext._manager._slots.get('docks').instance.records.get(dock).binding.surface.group.visible")
    check('mapped-zero-clip-hidden', 'dock.mapped && dockBg.mapped')
    evaluate('dock.remove_clip()')
    wait("ext._manager._slots.get('docks').instance.records.get(dock).binding.surface.group.visible")
    evaluate("dock.reactive=true;globalThis.pickPoint=dock.get_transformed_position();globalThis.picked=global.stage.get_actor_at_pos(Clutter.PickMode.ALL,pickPoint[0]+100,pickPoint[1]+30)")
    check('backdrop-does-not-steal-picking', 'dock===picked || dock.contains(picked)')



def run_dock(evaluate, wait, check, screenshot, results, root, output, variant, display_env, log):
    # Load a real dock in the private session; hover uses a virtual pointer.
    wait('!Main.layoutManager._startingUp && !Main.overview.animationInProgress')
    evaluate("scene.hide();cfg.set_boolean('docks-enabled',true);cfg.set_boolean('dock-blur',true)")
    evaluate("Main.extensionManager.enableExtension('dash-to-dock-extended@local')")
    wait("Main.extensionManager.lookup('dash-to-dock-extended@local')?.state===1")
    evaluate("(async()=>{globalThis.realDockModule=await import(Main.extensionManager.lookup('dash-to-dock-extended@local').dir.get_uri()+'/extension.js')})()")
    wait('globalThis.realDockModule?.dockManager?.mainDock')
    evaluate("globalThis.dockSettings=realDockModule.dockManager.extension.getSettings();dockSettings.set_enum('dock-position',St.Side.BOTTOM);dockSettings.set_boolean('dock-fixed',false);dockSettings.set_boolean('intellihide',true);dockSettings.set_boolean('autohide',true);dockSettings.set_boolean('require-pressure-to-show',false);dockSettings.set_double('show-delay',0);dockSettings.set_double('hide-delay',0);dockSettings.set_double('animation-time',0.15);cfg.set_boolean('dock-invisible-overview',false)")
    time.sleep(0.8)
    evaluate("globalThis.realDock=realDockModule.dockManager.mainDock;globalThis.pointer=global.stage.get_context().get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE)")
    process = subprocess.Popen(['gjs','-m',str(root/'tests/window.js')], env=display_env, stdout=log, stderr=log)
    try:
        wait("global.get_window_actors().some(a=>a.meta_window.get_title()==='GSE policy test')")
        evaluate("Main.overview.hide();global.get_window_actors().find(a=>a.meta_window.get_title()==='GSE policy test').meta_window.maximize();pointer.notify_absolute_motion(GLib.get_monotonic_time(),500,200)")
        wait('!Main.overview.visibleTarget')
        time.sleep(1)
        results['real-dock-debug'] = evaluate("({same:realDock===realDockModule.dockManager.mainDock,state:realDock.dockState,slide:realDock._slider.slideX,hover:realDock._box.hover,overlap:realDock._intellihide.getOverlapStatus(),target:realDock._intellihide._targetBox,required:realDock.dash.requiresVisibility,enabled:realDock.intellihideEnabled,fixed:dockSettings.get_boolean('dock-fixed'),position:[realDock.x,realDock.y],size:[realDock.width,realDock.height],overview:Main.overview.visibleTarget,windows:global.get_window_actors().map(a=>({title:a.meta_window.get_title(),rect:a.meta_window.get_frame_rect(),max:a.meta_window.is_maximized()}))})")
        wait('realDock.dockState===0')
        check('intellihide-background-hidden', "!ext._manager._slots.get('docks').instance.records.get(realDock)?.binding.surface?.group.visible")
        for cycle in range(3):
            evaluate('pointer.notify_absolute_motion(GLib.get_monotonic_time(),Main.layoutManager.primaryMonitor.width/2,Main.layoutManager.primaryMonitor.height-1)')
            wait('realDock.dockState===2', timeout=8)
            check(f'intellihide-hover-{cycle}', 'realDock._slider.slideX>0.99')
            screenshot('real-dock-visible')
            evaluate('pointer.notify_absolute_motion(GLib.get_monotonic_time(),500,200)')
            wait('realDock.dockState===0', timeout=8)
            check(f'intellihide-hide-{cycle}', "!ext._manager._slots.get('docks').instance.records.get(realDock)?.binding.surface?.group.visible")
    finally:
        process.terminate()
        process.wait(timeout=5)
        evaluate('scene.show()')
