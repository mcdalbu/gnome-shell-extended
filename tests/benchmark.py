#!/usr/bin/python3
# SPDX-License-Identifier: GPL-3.0-only
"""Short isolated GPU/CPU/RAM comparison. Never changes the user's desktop."""
import json
import os
from pathlib import Path
import random
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('GSE_BENCH_OUTPUT', str(ROOT / 'validation/backend-benchmark')))
REPETITIONS = int(os.environ.get('GSE_BENCH_REPETITIONS', '3'))
IDLE_SECONDS = float(os.environ.get('GSE_BENCH_IDLE_SECONDS', '3'))
UUID = 'gnome-shell-extended@mcda'
CASES = [('off', 0), ('native', 0), ('auto', 0), ('lightweight', 0), ('lightweight', 15)]
if os.environ.get('GSE_BENCH_ONLY'):
    CASES = [case for case in CASES if f'{case[0]}:{case[1]}' == os.environ['GSE_BENCH_ONLY']]


def read_process(pid):
    stat = Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()
    status = dict(line.split(':', 1) for line in Path(f'/proc/{pid}/status').read_text().splitlines() if ':' in line)
    clients = {}
    for fd in Path(f'/proc/{pid}/fdinfo').iterdir():
        try:
            fields = dict(line.split(':', 1) for line in fd.read_text().splitlines() if ':' in line)
        except OSError:
            continue
        if 'drm-client-id' not in fields:
            continue
        # One DRM client can be exposed by several duplicated file descriptors.
        identity = (fields.get('drm-pdev', '').strip(), fields['drm-client-id'].strip())
        if identity in clients:
            continue
        clients[identity] = {k: int(v.strip().split()[0]) for k, v in fields.items()
                             if k.startswith(('drm-cycles-', 'drm-total-cycles-', 'drm-resident-'))}
    return {'t': time.monotonic(), 'cpu': (int(stat[11]) + int(stat[12])) / os.sysconf('SC_CLK_TCK'),
            'rss_mib': int(status['VmRSS'].split()[0]) / 1024,
            'gpu_resident_mib': sum(sum(v for k, v in c.items() if k.startswith('drm-resident-'))
                                    for c in clients.values()) / 1024,
            'clients': {'|'.join(k): v for k, v in clients.items()}}


def summarize(samples, frames):
    first, last = samples[0], samples[-1]
    gpu = {}
    for identity, client in last['clients'].items():
        old = first['clients'].get(identity, {})
        for key, value in client.items():
            if not key.startswith('drm-cycles-'):
                continue
            engine = key.removeprefix('drm-cycles-')
            total_key = 'drm-total-cycles-' + engine
            denominator = client.get(total_key, 0) - old.get(total_key, 0)
            if key in old and denominator > 0:
                gpu[engine] = gpu.get(engine, 0) + max(0, value - old[key]) / denominator * 100
    duration = last['t'] - first['t']
    return {'seconds': duration, 'cpu_one_core_percent': 100 * (last['cpu'] - first['cpu']) / duration,
            'rss_mib': statistics.mean(s['rss_mib'] for s in samples),
            'gpu_resident_mib': statistics.mean(s['gpu_resident_mib'] for s in samples),
            'gpu_engine_percent': gpu, 'frames': frames, 'fps': frames / duration,
            'samples': samples}


def child(backend, hz, repetition):
    import gi
    gi.require_version('Gio', '2.0')
    from gi.repository import Gio, GLib
    settings = Gio.Settings.new('org.gnome.shell')
    settings.set_strv('enabled-extensions', ['gse-test-helper@local', UUID])
    settings.set_boolean('disable-user-extensions', False)
    settings.set_string('welcome-dialog-last-shown-version', '999')
    Gio.Settings.new('org.gnome.desktop.interface').set_boolean('enable-hot-corners', False)
    Gio.Settings.new('org.gnome.desktop.search-providers').set_boolean('disable-external', True)
    schema_dir = Path(os.environ['XDG_DATA_HOME']) / 'gnome-shell/extensions' / UUID / 'schemas'
    source = Gio.SettingsSchemaSource.new_from_directory(str(schema_dir), Gio.SettingsSchemaSource.get_default(), False)
    cfg = Gio.Settings.new_full(source.lookup('org.gnome.shell.extensions.gnome-shell-extended', False), None, None)
    cfg.set_string('blur-backend', backend)
    cfg.set_int('blur-radius', 24)
    cfg.set_double('blur-brightness', .8)
    cfg.set_double('surface-opacity', .85)
    cfg.set_int('update-frequency', hz)
    Gio.Settings.sync()
    name = f'{backend}-{hz}-r{repetition}'
    with (OUT / f'{name}.log').open('w') as log:
        shell = subprocess.Popen(['gnome-shell', '--headless', '--wayland', '--no-x11', '--virtual-monitor=1440x1000'], stdout=log, stderr=log)
        bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)

        def evaluate(code):
            ok, value = bus.call_sync('org.gnome.Shell', '/org/gnome/Shell', 'org.gnome.Shell', 'Eval',
                GLib.Variant('(s)', (code,)), GLib.VariantType.new('(bs)'), Gio.DBusCallFlags.NONE, 10000, None).unpack()
            if not ok:
                raise RuntimeError(value)
            return json.loads(value) if value else None

        def wait(code, timeout=25):
            end = time.monotonic() + timeout
            while time.monotonic() < end:
                if shell.poll() is not None:
                    raise RuntimeError('Compositor exited: ' + str(OUT / f'{name}.log'))
                try:
                    if evaluate('Boolean(' + code + ')'):
                        return
                except Exception:
                    pass
                time.sleep(.1)
            raise RuntimeError('Timeout: ' + code)

        def measure(seconds):
            evaluate('globalThis.benchFrames=0')
            samples = [read_process(shell.pid)]
            end = time.monotonic() + seconds
            while time.monotonic() < end:
                time.sleep(min(.5, max(0, end - time.monotonic())))
                samples.append(read_process(shell.pid))
            return summarize(samples, evaluate('benchFrames'))

        try:
            wait(f'Main.extensionManager.lookup({json.dumps(UUID)})?.state===1')
            evaluate("(async()=>{for(const name of ['St','Clutter']) globalThis[name]=(await import('gi://'+name)).default;globalThis.benchReady=true;})()")
            wait('globalThis.benchReady && !Main.layoutManager._startingUp && !Main.overview.animationInProgress')
            evaluate(f'globalThis.ext=Main.extensionManager.lookup({json.dumps(UUID)}).stateObj;Main.overview.hide();')
            wait('!Main.overview.visible && ext._manager._slots.get("blur")?.instance && ext._manager._slots.get("panel")?.instance')
            evaluate('''globalThis.scene=new St.Widget({name:'gse-benchmark-scene',width:1520,height:1000,reactive:false});
                for(let x=0;x<1520;x+=40) scene.add_child(new St.Widget({x,y:0,width:40,height:1000,
                    style:`background-color:${x%80?'#7a4189':'#3b818a'};`}));
                Main.uiGroup.insert_child_above(scene,global.window_group);
                Main.panel.statusArea.dateMenu.menu.open();
                globalThis.benchFrames=0;globalThis.benchProbe=global.stage.connect('after-paint',()=>benchFrames++);
                globalThis.benchTimeline=new Clutter.Timeline({actor:scene,duration:1000,repeat_count:-1});
                benchTimeline.connect('new-frame',()=>scene.translation_x=-80*benchTimeline.get_progress());''')
            binding = 'ext._manager._slots.get("blur").instance.bindings.get(Main.panel.statusArea.dateMenu.menu.actor)?.surface'
            if backend != 'off':
                wait(f'{binding}?.backend && !{binding}._loading && {binding}._state.captures.size>0')
            time.sleep(2)
            info = evaluate(f'''(()=>{{const s={binding};return {{resolved:s?.backend?.name??'off',
                captureCount:s?._state?.captures.size??0,frameDivisors:s?._state?[...s._state.captures.values()].map(c=>c.effect.frame_divisor??null):[]}}}})()''')
            idle = measure(IDLE_SECONDS)
            if os.environ.get('GSE_BENCH_CHECK_IDLE'):
                assert idle['frames'] <= 2, 'Idle redraw loop before animation'
            evaluate('benchTimeline.start()')
            time.sleep(2)
            active = measure(6)
            assert active['fps'] > 40, 'Animated load did not run at expected refresh rate'
            assert active['gpu_engine_percent'].get('rcs',0) > 0, 'No render GPU activity'
            evaluate('benchTimeline.stop()')
            post_idle = None
            if os.environ.get('GSE_BENCH_CHECK_IDLE'):
                time.sleep(.4)
                post_idle = measure(IDLE_SECONDS)
                assert post_idle['frames'] <= 2, 'Idle redraw loop after animation'
            maps = Path(f'/proc/{shell.pid}/maps').read_text()
            libraries = sorted({line.split()[-1] for line in maps.splitlines() if 'libblur-effect-' in line})
            expected = os.environ.get('GSE_BENCH_EXPECT_LIBRARY')
            if expected:
                assert libraries and all(expected in p for p in libraries), libraries
            evaluate('global.stage.disconnect(benchProbe);scene.destroy()')
            result = {'requested': backend, 'hz': hz, 'repetition': repetition, 'info': info, 'shellVersion': subprocess.check_output(['gnome-shell','--version'],text=True).strip(), 'idle': idle, 'active': active, 'postIdle': post_idle, 'libraries': libraries}
            (OUT / f'{name}.json').write_text(json.dumps(result, indent=2) + '\n')
            print(json.dumps({**{k: result[k] for k in ['requested','hz','repetition','info']},
                              'active': {k:v for k,v in active.items() if k!='samples'}}, ensure_ascii=False), flush=True)
        finally:
            shell.terminate()
            try:
                shell.wait(timeout=8)
            except subprocess.TimeoutExpired:
                shell.kill(); shell.wait()


def run():
    OUT.mkdir(parents=True, exist_ok=True)
    order = CASES * REPETITIONS
    # Balanced-ish deterministic interleaving, fresh compositor for every sample.
    random.Random(20261113).shuffle(order)
    repetitions = {}
    for backend, hz in order:
        repetitions[(backend,hz)] = repetitions.get((backend,hz), 0) + 1
        repetition = repetitions[(backend,hz)]
        completed = OUT / f'{backend}-{hz}-r{repetition}.json'
        if os.environ.get('GSE_BENCH_RESUME') and completed.exists():
            previous = json.loads(completed.read_text())
            assert previous['active']['fps'] > 40
            assert previous['active']['gpu_engine_percent'].get('rcs',0) > 0
            continue
        with tempfile.TemporaryDirectory(prefix='gse-benchmark-', ignore_cleanup_errors=True) as directory:
            base = Path(directory)
            target = base / 'data/gnome-shell/extensions' / UUID
            target.mkdir(parents=True)
            with zipfile.ZipFile(ROOT / 'dist/gnome-shell-extended@mcda_v13.zip') as archive:
                archive.extractall(target)
            helper = target.parent / 'gse-test-helper@local'
            helper.mkdir()
            (helper / 'metadata.json').write_text(json.dumps({'uuid':helper.name,'name':'Private benchmark helper',
                'description':'Only on a private test bus','shell-version':['51']}))
            (helper / 'extension.js').write_text("import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';export default class extends Extension {enable(){global.context.unsafe_mode=true}disable(){global.context.unsafe_mode=false}}")
            (base / 'runtime').mkdir(mode=0o700)
            env = dict(os.environ, XDG_DATA_HOME=str(base/'data'), XDG_CONFIG_HOME=str(base/'config'),
                XDG_CACHE_HOME=str(base/'cache'), XDG_STATE_HOME=str(base/'state'), XDG_RUNTIME_DIR=str(base/'runtime'),
                GSETTINGS_BACKEND='dconf')
            for key in ['DISPLAY','WAYLAND_DISPLAY','DBUS_SESSION_BUS_ADDRESS','DBUS_STARTER_ADDRESS','DBUS_STARTER_BUS_TYPE','LIBGL_ALWAYS_SOFTWARE']:
                env.pop(key, None)
            try:
                subprocess.run(['dbus-run-session','--','/usr/bin/python3',__file__,'--child',backend,str(hz),str(repetition)], env=env, check=True)
            finally:
                if os.path.ismount(base/'runtime/doc'):
                    subprocess.run(['fusermount3','-u',str(base/'runtime/doc')],check=False)
    results = [json.loads((OUT/f'{b}-{h}-r{r}.json').read_text()) for b,h in CASES for r in range(1,REPETITIONS+1)]
    (OUT/'results.json').write_text(json.dumps({'resolution':[1440,1000],'radius':24,'brightness':.8,'surfaceOpacity':.85,
        'durationActiveSeconds':6,'durationIdleSeconds':IDLE_SECONDS,'repetitions':REPETITIONS,'results':results},indent=2)+'\n')


if __name__ == '__main__':
    if '--child' in sys.argv:
        child(sys.argv[2],int(sys.argv[3]),int(sys.argv[4]))
    else:
        run()
