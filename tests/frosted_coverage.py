"""Pixel regression: the shared 64px frost tile must cover the whole actor."""
import time
from PIL import Image, ImageStat


def run(evaluate, wait, check, screenshot, results):
    evaluate('''globalThis.frostSaved=Object.fromEntries([
        'blur-filter-enabled','refraction-enabled','frosted-glass-enabled',
        'docks-enabled','dock-blur','dock-opacity'
        ].map(k=>[k,cfg.get_value(k)]));
        globalThis.frostInterface=new Gio.Settings({schema_id:'org.gnome.desktop.interface'});
        globalThis.frostTheme=frostInterface.get_string('color-scheme');
        cfg.set_boolean('blur-filter-enabled',false);cfg.set_boolean('refraction-enabled',false);
        cfg.set_boolean('frosted-glass-enabled',false);cfg.set_boolean('docks-enabled',true);
        cfg.set_boolean('dock-blur',true);cfg.set_double('dock-opacity',.55);
        globalThis.frostBackdrop=new St.Widget({width:global.stage.width,height:global.stage.height});
        Main.uiGroup.add_child(frostBackdrop);
        globalThis.frostDocks=Main.layoutManager.monitors.map(m=>{
            const dock=new St.Widget({name:'dashtodockContainer',x:m.x+32,y:m.y+100,
                width:Math.min(640,m.width-64),height:160});
            dock.add_child(new St.Widget({style_class:'dash-background',width:dock.width,height:160,
                style:'background-color:rgb(70,70,70);border-radius:20px;border-width:0;box-shadow:none;'}));
            Main.uiGroup.add_child(dock);return dock;});
        globalThis.frostSurface=d=>ext._manager._slots.get('docks').instance.records.get(d)?.binding.surface;''')
    wait('frostDocks.every(d=>frostSurface(d))')
    for theme, backdrop in [('dark', 'white'), ('light', 'black')]:
        evaluate(f"frostInterface.set_string('color-scheme','prefer-{theme}');frostBackdrop.style='background-color:{backdrop};'")
        time.sleep(.2)
        baseline = Image.open(screenshot(f'frost-{theme}-clear')).convert('RGB')
        scale = baseline.width / evaluate('global.stage.width')
        evaluate("cfg.set_boolean('frosted-glass-enabled',true)")
        wait('frostDocks.every(d=>frostSurface(d)?._state.glass?.mapped)')
        check(f'frost-{theme}-no-blur-or-capture', '''frostDocks.every(d=>{
            const s=frostSurface(d);return !s.backend && !s._stopDamage && s._state.captures.size===0;})''')
        time.sleep(.2)
        rendered = Image.open(screenshot(f'frost-{theme}-full-surface')).convert('RGB')
        geometry = evaluate('frostDocks.map(d=>[...d.get_transformed_position(),...d.get_transformed_size()])')
        differences = []
        for x, y, width, height in geometry:
            # Same phase of the periodic texture, on both sides of each old
            # 64px tile boundary and well beyond the first tile.
            for dx in range(32, int(width)-20, 64):
                for dy in [32, 96]:
                    px, py = round((x+dx)*scale), round((y+dy)*scale)
                    rect = (px-1, py-1, px+2, py+2)
                    clear = ImageStat.Stat(baseline.crop(rect)).mean[0]
                    glass = ImageStat.Stat(rendered.crop(rect)).mean[0]
                    differences.append(abs(clear-glass))
            for dx, dy in [(-5,height/2),(width+5,height/2),(width/2,-5),(width/2,height+5)]:
                point = (round((x+dx)*scale), round((y+dy)*scale))
                assert max(abs(a-b) for a,b in zip(baseline.getpixel(point),rendered.getpixel(point))) <= 1
        results[f'frost-{theme}-coverage-deltas'] = differences
        assert min(differences)>8, (theme, 'Uncovered part of the surface', differences)
        assert max(differences)-min(differences)<4, (theme, 'Visible tile boundary', differences)
        evaluate("cfg.set_boolean('frosted-glass-enabled',false)")
        wait('frostDocks.every(d=>!frostSurface(d)?._state?.glass)')
    evaluate('''frostDocks.forEach(d=>d.destroy());frostBackdrop.destroy();
        frostInterface.set_string('color-scheme',frostTheme);
        for(const [k,v] of Object.entries(frostSaved))cfg.set_value(k,v);''')
