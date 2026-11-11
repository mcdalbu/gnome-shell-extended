# SPDX-License-Identifier: GPL-2.0-or-later
"""Build a private read-only framebuffer probe; never changes compositor state."""
import os
from pathlib import Path
import shlex
import subprocess


def build_probe(base):
    directory = base / 'frame-probe'
    directory.mkdir()
    packages = subprocess.check_output(['pkg-config', '--list-all'], text=True)
    package = next(line.split()[0] for line in packages.splitlines()
                   if line.startswith('mutter-cogl-'))
    api = package.rsplit('-', 1)[1]
    libdir = subprocess.check_output(['pkg-config', '--variable=libdir', package], text=True).strip()
    libdir = str(Path(libdir) / ('mutter-' + api))
    flags = shlex.split(subprocess.check_output(['pkg-config', '--cflags', '--libs', package], text=True))
    environment = dict(os.environ, XDG_CACHE_HOME=str(base/'cache'),
                       LD_LIBRARY_PATH=f'{directory}:{libdir}:' + os.environ.get('LD_LIBRARY_PATH', ''))
    root = Path(__file__).parent
    subprocess.run(['gcc', '-shared', '-fPIC', '-o', str(directory/'libframe-probe.so'),
                    str(root/'frame-probe.c'), *flags], check=True)
    subprocess.run(['g-ir-scanner', '--quiet', '--namespace=FrameProbe', '--nsversion=1.0',
                    '--include=Cogl-'+api, '--add-include-path='+libdir,
                    '--library=frame-probe', '--library-path='+str(directory),
                    '--identifier-prefix=FrameProbe', '--symbol-prefix=frame_probe',
                    '--output='+str(directory/'FrameProbe-1.0.gir'),
                    str(root/'frame-probe.h'), '--pkg='+package], check=True, env=environment)
    subprocess.run(['g-ir-compiler', str(directory/'FrameProbe-1.0.gir'),
                    '--includedir='+libdir, '--output='+str(directory/'FrameProbe-1.0.typelib')], check=True)
    return {'GI_TYPELIB_PATH': f'{directory}:{libdir}:' + os.environ.get('GI_TYPELIB_PATH', ''),
            'LD_LIBRARY_PATH': environment['LD_LIBRARY_PATH']}
