"""Regression probes for the beta.3 performance audit, on the real GPU path."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
from PIL import Image, ImageStat


def run(evaluate, wait, check, screenshot, results, root):
    evaluate('''globalThis.optSaved=Object.fromEntries(cfg.list_keys().map(k=>[k,cfg.get_value(k)]));
        cfg.set_boolean('panel-blur',false);cfg.set_string('blur-method','fast-gaussian');
        cfg.set_string('blur-samples','9');cfg.set_int('blur-iterations',4);
        cfg.set_int('blur-radius',24);cfg.set_string('blur-render-area','monitor');
        cfg.set_string('blur-resolution','auto');cfg.set_string('blur-refresh-rate','100');
        globalThis.optBox=new St.Widget({x:200,y:200,width:400,height:240,style:'background-color:transparent;'});
        globalThis.optHost=new St.Widget({width:global.stage.width,height:global.stage.height});
        Main.uiGroup.add_child(optHost);optHost.add_child(optBox);
        (async()=>{const {Surface}=await import(ext.dir.get_uri()+'/core/surface.js');
            globalThis.optCache=await import(ext.dir.get_uri()+'/core/render/hiddenCache.js');
            globalThis.optSurface=new Surface(optBox,optBox,cfg,ext._logger,{manageStyle:false,opacity:()=>0});})();''')
    wait("[...optSurface?._state.captures.values()??[]].some(c=>c.effect._buffers.get('view')?.filter)")
    evaluate('''globalThis.optBuffers=()=>[...optSurface._state.captures.values()].map(c=>c.effect._buffers.get('view')).filter(Boolean);
        globalThis.optCounts={};globalThis.optRestores=[];
        globalThis.optWrap=(target,name,key)=>{const original=target[name];
            target[name]=function(...args){optCounts[key]=(optCounts[key]??0)+1;return original.apply(this,args)};
            optRestores.push(()=>target[name]=original)};
        for(const name of ['get_transformed_position','get_transformed_size'])optWrap(optBox,name,name);
        optWrap(optBuffers()[0].pipeline,'get_uniform_location','uniformLookup');
        globalThis.optFrames=0;globalThis.optPaint=global.stage.connect('after-paint',()=>optFrames++);
        globalThis.optPulse=new St.Widget({x:250,y:250,width:30,height:30,style:'background-color:white;'});
        optHost.insert_child_below(optPulse,optSurface.group);
        globalThis.optTimeline=new Clutter.Timeline({actor:optPulse,duration:700,repeat_count:-1});
        optTimeline.connect('new-frame',()=>optPulse.opacity=100+Math.round(optTimeline.get_progress()*155));
        optTimeline.start();''')
    time.sleep(.3)
    evaluate('optCounts={};optFrames=0')
    time.sleep(1.2)
    metrics = evaluate('({frames:optFrames,counts:{...optCounts}})')
    results['optimized-steady-frame-calls'] = metrics
    assert metrics['frames'] > 30
    assert metrics['counts'].get('uniformLookup',0) == 0, metrics
    assert metrics['counts']['get_transformed_position']/metrics['frames'] < 8, metrics
    evaluate('optTimeline.stop();global.stage.disconnect(optPaint);for(const f of optRestores)f()')
    time.sleep(.2)
    allocations=[]
    for radius in [24,25,26,27]:
        evaluate(f"globalThis.optPrevious=optBuffers()[0].filter;cfg.set_int('blur-radius',{radius});optSurface.update()")
        time.sleep(.15)
        allocations.append(evaluate('({radius:cfg.get_int("blur-radius"),reused:optPrevious===optBuffers()[0].filter})'))
    results['optimized-radius-storage'] = allocations
    assert all(a['reused'] for a in allocations), allocations
    evaluate("globalThis.optOldContextBuffer=optBuffers()[0];optOldContextBuffer.context=null;optBox.queue_redraw()")
    wait('optBuffers()[0]!==optOldContextBuffer && optBuffers()[0].prepared')
    check('optimized-context-change-rebuilds', '[...optSurface._state.captures.values()].every(c=>!c.effect._failed)')
    evaluate('optOldContextBuffer=null')
    screenshot('optimized-screenshot-cache')
    time.sleep(.7)
    check('optimized-screenshot-storage-expired', "[...optSurface._state.captures.values()].every(c=>!c.effect._buffers.has('capture'))")
    evaluate('optBox.set_clip(0,0,0,0)')
    wait('!optSurface.group.visible && !optSurface._framesActive')
    check('optimized-hidden-unsubscribed', '!optSurface._stopDamage && optSurface.frames._subscriptions.length===0')
    evaluate('optBox.remove_clip()')
    wait('optSurface.group.visible && optSurface._framesActive && optSurface._stopDamage')
    check('optimized-hidden-resume', 'optSurface._state.captures.size>0')
    evaluate('optHost.opacity=0')
    wait('!optSurface.group.visible && !optSurface._framesActive')
    evaluate('optHost.opacity=255')
    wait('optSurface.group.visible && optSurface._framesActive')
    check('optimized-ancestor-fade-resumes', '!!optSurface._stopDamage')
    evaluate('optBox.set_clip(0,0,0,0)')
    wait('!optSurface.group.visible')
    wait('optSurface._state.captures.size===0',timeout=8)
    check('optimized-hidden-cache-expired', 'optCache.hiddenCacheState().bytes<=128*1024*1024')
    evaluate('optTimeline.run_dispose();optPulse.destroy();optSurface.destroy();optHost.destroy()')

    # Actor-source filtering must see the current input, execute in GPU order,
    # and retain the final result while unrelated foreground actors animate.
    evaluate('''(async()=>{globalThis.optWallModule=await import(ext.dir.get_uri()+'/core/render/wallpaperBlur.js');
        globalThis.optAppearance=(await import(ext.dir.get_uri()+'/core/appearance.js')).readAppearance;
        globalThis.optPaper=new St.Widget({x:100,y:100,width:600,height:240,style:'background-color:black;'});
        for(let x=0;x<600;x+=20)optPaper.add_child(new St.Widget({x,width:20,height:240,
            style:`background-color:${x%40?'white':'black'};`}));
        Main.uiGroup.add_child(optPaper);
        cfg.set_int('blur-radius',24);
        globalThis.optFilters=optWallModule.wallpaperFilters(optPaper,optAppearance(cfg));
        for(const p of optFilters)optPaper.add_effect(p);
        globalThis.optWallReady=true;})();''')
    wait('optWallReady && optFilters[0].filter?.nodePasses>0')
    sizes=evaluate('''optFilters.map(p=>({source:[p.get_texture().get_width(),p.get_texture().get_height()],
        levels:p.filter.levels.map(t=>[t.width,t.height]),passes:p.filter.nodeTargets.map(t=>[t.width,t.height]),
        nodePasses:p.filter.nodePasses,reduction:p.filter.reduction}))''')
    results['optimized-wallpaper-targets']=sizes
    assert all(p['nodePasses']==len(p['levels'])+8 and len(p['passes'])==8 for p in sizes), sizes
    assert all(max(t[0] for t in p['passes']) <= p['source'][0]/p['reduction']+1 for p in sizes)
    shot=Image.open(screenshot('optimized-wallpaper-stripes')).convert('RGB')
    scale=shot.width/evaluate('global.stage.width')
    crop=shot.crop(tuple(round(v*scale) for v in (200,150,600,280)))
    stat=ImageStat.Stat(crop)
    results['optimized-wallpaper-stripes']={'mean':stat.mean,'stddev':stat.stddev}
    assert 70<stat.mean[0]<185 and stat.stddev[0]<30, (stat.mean,stat.stddev)
    evaluate("for(const c of optPaper.get_children())c.set_style('background-color:#1050d0;')")
    time.sleep(.2)
    shot=Image.open(screenshot('optimized-wallpaper-current-source')).convert('RGB')
    color=ImageStat.Stat(shot.crop(tuple(round(v*scale) for v in (200,150,600,280)))).mean
    assert color[2]>color[0]+100 and color[1]>color[0]+30,color
    evaluate("cfg.set_int('blur-iterations',1);for(const p of optFilters)p.configure(optAppearance(cfg))")
    wait('optFilters[0].filter.nodeTargets.length===2')
    check('optimized-wallpaper-releases-old-passes', 'optFilters.every(p=>p.filter.nodePipelines.size===p.filter.nodePasses)')
    evaluate('optPaper.destroy();cfg.set_int("blur-iterations",4)')

    # Brightness updates must keep filters and their allocated geometry.
    evaluate('''globalThis.optStaticBox=new St.Widget({x:100,y:100,width:600,height:32});Main.uiGroup.add_child(optStaticBox);
        (async()=>{const {WallpaperSurface}=await import(ext.dir.get_uri()+'/core/wallpaperSurface.js');
            globalThis.optStatic=new WallpaperSurface(optStaticBox,optStaticBox,cfg,ext._logger,{opacity:()=>0});})();''')
    wait('optStatic?.filters[0]?.filter')
    evaluate('''globalThis.optOldFilters=optStatic.filters.slice();globalThis.optOldGeometry=optStatic._geometryKey;
        cfg.set_double('blur-brightness',.7);optStatic.update()''')
    check('optimized-brightness-reuses-filters', 'optStatic.filters.every((p,i)=>p===optOldFilters[i]) && optStatic._geometryKey===optOldGeometry')
    evaluate('optStatic.destroy();optStaticBox.destroy();cfg.set_boolean("blur-overview",true);Main.overview.show()')
    wait('!Main.overview.animationInProgress')
    evaluate("globalThis.optBackgrounds=ext._manager._slots.get('blur').instance.backgrounds;globalThis.optOverview=optBackgrounds.group")
    results['optimized-overview-storage']=evaluate("""optBackgrounds.effects.map(([a,e])=>({
        source:e.underlay.map(p=>[p.get_texture().get_width(),p.get_texture().get_height()]),
        rgba8Bytes:optWallModule.wallpaperBytes([e,e.outputCache,...e.underlay]),
        legacyRgba8Bytes:9*e.get_texture().get_width()*e.get_texture().get_height()*4}))""")
    evaluate("""(async()=>{const GObject=(await import('gi://GObject')).default;
        const Probe=GObject.registerClass(class GseOverviewCacheProbe extends Clutter.Effect {
            vfunc_paint(_node,context,_flags){globalThis.optOverviewSourcePaints++;this.get_actor().continue_paint(context)}
        });globalThis.optOverviewSourcePaints=0;
        optBackgrounds.effects[0][0].add_effect_with_name('gse-test-overview-probe',new Probe());
        globalThis.optOverviewProbeReady=true;})();""")
    wait('optOverviewProbeReady && optOverviewSourcePaints>0')
    evaluate("""globalThis.optCachePulse=new St.Widget({x:100,y:100,width:20,height:20,style:'background-color:white;'});
        Main.uiGroup.add_child(optCachePulse);
        globalThis.optCacheTimeline=new Clutter.Timeline({actor:optCachePulse,duration:400,repeat_count:-1});
        optCacheTimeline.connect('new-frame',()=>optCachePulse.opacity=100+Math.round(100*optCacheTimeline.get_progress()));
        optCacheTimeline.start();optOverviewSourcePaints=0;""")
    time.sleep(.5)
    check('optimized-overview-output-cache', 'optOverviewSourcePaints===0')
    evaluate("""optCacheTimeline.stop();optCacheTimeline.run_dispose();optCachePulse.destroy();
        optBackgrounds.effects[0][0].remove_effect_by_name('gse-test-overview-probe')""")
    evaluate('Main.overview.hide()')
    wait('!Main.overview.visible')
    evaluate('Main.overview.show()')
    wait('!Main.overview.animationInProgress')
    check('optimized-overview-warm-reuse', 'optBackgrounds.group===optOverview')
    evaluate('Main.overview.hide()')
    wait('!Main.overview.visible')
    wait('!optBackgrounds.group',timeout=8)
    check('optimized-overview-cache-expired', 'optCache.hiddenCacheState().bytes<=128*1024*1024')
    evaluate('for(const [k,v] of Object.entries(optSaved))cfg.set_value(k,v)')


def windows(evaluate, wait, check, screenshot, results, root):
    evaluate('''scene.hide();cfg.set_boolean('panel-blur',false);cfg.set_boolean('opacity-enabled',true);
        cfg.set_boolean('opacity-ptyxis',true);cfg.set_boolean('windows-blur',true);
        cfg.set_double('gtk-background-opacity',.4);cfg.set_string('blur-method','fast-gaussian');
        cfg.set_string('blur-render-area','monitor');cfg.set_string('blur-refresh-rate','100');''')
    wait("ext._manager._slots.get('opacity')?.instance.windowBlur")
    env=dict(os.environ,WAYLAND_DISPLAY=evaluate('GLib.getenv("WAYLAND_DISPLAY")'),GTK_A11Y='none')
    with tempfile.TemporaryDirectory(prefix='gse-xrgb-') as directory:
        d=Path(directory)
        xml=Path('/usr/share/qt6/wayland/protocols/xdg-shell/xdg-shell.xml')
        if not xml.exists(): xml=Path('/usr/share/wayland-protocols/stable/xdg-shell/xdg-shell.xml')
        subprocess.run(['wayland-scanner','client-header',str(xml),str(d/'xdg-shell-client-protocol.h')],check=True)
        subprocess.run(['wayland-scanner','private-code',str(xml),str(d/'xdg-shell-protocol.c')],check=True)
        subprocess.run(['cc','-O2','-I'+str(d),str(root/'tests/opaque-window.c'),str(d/'xdg-shell-protocol.c'),'-lwayland-client','-o',str(d/'cover')],check=True)
        target=subprocess.Popen(['gjs','-m',str(root/'tests/windowFade.js')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        cover=subprocess.Popen([str(d/'cover')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            wait("['GSE fade target','GSE proven opaque cover'].every(t=>global.get_window_actors().some(a=>a.meta_window.get_title()===t && a.mapped && a.width>0))")
            evaluate('''globalThis.optTarget=global.get_window_actors().find(a=>a.meta_window.get_title()==='GSE fade target');
                globalThis.optCover=global.get_window_actors().find(a=>a.meta_window.get_title()==='GSE proven opaque cover');
                optTarget.meta_window.move_resize_frame(false,200,250,600,360);
                optCover.meta_window.move_frame(false,150,180);
                optTarget.meta_window.activate(global.display.get_current_time_roundtrip());
                globalThis.optController=ext._manager._slots.get('opacity').instance.windowBlur;
                globalThis.optState=()=>optController._windows.get(optTarget);
                globalThis.optCaptures=()=>[...optState().captures.values()].reduce((s,c)=>s+c.effect.statistics.captures,0);''')
            wait('optState()?.reveal?.value===1 && optState().captures.size>0')
            results['optimized-cover-proof']=evaluate('({bounds:optController._opaqueBounds(optCover),opaque:optController._isOpaque({actor:optCover,window:optCover.meta_window})})')
            results['optimized-cover-proof']['tree']=evaluate("""(()=>{const read=a=>({type:a.constructor.name,
                bounds:[...a.get_transformed_position(),...a.get_transformed_size()],size:[a.width,a.height],
                scale:[a.scale_x,a.scale_y],opacity:a.get_paint_opacity(),mapped:a.mapped,clip:a.has_clip,
                allocClip:a.clip_to_allocation,effects:a.get_effects().length,root:a.get_content()===optCover.get_texture(),
                children:a.get_children().map(read)});return read(optCover)})()""")
            check('optimized-xrgb-coverage-proven', '!!optController._opaqueBounds(optCover)')
            evaluate('optCover.meta_window.activate(global.display.get_current_time_roundtrip())')
            wait('optState().occluded')
            evaluate('''globalThis.optCoveredCount=optCaptures();
                globalThis.optPulse=new St.Widget({x:1100,y:100,width:30,height:30,style:'background-color:white;'});Main.uiGroup.add_child(optPulse);
                globalThis.optTimeline=new Clutter.Timeline({actor:optPulse,duration:700,repeat_count:-1});
                optTimeline.connect('new-frame',()=>optPulse.opacity=100+Math.round(155*optTimeline.get_progress()));optTimeline.start();''')
            time.sleep(1)
            check('optimized-covered-window-no-captures', 'optCaptures()===optCoveredCount && !optState().blur.visible && !optState().source')
            evaluate('optTarget.meta_window.activate(global.display.get_current_time_roundtrip())')
            wait('!optState().occluded && optState().blur.visible && optCaptures()>optCoveredCount')
            check('optimized-uncovered-window-resumes', '!!optState().source')
            # A visually opaque GTK RGBA cover cannot be trusted as XRGB.
            evaluate("globalThis.optUnknown=global.get_window_actors().find(a=>a.meta_window.get_title()==='GSE fade cover');optUnknown.meta_window.move_resize_frame(false,200,250,600,360);optUnknown.meta_window.activate(global.display.get_current_time_roundtrip())")
            time.sleep(.3)
            check('optimized-unknown-alpha-fallback', '!optController._opaqueBounds(optUnknown) && !optState().occluded')
            evaluate('''optTimeline.stop();optTimeline.run_dispose();optPulse.destroy();
                globalThis.optCalls=[];globalThis.optConsiderCount=0;
                globalThis.optSyncOriginal=optController.sync,globalThis.optConsiderOriginal=optController._consider;
                optController.sync=function(...args){optCalls.push(args[0]??false);return optSyncOriginal.apply(this,args)};
                optController._consider=function(...args){optConsiderCount++;return optConsiderOriginal.apply(this,args)};''')
            for key,code in [('brightness',"cfg.set_double('blur-brightness',.71)"),('calendar',"cfg.set_boolean('blur-calendar',false)")]:
                evaluate('optCalls=[];optConsiderCount=0;'+code)
                time.sleep(.25)
                result=evaluate('({effectOnlyArgs:optCalls,consideredActors:optConsiderCount})')
                results['optimized-settings-'+key]=result
                assert result['effectOnlyArgs']==([True] if key=='brightness' else []) and result['consideredActors']==0,result
            evaluate('optController.sync=optSyncOriginal;optController._consider=optConsiderOriginal')
        finally:
            for process in [target,cover]: process.terminate();process.wait(timeout=5)
    evaluate('scene.show();for(const [k,v] of Object.entries(optSaved))cfg.set_value(k,v)')
