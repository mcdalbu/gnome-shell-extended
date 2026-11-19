"""Panel edges must retain coverage, including inherited fractional clips."""
import time
from PIL import Image, ImageStat


def run(evaluate, wait, check, screenshot, results):
    evaluate('''globalThis.edgeSaved=Object.fromEntries([
        'panel-blur','panel-opacity','panel-auto-opacity','panel-style','panel-liquid-highlight',
        'blur-enabled','blur-filter-enabled','blur-method','blur-radius','blur-brightness',
        'refraction-enabled','refraction-style','refraction-strength','refraction-highlight','frosted-glass-enabled'
        ].map(k=>[k,cfg.get_value(k)]));
        cfg.set_boolean('panel-auto-opacity',false);cfg.set_string('panel-style','dark');
        cfg.set_double('panel-opacity',.2);cfg.set_boolean('panel-blur',true);
        cfg.set_boolean('blur-enabled',true);cfg.set_boolean('blur-filter-enabled',false);
        cfg.set_boolean('refraction-enabled',false);cfg.set_boolean('frosted-glass-enabled',false);
        cfg.set_int('blur-radius',24);cfg.set_double('blur-brightness',.5);
        globalThis.edgePanel=ext._manager._slots.get('panel').instance;
        globalThis.edgeBackdrop=new St.Widget({width:global.stage.width,height:global.stage.height,
            style:'background-color:white;'});
        Main.uiGroup.insert_child_below(edgeBackdrop,edgePanel.binding.surface?.group??Main.layoutManager.panelBox);
        (async()=>{globalThis.edgeProbe=(await import('gi://FrameProbe')).default;})();''')
    wait('edgeProbe')
    time.sleep(.3)
    baseline = Image.open(screenshot('panel-edge-clear')).convert('RGB')
    scale = baseline.width / evaluate('global.stage.width')
    x, y, width, height = evaluate('[...Main.panel.get_transformed_position(),...Main.panel.get_transformed_size()]')
    # This span avoids the activities, clock and status buttons.
    left, right = round((x+width*.2)*scale), round((x+width*.3)*scale)
    top = round(y*scale)
    clear = ImageStat.Stat(baseline.crop((left, top, right, top+1))).mean[0]
    check('panel-edge-transparency', f'{clear} > 180 && {clear} < 240')
    evaluate('globalThis.edgeSavedClip=Main.layoutManager.panelBox.has_clip?Main.layoutManager.panelBox.get_clip():null')
    cases = [(method, liquid, clipped)
             for method in ['box', 'fast-gaussian', 'kawase']
             for liquid, clipped in [(False, False), (True, False), (True, True)]]
    for method, liquid, clipped in cases:
        label = method + ('-liquid' if liquid else '') + ('-fractional-clip' if clipped else '')
        evaluate(f"cfg.set_double('panel-opacity',0);cfg.set_boolean('refraction-enabled',{str(liquid).lower()});"
                 f"cfg.set_string('refraction-style','liquid');cfg.set_double('refraction-strength',12);"
                 f"cfg.set_double('blur-brightness',{0 if liquid else .5});"
                 + ('Main.layoutManager.panelBox.set_clip(0,0,Main.layoutManager.panelBox.width,Main.panel.height-.025)'
                    if clipped else 'Main.layoutManager.panelBox.remove_clip()'))
        evaluate(f"cfg.set_string('blur-method','{method}');cfg.set_boolean('blur-filter-enabled',true)")
        wait('edgePanel.binding.surface?._state.captures.size>0')
        time.sleep(.2)
        evaluate('''globalThis.edgeNativeRows=null;
            globalThis.edgeProbeId=global.stage.connect('after-paint',(_stage,view)=>{
                const [x,y]=Main.panel.get_transformed_position();
                const [w,h]=Main.panel.get_transformed_size();
                const r=view.layout,scale=view.get_scale();
                if(x<r.x || x>=r.x+r.width || y<r.y || y>=r.y+r.height)return;
                const left=Math.round((x+w*.2-r.x)*scale),width=Math.round(w*.1*scale);
                const top=Math.round((y-r.y)*scale);
                const bottom=Math.round((y+h-r.y)*scale);
                edgeNativeRows=[top,top+1,top+2,Math.round((y+h*.5-r.y)*scale),bottom-3,bottom-2,bottom-1].map(row=>{
                    const data=edgeProbe.read(view.get_framebuffer(),left,row,width,1).get_data();
                    let sum=0;for(let i=0;i<data.length;i+=4)sum+=data[i];return sum/width;
                });
            });global.stage.queue_redraw();''')
        wait('edgeNativeRows')
        evaluate('global.stage.disconnect(edgeProbeId)')
        native = evaluate('edgeNativeRows')
        results['panel-edge-'+label+'-native-rows'] = native
        assert max(native)-min(native) < 3, (method, 'native framebuffer', native)
        assert clear-min(native) > 70, (method, clear, native)
        rendered = Image.open(screenshot('panel-edge-'+label)).convert('RGB')
        bottom = round((y+height)*scale)
        rows = list(range(top, top+3)) + [round((y+height*.5)*scale)] + list(range(bottom-3, bottom))
        values = [ImageStat.Stat(rendered.crop((left, row, right, row+1))).mean[0] for row in rows]
        results['panel-edge-'+label+'-rows'] = values
        # Uniform white with reduced brightness exposes a missing row. Liquid
        # uses zero brightness to isolate coverage from its edge highlight.
        assert max(values)-min(values) < 3, (method, values)
        assert clear-min(values) > 70, (method, clear, values)
    evaluate("""Main.layoutManager.panelBox.remove_clip();
        cfg.set_boolean('panel-liquid-highlight',true);
        cfg.set_string('refraction-style','liquid');cfg.set_boolean('refraction-enabled',true);
        cfg.set_double('refraction-highlight',0);""")
    highlights = []
    for intensity in [0, 100, 200]:
        evaluate(f"cfg.set_double('refraction-highlight',{intensity})")
        time.sleep(.3)
        shot = Image.open(screenshot(f'panel-liquid-highlight-{intensity}')).convert('RGB')
        highlights.append(ImageStat.Stat(shot.crop((left, bottom-1, right, bottom))).mean[0])
    assert highlights[0]+2 < highlights[1] < highlights[2]-2, highlights
    results['panel-liquid-highlight-red'] = highlights
    check('panel-liquid-highlight-keeps-layout',
          f'Main.panel.height==={height} && edgePanel.binding.surface._state.glassConfig.strength===0')
    check('panel-edge-foreground-opacity', 'Main.panel.opacity===255 && Main.panel._centerBox.opacity===255')
    evaluate('if(edgeSavedClip)Main.layoutManager.panelBox.set_clip(...edgeSavedClip);else Main.layoutManager.panelBox.remove_clip();edgeBackdrop.destroy();for(const [k,v] of Object.entries(edgeSaved))cfg.set_value(k,v)')
