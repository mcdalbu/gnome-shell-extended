#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Local validation and packaging; never installs or restarts the Shell."""
import json
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent
SCHEMA = 'org.gnome.shell.extensions.gnome-shell-extended'


def validate():
    metadata = json.loads((ROOT / 'src/metadata.json').read_text())
    assert metadata['uuid'] == 'gnome-shell-extended@mcda'
    assert metadata['shell-version'] == [str(v) for v in range(45, 52)]
    assert metadata['settings-schema'] == SCHEMA
    assert metadata['session-modes'] == ['user', 'unlock-dialog']
    schema = ET.parse(ROOT / 'schemas/org.gnome.shell.extensions.gschema.xml').getroot()[0]
    assert schema.attrib['id'] == SCHEMA
    assert schema.attrib['path'] == '/org/gnome/shell/extensions/gnome-shell-extended/'
    subprocess.run(['glib-compile-schemas', '--strict', '--dry-run', str(ROOT / 'schemas')], check=True)
    # Parse Shell-only imports without executing them outside the compositor.
    sources = sorted((ROOT / 'src').rglob('*.js'))
    for source in sources:
        with tempfile.NamedTemporaryFile(suffix='.mjs', mode='w') as handle:
            handle.write(source.read_text())
            handle.flush()
            subprocess.run(['gjs', '-c',
                            'Reflect.parse(new TextDecoder().decode('
                            'imports.gi.GLib.file_get_contents(ARGV[0])[1]), '
                            '{target: "module"});', handle.name], check=True,
                           stdout=subprocess.DEVNULL)
    print(f'Validated metadata, schema and syntax of {len(sources)} modules.')


def build():
    target = ROOT / 'build' / 'gnome-shell-extended@mcda'
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(ROOT / 'src', target)
    shutil.copytree(ROOT / 'schemas', target / 'schemas')
    for name in ['LICENSE', 'README.md', 'THIRD_PARTY.md', 'VALIDATION.md', 'CHANGELOG.md']:
        shutil.copy2(ROOT / name, target / name)
    subprocess.run(['glib-compile-schemas', '--strict', str(target / 'schemas')], check=True)
    print(target)


def test_settings():
    with tempfile.TemporaryDirectory(prefix='gse-schema-') as directory:
        shutil.copy2(ROOT / 'schemas/org.gnome.shell.extensions.gschema.xml', directory)
        subprocess.run(['glib-compile-schemas', '--strict', directory], check=True)
        subprocess.run(['gjs', '-m', str(ROOT / 'tests/settings.js'), directory],
                       env={**os.environ, 'GSETTINGS_BACKEND': 'memory'}, check=True)
        subprocess.run(['gjs', '-m', str(ROOT / 'tests/integrations.js')],
                       env={**os.environ, 'GSETTINGS_BACKEND': 'memory',
                            'XDG_CONFIG_HOME': directory,
                            'XDG_DATA_HOME': str(Path(directory) / 'data')}, check=True)


def package():
    target = ROOT / 'build' / 'gnome-shell-extended@mcda'
    if not (target / 'schemas/gschemas.compiled').is_file():
        raise RuntimeError('Run make build first')
    output = ROOT / 'dist' / f'{target.name}.zip'
    output.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(target.rglob('*')):
            if path.is_file():
                archive.write(path, path.relative_to(target))
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        assert {'extension.js', 'prefs.js', 'metadata.json', 'schemas/gschemas.compiled'} <= set(archive.namelist())
        assert not any('test-helper' in name for name in archive.namelist())
    checksum = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix('.zip.sha256').write_text(f'{checksum}  {output.name}\n')
    version = json.loads((target / 'metadata.json').read_text())['version']
    versioned = output.with_name(f'{target.name}_v{version}.zip')
    shutil.copy2(output, versioned)
    versioned.with_suffix('.zip.sha256').write_text(f'{checksum}  {versioned.name}\n')
    print(output)
    print(versioned)


def clean():
    for name in ['build', 'dist']:
        path = ROOT / name
        if path.exists():
            shutil.rmtree(path)


if __name__ == '__main__':
    {'validate': validate, 'test-settings': test_settings, 'build': build,
     'zip': package, 'clean': clean}[sys.argv[1]]()
