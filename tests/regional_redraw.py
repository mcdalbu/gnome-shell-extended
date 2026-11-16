"""Prove a bounded real-view repaint, rather than just a cropped screenshot."""
import time
from benchmark import read_process, summarize


def run(evaluate, wait, check, screenshot, results, pid):
    evaluate('''globalThis.regSaved=Object.fromEntries(['panel-blur','blur-filter-enabled','blur-method',
        'blur-radius','refraction-enabled','frosted-glass-enabled','blur-render-area'].map(k=>[k,cfg.get_value(k)]));
        cfg.set_boolean('panel-blur',false);cfg.set_boolean('blur-filter-enabled',true);
        cfg.set_string('blur-method','kawase');cfg.set_int('blur-radius',24);
        cfg.set_boolean('refraction-enabled',false);cfg.set_boolean('frosted-glass-enabled',false);
        cfg.set_string('blur-render-area','elements');
        globalThis.regSource=new St.Widget({x:320,y:300,width:80,height:80,style:'background-color:#f0b020;'});
        Main.uiGroup.add_child(regSource);
        globalThis.regBox=new St.Widget({x:300,y:280,width:260,height:180,
            style:'background-color:rgba(40,40,40,.2);border-radius:20px;'});
        Main.uiGroup.add_child(regBox);
        (async()=>{const {Surface}=await import(ext.dir.get_uri()+'/core/surface.js');
            globalThis.regSurface=new Surface(regBox,regBox,cfg,ext._logger);})();''')
    wait('globalThis.regSurface?._state.captures.size>0 && regSurface.guard._regional?.supported')
    evaluate('''globalThis.regFramesBefore=regSurface.guard._regional.diagnostics.frames;
        globalThis.regReadyBefore=regSurface.guard._regional.diagnostics.ready;
        globalThis.regTimeline=new Clutter.Timeline({actor:regSource,duration:700,repeat_count:-1});
        regTimeline.connect('new-frame',()=>regSource.opacity=180+Math.round(75*regTimeline.get_progress()));
        regTimeline.start();''')
    time.sleep(1.5)
    results['regional-redraw-area'] = evaluate('({...regSurface.guard._regional.diagnostics})')
    check('regional-painter-invoked', 'regSurface.guard._regional.diagnostics.frames>regFramesBefore+20')
    check('regional-source-keeps-updating', 'regSurface.guard._regional.diagnostics.ready>regReadyBefore+20')
    check('regional-painter-no-failure', '!regSurface.guard._regional.diagnostics.failure')
    check('regional-redraw-less-than-view', '!regSurface.guard._regional.diagnostics.fullView')
    check('regional-filter-healthy', '[...regSurface._state.captures.values()].every(c=>!c.effect._failed)')
    results['regional-redraw-area'] = evaluate('({...regSurface.guard._regional.diagnostics})')
    screenshot('regional-element')
    def measure():
        samples=[read_process(pid)]
        for _ in range(6):
            time.sleep(.5)
            samples.append(read_process(pid))
        return {k:v for k,v in summarize(samples,0).items() if k not in ['samples','frames','fps']}
    results['regional-animated-source-metrics'] = measure()
    evaluate("cfg.set_string('blur-render-area','monitor')")
    time.sleep(.5)
    results['monitor-animated-source-metrics'] = measure()
    evaluate("cfg.set_string('blur-render-area','elements')")
    time.sleep(.5)
    evaluate('regTimeline.stop()')
    time.sleep(.5)
    evaluate('''globalThis.regFar=new St.Widget({x:Main.layoutManager.monitors[0].x+Main.layoutManager.monitors[0].width-80,
        y:Main.layoutManager.monitors[0].height-80,width:40,height:40,style:'background-color:yellow;'});
        Main.uiGroup.add_child(regFar);
        globalThis.regFarTimeline=new Clutter.Timeline({actor:regFar,duration:400,repeat_count:-1});
        regFarTimeline.connect('new-frame',()=>regFar.opacity=180+Math.round(75*regFarTimeline.get_progress()));''')
    time.sleep(.3)
    evaluate('globalThis.regFarRequests=regSurface.guard._regional.diagnostics.requests;regFarTimeline.start()')
    time.sleep(1)
    check('regional-outside-damage-no-refresh', 'regSurface.guard._regional.diagnostics.requests===regFarRequests')
    evaluate('regFarTimeline.stop();regFarTimeline.run_dispose();regFar.destroy()')
    time.sleep(.5)
    evaluate("globalThis.regIdle=0;globalThis.regIdleSignal=global.stage.connect('after-paint',()=>regIdle++)")
    time.sleep(1)
    results['regional-idle-frames'] = evaluate('regIdle')
    results['regional-after-idle'] = evaluate('({...regSurface.guard._regional.diagnostics})')
    check('regional-idle-no-loop', 'regIdle<=1')
    evaluate('global.stage.disconnect(regIdleSignal)')
    evaluate('''regTimeline.stop();regTimeline.run_dispose();regSurface.destroy();regBox.destroy();regSource.destroy();
        for(const [k,v] of Object.entries(regSaved))cfg.set_value(k,v)''')
