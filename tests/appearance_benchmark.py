#!/usr/bin/python3
# SPDX-License-Identifier: GPL-3.0-only
"""Current appearance controls, fresh private compositor per case/repetition.

Run after make zip. Raw per-process DRM/CPU samples and logs stay in validation.
The historical backend benchmark remains available separately in benchmark.py.
"""
import hashlib
import json
import os
from pathlib import Path
import random
import statistics
import subprocess
import sys
import tempfile
import time
import zipfile

from benchmark import read_process, summarize

ROOT = Path(__file__).resolve().parents[1]
PROFILE = os.environ.get('GSE_APPEARANCE_BENCH_PROFILE', 'appearance')
assert PROFILE in ['appearance', 'iterations', 'kawase']
METADATA = json.loads((ROOT/'src/metadata.json').read_text())
OUT = Path(os.environ.get('GSE_APPEARANCE_BENCH_OUTPUT', str(ROOT/'validation'/
    (f"gaussian-iterations-benchmark-{METADATA['version-name']}" if PROFILE == 'iterations' else
     f"kawase-benchmark-{METADATA['version-name']}" if PROFILE == 'kawase' else 'appearance-benchmark-1.5.1'))))
PACKAGE = Path(os.environ.get('GSE_APPEARANCE_BENCH_PACKAGE', str(ROOT/'dist'/
    (f"gnome-shell-extended@mcda_v{METADATA['version']}.zip" if PROFILE != 'appearance' else 'gnome-shell-extended@mcda_v21.zip'))))
REPETITIONS = int(os.environ.get('GSE_APPEARANCE_BENCH_REPETITIONS', '5' if PROFILE != 'appearance' else '3'))
ACTIVE_SECONDS = float(os.environ.get('GSE_APPEARANCE_BENCH_ACTIVE_SECONDS', '12' if PROFILE != 'appearance' else '8'))
IDLE_SECONDS = float(os.environ.get('GSE_APPEARANCE_BENCH_IDLE_SECONDS', '2'))
WARMUP_SECONDS = 4 if PROFILE != 'appearance' else 2
UUID = 'gnome-shell-extended@mcda'
CASES = [dict(name='tint', blur=False, lens=False, frost=False, method='box', samples=13),
         dict(name='frost', blur=False, lens=False, frost=True, method='box', samples=13),
         dict(name='refraction', blur=False, lens=True, frost=False, method='box', samples=13)]
for lens in [False, True]:
    for method, samples in [('box',13),('fast-gaussian',5),('fast-gaussian',9),('fast-gaussian',13)]:
        name = 'box' if method == 'box' else f'gaussian-{samples}'
        CASES.append(dict(name=name+('-refraction' if lens else ''), blur=True,
                          lens=lens, frost=False, method=method, samples=samples))
if PROFILE == 'iterations':
    CASES = [dict(name='box',blur=True,lens=False,frost=False,method='box',samples=13,iterations=3),
             dict(name='gaussian-3-iterations',blur=True,lens=False,frost=False,method='fast-gaussian',samples=13,iterations=3),
             dict(name='gaussian-4-iterations',blur=True,lens=False,frost=False,method='fast-gaussian',samples=13,iterations=4)]
if PROFILE == 'kawase':
    CASES = [dict(name=name,blur=blur,lens=False,frost=False,method=method,samples=13,iterations=3 if method=='kawase' else 4)
             for name,blur,method in [('tint',False,'box'),('box',True,'box'),
                 ('gaussian-4-iterations',True,'fast-gaussian'),('kawase',True,'kawase')]]
if os.environ.get('GSE_APPEARANCE_BENCH_ONLY'):
    CASES = [c for c in CASES if c['name'] in os.environ['GSE_APPEARANCE_BENCH_ONLY'].split(',')]
    assert CASES, 'Unknown benchmark case'


def child(case, repetition):
    import gi
    gi.require_version('Gio', '2.0')
    from gi.repository import Gio, GLib
    settings = Gio.Settings.new('org.gnome.shell')
    settings.set_strv('enabled-extensions', ['gse-test-helper@local', UUID])
    settings.set_boolean('disable-user-extensions', False)
    settings.set_string('welcome-dialog-last-shown-version', '999')
    interface = Gio.Settings.new('org.gnome.desktop.interface')
    interface.set_boolean('enable-hot-corners', False)
    interface.set_string('color-scheme', 'prefer-dark')
    Gio.Settings.new('org.gnome.desktop.search-providers').set_boolean('disable-external', True)
    Gio.Settings.new('org.gnome.desktop.notifications').set_boolean('show-banners', False)
    schema_dir = Path(os.environ['XDG_DATA_HOME'])/'gnome-shell/extensions'/UUID/'schemas'
    source = Gio.SettingsSchemaSource.new_from_directory(str(schema_dir), Gio.SettingsSchemaSource.get_default(), False)
    cfg = Gio.Settings.new_full(source.lookup('org.gnome.shell.extensions.gnome-shell-extended', False), None, None)
    # Explicit new keys and migration marker: no old backend/frequency modes.
    cfg.set_int('appearance-controls-version', 1)
    for key, value in [('blur-enabled',False),('panel-enabled',False),('docks-enabled',True),
                       ('dock-blur',True),('blur-filter-enabled',case['blur']),
                       ('refraction-enabled',case['lens']),('frosted-glass-enabled',case['frost'])]:
        cfg.set_boolean(key, value)
    cfg.set_string('blur-method', case['method'])
    cfg.set_string('blur-samples', str(case['samples']))
    if 'iterations' in case:
        cfg.set_int('blur-kawase-iterations' if case['method']=='kawase' else 'blur-iterations',case['iterations'])
    cfg.set_int('blur-radius', 24)
    cfg.set_double('refraction-strength', 6)
    cfg.set_double('blur-brightness', .8)
    cfg.set_double('dock-opacity', .85)
    Gio.Settings.sync()
    name = f"{case['name']}-r{repetition}"
    with (OUT/f'{name}.log').open('w') as log:
        shell = subprocess.Popen(['gnome-shell','--headless','--wayland','--no-x11',
                                  '--virtual-monitor=1440x1000'], stdout=log, stderr=log)
        bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)

        def evaluate(code):
            ok, value = bus.call_sync('org.gnome.Shell','/org/gnome/Shell','org.gnome.Shell','Eval',
                GLib.Variant('(s)', (code,)), GLib.VariantType.new('(bs)'), Gio.DBusCallFlags.NONE,10000,None).unpack()
            if not ok:
                raise RuntimeError(value)
            return json.loads(value) if value else None

        def wait(code, timeout=25):
            end = time.monotonic()+timeout
            while time.monotonic()<end:
                if shell.poll() is not None:
                    raise RuntimeError(f'Compositor exited: {OUT/name}.log')
                try:
                    if evaluate('Boolean('+code+')'):
                        return
                except Exception:
                    pass
                time.sleep(.1)
            raise RuntimeError('Timeout: '+code)

        def info():
            return evaluate('''benchSurfaces().map(s=>({
                kind:s.constructor.name,captures:s._state?.captures.size??0,
                glass:!!s._state?.glass,backend:s.backend?.name??null,
                config:s._state?.glassConfig??null,
                buffers:[...(s._state?.captures.values()??[])].flatMap(c=>
                    [...c.effect._buffers.values()].map(b=>({width:b.width,height:b.height,
                        reducedBy:b.filter?.reduction??null,filters:[...(b.filter?.filters.keys()??[])]}))),
                failed:[...(s._state?.captures.values()??[])].some(c=>c.effect._failed),
                geometry:[...s.box.get_transformed_position(),...s.box.get_transformed_size()]
            }))''')

        def measure(seconds):
            evaluate('globalThis.benchFrames=0')
            def sample():
                data = read_process(shell.pid)
                if PROFILE != 'appearance':
                    # Observe clocks, never change the host's power settings.
                    data['gpu_clock_mhz'] = {}
                    for key in ['cur_freq','act_freq']:
                        paths = sorted(Path('/sys/class/drm').glob(f'card*/device/tile0/gt0/freq0/{key}'))
                        try:
                            data['gpu_clock_mhz'][key] = int(paths[0].read_text())
                        except (OSError,ValueError,IndexError):
                            pass
                return data
            samples = [sample()]
            end = time.monotonic()+seconds
            while time.monotonic()<end:
                time.sleep(min(.5, max(0,end-time.monotonic())))
                samples.append(sample())
            result = summarize(samples, evaluate('benchFrames'))
            if result['frames']:
                result['cpu_ms_per_frame'] = 10*result['cpu_one_core_percent']/result['fps']
                result['gpu_rcs_busy_ms_per_frame'] = 10*result['gpu_engine_percent'].get('rcs',0)/result['fps']
            return result

        def verify_passes():
            # Count actual render-target draws in one diagnostic frame AFTER
            # the timed workload. No instrumentation affects the active data.
            evaluate('''globalThis.benchVerifyFilters=benchSurfaces().flatMap(s=>
                [...s._state.captures.values()].map(c=>c.effect._buffers.get('view')?.filter)).filter(Boolean);
                for(const f of benchVerifyFilters){f._benchDraws=0;f._benchDraw=f._draw;
                    f._draw=function(...args){this._benchDraws++;return this._benchDraw(...args)};}
                globalThis.benchVerifyDone=false;
                globalThis.benchVerifySignal=global.stage.connect('after-paint',()=>{
                    for(const f of benchVerifyFilters){f._draw=f._benchDraw;delete f._benchDraw;}
                    global.stage.disconnect(benchVerifySignal);benchVerifyDone=true;
                });scene.queue_redraw();''')
            wait('benchVerifyDone')
            verification = evaluate('''benchVerifyFilters.map(f=>({
                totalDraws:f._benchDraws,downsampleDraws:f.levels.length,
                filterPasses:f._benchDraws-f.levels.length}))''')
            expected = case['iterations'] if case['method']=='kawase' else 6 if case['method']=='box' else 2*case['iterations']
            assert len(verification)==2 and all(v['filterPasses']==expected for v in verification), verification
            return verification

        try:
            wait(f'Main.extensionManager.lookup({json.dumps(UUID)})?.state===1')
            evaluate("(async()=>{for(const n of ['St','Clutter'])globalThis[n]=(await import('gi://'+n)).default;globalThis.benchSystem=(await import('system')).default;globalThis.benchReady=true;})()")
            wait('globalThis.benchReady && !Main.layoutManager._startingUp && !Main.overview.animationInProgress')
            evaluate(f'globalThis.ext=Main.extensionManager.lookup({json.dumps(UUID)}).stateObj;Main.overview.hide()')
            wait('!Main.overview.visible && ext._manager._slots.get("docks")?.instance')
            evaluate('''globalThis.scene=new St.Widget({name:'gse-benchmark-scene',width:1520,height:1000,reactive:false});
                for(let x=0;x<1520;x+=40)scene.add_child(new St.Widget({x,y:0,width:40,height:1000,
                    style:`background-color:${x%80?'#7a4189':'#3b818a'};`}));
                Main.uiGroup.insert_child_above(scene,global.window_group);
                globalThis.benchActors=[[220,860,1000,96],[880,100,520,540]].map(([x,y,width,height])=>{
                    const actor=new St.Widget({name:'dashtodockContainer',x,y,width,height});
                    actor.add_child(new St.Widget({style_class:'dash-background',width,height,
                        style:'background-color:rgb(70,70,70);border-radius:24px;border-width:0;box-shadow:none;'}));
                    Main.uiGroup.add_child(actor);return actor;});
                globalThis.benchSurfaces=()=>benchActors.map(a=>ext._manager._slots.get('docks').instance.records.get(a)?.binding.surface);
                globalThis.benchFrames=0;globalThis.benchProbe=global.stage.connect('after-paint',()=>benchFrames++);
                globalThis.benchTimeline=new Clutter.Timeline({actor:scene,duration:1000,repeat_count:-1});
                benchTimeline.connect('new-frame',()=>scene.translation_x=-80*benchTimeline.get_progress());''')
            wait('benchSurfaces().every(s=>s?.box.mapped)')
            if case['blur'] or case['lens']:
                wait('benchSurfaces().every(s=>s.backend && !s._loading && s._state.captures.size>0)')
            elif case['frost']:
                wait('benchSurfaces().every(s=>s._state?.glass?.mapped)')
            time.sleep(2)
            # Remove startup garbage in every case before sampling RSS/CPU.
            # No forced collection runs inside either measured interval.
            evaluate('benchSystem.gc()')
            time.sleep(.3)
            idle = measure(IDLE_SECONDS)
            evaluate('benchTimeline.start()')
            time.sleep(WARMUP_SECONDS)
            active = measure(ACTIVE_SECONDS)
            assert active['fps']>1, 'No animated load'
            assert active['gpu_engine_percent'].get('rcs',0)>0, 'No render GPU counters'
            resolved = info()
            assert len(resolved)==2 and not any(s['failed'] for s in resolved), resolved
            for s in resolved:
                assert s['glass']==case['frost']
                assert bool(s['captures'])==(case['blur'] or case['lens'])
                if case['blur'] or case['lens']:
                    assert s['config']['method']==case['method'] and s['config']['samples']==case['samples']
                    assert all(bool(b['reducedBy'])==case['blur'] for b in s['buffers'])
                    if 'iterations' in case:
                        assert s['config']['iterations']==case['iterations']
            evaluate('benchTimeline.stop()')
            verification = verify_passes() if PROFILE != 'appearance' and case['blur'] else None
            time.sleep(1)
            post_idle = measure(IDLE_SECONDS)
            result = dict(case=case,repetition=repetition,info=resolved,passVerification=verification,
                          idle=idle,active=active,postIdle=post_idle,
                          shellVersion=subprocess.check_output(['gnome-shell','--version'],text=True).strip(),
                          package_sha256=hashlib.sha256(PACKAGE.read_bytes()).hexdigest())
            (OUT/f'{name}.json').write_text(json.dumps(result,indent=2)+'\n')
            print(json.dumps(dict(case=case['name'],repetition=repetition,
                gpu=active['gpu_engine_percent']['rcs'],cpu=active['cpu_one_core_percent'],
                rss=active['rss_mib'],gpu_memory=active['gpu_resident_mib'],fps=active['fps'],
                idle_frames=[idle['frames'],post_idle['frames']])),flush=True)
        finally:
            shell.terminate()
            try:
                shell.wait(timeout=8)
            except subprocess.TimeoutExpired:
                shell.kill()
                shell.wait()


def run():
    OUT.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(PACKAGE) as archive:
        package_metadata = json.loads(archive.read('metadata.json'))
        assert archive.testzip() is None
    metadata = dict(profile=PROFILE,package_metadata=package_metadata,
                    resolution=[1440,1000],radius=24,strength=6,brightness=.8,opacity=.85,
                    durationActiveSeconds=ACTIVE_SECONDS,durationIdleSeconds=IDLE_SECONDS,
                    durationAnimationWarmupSeconds=WARMUP_SECONDS,
                    repetitions=REPETITIONS,package_sha256=hashlib.sha256(PACKAGE.read_bytes()).hexdigest(),
                    gpu=subprocess.check_output(['lspci','-nnk'],text=True),
                    kernel=subprocess.check_output(['uname','-r'],text=True).strip(),
                    cpu=subprocess.check_output(['lscpu'],text=True),cases=CASES)
    (OUT/'method.json').write_text(json.dumps(metadata,indent=2)+'\n')
    for repetition in range(1,REPETITIONS+1):
        order = list(CASES)
        random.Random(20261115+repetition).shuffle(order)
        for case in order:
            completed = OUT/f"{case['name']}-r{repetition}.json"
            if os.environ.get('GSE_APPEARANCE_BENCH_RESUME') and completed.exists():
                previous = json.loads(completed.read_text())
                assert previous['package_sha256']==metadata['package_sha256']
                assert abs(previous['active']['seconds']-ACTIVE_SECONDS)<1
                assert previous['case']==case
                continue
            with tempfile.TemporaryDirectory(prefix='gse-appearance-benchmark-',ignore_cleanup_errors=True) as directory:
                base = Path(directory)
                target = base/'data/gnome-shell/extensions'/UUID
                target.mkdir(parents=True)
                with zipfile.ZipFile(PACKAGE) as archive:
                    archive.extractall(target)
                helper = target.parent/'gse-test-helper@local'
                helper.mkdir()
                (helper/'metadata.json').write_text(json.dumps(dict(uuid=helper.name,name='Private benchmark helper',
                    description='Only on a private test bus',**{'shell-version':['51']})))
                (helper/'extension.js').write_text("import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';export default class extends Extension{enable(){global.context.unsafe_mode=true}disable(){global.context.unsafe_mode=false}}")
                (base/'runtime').mkdir(mode=0o700)
                env = dict(os.environ,XDG_DATA_HOME=str(base/'data'),XDG_CONFIG_HOME=str(base/'config'),
                           XDG_CACHE_HOME=str(base/'cache'),XDG_STATE_HOME=str(base/'state'),
                           XDG_RUNTIME_DIR=str(base/'runtime'),GSETTINGS_BACKEND='dconf',
                           GSE_APPEARANCE_BENCH_PACKAGE=str(PACKAGE),
                           GSE_APPEARANCE_BENCH_OUTPUT=str(OUT),GSE_APPEARANCE_BENCH_PROFILE=PROFILE)
                for key in ['DISPLAY','WAYLAND_DISPLAY','DBUS_SESSION_BUS_ADDRESS','DBUS_STARTER_ADDRESS',
                            'DBUS_STARTER_BUS_TYPE','LIBGL_ALWAYS_SOFTWARE']:
                    env.pop(key,None)
                try:
                    subprocess.run(['dbus-run-session','--','/usr/bin/python3',__file__,'--child',case['name'],str(repetition)],env=env,check=True)
                finally:
                    if os.path.ismount(base/'runtime/doc'):
                        subprocess.run(['fusermount3','-u',str(base/'runtime/doc')],check=False)
    results = [json.loads((OUT/f"{c['name']}-r{r}.json").read_text()) for c in CASES for r in range(1,REPETITIONS+1)]
    (OUT/'results.json').write_text(json.dumps(dict(**metadata,results=results),indent=2)+'\n')
    summary = {}
    for c in CASES:
        rows = [r for r in results if r['case']['name']==c['name']]
        metrics = {}
        for label, fn in [('gpu_rcs_percent',lambda r:r['active']['gpu_engine_percent']['rcs']),
                          ('cpu_one_core_percent',lambda r:r['active']['cpu_one_core_percent']),
                          ('rss_mib',lambda r:r['active']['rss_mib']),
                          ('gpu_resident_mib',lambda r:r['active']['gpu_resident_mib']),
                          ('fps',lambda r:r['active']['fps'])]:
            values = [fn(r) for r in rows]
            metrics[label] = dict(median=statistics.median(values),minimum=min(values),maximum=max(values),values=values)
        metrics['idle_frames'] = [[r['idle']['frames'],r['postIdle']['frames']] for r in rows]
        summary[c['name']] = metrics
    (OUT/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')


if __name__=='__main__':
    if '--child' in sys.argv:
        child(next(c for c in CASES if c['name']==sys.argv[2]),int(sys.argv[3]))
    else:
        run()
