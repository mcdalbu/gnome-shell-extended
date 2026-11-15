"""Compare the rendered edge response with a Gaussian and verify live quality changes."""
import math
import time
from PIL import Image


def run(evaluate, wait, check, screenshot, results):
    evaluate('''globalThis.iterSaved=Object.fromEntries([
        'blur-filter-enabled','blur-method','blur-samples','blur-iterations','blur-radius',
        'blur-brightness','refraction-enabled','frosted-glass-enabled','blur-overview',
        'panel-blur','panel-auto-opacity'
        ].map(k=>[k,cfg.get_value(k)]));
        cfg.set_boolean('blur-filter-enabled',true);cfg.set_string('blur-method','fast-gaussian');
        cfg.set_string('blur-samples','9');cfg.set_int('blur-radius',64);
        cfg.set_double('blur-brightness',1);cfg.set_boolean('refraction-enabled',false);
        cfg.set_boolean('frosted-glass-enabled',false);
        cfg.set_boolean('panel-blur',true);cfg.set_boolean('panel-auto-opacity',false);
        globalThis.iterBackground=new St.Widget({width:global.stage.width,height:global.stage.height,
            style:'background-color:black;'});
        for(let row=0;row<2;row++)for(let col=0;col<2;col++)
            iterBackground.add_child(new St.Widget({x:col*400,y:row*360,width:400,height:360,
                style:`background-color:rgb(${col*255},${row*255},0);`}));
        Main.uiGroup.add_child(iterBackground);
        globalThis.iterBox=new St.Widget({x:200,y:180,width:400,height:360,
            style:'background-color:transparent;border-radius:0px;'});
        Main.uiGroup.add_child(iterBox);
        globalThis.iterSurface=null;
        (async()=>{const {Surface}=await import(ext.dir.get_uri()+'/core/surface.js');
            iterSurface=new Surface(iterBox,iterBox,cfg,ext._logger,{manageStyle:false,opacity:()=>0});})();''')
    wait('iterSurface?._state.captures.size>0')
    profiles = {}
    for iterations in [1, 4, 8]:
        evaluate(f"cfg.set_int('blur-iterations',{iterations});iterSurface.update()")
        wait(f"ext._manager._slots.get('panel').instance.binding.surface?._state.glassConfig.iterations==={iterations}")
        time.sleep(.2)
        image = Image.open(screenshot(f'gaussian-iterations-{iterations}')).convert('RGB')
        scale = image.width/evaluate('global.stage.width')
        coordinates = list(range(-100, 101))
        axes = [
            [image.getpixel((round((400+offset)*scale), round(360*scale)))[0]/255 for offset in coordinates],
            [image.getpixel((round(400*scale), round((360+offset)*scale)))[1]/255 for offset in coordinates],
        ]
        # Fit only sigma and a subpixel phase. A true Gaussian has a monotonic
        # erf-shaped step response; sparse repeated bands have a larger error.
        errors = []
        for values in axes:
            assert all(b >= a-.012 for a,b in zip(values,values[1:])), 'Gaussian edge ringing'
            best = min(math.sqrt(sum((v-(.5+.5*math.erf((x+phase)/(sigma*math.sqrt(2)))))**2
                for x,v in zip(coordinates, values))/len(values))
                for sigma in range(20, 49) for phase in [-1, -.5, 0, .5, 1])
            errors.append(best)
        profiles[iterations] = axes
        results[f'gaussian-iterations-{iterations}-edge-rmse'] = errors
        check(f'gaussian-iterations-{iterations}-capture-healthy', '''[...iterSurface._state.captures.values()]
            .every(c=>!c.effect._failed && [...c.effect._buffers.values()].some(b=>b.filter))''')
        evaluate("cfg.set_boolean('blur-overview',true);Main.overview.show()")
        wait(f'''!Main.overview.animationInProgress && ext._manager._slots.get('blur').instance.backgrounds
            ?.effects.every(([,e])=>e.underlay.length==={2*iterations})''')
        check(f'gaussian-iterations-{iterations}-wallpaper', f'''ext._manager._slots.get('blur').instance.backgrounds
            .effects.length>0 && ext._manager._slots.get('blur').instance.backgrounds.effects
            .every(([,e])=>e.underlay.length==={2*iterations})''')
        evaluate('Main.overview.hide()')
        wait('!Main.overview.visible')
    for iterations in [4, 8]:
        errors = results[f'gaussian-iterations-{iterations}-edge-rmse']
        assert max(errors) < .025, (iterations, errors)
        delta = sum(abs(a-b) for a,b in zip(profiles[1][0],profiles[iterations][0]))/201
        results[f'gaussian-iterations-{iterations}-pixel-change'] = delta
        assert delta > .002, ('Quality setting did not change pixels', iterations, delta)
    assert max(results['gaussian-iterations-4-edge-rmse']) < max(results['gaussian-iterations-1-edge-rmse']), 'Progressive passes did not improve Gaussian response'
    evaluate('iterBox.destroy();iterBackground.destroy();for(const [k,v] of Object.entries(iterSaved))cfg.set_value(k,v)')
