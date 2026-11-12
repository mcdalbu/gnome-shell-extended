"""Verify Mutter places a real maximized window against the unchanged panel."""
import time


def test_panel_gap(evaluate, wait, check, screenshot, results):
    evaluate('''globalThis.gapPanel=()=>ext._manager._slots.get('panel').instance;
        globalThis.gapGeometry=()=>({panel:[...Main.panel.get_transformed_position(),...Main.panel.get_transformed_size()],
            box:[...Main.layoutManager.panelBox.get_transformed_position(),...Main.layoutManager.panelBox.get_transformed_size()],
            frame:((r)=>({x:r.x,y:r.y,width:r.width,height:r.height}))(policyWindow.get_frame_rect()),
            area:((r)=>({x:r.x,y:r.y,width:r.width,height:r.height}))(global.workspace_manager.get_active_workspace().get_work_area_for_monitor(policyWindow.get_monitor()))});
        globalThis.gapOriginalBoxStyle=Main.layoutManager.panelBox.get_style();
        cfg.set_boolean('panel-remove-gap',false);''')
    time.sleep(0.2)
    results['panel-gap-native'] = evaluate('gapGeometry()')
    # Reproduce a theme reserving an extra row below the actual panel. This
    # fixture changes the reservation, not the maximized window's coordinates.
    evaluate("Main.layoutManager.panelBox.set_style('padding-bottom:1px;');")
    wait('(()=>{const g=gapGeometry();return g.frame.y>Math.floor(g.panel[1]+g.panel[3]+1e-6);})()')
    evaluate('globalThis.gapBefore=gapGeometry();cfg.set_boolean("panel-remove-gap",true);')
    wait('(()=>{const g=gapGeometry();return g.frame.y===Math.floor(g.panel[1]+g.panel[3]+1e-6);})()')
    results['panel-gap-corrected'] = evaluate('gapGeometry()')
    check('panel-gap-window-meets-panel',
          '(()=>{const g=gapGeometry();return g.frame.y===g.area.y && g.frame.y<=g.panel[1]+g.panel[3] && g.panel[1]+g.panel[3]-g.frame.y<1;})()')
    check('panel-gap-panel-not-extended', 'gapGeometry().panel.every((v,i)=>v===gapBefore.panel[i])')
    check('panel-gap-no-painted-extension', "!Main.uiGroup.get_children().some(a=>a.name==='gse-panel-bottom-extension')")
    screenshot('panel-gap-maximized')
    evaluate('policyWindow.unmaximize();')
    wait('!policyWindow.maximized_vertically && !policyWindow.maximized_horizontally')
    time.sleep(0.3)
    evaluate('globalThis.gapNormalFrame=policyWindow.get_frame_rect();cfg.set_boolean("panel-remove-gap",false);')
    time.sleep(0.3)
    check('panel-gap-normal-window-preserved', '(()=>{const r=policyWindow.get_frame_rect();return ["x","y","width","height"].every(k=>r[k]===gapNormalFrame[k]);})()')
    evaluate('policyWindow.maximize();')
    wait('policyWindow.maximized_vertically && policyWindow.get_frame_rect().y===gapBefore.frame.y')
    check('panel-gap-disabled-restores-reservation', 'gapGeometry().area.y===gapBefore.area.y')
    evaluate('cfg.set_boolean("panel-remove-gap",true);')
    wait('!!gapPanel().gap.reservation')
    evaluate('cfg.set_boolean("panel-enabled",false);')
    wait('!ext._manager._slots.get("panel")?.instance && policyWindow.get_frame_rect().y===gapBefore.frame.y')
    check('panel-gap-disable-cleans-reservation', "!Main.uiGroup.get_children().some(a=>a.name==='gse-panel-reservation')")
    evaluate('Main.layoutManager.panelBox.set_style(gapOriginalBoxStyle);cfg.set_boolean("panel-remove-gap",false);cfg.set_boolean("panel-enabled",true);')
    wait('gapPanel()?.binding')
