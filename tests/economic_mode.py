"""Both appearance modes and their resources in the private test compositor."""
import os
from pathlib import Path
import subprocess
import time


def run(evaluate, wait, check, screenshot, results):
    evaluate('''globalThis.econSaved=Object.fromEntries([
        'blur-filter-enabled','refraction-enabled','frosted-glass-enabled','blur-backend','blur-radius','surface-opacity','panel-blur',
        'panel-auto-opacity','blur-overview','blur-lock-screen','opacity-enabled',
        'opacity-ptyxis','windows-blur','docks-enabled','dock-blur','dock-invisible-overview'
        ].map(k=>[k,cfg.get_value(k)]));
        globalThis.econModule=n=>ext._manager._slots.get(n)?.instance;
        globalThis.econMenu=Main.panel.statusArea.quickSettings.menu;
        globalThis.econSurface=()=>econModule('blur').bindings.get(econMenu.actor)?.surface;
        globalThis.econSurfaces=()=>[...[...econModule('blur').bindings.values()].map(b=>b.surface),
            econModule('panel')?.binding?.surface,
            ...[...(econModule('docks')?.records.values()??[])].map(r=>r.binding?.surface)]
            .filter(s=>s?._state);
        cfg.set_boolean('panel-blur',true);cfg.set_boolean('panel-auto-opacity',false);
        econMenu.open();''')
    wait('econSurface()?._state.captures.size>0')
    screenshot('mode-dynamic')
    evaluate("cfg.set_boolean('blur-filter-enabled',false);cfg.set_boolean('refraction-enabled',false);cfg.set_boolean('frosted-glass-enabled',true)")
    wait('econSurface()?._state.glass?.mapped && econModule("panel").binding.surface?._state.glass?.mapped')
    check('economic-no-captures', 'econSurfaces().every(s=>!s.backend && !s._stopDamage && s._state.captures.size===0)')
    check('economic-shared-texture', 'econSurfaces().every(s=>s._state.glass.content===econSurface()._state.glass.content)')
    check('economic-small-tile', 'econSurface()._state.glass.content.get_preferred_size().slice(-2).every(n=>n===64)')
    check('economic-content-fills-surface', '''econSurfaces().every(s=>{
        const g=s._state.glass,b=g.get_content_box();
        return Math.abs(b.get_width()-g.width)<.01 && Math.abs(b.get_height()-g.height)<.01;})''')
    check('economic-foreground-opaque', 'econMenu.box.opacity===255 && Main.panel.opacity===255')
    screenshot('mode-economic')
    evaluate('''globalThis.econFlags=[];globalThis.econProbe=global.stage.connect('before-paint',()=>{
        const flags=Clutter.get_debug_flags?.()??Meta.get_clutter_debug_flags();
        econFlags.push(!!(flags[1]&Clutter.DrawDebugFlag.DISABLE_CLIPPED_REDRAWS));
        });scene.queue_redraw();''')
    time.sleep(.3)
    evaluate('global.stage.disconnect(econProbe)')
    check('economic-partial-redraws', 'econFlags.length>0 && econFlags.every(f=>!f)')
    evaluate("cfg.set_int('blur-radius',0);cfg.set_string('blur-backend','off');cfg.set_double('surface-opacity',0)")
    wait('econSurface()?._state.glass?.opacity===0')
    check('economic-independent-of-backend', 'econModule("panel").binding.surface?._state.glass.mapped')
    evaluate("cfg.set_double('surface-opacity',0.55)")
    wait('econSurface()?._state.glass.opacity>0')
    evaluate('''globalThis.econInterface=new Gio.Settings({schema_id:'org.gnome.desktop.interface'});
        globalThis.econTheme=econInterface.get_string('color-scheme');
        econInterface.set_string('color-scheme','prefer-light');''')
    time.sleep(.3)
    evaluate('globalThis.econLight=econSurface()._state.glass.content;econInterface.set_string("color-scheme","prefer-dark")')
    time.sleep(.3)
    check('economic-theme-updates', 'econSurface()._state.glass.content!==econLight')
    screenshot('mode-economic-dark')
    evaluate('econInterface.set_string("color-scheme",econTheme);econMenu.close()')
    wait('!econSurface()')
    check('economic-close-releases-surface', '!econSurface()')
    from frosted_coverage import run as test_coverage
    test_coverage(evaluate, wait, check, screenshot, results)
    evaluate("cfg.set_boolean('docks-enabled',true);cfg.set_boolean('dock-blur',true);cfg.set_boolean('dock-invisible-overview',true)")
    wait('econModule("docks")')
    evaluate('''globalThis.econDock=new St.Widget({name:'dashtodockContainer',x:80,y:700,width:420,height:70});
        globalThis.econDockBox=new St.Widget({style_class:'dash-background',width:420,height:70,
            style:'background-color:rgb(45,45,45);border-radius:18px;'});
        econDock.add_child(econDockBox);Main.uiGroup.add_child(econDock);
        globalThis.econDockSurface=()=>econModule('docks').records.get(econDock)?.binding.surface;''')
    wait('econDockSurface()?._state.glass?.mapped')
    evaluate('econDock.translation_y=-40')
    time.sleep(.2)
    check('economic-dock-motion', 'Math.abs(econDockSurface().blur.get_transformed_position()[1]-econDockBox.get_transformed_position()[1])<1')
    evaluate('econDock.set_clip(0,0,0,0)')
    wait('!econDockSurface().group.visible')
    check('economic-dock-clip', '!econDockSurface().group.visible')
    evaluate('econDock.remove_clip();cfg.set_boolean("blur-overview",true);Main.overview.show()')
    wait('econModule("blur").backgrounds?.glasses.length===Main.layoutManager.monitors.length && !econDockSurface()')
    check('economic-wallpaper-no-effect', 'econModule("blur").backgrounds.effects.length===0')
    screenshot('mode-economic-overview')
    evaluate('Main.overview.hide()')
    wait('econDockSurface()?._state.glass?.mapped')
    evaluate('econDock.destroy()')
    evaluate('''cfg.set_boolean('blur-lock-screen',true);
        globalThis.econLockFixture=new St.Widget();globalThis.econLockGroup=new St.Widget();
        globalThis.econLock=new St.Widget({width:300,height:200});
        globalThis.econNative=new Shell.BlurEffect({mode:Shell.BlurMode.ACTOR});
        econLock.add_effect_with_name('blur',econNative);econLockGroup.add_child(econLock);
        econLockFixture._backgroundGroup=econLockGroup;econLockFixture.add_child(econLockGroup);
        Main.screenShield._lockDialogGroup.add_child(econLockFixture);''')
    wait('econModule("blur").backgrounds.locks.get(econLock)?.glass')
    check('economic-lock-no-effect', '!econNative.enabled && !econLock.get_effect("gse-lock-blur")')
    evaluate("cfg.set_string('blur-backend','native');cfg.set_int('blur-radius',24);cfg.set_boolean('blur-filter-enabled',true);cfg.set_boolean('refraction-enabled',false);cfg.set_boolean('frosted-glass-enabled',false)")
    wait('econLock.get_effect("gse-lock-blur")')
    check('dynamic-lock-restored', '!econModule("blur").backgrounds.locks.get(econLock).glass')
    evaluate("cfg.set_boolean('blur-filter-enabled',false);cfg.set_boolean('refraction-enabled',false);cfg.set_boolean('frosted-glass-enabled',true);cfg.set_boolean('blur-lock-screen',false)")
    check('economic-lock-disable-restores-native', 'econNative.enabled && !econLock.get_children().some(a=>a.name==="gse-frosted-glass")')
    evaluate("econLockFixture.destroy();scene.hide();cfg.set_boolean('opacity-enabled',true);cfg.set_boolean('opacity-ptyxis',true);cfg.set_boolean('windows-blur',true)")
    wait('econModule("opacity")?.windowBlur')
    env = dict(os.environ, WAYLAND_DISPLAY=evaluate('GLib.getenv("WAYLAND_DISPLAY")'), GTK_A11Y='none')
    client = subprocess.Popen(['gjs', '-m', str(Path(__file__).with_name('windowFade.js'))],
                              env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait('econModule("opacity").windowBlur._visible.size>0')
        evaluate('''globalThis.econWindow=global.get_window_actors().find(a=>a.meta_window.get_title()==='GSE fade target');
            econWindow.meta_window.activate(global.get_current_time());
            econWindow.meta_window.move_frame(false,80,140);''')
        time.sleep(.5)
        check('economic-windows-no-captures', '[...econModule("opacity").windowBlur._visible].every(s=>!s.source && !s.effect && !s.captures.size && s.glass.mapped && s.actor.opacity===255)')
        check('economic-no-window-damage', '!econModule("opacity").windowBlur._stopWindowDamage')
        screenshot('mode-economic-windows')
        evaluate("cfg.set_boolean('blur-filter-enabled',true);cfg.set_boolean('refraction-enabled',false);cfg.set_boolean('frosted-glass-enabled',false)")
        wait('[...econModule("opacity").windowBlur._visible].some(s=>s.captures.size>0)')
        check('dynamic-window-restored', '[...econModule("opacity").windowBlur._visible].every(s=>s.source && !s.glass)')
        evaluate("cfg.set_boolean('blur-filter-enabled',false);cfg.set_boolean('refraction-enabled',false);cfg.set_boolean('frosted-glass-enabled',true)")
        wait('[...econModule("opacity").windowBlur._visible].some(s=>s.glass?.mapped)')
        check('economic-window-switch-back', '[...econModule("opacity").windowBlur._visible].every(s=>!s.source && !s.captures.size)')
    finally:
        client.terminate()
        client.wait(timeout=5)
    evaluate('scene.show();econMenu.open()')
    wait('econSurface()?._state.glass?.mapped')
    time.sleep(1)
    evaluate('globalThis.econIdle=0;globalThis.econIdleId=global.stage.connect("after-paint",()=>econIdle++)')
    time.sleep(1)
    results['economic-idle-frames'] = evaluate('econIdle')
    evaluate('global.stage.disconnect(econIdleId)')
    assert results['economic-idle-frames'] <= 2
    evaluate('econMenu.close();ext.disable()')
    check('economic-disable-cleanup', '!Main.uiGroup.get_children().some(a=>a.name==="gse-surface") && !global.window_group.get_children().some(a=>a.name==="gse-window-blur")')
    evaluate('ext.enable()')
    wait('econModule("blur") && econModule("panel")')
    evaluate('econMenu.open()')
    wait('econSurface()?._state.glass?.mapped')
    check('economic-cold-start', '!econSurface().backend && !econSurface()._state.captures.size')
    evaluate("cfg.set_boolean('blur-filter-enabled',true);cfg.set_boolean('refraction-enabled',false);cfg.set_boolean('frosted-glass-enabled',false)")
    wait('econSurface()?._state.captures.size>0')
    check('dynamic-menu-restored', '!econSurface()._state.glass')
    evaluate('econMenu.close();for(const [k,v] of Object.entries(econSaved))cfg.set_value(k,v)')
    wait('ext._manager._slots.size===2')
    time.sleep(.4)
