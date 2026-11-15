// SPDX-License-Identifier: GPL-3.0-only
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import {GlassBlur} from './glassBlur.js';

// Rounded contour lens inspired by Pedro Ruedas's LiquidGlass.fx (GPL-3.0).
// https://github.com/PedroRuedas/Windows-Liquid-glass/blob/main/src/LiquidGlass/Effects/Shaders/LiquidGlass.fx
// Normals come from the signed distance field, without a normal-map texture.
const normalSource = `
float glassDistance(vec2 p, vec2 halfSize, float radius) {
    vec2 q = abs(p) - halfSize + radius;
    return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - radius;
}
vec2 glassOffset(vec2 p, vec2 size, float radius, float strength) {
    vec2 halfSize = max(size * 0.5, vec2(1.0));
    radius = min(radius, min(halfSize.x, halfSize.y));
    p -= halfSize;
    float distance = glassDistance(p, halfSize, radius);
    vec2 gradient = vec2(
        glassDistance(p+vec2(0.5,0.0),halfSize,radius)-glassDistance(p-vec2(0.5,0.0),halfSize,radius),
        glassDistance(p+vec2(0.0,0.5),halfSize,radius)-glassDistance(p-vec2(0.0,0.5),halfSize,radius));
    vec2 normal = gradient / max(length(gradient), 0.0001);
    float bezelWidth = min(28.0, min(halfSize.x, halfSize.y));
    float bezel = clamp(1.0-max(-distance,0.0)/max(bezelWidth,0.001),0.0,1.0);
    return -normal * strength * pow(bezel, 1.6);
}`;

// In-place BACKGROUND effect: copy only already painted pixels into a GPU
// texture before drawing. Never use a CPU readback, a previous frame, or an
// offscreen parent that would capture the surface's own foreground.
let backdropSnippet;
let wallpaperSnippet;

export const RefractionEffect = GObject.registerClass({
    Properties: {
        radius: GObject.ParamSpec.double('radius', null, null, GObject.ParamFlags.READWRITE, 0, 100, 6),
        brightness: GObject.ParamSpec.double('brightness', null, null, GObject.ParamFlags.READWRITE, 0, 1, 1),
    },
}, class GseRefractionEffect extends Clutter.Effect {
    _init(params = {}) {
        super._init();
        this.isRefraction = true;
        this.combined = params.mode === 1;
        this.radius = 6;
        this.brightness = 1;
        this._buffers = new Map();
    }

    configure(config) {
        if (config?.blurRadius === 0 && this.glassConfig?.blurRadius !== 0) {
            // A screenshot may not paint again after the user disables blur.
            // Release its blur pyramid too, rather than waiting for repaint.
            for (const buffer of this._buffers.values()) {
                buffer.pipeline.set_layer_texture(0, buffer.texture);
                buffer.filter = null;
                buffer.filterMaximum = 0;
            }
        }
        this.glassConfig = config;
    }

    release() {
        this._buffers.clear();
    }

    vfunc_paint(_node, context, _flags) {
        const actor = this.get_actor();
        const framebuffer = context.get_framebuffer();
        const views = actor.peek_stage_views();
        const view = views.find(v => v.get_framebuffer() === framebuffer);
        // Screenshots use a separate, full-stage framebuffer.
        const scale = view?.get_scale() ?? framebuffer.get_width() / global.stage.width;
        const layout = view?.layout ?? {x: 0, y: 0};
        const [x, y] = actor.get_transformed_position();
        const [w, h] = actor.get_transformed_size();
        const left = Math.max(0, Math.ceil((x - layout.x) * scale));
        const top = Math.max(0, Math.ceil((y - layout.y) * scale));
        const right = Math.min(framebuffer.get_width(), Math.floor((x + w - layout.x) * scale));
        const bottom = Math.min(framebuffer.get_height(), Math.floor((y + h - layout.y) * scale));
        const width = right - left;
        const height = bottom - top;
        if (width <= 0 || height <= 0 || w <= 0 || h <= 0)
            return;
        try {
            const cogl = framebuffer.get_context();
            const feature = Cogl.FeatureID.BLIT_FRAMEBUFFER ?? Cogl.FeatureID.OGL_FEATURE_ID_BLIT_FRAMEBUFFER;
            if (feature !== undefined) {
                const available = cogl.get_driver
                    ? cogl.get_driver().has_feature(feature) : Cogl.has_feature?.(cogl, feature);
                if (available === false)
                    throw new Error('Framebuffer copies unsupported by this driver');
            }
            // Keep at most one real-view buffer and one screenshot buffer per
            // effect; resizing replaces storage rather than retaining old FBOs.
            const key = view ? 'view' : 'capture';
            let buffer = this._buffers.get(key);
            if (!buffer || buffer.width !== width || buffer.height !== height) {
                const texture = Cogl.Texture2D.new_with_size(cogl, width, height);
                const target = Cogl.Offscreen.new_with_texture(texture);
                target.allocate();
                const pipeline = Cogl.Pipeline.new(cogl);
                pipeline.set_layer_texture(0, texture);
                pipeline.set_blend('RGBA = ADD (SRC_COLOR, DST_COLOR * (1 - SRC_COLOR[A]))');
                pipeline.set_layer_filters(0, Cogl.PipelineFilter.LINEAR, Cogl.PipelineFilter.LINEAR);
                pipeline.set_layer_wrap_mode(0, Cogl.PipelineWrapMode.CLAMP_TO_EDGE);
                if (!backdropSnippet) {
                    backdropSnippet = Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT,
                        `uniform vec2 glassSize; uniform vec2 glassOrigin;
                         uniform float glassScale; uniform float glassStrength;
                         uniform float glassBrightness; uniform float glassOpacity;
                         uniform vec4 glassBounds; uniform float glassCorner;
                         ${normalSource}`, null);
                    backdropSnippet.set_replace(`
                    vec2 uv = cogl_tex_coord_in[0].xy;
                    vec2 p = glassOrigin + uv * glassSize / glassScale;
                    vec2 offset = vec2(0.0);
                    if (glassStrength > 0.0)
                        offset = glassOffset(p-glassBounds.xy, glassBounds.zw, glassCorner, glassStrength) * glassScale / glassSize;
                    vec2 halfPixel = vec2(0.5) / glassSize;
                    vec4 color = texture2D(cogl_sampler0, clamp(uv + offset, halfPixel, vec2(1.0)-halfPixel));
                    vec2 halfGlass = max(glassBounds.zw * 0.5, vec2(0.001));
                    float corner = min(glassCorner, min(halfGlass.x, halfGlass.y));
                    float distance = glassDistance(p-glassBounds.xy-halfGlass, halfGlass, corner);
                    float coverage = clamp(0.5-distance*glassScale, 0.0, 1.0);
                    cogl_color_out = vec4(color.rgb * glassBrightness, 1.0) * glassOpacity * coverage;
                    `);
                }
                pipeline.add_snippet(backdropSnippet);
                buffer = {texture, target, pipeline, width, height};
                this._buffers.set(key, buffer);
            }
            // Flush the scene before the blit. Blit ignores source clipping;
            // rounded destination clipping stays active for the final draw.
            framebuffer.flush();
            if (!framebuffer.blit(buffer.target, left, top, 0, 0, width, height))
                throw new Error('Framebuffer blit failed');
            const pipeline = buffer.pipeline;
            const blurRadius = this.combined ? this.radius * (this.glassConfig?.blurRatio ?? 0) * scale : 0;
            if (blurRadius > 0) {
                const maximum = (this.glassConfig?.blurRadius ?? 0) * scale;
                if (!buffer.filter || buffer.filterMaximum !== maximum) {
                    buffer.filter = new GlassBlur(cogl, width, height, maximum);
                    buffer.filterMaximum = maximum;
                }
                pipeline.set_layer_texture(0, buffer.filter.apply(buffer.texture, blurRadius, this.glassConfig.method, this.glassConfig.samples));
            } else {
                pipeline.set_layer_texture(0, buffer.texture);
                if (this.glassConfig?.blurRadius === 0) {
                    buffer.filter = null;
                    buffer.filterMaximum = 0;
                }
            }
            const uniform = (name, value) => pipeline.set_uniform_1f(pipeline.get_uniform_location(name), value);
            pipeline.set_uniform_float(pipeline.get_uniform_location('glassSize'), 2, 1, [width, height]);
            pipeline.set_uniform_float(pipeline.get_uniform_location('glassOrigin'), 2, 1,
                [layout.x + left / scale, layout.y + top / scale]);
            pipeline.set_uniform_float(pipeline.get_uniform_location('glassBounds'), 4, 1,
                this.glassBounds ?? [x, y, w, h]);
            uniform('glassCorner', this.glassCorner ?? 0);
            uniform('glassScale', scale);
            uniform('glassStrength', this.radius * (this.glassConfig?.strengthRatio ?? 1));
            uniform('glassBrightness', this.brightness);
            uniform('glassOpacity', actor.get_paint_opacity() / 255);
            framebuffer.draw_textured_rectangle(pipeline,
                (layout.x + left / scale - x) * actor.width / w,
                (layout.y + top / scale - y) * actor.height / h,
                (layout.x + right / scale - x) * actor.width / w,
                (layout.y + bottom / scale - y) * actor.height / h, 0, 0, 1, 1);
            this._failed = false;
        } catch (error) {
            // Leave the native translucent tint if a driver cannot copy the
            // framebuffer. Do not retain or display an obsolete capture.
            this._buffers.clear();
            if (!this._failed)
                console.error(`GSE refraction: ${error.message}`);
            this._failed = true;
        }
    }
});

export function refractionBackend(combined = false) {
    return {name: combined ? 'combined' : 'refraction', api: {BlurEffect: RefractionEffect, BlurMode: {BACKGROUND: combined ? 1 : 0}}};
}

// Wallpaper already has a source texture; distort that texture instead of
// capturing unrelated Shell layers or the lock screen's foreground controls.
export function wallpaperRefraction(actor, strength, brightness) {
    const declarations = `uniform float strength; uniform float glassWidth;
        uniform float glassHeight; uniform float brightness; ${normalSource}`;
    const fragment = `
        vec2 uv = cogl_tex_coord_in[0].xy;
        vec2 size = vec2(glassWidth, glassHeight);
        vec2 d = glassOffset(uv * size, size, 0.0, strength) / size;
        cogl_color_out = texture2D(SAMPLER, clamp(uv+d, vec2(0.001), vec2(0.999)))
            * cogl_color_in * vec4(vec3(brightness), 1.0);`;
    let effect;
    if (Clutter.ShaderEffect.new_with_snippet) {
        if (!wallpaperSnippet) {
            wallpaperSnippet = Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, declarations, null);
            wallpaperSnippet.set_replace(fragment.replace('SAMPLER', 'cogl_sampler0'));
        }
        effect = Clutter.ShaderEffect.new_with_snippet(wallpaperSnippet);
    } else {
        effect = new Clutter.ShaderEffect({shader_type: Clutter.ShaderType.FRAGMENT_SHADER});
        effect.set_shader_source(`uniform sampler2D tex; ${declarations}
            void main() { ${fragment.replace('SAMPLER', 'tex')} }`);
    }
    setWallpaperStrength(effect, actor, strength, brightness);
    return effect;
}

export function setWallpaperStrength(effect, actor, strength, brightness) {
    for (const [name, number] of Object.entries({strength, brightness,
        glassWidth: Math.max(1, actor.width), glassHeight: Math.max(1, actor.height)})) {
        const value = new GObject.Value();
        value.init(GObject.TYPE_FLOAT);
        value.set_float(number);
        effect.set_uniform_value(name, value);
    }
}
