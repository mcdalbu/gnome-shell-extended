# SPDX-License-Identifier: GPL-3.0-only
"""Regression coverage against real Shell surfaces and the local dock fork."""
import math
import os
import subprocess
import time


def run(evaluate, wait, check, screenshot, results, root, output, variant, display_env, log):
    test_panel_blur(evaluate, wait, check, screenshot, results, output, variant)
    test_system_dialogs(evaluate, wait, check, screenshot, results, output, variant)
    test_panel_fade(evaluate, wait, check, results)
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
        # A large blur can mix the bright selection and dark mask into a slow
        # gradient, increasing global variance despite removing stripe edges.
        # Measure high-frequency detail instead of that low-frequency gradient.
        values = [abs(data[y*stride+(x+1)*channels+c] -
                      2*data[y*stride+x*channels+c] +
                      data[y*stride+(x-1)*channels+c])
                  for y in range(round((top+5)*scale), round((top+9)*scale))
                  for x in range(round((left+35)*scale)+1, round((left+width-35)*scale)-1)
                  for c in range(3)]
        return sum(values)/len(values)
    blurred, sharp = contrast('capture-blurred'), contrast('capture-sharp')
    results['screenshot-contrast'] = {'metric': 'horizontal-second-difference',
                                     'blurred': blurred, 'sharp': sharp}
    assert blurred < sharp * 0.8, results['screenshot-contrast']
    evaluate("Main.screenshotUI.close(true);cfg.set_int('blur-radius',24);cfg.set_double('surface-opacity',0.85);cfg.set_double('blur-brightness',0.8)")

    # A mapped dock with a zero clip must release its painted pixels, then return.
    wait("ext._manager._slots.get('docks').instance.records.get(dock).binding.surface?.group?.visible")
    evaluate("globalThis.clipFlicker=0;globalThis.clipProbe=ext._manager._slots.get('docks').instance.records.get(dock).binding.surface.group.connect('notify::visible',()=>clipFlicker++);dock.set_clip(0,0,0,0);dock.remove_clip()")
    time.sleep(0.15)
    check('transient-clip-does-not-toggle-backdrop', 'clipFlicker===0')
    evaluate("ext._manager._slots.get('docks').instance.records.get(dock).binding.surface.group.disconnect(clipProbe)")
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
    if os.environ.get('GSE_TEST_FLICKER'):
        blur = 'true' if os.environ.get('GSE_TEST_FLICKER_BLUR') else 'false'
        evaluate("cfg.set_string('blur-backend','auto');cfg.set_int('update-frequency',0);cfg.set_boolean('dock-blur',"+blur+");Gio.Settings.new('org.gnome.desktop.interface').set_string('color-scheme','prefer-dark')")
    evaluate("Main.extensionManager.enableExtension('dash-to-dock-extended@local')")
    wait("Main.extensionManager.lookup('dash-to-dock-extended@local')?.state===1")
    evaluate("(async()=>{globalThis.realDockModule=await import(Main.extensionManager.lookup('dash-to-dock-extended@local').dir.get_uri()+'/extension.js')})()")
    wait('globalThis.realDockModule?.dockManager?.mainDock')
    evaluate("globalThis.dockSettings=realDockModule.dockManager.extension.getSettings();dockSettings.set_enum('dock-position',St.Side.BOTTOM);dockSettings.set_boolean('dock-fixed',false);dockSettings.set_boolean('intellihide',true);dockSettings.set_boolean('autohide',true);dockSettings.set_boolean('require-pressure-to-show',false);dockSettings.set_double('show-delay',0);dockSettings.set_double('hide-delay',0);dockSettings.set_double('animation-time',0.15);cfg.set_boolean('dock-invisible-overview',false)")
    if os.environ.get('GSE_TEST_FLICKER'):
        evaluate("dockSettings.set_double('animation-time',0.2)")
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
        check('intellihide-background-hidden', "!ext._manager._slots.get('docks').instance.records.get(realDock)?.binding.surface?.group?.visible")
        if os.environ.get('GSE_TEST_FLICKER'):
            evaluate("dockSettings.set_boolean('hide-tooltip',true);(async()=>{globalThis.frameProbe=(await import('gi://FrameProbe')).default})()")
            wait('globalThis.frameProbe')
            evaluate('''globalThis.dockPaintFrames=[];globalThis.dockPaintReference=null;
                globalThis.dockPaintId=global.stage.connect('after-paint',(_stage,view)=>{
                    const monitor=Main.layoutManager.primaryMonitor;
                    if(view.layout.x!==monitor.x || view.layout.y!==monitor.y)return;
                    const scale=view.get_scale();
                    const bytes=frameProbe.read(view.get_framebuffer(),0,Math.round((monitor.height-120)*scale),Math.round(monitor.width*scale),Math.round(120*scale)).get_data();
                    if(!dockPaintReference){dockPaintReference=Array.from(bytes);return;}
                    const box=realDock.dash._background;const [x,y]=box.get_transformed_position();const [width,height]=box.get_transformed_size();
                    const rowWidth=Math.round(monitor.width*scale);let error=0,count=0;let strip=[0,0,0],stripCount=0;
                    for(let i=0;i<bytes.length;i+=4){const px=(i/4)%rowWidth/scale;const py=Math.floor(i/4/rowWidth)/scale+monitor.height-120;
                        if(realDock.dockState===0 || px<x-24 || px>x+width+24 || py<y-24){for(let c=0;c<3;c++)error+=Math.abs(bytes[i+c]-dockPaintReference[i+c]);count+=3;}
                        if(px>x+30&&px<x+width-30&&py>y+5&&py<y+9){for(let c=0;c<3;c++)strip[c]+=bytes[i+c];stripCount++;}}
                    const surface=ext._manager._slots.get('docks').instance.records.get(realDock)?.binding.surface;
                    let alignment=0;
                    if(surface?.group?.visible&&surface.blur.mapped){const a=[...surface.box.get_transformed_position(),...surface.box.get_transformed_size()];const b=[...surface.blur.get_transformed_position(),...surface.blur.get_transformed_size()];alignment=Math.max(...a.map((v,i)=>Math.abs(v-b[i])));}
                    dockPaintFrames.push({slide:realDock._slider.slideX,state:realDock.dockState,error:count?error/count:0,alignment,strip:stripCount?strip.map(c=>c/stripCount):null});
                });global.stage.queue_redraw();''')
            wait('globalThis.dockPaintReference')
        for cycle in range(3):
            evaluate('pointer.notify_absolute_motion(GLib.get_monotonic_time(),Main.layoutManager.primaryMonitor.width/2,Main.layoutManager.primaryMonitor.height-1)')
            wait('realDock.dockState===2', timeout=8)
            check(f'intellihide-hover-{cycle}', 'realDock._slider.slideX>0.99')
            # The pixel probe already records native presented frames. Do not
            # mix an additional offscreen readback into that measurement.
            if not os.environ.get('GSE_TEST_FLICKER'):
                screenshot('real-dock-visible')
            evaluate('pointer.notify_absolute_motion(GLib.get_monotonic_time(),500,200)')
            wait('realDock.dockState===0', timeout=8)
            check(f'intellihide-hide-{cycle}', "!ext._manager._slots.get('docks').instance.records.get(realDock)?.binding.surface?.group?.visible")
        if os.environ.get('GSE_TEST_FLICKER'):
            evaluate('global.stage.disconnect(dockPaintId)')
            frames=evaluate('dockPaintFrames')
            results['dock-painted-frames']=frames
            assert len(frames)>10, 'Insufficient painted animation frames'
            assert max(frame['error'] for frame in frames)<1, 'Flicker escaped the dock bounds'
            assert max(frame['alignment'] for frame in frames)<1, 'Blur/dock misalignment during paint'
            if not os.environ.get('GSE_TEST_FLICKER_BLUR'):
                check('tint-only-without-backdrop', "ext._manager._slots.get('docks').instance.records.get(realDock).binding.surfaceKind==='tint' && !ext._manager._slots.get('docks').instance.records.get(realDock).binding.surface.group")
            evaluate("cfg.set_boolean('dock-blur',true)")
        # Exercise the return fade on the actual dock, with its own theme and
        # Overview handlers, instead of relying only on the synthetic fixture.
        evaluate("cfg.set_boolean('dock-invisible-overview',true);pointer.notify_absolute_motion(GLib.get_monotonic_time(),Main.layoutManager.primaryMonitor.width/2,Main.layoutManager.primaryMonitor.height-1)")
        wait('realDock.dockState===2')
        if os.environ.get('GSE_TEST_DOCK_BOTTOM'):
            test_dock_bottom(evaluate, wait, screenshot, results, output, variant)
        evaluate("""globalThis.realDockFadeOutFrames=[];
            globalThis.dockFadeOutProbe=global.stage.connect('after-paint',()=>{
                const module=ext._manager._slots.get('docks').instance;
                realDockFadeOutFrames.push({value:module.fade.value,
                    backgroundOpacity:realDock.dash._background.opacity,
                    foreground:realDock.dash.opacity});
            });Main.overview.show();""")
        wait("Main.overview.visible && !Main.overview.animationInProgress && ext._manager._slots.get('docks').instance.fade.value===0")
        evaluate('global.stage.disconnect(dockFadeOutProbe)')
        out_frames=evaluate('realDockFadeOutFrames')
        results['real-dock-fade-out-frames']=out_frames
        assert any(0<f['backgroundOpacity']<255 for f in out_frames), out_frames
        assert all(abs(f['backgroundOpacity']-255*f['value'])<=1 for f in out_frames), out_frames
        assert all(f['foreground']==255 for f in out_frames), out_frames
        check('real-dock-overview-background-hidden', 'realDock.dash._background.get_paint_opacity()===0')
        evaluate("""globalThis.realDockFadeFrames=[];
            globalThis.realDockFadeProbe=global.stage.connect('after-paint',()=>{
                const module=ext._manager._slots.get('docks').instance;
                realDockFadeFrames.push({value:module.fade.value,
                    alpha:realDock.dash._background.get_theme_node().get_background_color().alpha*realDock.dash._background.get_paint_opacity()/255,
                    backgroundOpacity:realDock.dash._background.opacity,
                    foreground:realDock.dash.opacity});
            });Main.overview.hide();""")
        wait("!Main.overview.visible && ext._manager._slots.get('docks').instance.fade.value===1")
        evaluate('global.stage.disconnect(realDockFadeProbe)')
        frames=evaluate('realDockFadeFrames')
        results['real-dock-fade-frames']=frames
        alpha=evaluate("cfg.get_double('dock-opacity')*255")
        assert any(0<f['alpha']<alpha for f in frames), frames
        assert all(abs(f['alpha']-alpha*f['value'])<=2 for f in frames), frames
        assert all(abs(f['backgroundOpacity']-255*f['value'])<=1 for f in frames), frames
        assert all(f['foreground']==255 for f in frames), frames
        evaluate("cfg.set_boolean('dock-invisible-overview',false);pointer.notify_absolute_motion(GLib.get_monotonic_time(),500,200)")
    finally:
        process.terminate()
        process.wait(timeout=5)
        evaluate('scene.show()')


def test_panel_fade(evaluate, wait, check, results):
    evaluate("globalThis.savedPanelAlpha=cfg.get_double('panel-opacity');globalThis.savedPanelAuto=cfg.get_boolean('panel-auto-opacity');cfg.set_boolean('panel-auto-opacity',false);cfg.set_double('panel-opacity',0.6);Main.overview.show()")
    wait("Main.overview.visible && !Main.overview.animationInProgress")
    check('panel-overview-custom-style-suspended', "!Main.panel.get_style()?.includes('rgba(') && Main.panel.get_theme_node().get_background_color().alpha===0")
    check('panel-overview-window-tracking-off', "ext._manager._slots.get('panel').instance.tracked===false")
    check('panel-overview-blur-released', '!bindingFor(Main.panel).surface')
    # Enabling while already in Overview must not flash the configured tint.
    evaluate("cfg.set_boolean('panel-enabled',false);cfg.set_boolean('panel-enabled',true)")
    wait("ext._manager._slots.get('panel')?.instance?.overviewActive")
    check('panel-enable-in-overview-transparent', "Main.panel.get_theme_node().get_background_color().alpha===0")
    evaluate("""globalThis.panelFadeFrames=[];globalThis.panelHiddenAt=0;
        globalThis.panelHiddenProbe=Main.overview.connect('hiding',()=>panelHiddenAt=GLib.get_monotonic_time());
        globalThis.panelPaintProbe=global.stage.connect('after-paint',()=>{
            const panel=ext._manager._slots.get('panel')?.instance;if(!panel)return;
            panelFadeFrames.push({time:panelHiddenAt?(GLib.get_monotonic_time()-panelHiddenAt)/1000:-1,
                value:panel.fade?.value,returning:!!panel.returning,closing:!!panel.overviewClosing,
                dockValue:ext._manager._slots.get('docks')?.instance?.fade?.value,
                dockAlpha:dockBg.get_theme_node().get_background_color().alpha*dockBg.get_paint_opacity()/255,
                dockForeground:dock.opacity,
                alpha:Main.panel.get_theme_node().get_background_color().alpha,
                actor:Main.panel.opacity,button:Main.panel.statusArea.dateMenu.opacity});
        });Main.overview.hide();""")
    wait("!Main.overview.visible && ext._manager._slots.get('panel').instance.fade.value===1 && !ext._manager._slots.get('panel').instance.returning")
    evaluate('global.stage.disconnect(panelPaintProbe);Main.overview.disconnect(panelHiddenProbe)')
    frames=evaluate('panelFadeFrames')
    results['panel-fade-frames']=frames
    returning=[frame for frame in frames if frame['returning']]
    assert any(0<frame['alpha']<153 for frame in returning), 'Return must animate background alpha'
    assert all(frame['actor']==255 and frame['button']==255 for frame in frames), 'Foreground must remain opaque'
    assert any(0<frame['dockAlpha']<204 for frame in returning), 'Dock background must fade in'
    assert all(frame['dockForeground']==255 for frame in frames), 'Dock foreground must remain opaque'
    assert all(abs(frame['value']-frame['dockValue'])<0.05 for frame in returning), 'Panel/dock fades must agree'
    assert all(frame['alpha']<=154 for frame in frames if frame['closing']), 'Opaque flash during Overview close'
    completed=[frame for frame in frames if frame['time']>=0 and frame['value']==1]
    assert completed and 200<=completed[0]['time']<=400, frames
    results['panel-return-duration-ms']=completed[0]['time']
    # Reopening during the return cancels it, without a late callback restoring tint.
    evaluate('Main.overview.show()')
    wait('Main.overview.visible && !Main.overview.animationInProgress')
    evaluate('Main.overview.hide()')
    wait("ext._manager._slots.get('panel').instance.returning")
    evaluate('Main.overview.show()')
    wait('Main.overview.visible && !Main.overview.animationInProgress')
    time.sleep(0.3)
    check('panel-interrupted-return-remains-transparent', "Main.panel.get_theme_node().get_background_color().alpha===0 && ext._manager._slots.get('panel').instance.fade.value===0")
    evaluate('Main.overview.hide()')
    wait("!Main.overview.visible && ext._manager._slots.get('panel').instance.fade.value===1")
    evaluate("cfg.set_double('panel-opacity',savedPanelAlpha);cfg.set_boolean('panel-auto-opacity',savedPanelAuto)")


def test_menu_close(evaluate, wait, check, results):
    for name in ['dateMenu', 'quickSettings']:
        evaluate(f"globalThis.closingMenu=Main.panel.statusArea.{name}.menu;closingMenu.open()")
        wait("closingMenu.box.mapped && [...ext._manager._slots.get('blur').instance.bindings.values()].some(b=>b.box===closingMenu.box && b.surface?.backend)")
        time.sleep(0.3)
        evaluate("""globalThis.closeFrames=[];
            globalThis.closeProbe=global.stage.connect('after-paint',()=>{
                if(!closingMenu.box.mapped)return;
                const binding=ext._manager._slots.get('blur').instance.bindings.get(closingMenu.actor);
                const surface=binding?.surface;
                closeFrames.push({opacity:closingMenu.box.get_paint_opacity(),
                    alpha:closingMenu.box.get_theme_node().get_background_color().alpha,
                    surface:!!surface,backdropOpacity:surface?.group?.opacity,
                    backdropVisible:!!surface?.group?.visible});
            });closingMenu.close();""")
        check(name+'-surface-retained-at-close', "!!ext._manager._slots.get('blur').instance.bindings.get(closingMenu.actor)?.surface")
        wait('!closingMenu.box.mapped')
        evaluate('global.stage.disconnect(closeProbe)')
        frames=evaluate('closeFrames')
        results[name+'-close-frames']=frames
        assert len(frames)>2, frames
        assert all(f['surface'] and f['alpha']<255 for f in frames), 'Opaque restoration during close'
        assert any(0<f['opacity']<255 for f in frames), 'Native close fade did not run'
        assert all(abs(f['opacity']-f['backdropOpacity'])<=2 if f['opacity']>0
                   else not f['backdropVisible'] for f in frames), frames
        check(name+'-surface-released-after-close', "!ext._manager._slots.get('blur').instance.bindings.get(closingMenu.actor)?.surface")


def test_surface_pixels(evaluate, wait, screenshot, results, output, variant, box, name):
    import gi
    gi.require_version('GdkPixbuf', '2.0')
    from gi.repository import GdkPixbuf
    evaluate("globalThis.pixelSettings=[cfg.get_double('surface-opacity'),cfg.get_int('blur-radius'),cfg.get_double('blur-brightness')];cfg.set_double('surface-opacity',0.15);cfg.set_int('blur-radius',48);cfg.set_double('blur-brightness',1)")
    wait(f'bindingFor({box})?.surface?.backend')

    time.sleep(0.3)
    rect=evaluate(f'(()=>{{const b={box};return [...b.get_transformed_position(),...b.get_transformed_size()]}})()')
    screenshot(name+'-blurred')
    evaluate("cfg.set_int('blur-radius',0)")
    time.sleep(0.3)
    screenshot(name+'-sharp')
    def contrast(suffix):
        image=GdkPixbuf.Pixbuf.new_from_file(str(output/f'{variant}-{name}-{suffix}.png'))
        data,stride,channels=image.get_pixels(),image.get_rowstride(),image.get_n_channels()
        scale=image.get_width()/evaluate('global.stage.width')
        x,y,w,h=rect
        points=[tuple(data[row*stride+col*channels+c] for c in range(3))
                for row in range(round((y+5)*scale),round((y+9)*scale))
                for col in range(round((x+35)*scale),round((x+w-35)*scale))]
        averages=[sum(p[c] for p in points)/len(points) for c in range(3)]
        return math.sqrt(sum(sum((p[c]-averages[c])**2 for c in range(3)) for p in points)/len(points))
    blurred,sharp=contrast('blurred'),contrast('sharp')
    results[name+'-contrast']={'blurred':blurred,'sharp':sharp}
    assert sharp>1 and blurred<sharp*0.9, results[name+'-contrast']
    evaluate("cfg.set_double('surface-opacity',pixelSettings[0]);cfg.set_int('blur-radius',pixelSettings[1]);cfg.set_double('blur-brightness',pixelSettings[2])")
    wait(f'bindingFor({box})?.surface?.backend')


def test_panel_blur(evaluate, wait, check, screenshot, results, output, variant):
    evaluate("globalThis.panelBlurSaved=[cfg.get_double('panel-opacity'),cfg.get_boolean('panel-auto-opacity')];cfg.set_boolean('panel-auto-opacity',false);cfg.set_double('panel-opacity',0.15);cfg.set_boolean('panel-blur',true);for(const child of scene.get_children()){child.y=0;child.height=1000}")
    wait('bindingFor(Main.panel)?.surface?.backend')
    test_surface_pixels(evaluate, wait, screenshot, results, output, variant, 'Main.panel', 'panel')
    check('panel-text-opacity', 'Main.panel.opacity===255 && Main.panel.statusArea.dateMenu.opacity===255')
    evaluate("cfg.set_double('panel-opacity',1)")
    wait('!bindingFor(Main.panel)?.surface')
    check('opaque-panel-releases-blur', '!bindingFor(Main.panel).surface')
    evaluate("cfg.set_double('panel-opacity',panelBlurSaved[0]);cfg.set_boolean('panel-auto-opacity',panelBlurSaved[1]);for(const child of scene.get_children()){child.y=32;child.height=968}")


def test_system_dialogs(evaluate, wait, check, screenshot, results, output, variant):
    # Open the real private-session dialog UI directly, without OpenAsync's
    # countdown or any confirmation callback. No shutdown/reboot is requested.
    for kind, name in [(0, 'logout'), (1, 'shutdown'), (2, 'restart')]:
        evaluate(f"cfg.set_boolean('blur-dialogs',true);globalThis.systemDialog=Main.endSessionDialog;systemDialog._type={kind};systemDialog._totalSecondsToStayOpen=60;systemDialog._secondsLeft=60;systemDialog._updateButtons();systemDialog.open()")
        box='(systemDialog.dialogLayout._dialog ?? systemDialog.dialogLayout)'
        wait(f'bindingFor({box})?.surface?.backend')
        check(name+'-foreground-opaque', 'systemDialog.contentLayout.opacity===255')
        check(name+'-no-countdown', '!systemDialog._timerId')
        test_surface_pixels(evaluate, wait, screenshot, results, output, variant, box, name)
        evaluate('systemDialog.cancel()')
        wait('!systemDialog.mapped')
        check(name+'-surface-released', f'!bindingFor({box})?.surface')


def test_dock_bottom(evaluate, wait, screenshot, results, output, variant):
    import gi
    gi.require_version('GdkPixbuf', '2.0')
    from gi.repository import GdkPixbuf
    evaluate("globalThis.dockBottomSaved=[cfg.get_string('blur-backend'),cfg.get_int('blur-radius'),cfg.get_double('blur-brightness'),cfg.get_double('dock-opacity')];scene.show();cfg.set_double('dock-opacity',0.15);cfg.set_double('blur-brightness',1)")
    for backend in ['native', 'auto']:
        evaluate(f"cfg.set_string('blur-backend','{backend}');cfg.set_int('blur-radius',24)")
        wait("ext._manager._slots.get('docks').instance.records.get(realDock).binding.surface?.backend")
        time.sleep(0.3)
        name='dock-bottom-'+backend
        screenshot(name+'-blurred')
        rect=evaluate('(()=>{const b=realDock.dash._background;return [...b.get_transformed_position(),...b.get_transformed_size()]})()')
        geometry=evaluate("(()=>{const s=ext._manager._slots.get('docks').instance.records.get(realDock).binding.surface;const clips=[];for(let a=s.box;a;a=a.get_parent())if(a.has_clip||a.clip_to_allocation)clips.push({name:a.constructor.name,clip:a.has_clip?a.get_clip():null,size:[a.width,a.height],allocation:a.clip_to_allocation});return {rect:[...s.box.get_transformed_position(),...s.box.get_transformed_size()],backend:s.backend.name,captures:[...s._state.captures.values()].map(c=>({bounds:c.geometry.split(':').slice(0,4).map(Number),view:[Math.round(c.view.layout.width*c.view.get_scale()),Math.round(c.view.layout.height*c.view.get_scale())]})),clips}})()")
        results[name+'-geometry']=geometry
        for capture in geometry['captures']:
            left,top,right,bottom=capture['bounds']
            assert 0<=left<right<=capture['view'][0] and 0<=top<bottom<=capture['view'][1], capture
        evaluate("cfg.set_int('blur-radius',0)")
        time.sleep(0.3)
        screenshot(name+'-sharp')
        def bands(suffix):
            image=GdkPixbuf.Pixbuf.new_from_file(str(output/f'{variant}-{name}-{suffix}.png'))
            data,stride,channels=image.get_pixels(),image.get_rowstride(),image.get_n_channels()
            scale=image.get_width()/evaluate('global.stage.width')
            x,y,w,h=rect
            answer={}
            for band,top in [('top',y+5),('bottom',y+h-8)]:
                points=[tuple(data[row*stride+col*channels+c] for c in range(3))
                        for row in range(round(top*scale),round((top+3)*scale))
                        for col in range(round((x+35)*scale),round((x+w-35)*scale))]
                mean=[sum(p[c] for p in points)/len(points) for c in range(3)]
                answer[band]=math.sqrt(sum(sum((p[c]-mean[c])**2 for c in range(3)) for p in points)/len(points))
            return answer
        blurred,sharp=bands('blurred'),bands('sharp')
        results[name+'-contrast']={'blurred':blurred,'sharp':sharp}
        assert all(blurred[band]<sharp[band]*0.85 for band in sharp), results[name+'-contrast']
        assert abs(blurred['bottom']/sharp['bottom']-blurred['top']/sharp['top'])<0.05, results[name+'-contrast']
    evaluate("scene.hide();cfg.set_string('blur-backend',dockBottomSaved[0]);cfg.set_int('blur-radius',dockBottomSaved[1]);cfg.set_double('blur-brightness',dockBottomSaved[2]);cfg.set_double('dock-opacity',dockBottomSaved[3])")
