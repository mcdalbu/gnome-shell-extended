"""Exercise the extra panel row in the isolated Shell, including painted pixels."""
import time
import gi
gi.require_version('GdkPixbuf', '2.0')
from gi.repository import GdkPixbuf


def test_panel_extension(evaluate, wait, check, screenshot):
    evaluate('''globalThis.extensionPanel=()=>ext._manager._slots.get('panel').instance;
        globalThis.originalPanelGeometry=[Main.panel.x,Main.panel.y,Main.panel.width,Main.panel.height];
        globalThis.originalWorkArea=global.workspace_manager.get_active_workspace().get_work_area_for_monitor(0);
        cfg.set_boolean('panel-auto-opacity',false);
        cfg.set_boolean('panel-blur',true);
        cfg.set_double('panel-opacity',0.5);
        cfg.set_boolean('panel-extend-bottom',true);''')
    wait('extensionPanel().bottomExtension.mapped && extensionPanel().binding.surface?.blur.mapped')
    time.sleep(0.3)
    check('panel-extension-blur-height',
          'Math.abs(extensionPanel().binding.surface.blur.get_transformed_size()[1]-Main.panel.get_transformed_size()[1]-1)<0.01')
    check('panel-extension-row-geometry', '''(()=>{
        const strip=extensionPanel().bottomExtension;
        const [px,py]=Main.panel.get_transformed_position();
        const [pw,ph]=Main.panel.get_transformed_size();
        const [x,y]=strip.get_transformed_position();const [w,h]=strip.get_transformed_size();
        return Math.abs(x-px)<0.01 && Math.abs(y-py-ph)<0.01 && Math.abs(w-pw)<0.01 && Math.abs(h-1)<0.01;
    })()''')
    check('panel-extension-preserves-layout', '''(()=>{
        const area=global.workspace_manager.get_active_workspace().get_work_area_for_monitor(0);
        return [Main.panel.x,Main.panel.y,Main.panel.width,Main.panel.height].every((v,i)=>v===originalPanelGeometry[i]) &&
            ['x','y','width','height'].every(k=>area[k]===originalWorkArea[k]);
    })()''')
    evaluate("cfg.set_boolean('panel-blur',false);cfg.set_string('panel-style','dark');cfg.set_double('panel-opacity',1);")
    time.sleep(0.35)
    check('panel-extension-without-blur', 'extensionPanel().bottomExtension.mapped && !extensionPanel().binding.surface')
    image = GdkPixbuf.Pixbuf.new_from_file(str(screenshot('panel-extended-bottom')))
    x, y = evaluate('extensionPanel().bottomExtension.get_transformed_position()')
    offset = round(y) * image.get_rowstride() + round(x + 100) * image.get_n_channels()
    pixel = list(image.get_pixels()[offset:offset+3])
    check('panel-extension-painted-pixel', str(all(abs(a-b) <= 2 for a, b in zip(pixel, [25, 25, 28]))).lower())
    evaluate('Main.overview.show();')
    wait('extensionPanel().overviewActive && !extensionPanel().overviewOpening')
    check('panel-extension-hidden-overview', '!extensionPanel().bottomExtension.visible')
    evaluate('Main.overview.hide();')
    wait('extensionPanel().fade.value===1 && !extensionPanel().returnPending && extensionPanel().bottomExtension.mapped')
    evaluate("cfg.set_boolean('panel-extend-bottom',false);cfg.set_boolean('panel-blur',true);cfg.set_double('panel-opacity',0.5);")
    wait('extensionPanel().binding.surface?.blur.mapped')
    check('panel-extension-disabled', '!extensionPanel().bottomExtension.visible && Math.abs(extensionPanel().binding.surface.blur.height-Main.panel.height)<0.01')
    evaluate("for(const key of ['panel-auto-opacity','panel-blur','panel-opacity','panel-style'])cfg.reset(key);")
