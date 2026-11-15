"""Combined GPU filters: independent controls plus real-source/lifetime suite."""
import json
import time
from PIL import Image, ImageChops, ImageStat
from refraction_mode import run as refraction_suite


def run(evaluate, wait, check, screenshot, results):
    saved = evaluate("Object.fromEntries(['blur-filter-enabled','refraction-enabled','frosted-glass-enabled','blur-method','blur-radius','refraction-strength','blur-brightness','surface-opacity'].map(k=>[k,cfg.get_value(k).deep_unpack()]))")
    for method in ['box', 'fast-gaussian']:
        evaluate(f"cfg.set_string('blur-method','{method}')")
        prefix = f'combined-{method}-'
        measured = {}
        refraction_suite(evaluate, wait,
            lambda name, code: check(prefix + name, code),
            lambda name: screenshot(prefix + name), measured, blur=True)
        results.update({prefix + key: value for key, value in measured.items()})
    evaluate('''globalThis.comboGrid=new St.Widget({x:0,y:32,width:900,height:650});
        for(let y=0;y<650;y+=16)for(let x=0;x<900;x+=16)
            comboGrid.add_child(new St.Widget({x,y,width:16,height:16,
                style:`background-color:${((x+y)/16)%2?'#e0b040':'#203080'};`}));
        Main.uiGroup.add_child(comboGrid);
        globalThis.comboBox=new St.Widget({x:150,y:180,width:420,height:300,
            style:'background-color:rgba(40,40,40,0.15);border-radius:20px;'});
        Main.uiGroup.add_child(comboBox);
        cfg.set_boolean('blur-filter-enabled',true);cfg.set_boolean('refraction-enabled',true);cfg.set_boolean('frosted-glass-enabled',false);cfg.set_double('refraction-strength',0);
        cfg.set_int('blur-radius',0);cfg.set_double('blur-brightness',1);
        globalThis.comboSurface=null;
        (async()=>{const {Surface}=await import(ext.dir.get_uri()+'/core/surface.js');
            comboSurface=new Surface(comboBox,comboBox,cfg,ext._logger);})();''')
    wait('comboSurface')
    time.sleep(.2)
    clear = Image.open(screenshot('combined-grid-clear')).convert('RGB')
    scale = clear.width / evaluate('global.stage.width')
    rect = tuple(round(v*scale) for v in (230,250,470,400))
    std = lambda image: sum(ImageStat.Stat(image.crop(rect)).stddev)/3
    clear_std = std(clear)
    for method in ['box', 'fast-gaussian']:
        evaluate(f"cfg.set_string('blur-method','{method}');cfg.set_int('blur-radius',24);comboSurface.update()")
        wait('comboSurface._state.captures.size>0')
        time.sleep(.2)
        image = Image.open(screenshot('combined-grid-' + method)).convert('RGB')
        ratio = std(image)/clear_std
        results['combined-' + method + '-contrast-ratio'] = ratio
        assert ratio < .65, (method, ratio)
        check('combined-' + method + '-gpu-filter', '[...comboSurface._state.captures.values()].every(c=>c.effect.combined && !c.effect._failed && [...c.effect._buffers.values()].some(b=>b.filter))')
        evaluate("cfg.set_double('refraction-strength',12);comboSurface.update()")
        time.sleep(.2)
        refracted = Image.open(screenshot('combined-grid-' + method + '-lens')).convert('RGB')
        center_delta = max(ImageStat.Stat(ImageChops.difference(image.crop(rect),refracted.crop(rect))).mean)
        assert center_delta < .1, center_delta
        evaluate("cfg.set_int('blur-radius',0);comboSurface.update()")
        time.sleep(.2)
        sharp = Image.open(screenshot('combined-grid-' + method + '-lens-only')).convert('RGB')
        assert std(sharp) > clear_std*.95
        evaluate("cfg.set_double('refraction-strength',0);comboSurface.update()")
    evaluate('comboBox.destroy();comboGrid.destroy()')
    for key, value in saved.items():
        setter = 'set_boolean' if isinstance(value, bool) else 'set_string' if isinstance(value, str) else 'set_int' if key == 'blur-radius' else 'set_double'
        evaluate(f'cfg.{setter}({json.dumps(key)},{json.dumps(value)})')
    time.sleep(.3)
