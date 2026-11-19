#!/usr/bin/env python3
"""Check or remove obsolete GNOME Extended blocks from the user's GTK4 CSS."""
import argparse
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile

LEGACY = 'GNOME Extended: '
CURRENT = 'Gnome Shell Extended'
SECTIONS = ('Nautilus sidebar', 'Settings sidebar', 'GTK4 context menus')


def setting(*args):
    executable = '/usr/bin/gsettings' if Path('/usr/bin/gsettings').is_file() else 'gsettings'
    return subprocess.check_output([executable, *args], text=True).strip()


def remove_block(text, name):
    begin, end = (f'/* {action} {name} */' for action in ('BEGIN', 'END'))
    if begin not in text and end not in text:
        return text
    if text.count(begin) != 1 or text.count(end) != 1:
        raise ValueError(f'Bloco incompleto ou duplicado: {name}')
    start, finish = text.index(begin), text.index(end)
    if finish < start or '/* BEGIN ' in text[start + len(begin):finish]:
        raise ValueError(f'Bloco malformado: {name}')
    return text[:start] + text[finish + len(end):]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fix', action='store_true', help='Apply changes and save a backup')
    args = parser.parse_args()
    config = Path(os.environ.get('XDG_CONFIG_HOME') or Path.home() / '.config')
    css = config / 'gtk-4.0/gtk.css'
    if css.is_symlink():
        raise ValueError(f'O arquivo é um link simbólico: {css}')
    try:
        original = css.read_bytes()
    except FileNotFoundError:
        print('Nenhum CSS GTK4 do usuário.')
        return 0

    updated = original.decode('utf-8')
    if "'gnome-extended@local'" not in setting('get', 'org.gnome.shell', 'enabled-extensions'):
        for section in SECTIONS:
            updated = remove_block(updated, LEGACY + section)
    if f'/* BEGIN {CURRENT} */' in updated or f'/* END {CURRENT} */' in updated:
        data = Path(os.environ.get('XDG_DATA_HOME') or Path.home() / '.local/share')
        schemas = data / 'gnome-shell/extensions/gnome-shell-extended@mcda/schemas'
        options = ['--schemadir', str(schemas)] if (schemas / 'gschemas.compiled').is_file() else []
        if setting(*options, 'get', 'org.gnome.shell.extensions.gnome-shell-extended', 'opacity-enabled') == 'false':
            updated = remove_block(updated, CURRENT)
    content = updated.encode('utf-8')
    if content == original:
        print('Nenhum bloco obsoleto encontrado.')
        return 0
    if not args.fix:
        print('Blocos obsoletos encontrados. Use --fix para corrigir.')
        return 1

    mode = stat.S_IMODE(css.stat().st_mode)
    with tempfile.NamedTemporaryFile(dir=css.parent, prefix='gtk.css.backup-', delete=False) as backup:
        backup.write(original)
    with tempfile.NamedTemporaryFile(dir=css.parent, prefix='.gtk.css-', delete=False) as temporary:
        temporary.write(content)
    staged = Path(temporary.name)
    try:
        staged.chmod(mode)
        if css.is_symlink() or css.read_bytes() != original:
            raise ValueError('O CSS mudou durante a verificação. Tente novamente.')
        staged.replace(css)
    finally:
        staged.unlink(missing_ok=True)
    print(f'CSS corrigido em {css}. Backup em {backup.name}.')
    print('Reabra os aplicativos GTK para carregar o CSS.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f'Não foi possível verificar ou corrigir o CSS: {error}', file=sys.stderr)
        sys.exit(2)
