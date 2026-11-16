// SPDX-License-Identifier: GPL-3.0-only
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import {gaussianKernels, gaussianSource, gaussianSteps} from './gaussianKernels.js';
import {kawaseSource, kawaseSteps} from './kawase.js';
import {blurReduction} from './blurPerformance.js';

const box = `
    vec2 uv = cogl_tex_coord_in[0].xy;
    vec4 color = vec4(0.0);
    for (int i = -4; i <= 4; i++)
        color += texture2D(cogl_sampler0, uv + blurStep * float(i));
    cogl_color_out = color / 9.0;
`;
const snippets = new Map();
const boxSteps = Object.freeze([1, 1, 1]);

function filterSource(method, samples) {
    return method === 'kawase' ? kawaseSource : method === 'fast-gaussian' ? gaussianSource(samples) : box;
}

function pipeline(context, method = null, samples = 13) {
    const result = Cogl.Pipeline.new(context);
    result.set_layer_filters(0, Cogl.PipelineFilter.LINEAR, Cogl.PipelineFilter.LINEAR);
    result.set_layer_wrap_mode(0, Cogl.PipelineWrapMode.CLAMP_TO_EDGE);
    if (method) {
        const key = method === 'fast-gaussian' ? `${method}:${samples}` : method;
        if (!snippets.has(key)) {
            const snippet = Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, 'uniform vec2 blurStep;', null);
            snippet.set_replace(filterSource(method, samples));
            snippets.set(key, snippet);
        }
        result.add_snippet(snippets.get(key));
    }
    return result;
}

function target(context, width, height) {
    const texture = Cogl.Texture2D.new_with_size(context, width, height);
    const framebuffer = Cogl.Offscreen.new_with_texture(texture);
    framebuffer.allocate();
    framebuffer.orthographic(0, 0, width, height, -1, 1);
    return {texture, framebuffer, width, height};
}

// GPU-only filters. Build a 2x pyramid so a wide blur never skips
// entire source stripes. Geometry uses the final radius, stable during fades.
export class GlassBlur {
    constructor(context, width, height, maximumRadius, resolution = 'auto') {
        this.levels = [];
        const reduction = blurReduction(maximumRadius, resolution);
        for (let factor = 1; factor < reduction; factor *= 2) {
            width = Math.max(1, Math.ceil(width / 2));
            height = Math.max(1, Math.ceil(height / 2));
            this.levels.push(target(context, width, height));
        }
        this.scratch = target(context, width, height);
        this.copy = pipeline(context);
        this.context = context;
        this.filters = new Map();
        this.reduction = reduction;
    }

    _draw(destination, source, shader) {
        shader.set_layer_texture(0, source);
        destination.framebuffer.draw_textured_rectangle(shader,
            0, 0, destination.width, destination.height, 0, 0, 1, 1);
    }

    apply(source, radius, method, samples = 13, iterations = method === 'kawase' ? 3 : 4) {
        for (const level of this.levels) {
            this._draw(level, source, this.copy);
            source = level.texture;
        }
        const output = this.levels[this.levels.length - 1];
        const key = method === 'fast-gaussian' ? `${method}:${samples}` : method;
        if (!this.filters.has(key))
            this.filters.set(key, pipeline(this.context, method, samples));
        const shader = this.filters.get(key);
        if (method === 'kawase') {
            let read = output;
            let write = this.scratch;
            const location = shader.get_uniform_location('blurStep');
            for (const factor of kawaseSteps(iterations)) {
                const offset = radius * factor / this.reduction;
                shader.set_uniform_float(location, 2, 1, [offset / output.width, offset / output.height]);
                this._draw(write, read.texture, shader);
                [read, write] = [write, read];
            }
            read.framebuffer.flush();
            return read.texture;
        }
        const step = radius / this.reduction / (method === 'fast-gaussian' ? gaussianKernels[samples].support : 8);
        const location = shader.get_uniform_location('blurStep');
        // Reuse the same two targets for progressive Gaussian H/V pairs.
        // Each pass reads the preceding result; never sample the draw target.
        const steps = method === 'box' ? boxSteps : gaussianSteps(iterations);
        for (const factor of steps) {
            shader.set_uniform_float(location, 2, 1, [step * factor / output.width, 0]);
            this._draw(this.scratch, output.texture, shader);
            shader.set_uniform_float(location, 2, 1, [0, step * factor / output.height]);
            this._draw(output, this.scratch.texture, shader);
        }
        output.framebuffer.flush();
        return output.texture;
    }
}

const wallpaperSnippets = new Map();

// Actor-source wallpaper filters use Clutter's cached offscreen chain. Each
// pass reads the preceding pass after it has painted, never an old CPU copy.
export function wallpaperBlurPasses(actor, radius, method, samples = 13, iterations = method === 'kawase' ? 3 : 4) {
    const key = method === 'fast-gaussian' ? `${method}:${samples}` : method;
    const fragment = filterSource(method, samples)
        .replaceAll('blurStep', 'vec2(blurStepX, blurStepY)')
        .replaceAll('texture2D', 'glassWallpaperSample');
    const declarations = `uniform float blurStepX; uniform float blurStepY;
        uniform float blurClampX; uniform float blurClampY;
        vec4 glassWallpaperSample(sampler2D image, vec2 uv) {
            vec2 edge = vec2(blurClampX, blurClampY);
            return texture2D(image, clamp(uv, edge, vec2(1.0)-edge));
        }`;
    const effects = [];
    const steps = method === 'kawase' ? kawaseSteps(iterations) : method === 'box' ? boxSteps : gaussianSteps(iterations);
    for (const factor of steps) {
        for (const axis of (method === 'kawase' ? [2] : [0, 1])) {
            let effect;
            if (Clutter.ShaderEffect.new_with_snippet) {
                if (!wallpaperSnippets.has(key)) {
                    const snippet = Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, declarations, null);
                    snippet.set_replace(fragment);
                    wallpaperSnippets.set(key, snippet);
                }
                effect = Clutter.ShaderEffect.new_with_snippet(wallpaperSnippets.get(key));
            } else {
                effect = new Clutter.ShaderEffect({shader_type: Clutter.ShaderType.FRAGMENT_SHADER});
                effect.set_shader_source(`uniform sampler2D tex; ${declarations}
                    void main() { ${fragment.replaceAll('cogl_sampler0', 'tex')} }`);
            }
            effect.blurAxis = axis;
            effect.blurMethod = method;
            effect.blurSamples = samples;
            effect.blurFactor = factor;
            updateWallpaperBlur(effect, actor, radius);
            effects.push(effect);
        }
    }
    return effects;
}

export function updateWallpaperBlur(effect, actor, radius) {
    const support = effect.blurMethod === 'kawase' ? 1 : effect.blurMethod === 'box' ? 8 : gaussianKernels[effect.blurSamples].support;
    const step = radius * effect.blurFactor / support;
    for (const [name, number] of Object.entries({
        blurClampX: Math.min(0.49, 2 / Math.max(1, actor.width)),
        blurClampY: Math.min(0.49, 2 / Math.max(1, actor.height)),
        blurStepX: effect.blurAxis !== 1 ? step / Math.max(1, actor.width) : 0,
        blurStepY: effect.blurAxis !== 0 ? step / Math.max(1, actor.height) : 0,
    })) {
        const value = new GObject.Value();
        value.init(GObject.TYPE_FLOAT);
        value.set_float(number);
        effect.set_uniform_value(name, value);
    }
    effect.enabled = radius > 0;
}
