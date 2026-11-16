// SPDX-License-Identifier: GPL-3.0-only
// Diagonal four-sample passes, with increasing offsets. Each pass
// filters both axes, rather than requiring a horizontal/vertical pair.
export const kawaseSource = `
    vec2 uv = cogl_tex_coord_in[0].xy;
    vec4 color = texture2D(cogl_sampler0, uv + blurStep);
    color += texture2D(cogl_sampler0, uv - blurStep);
    color += texture2D(cogl_sampler0, uv + vec2(blurStep.x, -blurStep.y));
    color += texture2D(cogl_sampler0, uv + vec2(-blurStep.x, blurStep.y));
    cogl_color_out = color * 0.25;
`;

// Match the ideal per-axis variance of the existing three-pair Box filter:
// 3 * mean((-4..4)^2) * (radius / 8)^2 = 20 * (radius / 8)^2.
// Bilinear sampling and the common downsample pyramid add their own variance.
const stepsByIterations = new Map();
export function kawaseSteps(iterations = 3) {
    if (!stepsByIterations.has(iterations)) {
        const squaredOffsets = iterations * (4 * iterations ** 2 - 1) / 12;
        const normalization = Math.sqrt(20 / squaredOffsets) / 8;
        stepsByIterations.set(iterations, Object.freeze(Array.from({length: iterations},
            (_, i) => (i + 0.5) * normalization)));
    }
    return stepsByIterations.get(iterations);
}

export function kawasePadding(blurRadius, strength, scale, iterations = 3) {
    const physicalRadius = blurRadius * scale;
    const reduction = Math.min(8, Math.max(2,
        2 ** Math.floor(Math.log2(Math.max(1, physicalRadius / 6)))));
    // Sum of all diagonal offsets, plus conservative support for the 2x
    // pyramid, bilinear filter passes and final reconstruction. Use the
    // configured final radius, so a fade never reallocates the capture.
    return Math.ceil(physicalRadius * kawaseSteps(iterations).reduce((a, b) => a + b, 0) +
        strength * scale + (iterations + 3) * 0.5 * reduction);
}
