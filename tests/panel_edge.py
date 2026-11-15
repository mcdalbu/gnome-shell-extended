"""The first framebuffer rows of the real panel must receive the backdrop effect."""
import time
from PIL import Image, ImageStat


def run(evaluate, wait, check, screenshot, results):
    evaluate('''globalThis.edgeSaved=Object.fromEntries([
        'panel-blur','panel-opacity','panel-auto-opacity','panel-style',
        'blur-enabled','blur-filter-enabled','blur-method','blur-radius','blur-brightness',
        'refraction-enabled','frosted-glass-enabled'
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
    for method in ['box', 'fast-gaussian']:
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
                edgeNativeRows=[top,top+1,top+2,Math.round((y+h*.5-r.y)*scale)].map(row=>{
                    const data=edgeProbe.read(view.get_framebuffer(),left,row,width,1).get_data();
                    let sum=0;for(let i=0;i<data.length;i+=4)sum+=data[i];return sum/width;
                });
            });global.stage.queue_redraw();''')
        wait('edgeNativeRows')
        evaluate('global.stage.disconnect(edgeProbeId)')
        native = evaluate('edgeNativeRows')
        results['panel-edge-'+method+'-native-rows'] = native
        assert max(native)-min(native) < 3, (method, 'native framebuffer', native)
        assert clear-min(native) > 70, (method, clear, native)
        rendered = Image.open(screenshot('panel-edge-'+method)).convert('RGB')
        rows = list(range(top, top+3)) + [round((y+height*.5)*scale)]
        values = [ImageStat.Stat(rendered.crop((left, row, right, row+1))).mean[0] for row in rows]
        results['panel-edge-'+method+'-rows'] = values
        # A uniform source with 50% brightness isolates missing coverage from
        # blur-kernel differences. The first three rows must match the center.
        assert max(values)-min(values) < 3, (method, values)
        assert clear-min(values) > 70, (method, clear, values)
    check('panel-edge-foreground-opacity', 'Main.panel.opacity===255 && Main.panel._centerBox.opacity===255')
    evaluate('edgeBackdrop.destroy();for(const [k,v] of Object.entries(edgeSaved))cfg.set_value(k,v)')
