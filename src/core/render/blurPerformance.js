// SPDX-License-Identifier: GPL-3.0-only
import {gaussianSteps} from './gaussianKernels.js';
import {kawaseSteps} from './kawase.js';

export function blurReduction(radius, resolution = 'auto') {
    const automatic = Math.min(8, Math.max(2,
        2 ** Math.floor(Math.log2(Math.max(1, radius / 6)))));
    return automatic * (resolution === 'quarter' ? 4 : resolution === 'half' ? 2 : 1);
}

// Include the complete kernel, downsample/reconstruction footprint and lens
// displacement. Final configured values keep storage stable throughout fades.
export function capturePadding(config, scale) {
    const radius = config.blurRadius * scale;
    const reduction = blurReduction(radius, config.resolution);
    const steps = config.method === 'kawase' ? kawaseSteps(config.iterations)
        : config.method === 'fast-gaussian' ? gaussianSteps(config.iterations) : [0.5, 0.5, 0.5];
    const passes = config.method === 'kawase' ? steps.length : steps.length * 2;
    // The rounded lens bends inward: its sample center stays inside the
    // element's rectangle. Reserve the larger support, rather than adding
    // displacement to the kernel and shifting its sampling grid unnecessarily.
    const support = radius * steps.reduce((a, b) => a + b, 0);
    return Math.ceil(Math.max(config.strength * scale, support) +
        (radius > 0 ? (passes + 3) * 0.5 * reduction : 2));
}

// A deadline is checked only when the compositor already paints. Scheduling
// the single trailing refresh (if needed) belongs to the effect, not a loop.
export class CaptureRate {
    due(now, refresh, percent) {
        return percent === 100 || !(refresh > 0) || this.refresh !== refresh ||
            this.percent !== percent || !this.next || now + 0.08e6 / refresh >= this.next;
    }

    commit(now, refresh, percent) {
        const period = 1e6 / (refresh * percent / 100);
        // All surfaces on a monitor use the same time buckets, even when
        // opened at different times. Otherwise one surface's trailing redraw
        // can schedule another's timeout and keep an idle desktop repainting.
        this.next = (Math.floor((now + 0.08e6 / refresh) / period) + 1) * period;
        this.refresh = refresh;
        this.percent = percent;
    }
}
