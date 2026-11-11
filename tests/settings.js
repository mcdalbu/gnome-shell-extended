// SPDX-License-Identifier: GPL-3.0-only
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}

const source = Gio.SettingsSchemaSource.new_from_directory(ARGV[0], null, false);
const schema = source.lookup('org.gnome.shell.extensions.gnome-shell-extended', false);
const settings = new Gio.Settings({settings_schema: schema});
for (const key of schema.list_keys()) {
    const descriptor = schema.get_key(key);
    assert(descriptor.range_check(descriptor.get_default_value()), `Invalid default: ${key}`);
    assert(settings.get_value(key).equal(descriptor.get_default_value()), `Unexpected value: ${key}`);
}
assert(settings.get_boolean('blur-enabled'), 'Shell blur defaults to enabled');
assert(!settings.get_boolean('opacity-enabled'), 'Application modifications require opting in');
assert(settings.get_int('update-frequency') === 0, 'Default frequency must follow compositor');
assert(!schema.get_key('surface-opacity').range_check(new GLib.Variant('d', 1.01)), 'Alpha range');
assert(!schema.get_key('blur-radius').range_check(new GLib.Variant('i', -1)), 'Radius range');
assert(!schema.get_key('blur-backend').range_check(new GLib.Variant('s', 'unknown')), 'Backend choices');
assert(settings.set_double('surface-opacity', 0.5), 'Write valid alpha');
assert(settings.get_double('surface-opacity') === 0.5, 'Read valid alpha');
console.log(`PASS: ${schema.list_keys().length} GSettings defaults, ranges, choices and in-memory writes.`);
