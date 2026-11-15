"""Real-backdrop refraction and lifetime checks in the private compositor."""
import os
from pathlib import Path
import subprocess
import time


def run(evaluate, wait, check, screenshot, results, blur=False):
    if blur:
        raw_evaluate = evaluate
        evaluate = lambda code: raw_evaluate(code.replace('move_frame(false,128,180)', 'move_frame(false,800,180)'))
    evaluate('''globalThis.refractSaved=Object.fromEntries([
        'blur-filter-enabled','refraction-enabled','frosted-glass-enabled','blur-method','blur-radius','blur-brightness','refraction-strength',
        'surface-opacity','panel-blur','panel-auto-opacity','blur-overview','blur-lock-screen',
        'opacity-enabled','opacity-ptyxis','windows-blur','docks-enabled','dock-blur'
        ].map(k=>[k,cfg.get_value(k)]));
        globalThis.refractModule=n=>ext._manager._slots.get(n)?.instance;
        globalThis.refractMenu=Main.panel.statusArea.quickSettings.menu;
        globalThis.refractSurface=()=>refractModule('blur').bindings.get(refractMenu.actor)?.surface;
        cfg.set_boolean('blur-filter-enabled',EFFECT_BLUR);cfg.set_boolean('refraction-enabled',true);cfg.set_boolean('frosted-glass-enabled',false);
        cfg.set_boolean('panel-blur',true);cfg.set_boolean('panel-auto-opacity',false);
        cfg.set_double('blur-brightness',1);cfg.set_double('surface-opacity',0.25);
        refractMenu.open();'''.replace('EFFECT_BLUR', str(blur).lower()))
    wait('refractSurface()?.backend?.name==="combined" && refractSurface()._state.captures.size>0')
    time.sleep(.4)
    check('refraction-no-shader-errors', '[...refractSurface()._state.captures.values()].every(c=>!c.effect._failed && c.effect._buffers.size>0)')
    screenshot('mode-refraction')
    check('refraction-foreground-opaque', 'refractMenu.box.opacity===255 && Main.panel.opacity===255')
    check('refraction-panel-backend', 'refractModule("panel").binding.surface?.backend.name==="combined"')
    # Compare a stable, unobstructed part of a synthetic surface. The offset
    # must change edge positions, while leaving the distant scene unchanged.
    evaluate('''globalThis.refractFixture=new St.Widget({x:150,y:180,width:420,height:300,
        style:'background-color:rgba(40,40,40,0.1);border-radius:20px;'});
        refractFixture.add_child(new St.Widget({x:20,y:292,width:4,height:4,style:'background-color:white;'}));
        Main.uiGroup.add_child(refractFixture);
        globalThis.refractTest=null;
        (async()=>{const {Surface}=await import(ext.dir.get_uri()+'/core/surface.js');
        refractTest=new Surface(refractFixture,refractFixture,cfg,ext._logger);})();''')
    wait('refractTest?._state.captures.size>0')
    baseline = screenshot('refraction-fixture')
    evaluate("cfg.set_double('refraction-strength',12);refractTest.update()")
    time.sleep(.3)
    distorted = screenshot('refraction-fixture-strong')
    from PIL import Image, ImageChops, ImageStat
    base = Image.open(baseline).convert('RGB')
    strong = Image.open(distorted).convert('RGB')
    scale = base.width / evaluate('global.stage.width')
    rect = tuple(round(v*scale) for v in (153,210,172,450))
    difference = ImageStat.Stat(ImageChops.difference(base.crop(rect), strong.crop(rect))).mean
    results['refraction-pixel-change'] = sum(difference)/3
    assert results['refraction-pixel-change'] > .5, difference
    center = tuple(round(v*scale) for v in (230,250,470,400))
    assert max(ImageStat.Stat(ImageChops.difference(base.crop(center),strong.crop(center))).mean)<.1
    outside = tuple(round(v*scale) for v in (600,210,700,450))
    assert max(ImageStat.Stat(ImageChops.difference(base.crop(outside),strong.crop(outside))).mean) < .1
    # Native after-paint probe: screenshots must not hide damage artefacts.
    evaluate("refractMenu.close();refractFixture.hide();(async()=>{globalThis.refractProbeApi=(await import('gi://FrameProbe')).default})()")
    wait('refractProbeApi')
    time.sleep(.3)
    evaluate('''globalThis.refractFrames=[];globalThis.refractReference=null;
        globalThis.refractFrameId=global.stage.connect('after-paint',(_stage,view)=>{
            if(view.layout.x!==0)return;
            const scale=view.get_scale(), rw=Math.round(800*scale);
            const bytes=refractProbeApi.read(view.get_framebuffer(),0,Math.round(32*scale),rw,Math.round(500*scale)).get_data();
            if(!refractReference){refractReference=Array.from(bytes);return;}
            // The actor's animation clock may already describe the next frame.
            // Locate an opaque marker in the actual framebuffer instead.
            let marker=[Infinity,Infinity];
            for(let i=0;i<bytes.length;i+=4)if(bytes[i]>245&&bytes[i+1]>245&&bytes[i+2]>245){
                marker=[Math.min(marker[0],(i/4)%rw/scale),Math.min(marker[1],Math.floor(i/4/rw)/scale+32)];}
            const [x,y]=marker.every(Number.isFinite)?[marker[0]-20,marker[1]-292]:[120,-240];
            let error=0,count=0, bounds=[9999,9999,0,0];
            for(let i=0;i<bytes.length;i+=4){
                const px=(i/4)%rw/scale,py=Math.floor(i/4/rw)/scale+32;
                if(refractFixture.visible && px>=x-2 && px<=x+420+2 && py>=y-2 && py<=y+300+2)continue;
                for(let c=0;c<3;c++){const delta=Math.abs(bytes[i+c]-refractReference[i+c]);error+=delta;count++;if(delta>10){bounds=[Math.min(bounds[0],px),Math.min(bounds[1],py),Math.max(bounds[2],px),Math.max(bounds[3],py)];}}}
            refractFrames.push({error:count?error/count:0,box:[x,y],blur:refractTest.blur.get_transformed_position(),clip:refractTest.clip._key,bounds});
        });scene.queue_redraw();''')
    wait('refractReference')
    evaluate('refractFixture.show();refractFixture.ease({x:550,duration:350,mode:Clutter.AnimationMode.EASE_IN_OUT_QUAD})')
    time.sleep(.5)
    evaluate('refractFixture.ease({x:120,y:-240,duration:350,mode:Clutter.AnimationMode.EASE_IN_OUT_QUAD})')
    time.sleep(.5)
    evaluate('refractFixture.hide()')
    time.sleep(.2)
    evaluate('global.stage.disconnect(refractFrameId)')
    frames=evaluate('refractFrames')
    results['refraction-motion-frames']=len(frames)
    results['refraction-motion-outside-error']=max(f['error'] for f in frames)
    assert len(frames)>10 and max(f['error'] for f in frames)<1, frames
    evaluate('''refractFixture.destroy();cfg.set_boolean('docks-enabled',true);cfg.set_boolean('dock-blur',true);
        globalThis.refractDocks=Main.layoutManager.monitors.map(m=>{
            const dock=new St.Widget({name:'dashtodockContainer',x:m.x+60,y:m.y+m.height-85,width:420,height:70});
            dock.add_child(new St.Widget({style_class:'dash-background',width:420,height:70,
                style:'background-color:rgb(40,40,40);border-radius:18px;'}));
            Main.uiGroup.add_child(dock);return dock;});
        globalThis.refractDockSurfaces=()=>refractDocks.map(d=>refractModule('docks').records.get(d)?.binding.surface);''')
    wait('refractDockSurfaces().every(s=>s?._state.captures.size>0)')
    time.sleep(.3)
    check('refraction-each-monitor', 'refractDockSurfaces().every(s=>[...s._state.captures.values()].every(c=>!c.effect._failed && c.effect._buffers.size))')
    screenshot('mode-refraction-dock-scales')
    evaluate('refractDocks.forEach(d=>d.set_clip(0,0,0,0))')
    wait('refractDockSurfaces().every(s=>!s.group.visible)')
    check('refraction-dock-empty-clip', 'refractDockSurfaces().every(s=>!s.group.visible)')
    evaluate('refractDocks.forEach(d=>d.remove_clip())')
    wait('refractDockSurfaces().every(s=>s.group.visible)')
    evaluate('refractDocks.forEach(d=>d.destroy());cfg.set_boolean("blur-overview",true);Main.overview.show()')
    wait('refractModule("blur").backgrounds.effects.length>0 && !Main.overview.animationInProgress')
    screenshot('mode-refraction-overview')
    evaluate('Main.overview.hide()')
    wait('!Main.overview.visible')
    evaluate('''cfg.set_boolean('blur-lock-screen',true);
        globalThis.refractLockFixture=new St.Widget();globalThis.refractLockGroup=new St.Widget();
        globalThis.refractLock=new St.Widget({width:300,height:200});
        globalThis.refractNative=new Shell.BlurEffect({mode:Shell.BlurMode.ACTOR});
        refractLock.add_effect_with_name('blur',refractNative);refractLockGroup.add_child(refractLock);
        refractLockFixture._backgroundGroup=refractLockGroup;refractLockFixture.add_child(refractLockGroup);
        Main.screenShield._lockDialogGroup.add_child(refractLockFixture);''')
    wait('refractLock.get_effect("gse-lock-blur")')
    check('refraction-lock-source', '!refractNative.enabled && refractModule("blur").backgrounds.appearance.strength>0')
    evaluate('cfg.set_boolean("blur-lock-screen",false)')
    check('refraction-lock-restored', 'refractNative.enabled && !refractLock.get_effect("gse-lock-blur")')
    evaluate('''refractLockFixture.destroy();scene.hide();
        cfg.set_boolean('opacity-enabled',true);cfg.set_boolean('opacity-ptyxis',true);
        cfg.set_boolean('windows-blur',true);''')
    wait('refractModule("opacity")?.windowBlur')
    env=dict(os.environ, WAYLAND_DISPLAY=evaluate('GLib.getenv("WAYLAND_DISPLAY")'), GTK_A11Y='none')
    client=subprocess.Popen(['gjs','-m',str(Path(__file__).with_name('windowFade.js'))],
        env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait('["GSE fade target","GSE fade cover"].every(t=>global.get_window_actors().some(a=>a.meta_window.get_title()===t && a.mapped && a.width>0))')
        evaluate('''globalThis.refractWindow=global.get_window_actors().find(a=>a.meta_window.get_title()==='GSE fade target');
            globalThis.refractCover=global.get_window_actors().find(a=>a.meta_window.get_title()==='GSE fade cover');
            for(const a of [refractWindow,refractCover])a.meta_window.move_resize_frame(false,120,180,600,360);
            refractCover.meta_window.activate(global.get_current_time());''')
        time.sleep(.3)
        evaluate('refractWindow.meta_window.activate(global.get_current_time())')
        wait('[...refractModule("opacity").windowBlur._visible].some(s=>s.actor===refractWindow && s.captures.size>0)')
        wait('global.display.focus_window===refractWindow.meta_window && refractModule("opacity").windowBlur._windows.get(refractWindow)?.reveal?.value===1')
        time.sleep(.2)
        check('refraction-window-live-source', '[...refractModule("opacity").windowBlur._visible].every(s=>s.source && s.actor.opacity===255 && [...s.captures.values()].every(c=>!c.effect._failed && c.effect._buffers.size))')
        original=screenshot('mode-refraction-windows')
        evaluate('refractCover.meta_window.move_frame(false,128,180)')
        time.sleep(.3)
        changed=screenshot('mode-refraction-window-source-moved')
        changed_image=Image.open(changed).convert('RGB')
        original_image=Image.open(original).convert('RGB')
        source_rect=tuple(round(v*scale) for v in (150,215,290,275))
        source_delta=sum(ImageStat.Stat(ImageChops.difference(original_image.crop(source_rect),changed_image.crop(source_rect))).mean)/3
        results['refraction-window-source-change']=source_delta
        assert source_delta>.5
        evaluate('refractCover.meta_window.move_frame(false,120,180)')
        evaluate('refractWindow.meta_window.activate(global.get_current_time())')
        wait('global.display.focus_window===refractWindow.meta_window && refractModule("opacity").windowBlur._windows.get(refractWindow)?.reveal?.value===1')
        time.sleep(.3)
        evaluate("cfg.set_double('refraction-strength',0)")
        time.sleep(.3)
        clear=screenshot('mode-refraction-windows-clear')
        before=Image.open(original).convert('RGB');after=Image.open(clear).convert('RGB')
        rect=tuple(round(v*scale) for v in (123,215,143,450))
        results['refraction-window-pixel-change']=sum(ImageStat.Stat(ImageChops.difference(before.crop(rect),after.crop(rect))).mean)/3
        assert results['refraction-window-pixel-change']>.5
        rect=tuple(round(v*scale) for v in (420,215,480,275))
        assert max(ImageStat.Stat(ImageChops.difference(before.crop(rect),after.crop(rect))).mean)<.1
        evaluate("cfg.set_double('refraction-strength',6);cfg.set_boolean('blur-filter-enabled',false);cfg.set_boolean('refraction-enabled',false);cfg.set_boolean('frosted-glass-enabled',true)")
        wait('[...refractModule("opacity").windowBlur._visible].some(s=>s.glass?.mapped)')
        evaluate("cfg.set_boolean('blur-filter-enabled',EFFECT_BLUR);cfg.set_boolean('refraction-enabled',true);cfg.set_boolean('frosted-glass-enabled',false)".replace('EFFECT_BLUR',str(blur).lower()))
        wait('[...refractModule("opacity").windowBlur._visible].some(s=>s.captures.size>0 && !s.glass)')
        for blur_on, distortion_on in [(True,False),(False,True),(False,False),(True,True)]:
            evaluate(f"cfg.set_boolean('blur-filter-enabled',{str(blur_on).lower()});cfg.set_boolean('refraction-enabled',{str(distortion_on).lower()})")
            if blur_on or distortion_on:
                wait('refractModule("opacity").windowBlur?._windows.get(refractWindow)?.captures.size>0')
                check(f'window-toggles-{blur_on}-{distortion_on}',
                    f'refractModule("opacity").windowBlur._glassConfig.blurRadius==={24 if blur_on else 0} && refractModule("opacity").windowBlur._glassConfig.strength==={6 if distortion_on else 0}')
            else:
                wait('!refractModule("opacity").windowBlur')
                check('window-both-off-releases', '!refractModule("opacity").windowBlur')
        evaluate("cfg.set_boolean('blur-filter-enabled',EFFECT_BLUR);cfg.set_boolean('refraction-enabled',true)".replace('EFFECT_BLUR',str(blur).lower()))

    finally:
        client.terminate();client.wait(timeout=5)
    wait('!global.get_window_actors().some(a=>a.meta_window.get_title().startsWith("GSE fade"))')
    evaluate('scene.show();refractMenu.open()')
    wait('refractSurface()?._state.captures.size>0')
    time.sleep(1)
    evaluate('globalThis.refractIdle=0;globalThis.refractProbe=global.stage.connect("after-paint",()=>refractIdle++)')
    time.sleep(1)
    results['refraction-idle-frames'] = evaluate('refractIdle')
    evaluate('global.stage.disconnect(refractProbe)')
    assert results['refraction-idle-frames'] <= 2
    evaluate('refractMenu.close();ext.disable();ext.enable()')
    wait('refractModule("blur") && refractModule("panel")')
    evaluate('refractMenu.open()')
    wait('refractSurface()?.backend?.name==="combined" && refractSurface()._state.captures.size>0')
    check('refraction-cold-start', 'refractSurface().backend.name==="combined"')
    evaluate('refractMenu.close();for(const [k,v] of Object.entries(refractSaved))cfg.set_value(k,v)')
    time.sleep(.4)
