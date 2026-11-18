// SPDX-License-Identifier: GPL-3.0-only

// Legacy keys remain readable for upgrades, but are no longer UI controls or
// runtime selectors. Respect any explicit new value, then migrate only once.
export const LEGACY_APPEARANCE_KEYS = Object.freeze([
    'blur-mode', 'blur-glass-method', 'blur-backend', 'update-frequency', 'appearance-controls-version',
]);

export function migrateAppearance(settings) {
    if (settings.get_int('appearance-controls-version') >= 1)
        return;
    const mode = settings.get_string('blur-mode');
    const values = {
        'blur-filter-enabled': mode === 'combined' || (mode === 'dynamic' && settings.get_string('blur-backend') !== 'off'),
        'refraction-enabled': mode === 'refraction' || mode === 'combined',
        'frosted-glass-enabled': mode === 'economical',
        'blur-method': settings.get_string('blur-glass-method'),
    };
    for (const [key, value] of Object.entries(values)) {
        if (settings.get_user_value(key) !== null)
            continue;
        if (typeof value === 'boolean')
            settings.set_boolean(key, value);
        else
            settings.set_string(key, value);
    }
    settings.set_int('appearance-controls-version', 1);
}

export function readAppearance(settings) {
    const blurRadius = settings.get_boolean('blur-filter-enabled') ? settings.get_int('blur-radius') : 0;
    const strength = settings.get_boolean('refraction-enabled') ? settings.get_double('refraction-strength') : 0;
    const radius = Math.max(blurRadius, strength);
    const frosted = settings.get_boolean('frosted-glass-enabled');
    const method = settings.get_string('blur-method');
    return {blurRadius, strength, radius, frosted, capture: radius > 0,
        glassStyle: settings.get_string('refraction-style'),
        resolution: settings.get_string('blur-resolution'),
        refreshPercent: Number(settings.get_string('blur-refresh-rate')),
        method, samples: Number(settings.get_string('blur-samples')),
        iterations: settings.get_int(method === 'kawase' ? 'blur-kawase-iterations' : 'blur-iterations'),
        blurRatio: blurRadius / (radius || 1), strengthRatio: strength / (radius || 1)};
}
