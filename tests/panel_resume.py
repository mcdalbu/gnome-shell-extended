"""Recreate the unlock ordering without suspending or locking the user's PC."""
import time
from PIL import Image, ImageChops, ImageStat


def run(evaluate, wait, check, screenshot, results):
    evaluate('''globalThis.resumeSaved=Object.fromEntries([
        'panel-blur','panel-static-blur','panel-auto-opacity','panel-opacity','panel-style',
        'blur-enabled','blur-filter-enabled','blur-radius','blur-method','blur-brightness','refraction-enabled','frosted-glass-enabled'
        ].map(k=>[k,cfg.get_value(k)]));
        cfg.set_boolean('panel-blur',true);cfg.set_boolean('panel-static-blur',false);
        cfg.set_boolean('panel-auto-opacity',false);cfg.set_double('panel-opacity',.15);
        cfg.set_string('panel-style','dark');cfg.set_boolean('blur-enabled',true);
        cfg.set_boolean('blur-filter-enabled',true);cfg.set_int('blur-radius',24);
        cfg.set_string('blur-method','fast-gaussian');cfg.set_double('blur-brightness',1);cfg.set_boolean('refraction-enabled',false);
        cfg.set_boolean('frosted-glass-enabled',false);
        globalThis.resumePanel=()=>ext._manager._slots.get('panel')?.instance;
        globalThis.resumeSurface=()=>resumePanel()?.binding.surface;
        globalThis.resumePattern=new St.Widget({width:global.stage.width,height:64,style:'background-color:black;'});
        for(let x=0;x<global.stage.width;x+=20)resumePattern.add_child(new St.Widget({x,width:20,height:64,
            style:`background-color:${x%40?'white':'black'};`}));
        Main.uiGroup.insert_child_below(resumePattern,Main.layoutManager.panelBox);
        globalThis.resumeOverviewEvents=0;
        globalThis.resumeOverviewId=Main.overview.connect('showing',()=>resumeOverviewEvents++);''')
    wait('resumeSurface()?._state.captures.size>0')
    time.sleep(.3)
    before=Image.open(screenshot('panel-before-suspend')).convert('RGB')
    try:
        # ScreenShield._continueDeactivate() pops unlock-dialog first. Its
        # active=false signal follows only after the native unlock animation.
        # Keep the real actor and emitters, but never open an auth dialog.
        evaluate('''globalThis.resumeOldPanel=resumePanel();
            Main.screenShield._isActive=true;Main.screenShield.emit('active-changed');
            ext._manager.setSuspended(true);ext._manager.setSuspended(false);''')
        wait('resumePanel() && resumePanel()!==resumeOldPanel && resumeSurface() && !resumeSurface()._framesActive')
        check('panel-resume-recreated-under-shield', 'Main.screenShield.active && !resumeSurface().group.visible')
        evaluate("Main.screenShield._isActive=false;Main.screenShield.emit('active-changed')")
        time.sleep(.5)
        resumed=evaluate('!!(resumeSurface()?.group.visible && resumeSurface()._framesActive && resumeSurface()._state.captures.size)')
        results['panel-resume-without-overview']=resumed
        if not resumed:
            # Record the reported workaround, so a failing baseline explains
            # this regression rather than just timing out on an empty texture.
            evaluate('Main.overview.show()')
            wait('!Main.overview.animationInProgress')
            evaluate('Main.overview.hide()')
            wait('resumeSurface()?._state.captures.size>0')
            results['panel-resume-overview-workaround']=True
            raise AssertionError('Panel stays dormant after shield removal until Overview is toggled')
        check('panel-resume-no-overview-events','resumeOverviewEvents===0')
        check('panel-resume-captures-healthy', '[...resumeSurface()._state.captures.values()].every(c=>!c.effect._failed)')
        after=Image.open(screenshot('panel-resumed')).convert('RGB')
        x,y,w,h=evaluate('[...Main.panel.get_transformed_position(),...Main.panel.get_transformed_size()]')
        scale=after.width/evaluate('global.stage.width')
        crop=tuple(round(v*scale) for v in (x+w*.15,y+5,x+w*.3,y+h-5))
        difference=ImageStat.Stat(ImageChops.difference(before.crop(crop),after.crop(crop))).mean
        results['panel-resume-pixel-difference']=difference
        assert max(difference)<2, ('Panel did not restore its rendered blur',difference)
        # A second screen-shield cycle can occur without a module reload.
        evaluate("Main.screenShield._isActive=true;Main.screenShield.emit('active-changed');global.stage.queue_redraw()")
        wait('!resumeSurface().group.visible && !resumeSurface()._framesActive')
        check('panel-resume-shield-pauses-damage', '!resumeSurface()._stopDamage')
        evaluate("Main.screenShield._isActive=false;Main.screenShield.emit('active-changed')")
        wait('resumeSurface().group.visible && resumeSurface()._framesActive && resumeSurface()._stopDamage')
        check('panel-resume-second-cycle', 'resumeOverviewEvents===0')
        time.sleep(.5)
        evaluate("globalThis.resumeIdle=0;globalThis.resumeIdleId=global.stage.connect('after-paint',()=>resumeIdle++)")
        time.sleep(.7)
        results['panel-resume-idle-frames']=evaluate('resumeIdle')
        check('panel-resume-no-idle-loop', 'resumeIdle<=1')
        evaluate('global.stage.disconnect(resumeIdleId)')
        # Exercise the real SessionMode signal chain too. Only the private
        # mode stack changes: no lock dialog, credentials or system suspend.
        evaluate("""globalThis.resumeNativeOldPanel=resumePanel();
            Main.screenShield._isActive=true;Main.screenShield.emit('active-changed');
            Main.sessionMode.pushMode('unlock-dialog');""")
        wait("Main.sessionMode.isLocked && !ext._manager._slots.has('panel')")
        check('panel-resume-native-mode-suspends', 'Main.screenShield.active')
        evaluate("Main.sessionMode.popMode('unlock-dialog')")
        wait('!Main.sessionMode.isLocked && resumePanel() && resumePanel()!==resumeNativeOldPanel && resumeSurface() && !resumeSurface()._framesActive')
        evaluate("Main.screenShield._isActive=false;Main.screenShield.emit('active-changed')")
        wait('resumeSurface().group.visible && resumeSurface()._framesActive && resumeSurface()._state.captures.size>0')
        check('panel-resume-native-session-order', 'resumeOverviewEvents===0')
        # A disabled surface must not retain shield/session callbacks or wake
        # again when a later unlock is signalled.
        evaluate("""globalThis.resumeDisposed=resumeSurface();globalThis.resumeLateCalls=0;
            const original=resumeDisposed._queueLayoutSync;
            resumeDisposed._queueLayoutSync=function(...args){resumeLateCalls++;return original.apply(this,args)};
            cfg.set_boolean('panel-blur',false);""")
        wait('!resumeSurface()')
        evaluate("resumeLateCalls=0;Main.screenShield.emit('active-changed')")
        check('panel-resume-disabled-cleans-signals', 'resumeLateCalls===0 && resumeDisposed._destroyed')
    finally:
        evaluate('''if(Main.sessionMode.currentMode==='unlock-dialog')Main.sessionMode.popMode('unlock-dialog');
            Main.screenShield._isActive=false;Main.screenShield.emit('active-changed');
            ext._manager.setSuspended(false);Main.overview.disconnect(resumeOverviewId);resumePattern.destroy();
            for(const [key,value] of Object.entries(resumeSaved))cfg.set_value(key,value);''')
