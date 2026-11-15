// SPDX-License-Identifier: GPL-3.0-only
// Optimized 5/9/13-tap kernels from glsl-fast-gaussian-blur, MIT.
// Copyright (c) 2015 Jam3. Full license in THIRD_PARTY.md.
export const gaussianKernels = Object.freeze({
    5: {support: 1.3333333333333333, weights: [0.29411764705882354, 0.35294117647058826],
        offsets: [1.3333333333333333]},
    9: {support: 3.2307692308, weights: [0.2270270270, 0.3162162162, 0.0702702703],
        offsets: [1.3846153846, 3.2307692308]},
    13: {support: 5.176470588235294, weights: [0.1964825501511404, 0.2969069646728344, 0.09447039785044732, 0.010381362401148057],
        offsets: [1.411764705882353, 3.2941176470588234, 5.176470588235294]},
});

export function gaussianSource(samples) {
    const {weights, offsets} = gaussianKernels[samples];
    let body = `vec2 uv = cogl_tex_coord_in[0].xy;\nvec4 color = texture2D(cogl_sampler0, uv) * ${weights[0]};\n`;
    for (const [index, offset] of offsets.entries()) {
        for (const sign of ['+', '-'])
            body += `color += texture2D(cogl_sampler0, uv ${sign} blurStep * ${offset}) * ${weights[index + 1]};\n`;
    }
    return body + 'cogl_color_out = color;';
}
