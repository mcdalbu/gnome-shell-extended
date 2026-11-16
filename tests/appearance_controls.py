"""The two independent UI toggles control every shared surface path."""
import time


def run(evaluate, wait, check, screenshot, results):
    evaluate('''globalThis.controlsSaved=Object.fromEntries([
        'blur-filter-enabled','refraction-enabled','frosted-glass-enabled','blur-method',
        'blur-radius','refraction-strength','panel-blur','panel-auto-opacity',
        'docks-enabled','dock-blur','surface-opacity'
        ].map(k=>[k,cfg.get_value(k)]));
        globalThis.controlsModule=n=>ext._manager._slots.get(n)?.instance;
        globalThis.controlsMenu=Main.panel.statusArea.quickSettings.menu;
        globalThis.controlsMenuSurface=()=>controlsModule('blur').bindings.get(controlsMenu.actor)?.surface;
        cfg.set_boolean('panel-blur',true);cfg.set_boolean('panel-auto-opacity',false);
        cfg.set_double('surface-opacity',.35);cfg.set_int('blur-radius',24);
        cfg.set_double('refraction-strength',6);cfg.set_boolean('frosted-glass-enabled',false);
        cfg.set_boolean('docks-enabled',true);cfg.set_boolean('dock-blur',true);
        globalThis.controlsDock=new St.Widget({name:'dashtodockContainer',x:80,y:500,width:420,height:70});
        controlsDock.add_child(new St.Widget({style_class:'dash-background',width:420,height:70,
            style:'background-color:rgb(40,40,40);border-radius:18px;'}));
        Main.uiGroup.add_child(controlsDock);controlsMenu.open();
        globalThis.controlsSurfaces=()=>[controlsMenuSurface(),controlsModule('panel').binding.surface,
            controlsModule('docks')?.records.get(controlsDock)?.binding.surface];''')
    wait('controlsModule("docks")?.records.get(controlsDock)?.binding.surface')
    for method in ['box', 'fast-gaussian', 'kawase']:
        evaluate(f"cfg.set_string('blur-method','{method}')")
        for blur, distortion in [(True, True), (False, True), (True, False), (False, False)]:
            evaluate(f"cfg.set_boolean('blur-filter-enabled',{str(blur).lower()});cfg.set_boolean('refraction-enabled',{str(distortion).lower()})")
            active = blur or distortion
            wait('controlsSurfaces().every(s=>s' + ('?._state?.captures.size>0)' if active else ' && !s._state)'))
            if active:
                time.sleep(.15)
                check(f'toggles-{method}-{blur}-{distortion}', f'''controlsSurfaces().every(s=>
                    s._state.glassConfig.blurRadius==={24 if blur else 0} &&
                    s._state.glassConfig.strength==={6 if distortion else 0} &&
                    [...s._state.captures.values()].every(c=>!c.effect._failed &&
                        [...c.effect._buffers.values()].{'some' if blur else 'every'}(b=>{'!!b.filter' if blur else '!b.filter'})))''')
            else:
                check('toggles-off-no-captures-' + method, 'controlsSurfaces().every(s=>!s.backend && !s._stopDamage)')
            screenshot(f'toggles-{method}-{int(blur)}-{int(distortion)}')
    evaluate("cfg.set_boolean('blur-filter-enabled',true);cfg.set_boolean('refraction-enabled',true);cfg.set_boolean('frosted-glass-enabled',true)")
    wait('controlsSurfaces().every(s=>s?._state?.glass?.mapped && s._state.captures.size>0)')
    check('frost-above-sampling', 'controlsSurfaces().every(s=>s.blur.get_last_child()===s._state.glass)')
    evaluate("cfg.set_boolean('blur-filter-enabled',false);cfg.set_boolean('refraction-enabled',false)")
    wait('controlsSurfaces().every(s=>s?._state?.glass?.mapped && !s._state.captures.size)')
    check('frost-only-no-captures', 'controlsSurfaces().every(s=>!s.backend && !s._stopDamage)')
    evaluate('controlsMenu.close();controlsDock.destroy();for(const [k,v] of Object.entries(controlsSaved))cfg.set_value(k,v)')
    wait('!controlsMenuSurface() && ext._manager._slots.size===2')
