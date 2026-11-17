"""Exercise real shader output, live switches, pass budget and wallpaper chain."""
import time
from PIL import Image, ImageChops, ImageStat


def run(evaluate, wait, check, screenshot, results):
    evaluate('''globalThis.kSaved=Object.fromEntries([
        'blur-filter-enabled','blur-method','blur-radius','blur-samples','blur-iterations',
        'blur-kawase-iterations','blur-brightness','refraction-enabled','frosted-glass-enabled','blur-overview',
        'panel-blur','panel-auto-opacity'
        ].map(k=>[k,cfg.get_value(k)]));
        cfg.set_boolean('blur-filter-enabled',true);cfg.set_boolean('refraction-enabled',false);
        cfg.set_boolean('frosted-glass-enabled',false);cfg.set_double('blur-brightness',1);
        cfg.set_string('blur-method','kawase');cfg.set_int('blur-radius',24);
        cfg.set_int('blur-kawase-iterations',3);cfg.set_boolean('panel-blur',true);cfg.set_boolean('panel-auto-opacity',false);
        globalThis.kBackground=new St.Widget({width:global.stage.width,height:global.stage.height,
            style:'background-color:black;'});
        for(let y=0;y<2;y++)for(let x=0;x<2;x++)
            kBackground.add_child(new St.Widget({x:x*400,y:y*360,width:400,height:360,
                style:`background-color:rgb(${x*255},${y*255},0);`}));
        Main.uiGroup.add_child(kBackground);
        globalThis.kBox=new St.Widget({x:200,y:180,width:400,height:360,
            style:'background-color:transparent;'});
        Main.uiGroup.add_child(kBox);
        (async()=>{const {Surface}=await import(ext.dir.get_uri()+'/core/surface.js');
            globalThis.kSurface=new Surface(kBox,kBox,cfg,ext._logger,{manageStyle:false,opacity:()=>0});})();''')
    wait('globalThis.kSurface?._state.captures.size>0')

    def image(name):
        time.sleep(.15)
        return Image.open(screenshot(name)).convert('RGB')

    widths = {}
    for radius in [1, 6, 24, 64, 100]:
        for method in ['box', 'kawase']:
            evaluate(f"cfg.set_string('blur-method','{method}');cfg.set_int('blur-radius',{radius});kSurface.update()")
            shot = image(f'{method}-edge-r{radius}')
            scale = shot.width / evaluate('global.stage.width')
            axes = [
                [shot.getpixel((round((400+o)*scale), round(300*scale)))[0]/255 for o in range(-150,151)],
                [shot.getpixel((round(300*scale), round((360+o)*scale)))[1]/255 for o in range(-150,151)],
            ]
            for values in axes:
                assert values[0] < .05 and values[-1] > .95, (method,radius,'DC preservation')
                assert all(b >= a-.012 for a,b in zip(values, values[1:])), (method,radius,'ringing')
            width = [sum(.1 < v < .9 for v in values) for values in axes]
            widths[f'{method}-{radius}'] = width
            if method == 'kawase':
                assert abs(width[0]-width[1]) <= 3, (radius,width)
                if radius >= 24:
                    reference = widths[f'box-{radius}']
                    assert all(.65 < a/b < 1.45 for a,b in zip(width,reference)), (radius,width,reference)
            check(f'{method}-radius-{radius}-healthy', '''[...kSurface._state.captures.values()]
                .every(c=>!c.effect._failed && [...c.effect._buffers.values()].some(b=>b.filter))''')
    results['kawase-edge-widths-10-90'] = widths

    evaluate("cfg.set_int('blur-radius',24);kSurface.update()")
    original = image('kawase-quality-before')
    evaluate("cfg.set_string('blur-samples','5');cfg.set_int('blur-iterations',8);kSurface.update()")
    changed = image('kawase-quality-after')
    scale = changed.width/evaluate('global.stage.width')
    crop = tuple(round(v*scale) for v in (240,220,560,500))
    assert max(ImageStat.Stat(ImageChops.difference(original.crop(crop),changed.crop(crop))).mean) < .1

    # Observe one painted frame; instrumentation is removed immediately after.
    evaluate('''globalThis.kFilters=[...kSurface._state.captures.values()].map(c=>c.effect._buffers.get('view')?.filter).filter(Boolean);
        for(const f of kFilters){f.kDraws=0;f.kOriginal=f._draw;
            f._draw=function(...args){this.kDraws++;if(args[0].texture===args[1])throw Error('feedback');return this.kOriginal(...args)}}
        globalThis.kFrameDone=false;
        globalThis.kProbe=global.stage.connect('after-paint',()=>{
            for(const f of kFilters){f._draw=f.kOriginal;delete f.kOriginal}
            global.stage.disconnect(kProbe);kFrameDone=true});kBackground.queue_redraw();''')
    wait('kFrameDone')
    check('kawase-three-filter-passes', 'kFilters.length>0 && kFilters.every(f=>f.kDraws-f.levels.length===3)')
    results['kawase-pass-counts'] = evaluate('kFilters.map(f=>({downsample:f.levels.length,filter:f.kDraws-f.levels.length}))')
    evaluate("cfg.set_boolean('blur-overview',true);Main.overview.show()")
    wait('!Main.overview.animationInProgress')
    check('kawase-wallpaper-three-passes', '''ext._manager._slots.get('blur').instance.backgrounds.effects.length>0 &&
        ext._manager._slots.get('blur').instance.backgrounds.effects.every(([,e])=>
            e.underlay.reduce((n,p)=>n+(p.blurPasses??1),0)===3 && e.underlay.every(p=>p.blurMethod==='kawase' && p.enabled))''')
    screenshot('kawase-overview')
    iteration_widths = {}
    for iterations in [1, 2, 3, 8]:
        # Change while Overview is open: its cached chain must be rebuilt too.
        evaluate(f"cfg.set_int('blur-kawase-iterations',{iterations})")
        wait(f'''ext._manager._slots.get('blur').instance.backgrounds.effects.length>0 &&
            ext._manager._slots.get('blur').instance.backgrounds.effects.every(([,e])=>e.underlay.reduce((n,p)=>n+(p.blurPasses??1),0)==={iterations})''')
        evaluate('Main.overview.hide()')
        wait('!Main.overview.visible')
        evaluate("cfg.set_int('blur-radius',64);kSurface.update()")
        wait(f'''ext._manager._slots.get('panel').instance.binding.surface?._state.glassConfig.iterations==={iterations}''')
        shot = image(f'kawase-iterations-{iterations}')
        scale = shot.width/evaluate('global.stage.width')
        values = [shot.getpixel((round((400+o)*scale),round(300*scale)))[0]/255 for o in range(-150,151)]
        assert values[0] < .05 and values[-1] > .95
        assert all(b>=a-.012 for a,b in zip(values,values[1:])), (iterations,'ringing')
        width = sum(.1<v<.9 for v in values)
        assert .6 < width/widths['kawase-64'][0] < 1.4, (iterations,width)
        iteration_widths[iterations] = width
        evaluate('''globalThis.kFilters=[...kSurface._state.captures.values()].map(c=>c.effect._buffers.get('view')?.filter).filter(Boolean);
            for(const f of kFilters){f.kDraws=0;f.kOriginal=f._draw;
                f._draw=function(...args){this.kDraws++;if(args[0].texture===args[1])throw Error('feedback');return this.kOriginal(...args)}}
            globalThis.kFrameDone=false;
            globalThis.kProbe=global.stage.connect('after-paint',()=>{
                for(const f of kFilters){f._draw=f.kOriginal;delete f.kOriginal}
                global.stage.disconnect(kProbe);kFrameDone=true});kBackground.queue_redraw();''')
        wait('kFrameDone')
        check(f'kawase-iterations-{iterations}-passes',f'kFilters.length>0 && kFilters.every(f=>f.kDraws-f.levels.length==={iterations})')
        evaluate('Main.overview.show()')
        wait('!Main.overview.animationInProgress')
    results['kawase-iteration-edge-widths-10-90'] = iteration_widths
    evaluate('Main.overview.hide()')
    wait('!Main.overview.visible')
    evaluate("cfg.set_int('blur-radius',0);kSurface.update()")
    check('kawase-zero-radius-releases', '(kSurface._state?.captures.size??0)===0')
    evaluate('kSurface.destroy();kBox.destroy();kBackground.destroy();for(const [k,v] of Object.entries(kSaved))cfg.set_value(k,v)')
