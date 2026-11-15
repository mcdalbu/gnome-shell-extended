"""A constant backdrop exposes one-pixel seams at rounded dock tangencies."""
import math
import time
from PIL import Image


def run(evaluate, wait, check, screenshot, results):
    evaluate('''globalThis.cornerSaved=Object.fromEntries([
        'blur-filter-enabled','blur-method','blur-samples','blur-radius','blur-brightness',
        'refraction-enabled','frosted-glass-enabled','docks-enabled','dock-blur','dock-opacity'
        ].map(k=>[k,cfg.get_value(k)]));
        cfg.set_boolean('blur-filter-enabled',false);cfg.set_boolean('refraction-enabled',false);
        cfg.set_boolean('frosted-glass-enabled',false);cfg.set_boolean('docks-enabled',true);
        cfg.set_boolean('dock-blur',true);cfg.set_double('dock-opacity',.8);
        cfg.set_double('blur-brightness',.8);cfg.set_int('blur-radius',24);
        globalThis.cornerBackdrop=new St.Widget({width:global.stage.width,height:global.stage.height,
            style:'background-color:white;'});Main.uiGroup.add_child(cornerBackdrop);
        globalThis.cornerDocks=Main.layoutManager.monitors.map(m=>{
            const dock=new St.Widget({name:'dashtodockContainer',x:m.x+14,y:m.y+m.height-108,
                width:Math.min(1000,m.width-28),height:96});
            const box=new St.Widget({style_class:'dash-background',width:dock.width,height:96,
                style:'background-color:rgb(70,70,70);border-radius:32px;border-width:0;box-shadow:none;'});
            dock.add_child(box);Main.uiGroup.add_child(dock);return dock;});
        globalThis.cornerSurface=d=>ext._manager._slots.get('docks').instance.records.get(d)?.binding.surface;''')
    wait('cornerDocks.every(d=>cornerSurface(d))')
    baseline = Image.open(screenshot('dock-corner-clear')).convert('RGB')
    scale = baseline.width/evaluate('global.stage.width')
    geometry = evaluate('cornerDocks.map(d=>[...d.get_transformed_position(),...d.get_transformed_size()])')
    for method, samples in [('box',13),('fast-gaussian',5),('fast-gaussian',9),('fast-gaussian',13)]:
        evaluate(f"cfg.set_boolean('blur-filter-enabled',true);cfg.set_string('blur-method','{method}');cfg.set_string('blur-samples','{samples}')")
        wait('cornerDocks.every(d=>cornerSurface(d)?._state.captures.size>0)')
        time.sleep(.2)
        filtered = Image.open(screenshot(f'dock-corner-{method}-{samples}')).convert('RGB')
        values=[]
        for x,y,w,h in geometry:
            for col in [math.ceil(x*scale),math.floor((x+w)*scale)-1]:
                rows=list(range(math.ceil((y+h-32)*scale),math.ceil((y+h-32)*scale)+max(2,round(2*scale))))
                rows+=list(range(math.floor((y+32)*scale)-max(2,round(2*scale)),math.floor((y+32)*scale)))
                for row in rows:
                    clear=baseline.getpixel((col,row))[0]
                    rendered=filtered.getpixel((col,row))[0]
                    alpha=(255-clear)/(255-70)
                    coverage=(clear-rendered)/(255*.2*max(.01,1-alpha))
                    values.append(coverage)
        results[f'dock-corner-{method}-{samples}-coverage']=values
        assert min(values)>.6, (method,samples,values)
    check('dock-corner-sampling-active','cornerDocks.every(d=>[...cornerSurface(d)._state.captures.values()].every(c=>!c.effect._failed))')
    evaluate('cornerDocks.forEach(d=>d.destroy());cornerBackdrop.destroy();for(const [k,v] of Object.entries(cornerSaved))cfg.set_value(k,v)')
    wait('ext._manager._slots.size===2')
