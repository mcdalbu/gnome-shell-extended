// SPDX-License-Identifier: GPL-3.0-only
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import {GlassBlur} from './glassBlur.js';
import {CaptureRate, blurReduction} from './blurPerformance.js';
import {uniforms} from './uniforms.js';
import {liquidSource} from './liquid.js';

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
// texture before drawing. A rate-limited or incomplete native source reuses
// its prepared texture. Never capture an offscreen parent or CPU pixels.
let backdropSnippet;
let wallpaperSnippet;
const capabilities = new WeakMap();

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
        this.statistics = {captures: 0, rateReuses: 0, regionalReuses: 0, trailing: 0};
    }

    configure(config) {
        const styleChanged = this.glassConfig && this.glassConfig.glassStyle !== config?.glassStyle;
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
        if (styleChanged)
            this.queue_repaint();
    }

    release() {
        if (this._captureExpiry)
            GLib.Source.remove(this._captureExpiry);
        this._captureExpiry = 0;
        for (const buffer of this._buffers.values())
            this._cancelRefresh(buffer);
        this._buffers.clear();
        this.regionalRefresh = null;
    }

    estimatedBytes() {
        let pixels = 0;
        for (const b of this._buffers.values()) {
            pixels += b.width * b.height;
            if (b.filter)
                pixels += [...b.filter.levels, b.filter.scratch].reduce((n, t) => n + t.width * t.height, 0);
        }
        return pixels * 4;
    }

    forceNextRefresh(view) {
        const buffer = this._buffers.get('view');
        if (buffer?.view === view) {
            this._cancelRefresh(buffer);
            buffer.forceRefresh = true;
        }
    }

    _cancelRefresh(buffer) {
        if (buffer.refreshSource)
            GLib.Source.remove(buffer.refreshSource);
        buffer.refreshSource = 0;
    }

    _parameters(scale) {
        const config = this.glassConfig;
        const radius = this.combined ? this.radius * (config?.blurRatio ?? 0) * scale : 0;
        return `${radius}:${config?.method}:${config?.samples}:${config?.iterations}:${config?.resolution}`;
    }

    // Used by regional damage handling too, so a deliberately skipped refresh
    // does not request a source-margin redraw at the full monitor frequency.
    deferForRate(view) {
        const percent = this.glassConfig?.refreshPercent ?? 100;
        if (percent === 100)
            return false;
        const buffer = this._buffers.get('view');
        if (!buffer?.prepared || buffer.view !== view || buffer.forceRefresh)
            return false;
        const refresh = view.get_refresh_rate?.() ?? 0;
        if (!(refresh > 0) || buffer.parameters !== this._parameters(view.get_scale()))
            return false;
        const now = GLib.get_monotonic_time();
        if (buffer.rate.due(now, refresh, percent))
            return false;
        // Moving/resizing captures must sample their new source immediately.
        const actor = this.get_actor();
        const [x, y] = actor.get_transformed_position();
        const [w, h] = actor.get_transformed_size();
        if (buffer.transform !== `${x}:${y}:${w}:${h}`)
            return false;
        if (!buffer.refreshSource) {
            buffer.refreshSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                Math.max(1, Math.ceil((buffer.rate.next - now) / 1000)), () => {
                    buffer.refreshSource = 0;
                    // One final refresh after the source stops changing. This
                    // refresh is forced and cannot schedule another timeout.
                    buffer.forceRefresh = true;
                    this.statistics.trailing++;
                    if (actor.mapped) {
                        this.regionalRefresh?.();
                        actor.queue_redraw();
                    }
                    return GLib.SOURCE_REMOVE;
                });
        }
        return true;
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
        // Capture every touched pixel; the destination scissor and shader
        // own the surface coverage. Rounding inward drops the first/last
        // framebuffer row when the shared capture has its subpixel inset,
        // leaving a sharp one-pixel strip along screen-edge panels.
        const left = Math.max(0, Math.floor((x - layout.x) * scale));
        const top = Math.max(0, Math.floor((y - layout.y) * scale));
        const right = Math.min(framebuffer.get_width(), Math.ceil((x + w - layout.x) * scale));
        const bottom = Math.min(framebuffer.get_height(), Math.ceil((y + h - layout.y) * scale));
        const width = right - left;
        const height = bottom - top;
        if (width <= 0 || height <= 0 || w <= 0 || h <= 0)
            return;
        try {
            const cogl = framebuffer.get_context();
            const key = view ? 'view' : 'capture';
            let buffer = this._buffers.get(key);
            const transform = `${x}:${y}:${w}:${h}`;
            const parameters = this._parameters(scale);
            const prepared = buffer?.prepared && buffer.context === cogl && buffer.width === width && buffer.height === height && buffer.view === view;
            const valid = prepared && buffer.transform === transform && buffer.parameters === parameters;
            // A partial source region must not capture this surface's old
            // pixels. Reuse a prepared image until the requested native region
            // is refreshed. New/resized surfaces keep their native tint for
            // that one frame rather than showing an uninitialized texture.
            if (view && this.captureDeferred && !prepared)
                return;
            const limited = valid && view && this.deferForRate(view);
            const reuse = !!(view && prepared && (this.captureDeferred || limited));
            if (!capabilities.has(cogl)) {
                const feature = Cogl.FeatureID.BLIT_FRAMEBUFFER ?? Cogl.FeatureID.OGL_FEATURE_ID_BLIT_FRAMEBUFFER;
                const available = feature === undefined ? true : cogl.get_driver
                    ? cogl.get_driver().has_feature(feature) : Cogl.has_feature?.(cogl, feature);
                capabilities.set(cogl, available !== false);
            }
            if (!capabilities.get(cogl))
                throw new Error('Framebuffer copies unsupported by this driver');
            // Keep at most one real-view buffer and one screenshot buffer per
            // effect; resizing replaces storage rather than retaining old FBOs.
            if (!buffer || buffer.context !== cogl || buffer.width !== width || buffer.height !== height) {
                if (buffer)
                    this._cancelRefresh(buffer);
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
                         uniform float glassBrightness; uniform float glassOpacity; uniform float glassLiquid;
                         uniform vec4 glassBounds; uniform float glassCorner;
                         ${normalSource} ${liquidSource}`, null);
                    backdropSnippet.set_replace(`
                    vec2 uv = cogl_tex_coord_in[0].xy;
                    vec2 p = glassOrigin + uv * glassSize / glassScale;
                    vec2 offset = vec2(0.0);
                    vec3 lens = vec3(0.0);
                    if (glassStrength > 0.0) {
                        if (glassLiquid > 0.5) {
                            lens = liquidLens(p-glassBounds.xy, glassBounds.zw, glassCorner, glassStrength);
                            offset = lens.xy * glassScale / glassSize;
                        } else {
                            offset = glassOffset(p-glassBounds.xy, glassBounds.zw, glassCorner, glassStrength) * glassScale / glassSize;
                        }
                    }
                    vec2 halfPixel = vec2(0.5) / glassSize;
                    vec4 color = texture2D(cogl_sampler0, clamp(uv + offset, halfPixel, vec2(1.0)-halfPixel));
                    color.rgb += vec3(lens.z);
                    vec2 halfGlass = max(glassBounds.zw * 0.5, vec2(0.001));
                    float corner = min(glassCorner, min(halfGlass.x, halfGlass.y));
                    float distance = glassDistance(p-glassBounds.xy-halfGlass, halfGlass, corner);
                    float coverage = clamp(0.5-distance*glassScale, 0.0, 1.0);
                    cogl_color_out = vec4(color.rgb * glassBrightness, 1.0) * glassOpacity * coverage;
                    `);
                }
                pipeline.add_snippet(backdropSnippet);
                buffer = {texture, target, pipeline, width, height, context: cogl, rate: new CaptureRate(), uniforms: uniforms(pipeline)};
                this._buffers.set(key, buffer);
            }
            // Flush the scene before the blit. Blit ignores source clipping;
            // rounded destination clipping stays active for the final draw.
            const pipeline = buffer.pipeline;
            const blurRadius = this.combined ? this.radius * (this.glassConfig?.blurRatio ?? 0) * scale : 0;
            if (!reuse) {
                framebuffer.flush();
                if (!framebuffer.blit(buffer.target, left, top, 0, 0, width, height))
                    throw new Error('Framebuffer blit failed');
                if (blurRadius > 0) {
                    const maximum = (this.glassConfig?.blurRadius ?? 0) * scale;
                    const resolution = this.glassConfig?.resolution ?? 'auto';
                    if (!buffer.filter || buffer.filter.reduction !== blurReduction(maximum, resolution)) {
                        buffer.filter = new GlassBlur(cogl, width, height, maximum, resolution);
                    }
                    buffer.filterMaximum = maximum;
                    buffer.resolution = resolution;
                    pipeline.set_layer_texture(0, buffer.filter.apply(buffer.texture, blurRadius,
                        this.glassConfig.method, this.glassConfig.samples, this.glassConfig.iterations));
                } else {
                    pipeline.set_layer_texture(0, buffer.texture);
                    if (this.glassConfig?.blurRadius === 0) {
                        buffer.filter = null;
                        buffer.filterMaximum = 0;
                    }
                }
                this._cancelRefresh(buffer);
                buffer.forceRefresh = false;
                buffer.prepared = true;
                buffer.parameters = parameters;
                buffer.transform = transform;
                buffer.view = view;
                if (view) {
                    buffer.rate.commit(GLib.get_monotonic_time(), view.get_refresh_rate?.() || 60,
                        this.glassConfig?.refreshPercent ?? 100);
                    this.statistics.captures++;
                }
            } else {
                this.statistics[limited ? 'rateReuses' : 'regionalReuses']++;
            }
            const uniform = (name, value) => buffer.uniforms.scalar(name, value);
            buffer.uniforms.vector('glassSize', [width, height]);
            buffer.uniforms.vector('glassOrigin',
                [layout.x + left / scale, layout.y + top / scale]);
            buffer.uniforms.vector('glassBounds',
                this.glassBounds ?? [x, y, w, h]);
            uniform('glassCorner', this.glassCorner ?? 0);
            uniform('glassScale', scale);
            uniform('glassStrength', this.radius * (this.glassConfig?.strengthRatio ?? 1));
            uniform('glassLiquid', this.glassConfig?.glassStyle === 'liquid' ? 1 : 0);
            uniform('glassBrightness', this.brightness);
            uniform('glassOpacity', actor.get_paint_opacity() / 255);
            framebuffer.draw_textured_rectangle(pipeline,
                (layout.x + left / scale - x) * actor.width / w,
                (layout.y + top / scale - y) * actor.height / h,
                (layout.x + right / scale - x) * actor.width / w,
                (layout.y + bottom / scale - y) * actor.height / h, 0, 0, 1, 1);
            if (!view) {
                if (this._captureExpiry)
                    GLib.Source.remove(this._captureExpiry);
                this._captureExpiry = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                    this._captureExpiry = 0;
                    this._buffers.delete('capture');
                    return GLib.SOURCE_REMOVE;
                });
            }
            this._failed = false;
        } catch (error) {
            // Leave the native translucent tint if a driver cannot copy the
            // framebuffer. Do not retain or display an obsolete capture.
            this.release();
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
export function wallpaperRefraction(actor, strength, brightness, opaque = false, style = 'contour') {
    const declarations = `uniform float strength; uniform float glassWidth;
        uniform float glassHeight; uniform float brightness; uniform float wallpaperOpaque;
        uniform float glassLiquid; ${normalSource} ${liquidSource}`;
    const fragment = `
        vec2 uv = cogl_tex_coord_in[0].xy;
        vec2 size = vec2(glassWidth, glassHeight);
        vec2 d = vec2(0.0);
        vec3 lens = vec3(0.0);
        if (strength > 0.0) {
            if (glassLiquid > 0.5) {
                lens = liquidLens(uv * size, size, 0.0, strength);
                d = lens.xy / size;
            } else {
                d = glassOffset(uv * size, size, 0.0, strength) / size;
            }
        }
        vec4 color = texture2D(SAMPLER, clamp(uv+d, vec2(0.001), vec2(0.999)));
        color.rgb += vec3(lens.z) * color.a;
        // The panel's wallpaper is opaque. Normalize premultiplied coverage
        // at the offscreen border instead of revealing unrelated windows.
        if (wallpaperOpaque > 0.5)
            color = vec4(color.rgb / max(color.a, 0.0001), 1.0);
        cogl_color_out = color * cogl_color_in * vec4(vec3(brightness), 1.0);`;
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
    effect.wallpaperOpaque = opaque;
    setWallpaperStrength(effect, actor, strength, brightness, style);
    return effect;
}

export function setWallpaperStrength(effect, actor, strength, brightness, style = 'contour') {
    effect.glassStyle = style;
    effect._wallpaperUniforms ??= new Map();
    for (const [name, number] of Object.entries({strength, brightness, glassLiquid: style === 'liquid' ? 1 : 0,
        wallpaperOpaque: effect.wallpaperOpaque ? 1 : 0,
        glassWidth: Math.max(1, actor.width), glassHeight: Math.max(1, actor.height)})) {
        if (effect._wallpaperUniforms.get(name) === number)
            continue;
        effect._wallpaperUniforms.set(name, number);
        const value = new GObject.Value();
        value.init(GObject.TYPE_FLOAT);
        value.set_float(number);
        effect.set_uniform_value(name, value);
    }
}
