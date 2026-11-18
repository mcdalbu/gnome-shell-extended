// SPDX-License-Identifier: GPL-3.0-only
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {migrateAppearance, readAppearance} from '../src/core/appearance.js';
import {CaptureRate, blurReduction, capturePadding} from '../src/core/render/blurPerformance.js';

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
assert(!settings.get_boolean('panel-remove-gap'), 'Panel gap correction defaults to disabled');
assert(settings.get_boolean('blur-enabled'), 'Shell blur defaults to enabled');
assert(!settings.get_boolean('panel-static-blur'), 'Static wallpaper source is opt-in');
assert(settings.get_string('blur-render-area') === 'monitor', 'Compatible redraw remains the default');
assert(schema.get_key('blur-render-area').range_check(new GLib.Variant('s','elements')), 'Element redraw supported');
assert(!schema.get_key('blur-render-area').range_check(new GLib.Variant('s','unknown')), 'Reject unknown redraw area');
assert(readAppearance(settings).resolution === 'auto' && readAppearance(settings).refreshPercent === 100,
    'Performance defaults preserve resolution and refresh rate');
for (const percent of [100, 50, 25]) {
    assert(settings.set_string('blur-refresh-rate', String(percent)), 'Supported refresh fraction');
    assert(readAppearance(settings).refreshPercent === percent, 'Refresh fraction propagated');
    for (const hz of [60, 120, 144]) {
        const budget = new CaptureRate();
        let count = 0;
        for (let frame = 0; frame < hz * 8; frame++) {
            const now = frame * 1e6 / hz;
            if (budget.due(now, hz, percent)) {
                budget.commit(now, hz, percent);
                count++;
            }
        }
        assert(Math.abs(count - hz * 8 * percent / 100) <= 1, 'Monitor-relative capture cadence');
        assert(budget.due(60e6, hz, percent), 'A change after idle refreshes immediately');
        budget.commit(60e6, hz, percent);
        assert(percent === 100 || !budget.due(60e6 + 1000, hz, percent), 'No catch-up burst after idle');
        assert(budget.due(60e6 + 1000, hz * 2, percent), 'New monitor refresh is immediate');
    }
}
assert(!schema.get_key('blur-refresh-rate').range_check(new GLib.Variant('s','75')), 'Only full, half and quarter rates');
settings.reset('blur-refresh-rate');
for (const percent of [50, 25]) {
    const first = new CaptureRate(), second = new CaptureRate();
    first.commit(0, 60, percent);
    second.commit(10000, 60, percent);
    assert(first.next === second.next, 'Staggered surfaces share a refresh deadline and cannot wake each other forever');
}
for (const radius of [1, 24, 100, 200]) {
    assert(blurReduction(radius, 'half') === 2 * blurReduction(radius), 'Half linear resolution');
    assert(blurReduction(radius, 'quarter') === 4 * blurReduction(radius), 'Quarter linear resolution');
}
for (const method of ['box', 'fast-gaussian', 'kawase']) {
    const config = {blurRadius:24, strength:0, method, iterations:8, resolution:'quarter'};
    assert(capturePadding({...config, blurRadius:1, strength:24}, 1.5) > 36,
        'Capture covers the physical lens displacement and reconstruction');
    assert(capturePadding({...config, strength:12}, 1.5) === capturePadding(config, 1.5),
        'An inward lens within the kernel does not shift its sampling grid');
}
assert(schema.get_key('blur-mode').range_check(new GLib.Variant('s','combined')), 'Combined choice');
assert(settings.get_string('blur-glass-method') === 'box', 'Box blur default');
assert(schema.get_key('blur-glass-method').range_check(new GLib.Variant('s','fast-gaussian')), 'Fast Gaussian choice');
assert(!schema.get_key('blur-glass-method').range_check(new GLib.Variant('s','unknown')), 'Glass filter choices');
assert(settings.get_string('blur-mode') === 'dynamic', 'Dynamic mode preserves existing appearance');
assert(schema.get_key('blur-mode').range_check(new GLib.Variant('s', 'refraction')), 'Refraction choice');
assert(settings.get_string('refraction-style')==='contour', 'Existing lens remains the default');
assert(schema.get_key('refraction-style').range_check(new GLib.Variant('s','liquid')), 'Liquid glass choice');
assert(!schema.get_key('refraction-style').range_check(new GLib.Variant('s','unknown')), 'Reject unknown glass style');
settings.set_string('refraction-style','liquid');
assert(readAppearance(settings).glassStyle==='liquid', 'Liquid propagated independently of blur method');
settings.reset('refraction-style');
assert(settings.get_double('refraction-strength') === 6, 'Refraction default');
assert(!schema.get_key('refraction-strength').range_check(new GLib.Variant('d', 24.01)), 'Refraction strength range');
assert(!schema.get_key('blur-mode').range_check(new GLib.Variant('s', 'unknown')), 'Appearance mode choices');
assert(!settings.get_boolean('opacity-enabled'), 'Application modifications require opting in');
assert(settings.get_int('update-frequency') === 0, 'Default frequency must follow compositor');
assert(!schema.get_key('surface-opacity').range_check(new GLib.Variant('d', 1.01)), 'Alpha range');
assert(!schema.get_key('blur-radius').range_check(new GLib.Variant('i', -1)), 'Radius range');
assert(!schema.get_key('blur-backend').range_check(new GLib.Variant('s', 'unknown')), 'Backend choices');
assert(settings.set_double('surface-opacity', 0.5), 'Write valid alpha');
assert(settings.get_double('surface-opacity') === 0.5, 'Read valid alpha');
assert(settings.get_string('blur-samples')==='13', 'Default 13 taps preserves existing Gaussian');
for (const samples of ['5','9','13'])
    assert(schema.get_key('blur-samples').range_check(new GLib.Variant('s',samples)), 'Supported sample count');
assert(!schema.get_key('blur-samples').range_check(new GLib.Variant('s','7')), 'Reject unsupported sample count');
assert(settings.get_int('blur-iterations')===4, 'Default Gaussian uses eight directional passes');
assert(!schema.get_key('blur-iterations').range_check(new GLib.Variant('i',0)), 'Reject zero iterations');
assert(!schema.get_key('blur-iterations').range_check(new GLib.Variant('i',9)), 'Bound Gaussian GPU passes');
assert(readAppearance(settings).iterations===4, 'Shared Gaussian iteration count');
assert(settings.set_string('blur-method', 'kawase'), 'Kawase method supported');
migrateAppearance(settings);
assert(readAppearance(settings).method === 'kawase', 'Explicit Kawase survives legacy migration');
settings.set_int('blur-iterations', 8);
settings.set_string('blur-samples', '5');
assert(readAppearance(settings).method === 'kawase', 'Gaussian quality does not select the method');
assert(readAppearance(settings).iterations === 3, 'Kawase defaults to three independently of Gaussian');
assert(!schema.get_key('blur-kawase-iterations').range_check(new GLib.Variant('i',0)), 'Reject zero Kawase iterations');
assert(!schema.get_key('blur-kawase-iterations').range_check(new GLib.Variant('i',9)), 'Bound Kawase GPU passes');
settings.set_int('blur-kawase-iterations', 1);
assert(readAppearance(settings).iterations === 1, 'Kawase has its own iteration count');
settings.set_string('blur-method', 'fast-gaussian');
assert(readAppearance(settings).iterations === 8, 'Gaussian iteration count preserved');
// Verify upgrades with a fresh settings state for each old appearance.
const reset = () => { for (const key of schema.list_keys()) settings.reset(key); };
for (const [mode, blur, distortion, frost] of [
    ['dynamic',true,false,false], ['economical',false,false,true],
    ['refraction',false,true,false], ['combined',true,true,false],
]) {
    reset();
    settings.set_string('blur-mode',mode);
    settings.set_string('blur-glass-method','fast-gaussian');
    migrateAppearance(settings);
    assert(settings.get_boolean('blur-filter-enabled')===blur, `Migrate blur ${mode}`);
    assert(settings.get_boolean('refraction-enabled')===distortion, `Migrate distortion ${mode}`);
    assert(settings.get_boolean('frosted-glass-enabled')===frost, `Migrate frost ${mode}`);
    assert(settings.get_string('blur-method')==='fast-gaussian', 'Migrate method');
    settings.set_boolean('refraction-enabled',!distortion);
    settings.set_string('blur-mode','economical');
    migrateAppearance(settings);
    assert(settings.get_boolean('refraction-enabled')===!distortion, 'Migration is one-time');
}
reset();
settings.set_string('blur-backend','off');
migrateAppearance(settings);
assert(!readAppearance(settings).capture, 'Legacy backend off migrates to disabled blur');
reset();
settings.set_string('blur-mode','combined');
settings.set_boolean('blur-filter-enabled',false);
settings.set_boolean('refraction-enabled',false);
settings.set_string('blur-method','fast-gaussian');
migrateAppearance(settings);
assert(!readAppearance(settings).capture && settings.get_string('blur-method')==='fast-gaussian', 'Explicit new choices preserved');
for (const blur of [false,true]) for (const distortion of [false,true]) {
    settings.set_boolean('blur-filter-enabled',blur);
    settings.set_boolean('refraction-enabled',distortion);
    const config = readAppearance(settings);
    assert((config.blurRadius>0)===blur, 'Blur independent');
    assert((config.strength>0)===distortion, 'Distortion independent');
    assert(config.capture===(blur||distortion), 'No capture when both off');
    assert(config.radius===Math.max(config.blurRadius,config.strength), 'Shared capture support');
}
console.log(`PASS: ${schema.list_keys().length} GSettings defaults, ranges, independent controls and appearance migrations.`);
