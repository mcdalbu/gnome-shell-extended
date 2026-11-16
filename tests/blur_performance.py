"""Exercise actual GPU targets, per-view refreshes, final pixels and idle."""
import time
from PIL import Image


def run(evaluate, wait, check, screenshot, results):
    evaluate('''globalThis.pSaved=Object.fromEntries([
        'panel-blur','blur-filter-enabled','blur-method','blur-radius','blur-brightness',
        'refraction-enabled','refraction-strength','frosted-glass-enabled','blur-render-area',
        'blur-resolution','blur-refresh-rate'].map(k=>[k,cfg.get_value(k)]));
        cfg.set_boolean('panel-blur',false);cfg.set_boolean('blur-filter-enabled',true);
        cfg.set_int('blur-radius',24);cfg.set_double('blur-brightness',1);
        cfg.set_boolean('refraction-enabled',false);cfg.set_boolean('frosted-glass-enabled',false);
        cfg.set_string('blur-refresh-rate','100');
        globalThis.pSource=new St.Widget({width:global.stage.width,height:global.stage.height,
            style:'background-color:black;'});
        for(let x=0;x<global.stage.width;x+=40)pSource.add_child(new St.Widget({x,width:40,
            height:global.stage.height,style:`background-color:${x%80?'white':'black'};`}));
        Main.uiGroup.add_child(pSource);
        globalThis.pBox=new St.Widget({x:250,y:250,width:400,height:32,style:'background-color:transparent;'});
        Main.uiGroup.add_child(pBox);
        (async()=>{globalThis.pProbe=(await import('gi://FrameProbe')).default;
            const {Surface}=await import(ext.dir.get_uri()+'/core/surface.js');
            globalThis.pSurface=new Surface(pBox,pBox,cfg,ext._logger,{manageStyle:false,opacity:()=>0});})();''')
    wait('pSurface?._state.captures.size>0')
    geometry = {}
    for method in ['box', 'fast-gaussian', 'kawase']:
        for resolution in ['auto', 'half', 'quarter']:
            evaluate(f"cfg.set_string('blur-method','{method}');cfg.set_string('blur-resolution','{resolution}');pSurface.update()")
            time.sleep(.2)
            shot = Image.open(screenshot(f'performance-{method}-{resolution}')).convert('RGB')
            scale = shot.width / evaluate('global.stage.width')
            # The stripes must be blurred, not omitted, and preserve neutral RGB.
            pixels = [shot.getpixel((round(x*scale), round(266*scale))) for x in range(300, 600)]
            values = [p[0] for p in pixels]
            assert sum(25<v<230 for v in values) > 20, (method, resolution, 'blur missing')
            assert all(max(p)-min(p)<3 for p in pixels), (method, resolution, 'color contamination')
            state = evaluate('''[...pSurface._state.captures.values()].map(c=>{
                const f=c.effect._buffers.get('view')?.filter;
                return {width:c.actor.width,height:c.actor.height,reduction:f?.reduction,
                    target:f?[f.scratch.width,f.scratch.height]:null,failed:!!c.effect._failed};})''')
            assert state and all(s['target'] and not s['failed'] for s in state), state
            geometry[f'{method}-{resolution}'] = state
        a, h, q = [geometry[f'{method}-{r}'][0] for r in ['auto','half','quarter']]
        assert h['reduction'] == 2*a['reduction'] and q['reduction'] == 4*a['reduction']
        assert h['target'][0]*h['target'][1] < a['target'][0]*a['target'][1]
        assert q['target'][0]*q['target'][1] < h['target'][0]*h['target'][1]
    results['performance-filter-targets'] = geometry
    # All methods eliminate the legacy 320px minimum for this thin surface.
    assert all(round(geometry[f'{m}-auto'][0]['height']) < 320 for m in ['box','fast-gaussian','kawase'])
    evaluate('''for(const c of pSource.get_children())c.destroy();
        pSource.style='background-color:#204060;';
        globalThis.pPulse=new St.Widget({x:320,y:260,width:80,height:60,style:'background-color:#ff8040;'});
        pSource.add_child(pPulse);
        globalThis.pTimeline=new Clutter.Timeline({actor:pPulse,duration:700,repeat_count:-1});
        pTimeline.connect('new-frame',()=>pPulse.opacity=100+Math.round(155*pTimeline.get_progress()));
        globalThis.pEffect=()=>[...pSurface._state.captures.values()][0]?.effect;
        globalThis.pFrames=0;
        globalThis.pPaint=global.stage.connect('after-paint',(_stage,view)=>{
            if(view!==[...pSurface._state.captures.values()][0]?.view)return;
            pFrames++;
            const scale=view.get_scale(),r=view.layout;
            const data=pProbe.read(view.get_framebuffer(),Math.round((450-r.x)*scale),
                Math.round((266-r.y)*scale),1,1).get_data();
            globalThis.pLastPixel=Array.from(data).slice(0,3);
        });
        cfg.set_string('blur-resolution','auto');cfg.set_string('blur-method','kawase');pSurface.update();''')
    cadence = {}
    for mode in ['monitor', 'elements']:
        evaluate(f"cfg.set_string('blur-render-area','{mode}')")
        if mode == 'elements':
            wait('pSurface.guard._regional?.supported')
        for percent in [100, 50, 25]:
            evaluate(f"cfg.set_string('blur-refresh-rate','{percent}');pSurface.update();pTimeline.start()")
            time.sleep(.3)
            before = evaluate('({count:pEffect().statistics.captures,frames:pFrames,time:GLib.get_monotonic_time()})')
            time.sleep(2)
            after = evaluate('({count:pEffect().statistics.captures,frames:pFrames,time:GLib.get_monotonic_time()})')
            elapsed = (after['time']-before['time'])/1e6
            hz = evaluate('[...pSurface._state.captures.values()][0].view.get_refresh_rate()')
            captures = after['count']-before['count']
            frames = after['frames']-before['frames']
            cadence[f'{mode}-{percent}'] = dict(captures=captures, frames=frames, seconds=elapsed,
                monitorHz=hz, statistics=evaluate('({...pEffect().statistics})'))
            assert captures > elapsed*hz*percent/100*.35, cadence
            assert captures < elapsed*hz*percent/100*1.2+2, cadence
            if percent < 100:
                assert frames > captures*1.2, cadence
            # Stop on a new color. Read the presented view, not the separate
            # screenshot path, which deliberately bypasses the limiter.
            evaluate("pTimeline.stop();pPulse.visible=false;pSource.style='background-color:rgb(24,160,80);'")
            time.sleep(.4)
            pixel = evaluate('pLastPixel')
            assert all(abs(a-b)<4 for a,b in zip(pixel,[24,160,80])), (mode,percent,pixel)
            count = evaluate('pFrames')
            time.sleep(.8)
            assert evaluate('pFrames')-count <= 1, (mode,percent,'idle repaint loop')
            check(f'performance-{mode}-{percent}-no-pending-timer',
                  "[...pEffect()._buffers.values()].every(b=>!b.refreshSource)")
            evaluate("pSource.style='background-color:#204060;';pPulse.visible=true")
    results['performance-cadence'] = cadence
    for method in ['box', 'fast-gaussian', 'kawase']:
        evaluate(f"cfg.set_string('blur-method','{method}');cfg.set_string('blur-refresh-rate','25');pSurface.update();pTimeline.start()")
        before = evaluate('pEffect().statistics.rateReuses')
        wait(f'pEffect().statistics.rateReuses>{before}+2')
        evaluate('pBox.x+=64;pSurface.update()')
        wait('''[...pSurface._state.captures.values()].every(c=>{
            const b=c.effect._buffers.get('view'),a=c.actor;
            return b?.prepared && b.transform===`${a.get_transformed_position().join(':')}:${a.get_transformed_size().join(':')}`;
        })''')
        check(f'performance-{method}-moving-cache-healthy', '!pEffect()._failed')
        evaluate('pTimeline.stop()')
    # Staggered surfaces with overlapping capture margins must not keep waking
    # each other through region requests or trailing refreshes after motion.
    evaluate("cfg.set_string('blur-render-area','monitor');cfg.set_string('blur-refresh-rate','50');pSurface.update();pTimeline.start()")
    time.sleep(.02)
    evaluate('''globalThis.pPeerBox=new St.Widget({x:250,y:390,width:400,height:32,
        style:'background-color:transparent;'});Main.uiGroup.add_child(pPeerBox);
        (async()=>{const {Surface}=await import(ext.dir.get_uri()+'/core/surface.js');
            globalThis.pPeer=new Surface(pPeerBox,pPeerBox,cfg,ext._logger,{manageStyle:false,opacity:()=>0});})();''')
    wait("[...pPeer?._state.captures.values()??[]].some(c=>c.effect._buffers.get('view')?.prepared)")
    evaluate('''{const a=[...pSurface._state.captures.values()][0].actor;
        const [x,y]=a.get_transformed_position(),[w,h]=a.get_transformed_size();
        pPulse.set_position(Math.floor(x),Math.floor(y));
        pPulse.set_size(Math.ceil(x+w)-Math.floor(x),Math.ceil(y+h)-Math.floor(y));}''')
    peers = {}
    peer_updates = {}
    for mode in ['monitor', 'elements']:
        for percent in [100, 50, 25]:
            evaluate(f"cfg.set_string('blur-render-area','{mode}');cfg.set_string('blur-refresh-rate','{percent}');pSurface.update();pPeer.update();pTimeline.start()")
            counts = evaluate('[pEffect().statistics.captures,[...pPeer._state.captures.values()][0].effect.statistics.captures]')
            time.sleep(.7)
            updated = evaluate('[pEffect().statistics.captures,[...pPeer._state.captures.values()][0].effect.statistics.captures]')
            hz = evaluate('[...pSurface._state.captures.values()][0].view.get_refresh_rate()')
            assert all(b-a <= hz*.7*percent/100+4 for a,b in zip(counts,updated)), (mode,percent,counts,updated)
            peer_updates[f'{mode}-{percent}'] = [b-a for a,b in zip(counts,updated)]
            evaluate('pTimeline.stop()')
            time.sleep(.4)
            before = evaluate('pFrames')
            time.sleep(.7)
            peers[f'{mode}-{percent}'] = evaluate('pFrames')-before
            assert peers[f'{mode}-{percent}'] <= 1, (mode,percent,'surfaces wake each other',peers)
    results['performance-peer-idle-frames'] = peers
    results['performance-peer-captures-in-700ms'] = peer_updates
    evaluate('pPeer.destroy();pPeerBox.destroy()')
    # Destroy during the pending final refresh: every timeout must be removed.
    evaluate("cfg.set_string('blur-refresh-rate','25');pSurface.update();pTimeline.start()")
    wait("pEffect()._buffers.get('view')?.refreshSource>0")
    evaluate('''globalThis.pBuffers=[...pEffect()._buffers.values()];
        pTimeline.stop();pTimeline.run_dispose();pSurface.destroy();pBox.destroy();pSource.destroy();
        global.stage.disconnect(pPaint);for(const [k,v] of Object.entries(pSaved))cfg.set_value(k,v);''')
    check('performance-destroy-cancels-timers', 'pBuffers.every(b=>!b.refreshSource)')
