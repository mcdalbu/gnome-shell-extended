"""Real GPU pixels, live glass model changes and shared surface integration."""
import json
import os
from pathlib import Path
import subprocess
import time
from PIL import Image, ImageChops, ImageDraw, ImageStat


def run(evaluate, wait, check, screenshot, results, root):
    evaluate('''globalThis.liquidSaved=Object.fromEntries(cfg.list_keys().map(k=>[k,cfg.get_value(k)]));
        cfg.set_boolean('panel-blur',false);cfg.set_boolean('blur-filter-enabled',false);
        cfg.set_boolean('refraction-enabled',true);cfg.set_double('refraction-strength',0);
        cfg.set_string('refraction-style','contour');cfg.set_boolean('frosted-glass-enabled',false);
        cfg.set_double('blur-brightness',1);cfg.set_string('blur-refresh-rate','100');
        globalThis.liquidSource=new St.Widget({width:global.stage.width,height:global.stage.height,
            style:'background-color:rgb(5,10,20);'});
        for(const x of [299,499])liquidSource.add_child(new St.Widget({x,y:0,width:3,height:global.stage.height,
            style:'background-color:white;'}));
        Main.uiGroup.add_child(liquidSource);
        globalThis.liquidBox=new St.Widget({x:200,y:180,width:400,height:240,
            style:'background-color:transparent;border-radius:24px;'});
        globalThis.liquidLabel=new St.Label({x:155,y:30,text:'Liquid',style:'color:white;font-size:18px;'});
        liquidBox.add_child(liquidLabel);Main.uiGroup.add_child(liquidBox);
        (async()=>{const {Surface}=await import(ext.dir.get_uri()+'/core/surface.js');
            globalThis.liquidSurface=new Surface(liquidBox,liquidBox,cfg,ext._logger,{manageStyle:false,opacity:()=>0});})();''')
    wait('globalThis.liquidSurface')
    time.sleep(.2)
    baseline=Image.open(screenshot('liquid-zero')).convert('RGB')
    scale=baseline.width/evaluate('global.stage.width')

    def line_centroid(shot, center):
        values=[]
        for x in range(round((center-14)*scale),round((center+14)*scale)):
            brightness=shot.getpixel((x,round(300*scale)))[0]
            values.append((x/scale,max(0,brightness-80)))
        total=sum(v for _,v in values)
        assert total>50, 'Lost the refracted background line'
        return sum(x*v for x,v in values)/total

    original=[line_centroid(baseline,x) for x in [300,500]]
    evaluate("cfg.set_double('refraction-strength',24);liquidSurface.update()")
    wait('liquidSurface._state.captures.size>0')
    contour=Image.open(screenshot('liquid-contour')).convert('RGB')
    evaluate('''globalThis.liquidOldBuffers=[...liquidSurface._state.captures.values()].map(c=>c.effect._buffers.get('view'));
        cfg.set_string('refraction-style','liquid');liquidSurface.update()''')
    wait("liquidSurface._state.glassConfig.glassStyle==='liquid'")
    sphere=Image.open(screenshot('liquid-enabled')).convert('RGB')
    positions=[line_centroid(sphere,x) for x in [300,500]]
    results['liquid-line-centroids']={'original':original,'contour':[line_centroid(contour,x) for x in [300,500]],'liquid':positions}
    assert max(abs(a-b) for a,b in zip(original,positions))<.3, positions
    for x,y in [(400,185),(400,415),(205,300),(595,300),(211,191)]:
        before=baseline.getpixel((round(x*scale),round(y*scale)))
        after=sphere.getpixel((round(x*scale),round(y*scale)))
        assert after[0]>before[0]+2, ('Missing Liquid at element edge',x,y,before,after)
    results['liquid-follows-element-edges']=True
    check('liquid-switch-reuses-storage','[...liquidSurface._state.captures.values()].every((c,i)=>c.effect._buffers.get("view")===liquidOldBuffers[i])')
    check('liquid-foreground-opaque','liquidLabel.opacity===255 && liquidBox.opacity===255')
    difference=ImageChops.difference(baseline,sphere)
    ImageDraw.Draw(difference).rectangle(tuple(round(v*scale) for v in (198,178,602,422)),fill='black')
    assert max(channel[1] for channel in difference.getextrema())<=1, 'Shader changed pixels outside the element'
    results['liquid-outside-element-unchanged']=True
    evaluate("""globalThis.liquidRatePulse=new St.Widget({x:240,y:240,width:30,height:30,style:'background-color:red;'});
        Main.uiGroup.insert_child_below(liquidRatePulse,liquidSurface.group);
        globalThis.liquidRateTimeline=new Clutter.Timeline({actor:liquidRatePulse,duration:400,repeat_count:-1});
        liquidRateTimeline.connect('new-frame',()=>liquidRatePulse.opacity=100+Math.round(155*liquidRateTimeline.get_progress()));
        globalThis.liquidRateCapture=[...liquidSurface._state.captures.values()][0];
        globalThis.liquidRateFrames=0;
        globalThis.liquidRateId=global.stage.connect('after-paint',(_stage,view)=>{if(view===liquidRateCapture.view)liquidRateFrames++});""")
    try:
        for percent in ['50','25']:
            evaluate(f"cfg.set_string('blur-refresh-rate','{percent}');liquidSurface.update();liquidRateFrames=0;globalThis.liquidRateBefore=liquidRateCapture.effect.statistics.captures;liquidRateTimeline.start()")
            time.sleep(.7)
            metrics=evaluate('({frames:liquidRateFrames,captures:liquidRateCapture.effect.statistics.captures-liquidRateBefore})')
            results['liquid-cadence-'+percent]=metrics
            # Regional damage may already keep captures below half rate.
            # Validate the actual budget, not one particular reuse counter.
            assert metrics['frames']>8 and 0<metrics['captures']<=metrics['frames']*int(percent)/100+3,metrics
            evaluate('liquidRateTimeline.stop()')
            time.sleep(.25)
    finally:
        evaluate('liquidRateTimeline.stop();liquidRateTimeline.run_dispose();global.stage.disconnect(liquidRateId);liquidRatePulse.destroy();cfg.set_string("blur-refresh-rate","100");liquidSurface.update()')
    evaluate("cfg.set_double('refraction-strength',0);liquidSurface.update()")
    zero=Image.open(screenshot('liquid-disabled-zero')).convert('RGB')
    assert max(ImageStat.Stat(ImageChops.difference(baseline,zero)).mean)<.05
    check('liquid-zero-releases-captures','liquidSurface._state.captures.size===0')
    for method in ['box','fast-gaussian','kawase']:
        evaluate(f"cfg.set_boolean('blur-filter-enabled',true);cfg.set_string('blur-method','{method}');cfg.set_double('refraction-strength',12);liquidSurface.update()")
        wait('liquidSurface._state.captures.size>0')
        screenshot('liquid-combined-'+method)
        check('liquid-combined-'+method, '''[...liquidSurface._state.captures.values()].every(c=>!c.effect._failed &&
            c.effect.glassConfig.glassStyle==='liquid' && [...c.effect._buffers.values()].some(b=>b.filter))''')
    evaluate('liquidSurface.destroy();liquidBox.destroy();liquidSource.destroy()')

    # The normal element bindings (menus, panel and dock) must all read the
    # model, with independent blur/refraction toggles and unchanged foreground.
    from appearance_controls import run as controls
    controls(evaluate,wait,check,screenshot,results)
    windows(evaluate,wait,check,screenshot,results,root)
    wallpaper(evaluate,wait,check,screenshot,results,root)
    evaluate('for(const [key,value] of Object.entries(liquidSaved))cfg.set_value(key,value)')


def windows(evaluate, wait, check, screenshot, results, root):
    evaluate('''scene.hide();cfg.set_boolean('panel-blur',false);cfg.set_boolean('opacity-enabled',true);
        cfg.set_boolean('opacity-ptyxis',true);cfg.set_boolean('windows-blur',true);
        cfg.set_double('gtk-background-opacity',.4);cfg.set_boolean('blur-filter-enabled',false);
        cfg.set_boolean('frosted-glass-enabled',false);cfg.set_boolean('refraction-enabled',true);
        cfg.set_double('refraction-strength',24);cfg.set_string('refraction-style','contour');
''')
    wait("ext._manager._slots.get('opacity')?.instance.windowBlur")
    env=dict(os.environ,WAYLAND_DISPLAY=evaluate('GLib.getenv("WAYLAND_DISPLAY")'),GTK_A11Y='none')
    client=subprocess.Popen(['gjs','-m',str(root/'tests/windowFade.js')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        wait("['GSE fade target','GSE fade cover'].every(t=>global.get_window_actors().some(a=>a.meta_window.get_title()===t && a.mapped && a.width>0))")
        evaluate('''globalThis.liquidTarget=global.get_window_actors().find(a=>a.meta_window.get_title()==='GSE fade target');
            globalThis.liquidCover=global.get_window_actors().find(a=>a.meta_window.get_title()==='GSE fade cover');
            liquidTarget.meta_window.move_resize_frame(false,200,250,600,360);
            liquidCover.meta_window.move_resize_frame(false,200,250,600,360);
            liquidTarget.meta_window.activate(global.display.get_current_time_roundtrip());
            globalThis.liquidWindowState=()=>ext._manager._slots.get('opacity').instance.windowBlur._windows.get(liquidTarget);''')
        wait('liquidWindowState()?.reveal?.value===1 && liquidWindowState().captures.size>0')
        time.sleep(.3)
        before=Image.open(screenshot('liquid-window-contour')).convert('RGB')
        evaluate("cfg.set_string('refraction-style','liquid')")
        wait("liquidWindowState().glassConfig.glassStyle==='liquid'")
        after=Image.open(screenshot('liquid-window-enabled')).convert('RGB')
        scale=after.width/evaluate('global.stage.width')
        x,y,w,h=evaluate('(()=>{const r=liquidTarget.meta_window.get_frame_rect();return [r.x,r.y,r.width,r.height]})()')
        delta=ImageChops.difference(before,after)
        def region(a,b,c,d):return tuple(round(v*scale) for v in (a,b,c,d))
        sidebar=ImageStat.Stat(delta.crop(region(x+3,y+40,x+25,y+120))).mean
        content=ImageStat.Stat(delta.crop(region(x+250,y+40,x+w-30,y+120))).mean
        results['liquid-native-window-pixels']={'sidebar':sidebar,'opaqueContent':content}
        assert max(sidebar)>.2 and max(content)<.1, (sidebar,content)
        check('liquid-native-window-healthy','[...liquidWindowState().captures.values()].every(c=>!c.effect._failed)')
    finally:
        client.terminate();client.wait(timeout=5)
        evaluate('scene.show()')


def wallpaper(evaluate, wait, check, screenshot, results, root):
    from PIL import ImageDraw
    image=Image.new('RGB',(1440,1000),'#101010');draw=ImageDraw.Draw(image)
    for x in range(0,1440,20):draw.rectangle((x,0,x+9,999),fill='#e0e0e0')
    path=root/'validation/liquid-wallpaper-source.png';image.save(path)
    evaluate('''globalThis.liquidBg=new Gio.Settings({schema_id:'org.gnome.desktop.background'});
        globalThis.liquidBgSaved=Object.fromEntries(['picture-options','picture-uri','picture-uri-dark'].map(k=>[k,liquidBg.get_value(k)]));''')
    try:
        evaluate(f'''liquidBg.set_string('picture-options','stretched');
            liquidBg.set_string('picture-uri',{json.dumps(path.as_uri())});liquidBg.set_string('picture-uri-dark',{json.dumps(path.as_uri())});
            cfg.set_boolean('panel-auto-opacity',false);cfg.set_double('panel-opacity',.15);cfg.set_string('panel-style','dark');
            cfg.set_boolean('panel-blur',true);cfg.set_boolean('panel-static-blur',true);
            cfg.set_boolean('blur-filter-enabled',false);cfg.set_boolean('refraction-enabled',true);
            cfg.set_double('refraction-strength',24);cfg.set_string('refraction-style','contour');
            globalThis.liquidPanel=()=>ext._manager._slots.get('panel').instance.binding.surface;''')
        wait("liquidPanel()?.constructor.name==='WallpaperSurface' && liquidPanel().manager?.backgroundActor")
        time.sleep(1)
        before=Image.open(screenshot('liquid-wallpaper-contour')).convert('RGB')
        evaluate("globalThis.liquidOldFinish=liquidPanel().finish;cfg.set_string('refraction-style','liquid')")
        wait("liquidPanel().finish.glassStyle==='liquid'")
        after=Image.open(screenshot('liquid-wallpaper-enabled')).convert('RGB')
        scale=after.width/evaluate('global.stage.width');x,y,w,h=evaluate('[...Main.panel.get_transformed_position(),...Main.panel.get_transformed_size()]')
        crop=tuple(round(v*scale) for v in (x+w*.1,y+1,x+w*.3,y+h-1))
        delta=ImageStat.Stat(ImageChops.difference(before.crop(crop),after.crop(crop))).mean
        results['liquid-wallpaper-pixel-change']=delta
        peak=max(c[1] for c in ImageChops.difference(before.crop(crop),after.crop(crop)).getextrema())
        results['liquid-wallpaper-edge-peak']=peak
        assert peak>=2,(delta,peak)
        check('liquid-wallpaper-reuses-finish','liquidPanel().finish===liquidOldFinish && liquidPanel()._state.captures.size===0')
        evaluate('''(async()=>{const GObject=(await import('gi://GObject')).default;
            const Probe=GObject.registerClass(class GseLiquidCacheProbe extends Clutter.Effect {
                vfunc_paint(_node,context,_flags){globalThis.liquidPaints++;this.get_actor().continue_paint(context)}
            });globalThis.liquidPaints=0;liquidPanel().viewport.add_effect_with_name('gse-test-liquid-probe',new Probe());
            globalThis.liquidProbeReady=true;})();''')
        wait('liquidProbeReady && liquidPaints>0')
        evaluate('''globalThis.liquidPulse=new St.Widget({x:100,y:100,width:30,height:30,style:'background-color:red;'});
            Main.uiGroup.add_child(liquidPulse);globalThis.liquidTimeline=new Clutter.Timeline({actor:liquidPulse,duration:400,repeat_count:-1});
            liquidTimeline.connect('new-frame',()=>liquidPulse.opacity=100+Math.round(155*liquidTimeline.get_progress()));
            liquidPaints=0;liquidTimeline.start();''')
        time.sleep(.6)
        check('liquid-wallpaper-final-cache','liquidPaints===0')
        evaluate("liquidTimeline.stop();liquidTimeline.run_dispose();liquidPulse.destroy();liquidPanel().viewport.remove_effect_by_name('gse-test-liquid-probe')")
        evaluate("cfg.set_boolean('blur-overview',true);Main.overview.show()")
        wait('!Main.overview.animationInProgress')
        check('liquid-overview-model', "ext._manager._slots.get('blur').instance.backgrounds.effects.length>0 && ext._manager._slots.get('blur').instance.backgrounds.effects.every(([,e])=>e.glassStyle==='liquid' && e.get_texture())")
        screenshot('liquid-overview')
        evaluate('Main.overview.hide()')
        wait("!Main.overview.visible && ext._manager._slots.get('panel').instance.fade.value===1 && liquidPanel()?.finish?.glassStyle==='liquid'")
        evaluate("""cfg.set_boolean('blur-lock-screen',true);
            globalThis.liquidLockFixture=new St.Widget();globalThis.liquidLockGroup=new St.Widget();
            globalThis.liquidLock=new St.Widget({width:300,height:200});
            globalThis.liquidNativeLock=new Shell.BlurEffect({mode:Shell.BlurMode.ACTOR});
            liquidLock.add_effect_with_name('blur',liquidNativeLock);liquidLockFixture._backgroundGroup=liquidLockGroup;
            liquidLockGroup.add_child(liquidLock);liquidLockFixture.add_child(liquidLockGroup);
            Main.screenShield._lockDialogGroup.add_child(liquidLockFixture);""")
        wait("liquidLock.get_effect('gse-lock-blur')?.glassStyle==='liquid'")
        check('liquid-lock-wallpaper-model', '!liquidNativeLock.enabled')
        evaluate("cfg.set_boolean('blur-lock-screen',false)")
        wait("liquidNativeLock.enabled && !liquidLock.get_effect('gse-lock-blur')")
        evaluate('liquidLockFixture.destroy()')
        time.sleep(.4)
        evaluate("globalThis.liquidIdle=0;globalThis.liquidIdleId=global.stage.connect('after-paint',()=>liquidIdle++)")
        time.sleep(.7)
        results['liquid-idle-frames']=evaluate('liquidIdle')
        evaluate('global.stage.disconnect(liquidIdleId)')
        assert results['liquid-idle-frames']<=1
    finally:
        evaluate('for(const [key,value] of Object.entries(liquidBgSaved))liquidBg.set_value(key,value)')
