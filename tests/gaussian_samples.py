"""All optimized Gaussian kernels render, switch live and blur in both axes."""
import time
from PIL import Image, ImageStat, ImageChops


def run(evaluate, wait, check, screenshot, results):
    evaluate('''globalThis.samplesSaved=Object.fromEntries([
        'blur-filter-enabled','blur-method','blur-samples','blur-radius','blur-brightness',
        'refraction-enabled','frosted-glass-enabled','docks-enabled','dock-blur','dock-opacity','blur-overview'
        ].map(k=>[k,cfg.get_value(k)]));
        cfg.set_boolean('blur-filter-enabled',false);cfg.set_boolean('refraction-enabled',false);
        cfg.set_boolean('frosted-glass-enabled',false);cfg.set_boolean('docks-enabled',true);
        cfg.set_boolean('dock-blur',true);cfg.set_double('dock-opacity',.2);
        cfg.set_string('blur-method','fast-gaussian');cfg.set_int('blur-radius',24);
        cfg.set_double('blur-brightness',1);
        globalThis.samplesGrid=new St.Widget({width:global.stage.width,height:global.stage.height});
        for(let y=0;y<700;y+=16)for(let x=0;x<900;x+=16)
            samplesGrid.add_child(new St.Widget({x,y,width:16,height:16,
                style:`background-color:${((x+y)/16)%2?'#e0b040':'#203080'};`}));
        Main.uiGroup.add_child(samplesGrid);
        globalThis.samplesDock=new St.Widget({name:'dashtodockContainer',x:80,y:200,width:420,height:120});
        samplesDock.add_child(new St.Widget({style_class:'dash-background',width:420,height:120,
            style:'background-color:rgb(40,40,40);border-radius:28px;'}));
        Main.uiGroup.add_child(samplesDock);
        globalThis.samplesSurface=()=>ext._manager._slots.get('docks').instance.records.get(samplesDock)?.binding.surface;''')
    wait('samplesSurface()')
    clear=Image.open(screenshot('samples-grid-clear')).convert('RGB')
    scale=clear.width/evaluate('global.stage.width')
    rect=tuple(round(v*scale) for v in (150,235,430,285))
    std=lambda image:sum(ImageStat.Stat(image.crop(rect)).stddev)/3
    reference=std(clear)
    images=[]
    for samples in [5,9,13]:
        evaluate(f"cfg.set_string('blur-samples','{samples}');cfg.set_boolean('blur-filter-enabled',true)")
        wait(f'samplesSurface()?._state?.glassConfig.samples==={samples} && samplesSurface()._state.captures.size>0')
        time.sleep(.2)
        image=Image.open(screenshot(f'samples-grid-{samples}')).convert('RGB')
        results[f'gaussian-{samples}-contrast-ratio']=std(image)/reference
        assert std(image)<reference*.65,(samples,std(image)/reference)
        check(f'gaussian-{samples}-kernel',f'''[...samplesSurface()._state.captures.values()].every(c=>!c.effect._failed &&
            [...c.effect._buffers.values()].some(b=>b.filter?.filters.has('fast-gaussian:{samples}')))''')
        images.append(image)
        evaluate("cfg.set_boolean('blur-overview',true);Main.overview.show()")
        wait(f'''ext._manager._slots.get('blur').instance.backgrounds?.effects.length>0 && !Main.overview.animationInProgress &&
            ext._manager._slots.get('blur').instance.backgrounds.effects.every(([,e])=>e.underlay.length===2 && e.underlay.every(p=>p.blurSamples==={samples}))''')
        screenshot(f'samples-overview-{samples}')
        evaluate('Main.overview.hide()')
        wait('!Main.overview.visible')
    for a,b in zip(images,images[1:]):
        assert sum(ImageStat.Stat(ImageChops.difference(a.crop(rect),b.crop(rect))).mean)>.1, 'Kernel choice did not change output'
    evaluate('samplesDock.destroy();samplesGrid.destroy();for(const [k,v] of Object.entries(samplesSaved))cfg.set_value(k,v)')
    wait('ext._manager._slots.size===2')
