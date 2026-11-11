// SPDX-License-Identifier: GPL-3.0-only
import Shell from 'gi://Shell';

let optional;
let pending;

export function nativeBackend() {
    return {api: Shell, name: 'native'};
}

// Optional namespace is loaded once, only when a visible surface needs blur.
export async function loadBackend(preference) {
    if (preference === 'native' || preference === 'off')
        return nativeBackend();
    pending ??= import('gi://Blur').then(({default: api}) => {
        const properties = api.BlurEffect?.list_properties().map(p => p.name) ?? [];
        if (!properties.includes('brightness') || api.BlurMode?.BACKGROUND === undefined)
            return null;
        const probe = new api.BlurEffect({mode: api.BlurMode.BACKGROUND});
        probe.run_dispose();
        return {api, name: 'lightweight'};
    }).catch(() => null);
    optional = await pending;
    return optional ?? nativeBackend();
}

export function radiusProperty(api) {
    return api.BlurEffect.list_properties().some(p => p.name === 'radius') ? 'radius' : 'sigma';
}

// Brightness uses percentages only at this internal rendering boundary.
export function applyBlurParameters(effect, property, radius, scale, brightness = 80) {
    const physicalRadius = Math.round(radius * scale);
    const value = property === 'radius' ? physicalRadius : physicalRadius / 2;
    if (effect[property] !== value)
        effect[property] = value;
    if (effect.brightness !== brightness / 100)
        effect.brightness = brightness / 100;
}

export function applyBlurRate(effect, hz, refresh = 60) {
    // Native Shell.BlurEffect has no capture limiter. No JS repaint timer.
    if ('frame_divisor' in effect) {
        const spec = effect.constructor.find_property('frame-divisor');
        const maximum = spec?.maximum ?? 4;
        const divisor = hz > 0 ? Math.min(maximum, Math.max(1, Math.ceil(refresh / hz))) : 1;
        if (effect.frame_divisor !== divisor)
            effect.frame_divisor = divisor;
    }
}
