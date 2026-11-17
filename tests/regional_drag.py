"""Native pointer grab of a translucent Wayland client near the real dock."""
import os
import subprocess
import time


def run(evaluate, wait, check, results, root, log):
    evaluate('''globalThis.dragSaved=Object.fromEntries([
        'panel-blur','panel-auto-opacity','panel-opacity','blur-method','blur-samples',
        'blur-render-area','blur-radius','blur-refresh-rate','docks-enabled','dock-blur',
        'opacity-enabled','opacity-ptyxis','windows-blur'].map(k=>[k,cfg.get_value(k)]));
        scene.hide();cfg.set_boolean('panel-blur',true);cfg.set_boolean('panel-auto-opacity',false);
        cfg.set_double('panel-opacity',.3);cfg.set_string('blur-method','fast-gaussian');
        cfg.set_string('blur-samples','9');cfg.set_int('blur-radius',24);
        cfg.set_string('blur-refresh-rate','100');
        (async()=>{globalThis.dragDockModule=await import(Main.extensionManager.lookup('dash-to-dock-extended@local').dir.get_uri()+'/extension.js');})();''')
    wait('dragDockModule?.dockManager?.mainDock')
    evaluate('''globalThis.dragDock=dragDockModule.dockManager.mainDock;
        globalThis.dragDockSettings=dragDockModule.dockManager.extension.getSettings();
        dragDockSettings.set_enum('dock-position',St.Side.BOTTOM);
        dragDockSettings.set_boolean('dock-fixed',false);dragDockSettings.set_boolean('intellihide',true);
        dragDockSettings.set_enum('intellihide-mode',0);dragDockSettings.set_boolean('autohide',true);
        dragDockSettings.set_boolean('require-pressure-to-show',false);
        dragDockSettings.set_double('animation-time',.2);
        globalThis.dragBackend=global.stage.get_context().get_backend();
        globalThis.dragPointer=dragBackend.get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        globalThis.dragNativeGrab=false;
        globalThis.dragBeginSignal=global.display.connect('grab-op-begin',()=>dragNativeGrab=true);
        globalThis.dragEndSignal=global.display.connect('grab-op-end',()=>dragNativeGrab=false);''')
    env=dict(os.environ,WAYLAND_DISPLAY=evaluate('GLib.getenv("WAYLAND_DISPLAY")'),GTK_A11Y='none')
    client=subprocess.Popen(['gjs','-m',str(root/'tests/windowFade.js')],env=env,stdout=log,stderr=log)
    try:
        wait("['GSE fade target','GSE fade cover'].every(t=>global.get_window_actors().some(a=>a.meta_window.get_title()===t && a.mapped))")
        evaluate('''globalThis.dragActor=global.get_window_actors().find(a=>a.meta_window.get_title()==='GSE fade target');
            global.get_window_actors().find(a=>a.meta_window.get_title()==='GSE fade cover').meta_window.minimize();
            globalThis.dragMonitor=Main.layoutManager.primaryMonitor;
            globalThis.dragStart=[dragMonitor.x+Math.max(50,(dragMonitor.width-600)/2),dragMonitor.y+Math.max(70,dragMonitor.height-600)];
            dragActor.meta_window.move_resize_frame(false,...dragStart,600,360);
            dragActor.meta_window.activate(global.get_current_time());''')
        wait('global.display.focus_window===dragActor.meta_window')
        measurements={}
        for effects in [False,True]:
            evaluate(f"cfg.set_boolean('docks-enabled',{str(effects).lower()});cfg.set_boolean('dock-blur',true);cfg.set_boolean('opacity-enabled',{str(effects).lower()});cfg.set_boolean('opacity-ptyxis',{str(effects).lower()});cfg.set_boolean('windows-blur',true)")
            if effects:
                wait("ext._manager._slots.get('opacity')?.instance.windowBlur?._visible.size>0 && ext._manager._slots.get('docks')?.instance.records.has(dragDock)")
            for mode in ['monitor','elements']:
                evaluate(f"cfg.set_string('blur-render-area','{mode}');dragActor.meta_window.move_frame(false,...dragStart)")
                time.sleep(.6)
                evaluate('''globalThis.dragFrames=[];globalThis.dragStarted=0;
                    globalThis.dragBefore=global.stage.connect('before-update',()=>dragStarted=GLib.get_monotonic_time());
                    globalThis.dragPaint=global.stage.connect('after-paint',(_s,view)=>{
                        if(view.layout.x!==dragMonitor.x)return;
                        const surface=ext._manager._slots.get('docks')?.instance.records.get(dragDock)?.binding.surface;
                        const state=ext._manager._slots.get('opacity')?.instance.windowBlur?._windows.get(dragActor);
                        const counters=s=>[...(s?.captures??new Map()).values()].reduce((n,c)=>n+c.effect.statistics.captures,0);
                        dragFrames.push({time:GLib.get_monotonic_time(),drawUs:GLib.get_monotonic_time()-dragStarted,
                            slide:dragDock._slider.slideX,y:dragActor.meta_window.get_frame_rect().y,
                            grabbing:dragNativeGrab,regional:!!state?.guard._usingRegional,
                            panelRegional:!!ext._manager._slots.get('panel')?.instance.binding.surface?.guard._usingRegional,
                            dockCaptures:counters(surface?._state),windowCaptures:counters(state)});
                    });
                    dragPointer.notify_absolute_motion(GLib.get_monotonic_time(),dragStart[0]+100,dragStart[1]+30);
                    dragPointer.notify_button(GLib.get_monotonic_time(),1,Clutter.ButtonState.PRESSED);
                    globalThis.dragButtonDown=true;''')
                time.sleep(.08)
                ok=evaluate('dragActor.meta_window.begin_grab_op(Meta.GrabOp.MOVING,dragBackend.get_pointer_sprite(global.stage),global.get_current_time(),null)')
                assert ok,'Native pointer grab did not start'
                wait('dragNativeGrab')
                evaluate('''globalThis.dragTimeline=new Clutter.Timeline({actor:dragActor,duration:1600});
                    dragTimeline.connect('new-frame',()=>{
                        const delta=(dragMonitor.y+dragMonitor.height-330-dragStart[1])*Math.sin(Math.PI*dragTimeline.get_progress());
                        dragPointer.notify_absolute_motion(GLib.get_monotonic_time(),dragStart[0]+100,dragStart[1]+30+delta);
                    });dragTimeline.start();''')
                time.sleep(1.9)
                evaluate('dragPointer.notify_button(GLib.get_monotonic_time(),1,Clutter.ButtonState.RELEASED);dragButtonDown=false')
                wait('!dragNativeGrab')
                time.sleep(.4)
                evaluate('global.stage.disconnect(dragBefore);global.stage.disconnect(dragPaint);dragTimeline.stop();dragTimeline.run_dispose()')
                frames=evaluate('dragFrames')
                moving=[(a,b) for a,b in zip(frames,frames[1:]) if a['y']!=b['y']]
                intervals=[(b['time']-a['time'])/1000 for a,b in moving]
                draws=sorted(f['drawUs']/1000 for f in frames)
                measurements[f'{mode}-effects-{effects}']={
                    'frames':frames,'maxIntervalMs':max(intervals),'p95DrawMs':draws[int(len(draws)*.95)],
                    'maxDrawMs':max(draws)}
                assert max(f['y'] for f in frames)-min(f['y'] for f in frames)>150
                assert min(f['slide'] for f in frames)<.1 and max(f['slide'] for f in frames)>.9
                assert all(not b['regional'] and not b['panelRegional'] for a,b in moving if b['grabbing']), 'Drag entered deferred regional rendering'
                if effects:
                    assert all(b['windowCaptures']>a['windowCaptures'] for a,b in moving if b['grabbing']), 'Moving backdrop reused a stale capture'
                if mode=='elements':
                    evaluate('''globalThis.dragResumed=null;
                        globalThis.dragResumeId=global.stage.connect('after-paint',(_stage,view)=>{
                            if(view.layout.x!==dragMonitor.x || view.layout.y!==dragMonitor.y)return;
                            dragResumed=!!ext._manager._slots.get('panel').instance.binding.surface?.guard._usingRegional;
                        });dragActor.queue_redraw();''')
                    wait('dragResumed!==null')
                    check(f'regional-drag-resumes-{effects}', 'dragResumed')
                    evaluate('global.stage.disconnect(dragResumeId)')
                time.sleep(.4)
                evaluate("globalThis.dragIdle=0;globalThis.dragIdleId=global.stage.connect('after-paint',()=>dragIdle++)")
                time.sleep(.6)
                results.setdefault('regional-drag-idle-frame-counts',{})[f'{effects}-{mode}']=evaluate('dragIdle')
                check(f'regional-drag-idle-{effects}-{mode}', 'dragIdle<=1')
                evaluate('global.stage.disconnect(dragIdleId)')
        results['regional-native-drag']=measurements
    finally:
        evaluate('''if(globalThis.dragButtonDown)dragPointer.notify_button(GLib.get_monotonic_time(),1,Clutter.ButtonState.RELEASED);
            dragPointer.run_dispose();
            global.display.disconnect(dragBeginSignal);global.display.disconnect(dragEndSignal);
            for(const [k,v] of Object.entries(dragSaved))cfg.set_value(k,v);scene.show();''')
        client.terminate();client.wait(timeout=5)
