"""Real panel: wallpaper-only pixels, cached shader output and source switching."""
import time
import json
from pathlib import Path
from PIL import Image, ImageStat
from benchmark import read_process, summarize


def run(evaluate, wait, check, screenshot, results, pid):
    evaluate('''globalThis.spSaved=Object.fromEntries([
        'panel-static-blur','panel-blur','panel-opacity','panel-auto-opacity','panel-style',
        'blur-enabled','blur-filter-enabled','blur-method','blur-radius','blur-brightness',
        'refraction-enabled','frosted-glass-enabled'
        ].map(k=>[k,cfg.get_value(k)]));
        globalThis.spBg=new Gio.Settings({schema_id:'org.gnome.desktop.background'});
        globalThis.spBgSaved=Object.fromEntries(['picture-options','picture-uri','picture-uri-dark','primary-color','secondary-color','color-shading-type']
            .map(k=>[k,spBg.get_value(k)]));
        spBg.set_string('picture-options','none');spBg.set_string('color-shading-type','solid');
        spBg.set_string('primary-color','#1450a0');spBg.set_string('secondary-color','#1450a0');
        cfg.set_boolean('panel-auto-opacity',false);cfg.set_double('panel-opacity',.1);
        cfg.set_string('panel-style','dark');cfg.set_boolean('panel-blur',true);
        cfg.set_boolean('blur-enabled',true);cfg.set_boolean('blur-filter-enabled',true);
        cfg.set_int('blur-radius',24);cfg.set_double('blur-brightness',1);
        cfg.set_boolean('refraction-enabled',false);cfg.set_boolean('frosted-glass-enabled',false);
        cfg.set_boolean('panel-static-blur',true);
        globalThis.spModule=ext._manager._slots.get('panel').instance;
        globalThis.spSurface=()=>spModule.binding.surface;
        globalThis.spScene=new St.Widget({width:global.stage.width,height:global.stage.height,
            style:'background-color:#f00000;'});
        Main.uiGroup.insert_child_below(spScene,Main.layoutManager.panelBox);''')
    wait("spSurface()?.constructor.name==='WallpaperSurface' && spSurface().manager?.backgroundActor")
    time.sleep(1.5)
    check('static-panel-no-framebuffer-captures', 'spSurface()._state.captures.size===0 && !spSurface().guard && !spSurface().frames')
    check('static-panel-strip-height', 'spSurface().source.height < Main.layoutManager.primaryMonitor.height/2')

    def pixels(name):
        shot = Image.open(screenshot(name)).convert('RGB')
        scale = shot.width/evaluate('global.stage.width')
        x,y,w,h = evaluate('[...Main.panel.get_transformed_position(),...Main.panel.get_transformed_size()]')
        rect=tuple(round(v*scale) for v in (x+w*.2,y+3,x+w*.3,y+h-3))
        return ImageStat.Stat(shot.crop(rect)).mean

    methods = ['box','fast-gaussian','kawase']
    for method in methods:
        evaluate(f"cfg.set_string('blur-method','{method}')")
        wait(f"spSurface()?._state.glassConfig.method==='{method}'")
        time.sleep(.2)
        color = pixels('static-panel-'+method)
        results['static-panel-'+method+'-rgb'] = color
        assert color[2]>color[0]+60 and color[1]>color[0]+20, (method,color)

    # This sits INSIDE the output cache, after all its filtering effects. A
    # repaint of a cached image must not paint this effect or its children.
    evaluate('''(async()=>{
        const GObject=(await import('gi://GObject')).default;
        const Probe=GObject.registerClass(class GseStaticPanelProbe extends Clutter.Effect{
            vfunc_paint(_n,c,_f){globalThis.spFilterPaints++;this.get_actor().continue_paint(c)}});
        globalThis.spFilterPaints=0;spSurface().viewport.add_effect_with_name('gse-test-static-probe',new Probe());
        globalThis.spReady=true;})();''')
    wait('spReady && spFilterPaints>0')
    time.sleep(.3)
    evaluate('''globalThis.spFrames=0;globalThis.spFrameSignal=global.stage.connect('after-paint',()=>spFrames++);
        globalThis.spTimeline=new Clutter.Timeline({actor:spScene,duration:700,repeat_count:-1});
        spTimeline.connect('new-frame',()=>spScene.opacity=180+Math.round(75*spTimeline.get_progress()));
        globalThis.spPaintsBefore=spFilterPaints;spTimeline.start();''')
    time.sleep(1)
    check('static-panel-cache-during-animation', 'spFrames>20 && spFilterPaints===spPaintsBefore')
    results['static-panel-cache-animation'] = evaluate('({frames:spFrames,shaderSourcePaints:spFilterPaints-spPaintsBefore})')

    def measure(seconds):
        samples=[read_process(pid)]
        end=time.monotonic()+seconds
        while time.monotonic()<end:
            time.sleep(min(.5,max(0,end-time.monotonic())))
            samples.append(read_process(pid))
        return {k:v for k,v in summarize(samples,0).items() if k not in ['samples','frames','fps']}

    results['static-panel-animated-source-metrics'] = measure(3)
    before = pixels('static-panel-animated-scene')
    evaluate("spScene.set_style('background-color:#00f000;')")
    time.sleep(.2)
    after = pixels('static-panel-changed-window')
    assert max(abs(a-b) for a,b in zip(before,after)) < 1, (before,after)
    evaluate('spTimeline.stop()')

    # Wallpaper changes, unlike window changes, must replace the cached image.
    evaluate("spBg.set_string('primary-color','#a01450');spBg.set_string('secondary-color','#a01450')")
    time.sleep(1.8)
    color = pixels('static-panel-new-wallpaper')
    assert color[0]>color[2]+40, color
    check('static-panel-wallpaper-invalidates-cache', 'spFilterPaints>spPaintsBefore')
    # A real image with detail proves this is filtered wallpaper, not a solid
    # approximation or a frozen copy of whatever window used to be behind it.
    pattern = Path(__file__).resolve().parents[1]/'validation/static-panel-pattern.png'
    picture = Image.new('RGB',(1440,1000))
    for x in range(1440):
        picture.paste('#ffffff' if (x//12)%2 else '#000000',(x,0,x+1,1000))
    picture.save(pattern)
    uri=json.dumps(pattern.as_uri())
    evaluate(f"spBg.set_string('picture-uri',{uri});spBg.set_string('picture-uri-dark',{uri});spBg.set_string('picture-options','zoom');cfg.set_int('blur-radius',1)")
    time.sleep(1.8)
    def contrast(name):
        shot=Image.open(screenshot(name)).convert('RGB');scale=shot.width/evaluate('global.stage.width')
        x,y,w,h=evaluate('[...Main.panel.get_transformed_position(),...Main.panel.get_transformed_size()]')
        return ImageStat.Stat(shot.crop(tuple(round(v*scale) for v in (x+w*.2,y+3,x+w*.3,y+h-3)))).stddev[0]
    sharp=contrast('static-panel-pattern-radius-1')
    evaluate("cfg.set_int('blur-radius',24)")
    time.sleep(.3)
    blurred=contrast('static-panel-pattern-radius-24')
    results['static-panel-pattern-contrast']={'radius1':sharp,'radius24':blurred}
    assert sharp>20 and blurred<sharp*.65, (sharp,blurred)
    check('static-panel-text-opacity', 'Main.panel.opacity===255 && Main.panel._centerBox.opacity===255')
    evaluate('Main.overview.show()')
    wait('!Main.overview.animationInProgress')
    check('static-panel-released-in-overview', '!spSurface()')
    evaluate('Main.overview.hide()')
    wait("!Main.overview.visible && spSurface()?.constructor.name==='WallpaperSurface' && spModule.fade.value===1")
    time.sleep(.3)
    pixels('static-panel-after-overview')
    evaluate("cfg.set_double('panel-opacity',1)")
    wait('!spSurface()')
    check('static-panel-opaque-releases', '!Main.uiGroup.get_children().some(g=>g.get_children().some(c=>c.name===\'gse-static-wallpaper\'))')
    evaluate("cfg.set_double('panel-opacity',.1);cfg.set_boolean('panel-static-blur',false)")
    wait("spSurface()?.constructor.name==='Surface' && spSurface()._state.captures.size>0")
    time.sleep(.3)
    color = pixels('dynamic-panel-source')
    assert color[1]>color[2]+80, color
    evaluate('spTimeline.start()')
    time.sleep(1)
    results['dynamic-panel-animated-source-metrics'] = measure(3)
    evaluate('''spTimeline.stop();spTimeline.run_dispose();global.stage.disconnect(spFrameSignal);spScene.destroy();
        for(const [k,v] of Object.entries(spBgSaved))spBg.set_value(k,v);
        for(const [k,v] of Object.entries(spSaved))cfg.set_value(k,v);''')
