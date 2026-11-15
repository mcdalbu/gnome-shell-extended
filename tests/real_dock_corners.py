"""Actual Dash to Dock Extended actors, loaded only on the private test bus."""
import time
from PIL import Image, ImageStat


def run(evaluate, wait, check, screenshot, results):
    evaluate('''globalThis.realCornerSaved=Object.fromEntries([
        'blur-filter-enabled','blur-method','blur-samples','blur-radius','blur-brightness',
        'refraction-enabled','frosted-glass-enabled','docks-enabled','dock-blur','dock-opacity'
        ].map(k=>[k,cfg.get_value(k)]));
        cfg.set_boolean('blur-filter-enabled',true);cfg.set_boolean('refraction-enabled',false);
        cfg.set_boolean('frosted-glass-enabled',false);cfg.set_boolean('docks-enabled',true);
        cfg.set_boolean('dock-blur',true);cfg.set_double('dock-opacity',.8);
        cfg.set_double('blur-brightness',.8);cfg.set_int('blur-radius',24);
        globalThis.realCornerBackdrop=new St.Widget({width:global.stage.width,height:global.stage.height,
            style:'background-color:white;'});Main.uiGroup.add_child(realCornerBackdrop);
        const source=Gio.SettingsSchemaSource.new_from_directory(
            GLib.build_filenamev([GLib.get_user_data_dir(),'gnome-shell','extensions','dash-to-dock-extended@local','schemas']),
            Gio.SettingsSchemaSource.get_default(),false);
        const dockConfig=new Gio.Settings({settings_schema:source.lookup('org.gnome.shell.extensions.dash-to-dock-extended',false)});
        dockConfig.set_boolean('show-trash',false);dockConfig.set_boolean('show-mounts',false);
        Main.extensionManager.enableExtension('dash-to-dock-extended@local');''')
    wait('Main.extensionManager.lookup("dash-to-dock-extended@local")?.state===1')
    evaluate('''(async()=>{globalThis.realCornerModule=await import(Main.extensionManager.lookup('dash-to-dock-extended@local').dir.get_uri()+'/extension.js')})()''')
    wait('globalThis.realCornerModule?.dockManager?.mainDock')
    evaluate('''globalThis.realCornerSettings=realCornerModule.dockManager.extension.getSettings();
        realCornerSettings.set_enum('dock-position',St.Side.BOTTOM);
        for(const [k,v] of [['dock-fixed',true],['autohide',false],['intellihide',false],['show-mounts',false],['show-trash',false]])
            if(realCornerSettings.settings_schema.has_key(k))realCornerSettings.set_boolean(k,v);
        globalThis.realCornerDock=()=>realCornerModule.dockManager.mainDock;
        globalThis.realCornerSurface=()=>ext._manager._slots.get('docks').instance.records.get(realCornerDock())?.binding.surface;
        Main.overview.hide();''')
    wait('realCornerSurface()?._state.captures.size>0 && realCornerSurface().group.visible')
    evaluate('''const parent=realCornerSurface().group.get_parent();
        if(realCornerBackdrop.get_parent()!==parent){realCornerBackdrop.get_parent().remove_child(realCornerBackdrop);parent.insert_child_below(realCornerBackdrop,realCornerSurface().group);}
        else parent.set_child_below_sibling(realCornerBackdrop,realCornerSurface().group);''')
    time.sleep(.5)
    results['real-dock-corner-geometry']=evaluate('''(()=>{const s=realCornerSurface();return {
        rect:[...s.box.get_transformed_position(),...s.box.get_transformed_size()],radius:s.clip.radius};})()''')
    for samples in [5,9,13]:
        evaluate(f"cfg.set_string('blur-method','fast-gaussian');cfg.set_string('blur-samples','{samples}')")
        wait(f'realCornerSurface()?._state.glassConfig.samples==={samples}')
        time.sleep(.2)
        check(f'real-dock-gaussian-{samples}', '''realCornerSurface().clip.shaderClip &&
            [...realCornerSurface()._state.captures.values()].every(c=>!c.effect._failed)''')
        picture=Image.open(screenshot(f'real-dock-gaussian-{samples}')).convert('RGB')
        scale=picture.width/evaluate('global.stage.width')
        x,y,w,h=results['real-dock-corner-geometry']['rect']
        rect=tuple(round(v*scale) for v in (x,y,x+w,y+h))
        assert max(ImageStat.Stat(picture.crop(rect)).mean)<240, 'Dock is obscured in the screenshot'
    evaluate("cfg.set_string('blur-method','box');cfg.set_boolean('refraction-enabled',true)")
    time.sleep(.3)
    screenshot('real-dock-box-distortion')
    check('real-dock-foreground-opaque', 'realCornerDock().dash.opacity===255')
    evaluate('''globalThis.realFrostInterface=new Gio.Settings({schema_id:'org.gnome.desktop.interface'});
        globalThis.realFrostTheme=realFrostInterface.get_string('color-scheme');
        cfg.set_boolean('blur-filter-enabled',false);cfg.set_boolean('refraction-enabled',false);
        cfg.set_boolean('frosted-glass-enabled',true);''')
    wait('realCornerSurface()?._state.glass?.mapped && realCornerSurface()._state.captures.size===0')
    for theme in ['dark','light']:
        evaluate(f"realFrostInterface.set_string('color-scheme','prefer-{theme}')")
        time.sleep(.2)
        check(f'real-dock-frost-{theme}-fills-surface', '''(()=>{
            const s=realCornerSurface(),g=s._state.glass,b=g.get_content_box();
            return !s.backend && !s._stopDamage && !s._state.captures.size &&
                Math.abs(b.get_width()-g.width)<.01 && Math.abs(b.get_height()-g.height)<.01;
        })()''')
        screenshot(f'real-dock-frost-{theme}-blur-off')
    evaluate("realFrostInterface.set_string('color-scheme',realFrostTheme)")
    evaluate("Main.extensionManager.disableExtension('dash-to-dock-extended@local');realCornerBackdrop.destroy();for(const [k,v] of Object.entries(realCornerSaved))cfg.set_value(k,v)")
    wait('ext._manager._slots.size===2')
