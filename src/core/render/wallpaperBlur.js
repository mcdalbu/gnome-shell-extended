// SPDX-License-Identifier: GPL-3.0-only
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import {GlassBlur, wallpaperBlurPasses, updateWallpaperBlur} from './glassBlur.js';
import {blurReduction} from './blurPerformance.js';

export const WallpaperCache = GObject.registerClass(class GseWallpaperCache extends Clutter.OffscreenEffect {});
const supported = !!Clutter.OffscreenEffect.prototype.get_pipeline && !!Clutter.LayerNode?.new_to_framebuffer;

const WallpaperBlur = GObject.registerClass(class GseWallpaperBlur extends Clutter.OffscreenEffect {
    configure(appearance) {
        const {blurRadius, method, samples, iterations, resolution} = appearance;
        const key = JSON.stringify([blurRadius, method, samples, iterations, resolution]);
        if (this._key === key)
            return;
        this._key = key;
        Object.assign(this, {radius: blurRadius, blurMethod: method, blurSamples: samples,
            blurIterations: iterations, resolution});
        this.blurPasses = method === 'kawase' ? iterations : method === 'box' ? 6 : 2 * iterations;
        this._dirty = true;
        this.queue_repaint();
    }

    vfunc_create_texture(context, width, height) {
        this._context = context;
        this._dirty = true;
        return super.vfunc_create_texture(context, width, height);
    }

    vfunc_paint(node, context, flags) {
        if (flags & Clutter.EffectPaintFlags.ACTOR_DIRTY)
            this._dirty = true;
        super.vfunc_paint(node, context, flags);
    }

    vfunc_paint_target(node, context) {
        const source = this.get_texture();
        const radius = this.radius * this.get_actor().get_resource_scale();
        const width = source.get_width(), height = source.get_height();
        const storage = `${width}:${height}:${blurReduction(radius, this.resolution)}`;
        if (this._storage !== storage || this._filterContext !== this._context) {
            this._storage = storage;
            this._filterContext = this._context;
            this.filter = new GlassBlur(this._context, width, height, radius, this.resolution, true);
            this._dirty = true;
        }
        if (this._dirty) {
            this.output = this.filter.buildNodes(node, source, radius,
                this.blurMethod, this.blurSamples, this.blurIterations);
            this._dirty = false;
        }
        this.get_pipeline().set_layer_texture(0, this.output);
        super.vfunc_paint_target(node, context);
        // PipelineNode snapshots its pipeline. Keep Clutter's input pipeline
        // bound to its own texture for the next actor-source render.
        this.get_pipeline().set_layer_texture(0, source);
    }
});

export function wallpaperFilters(actor, appearance) {
    if (!supported)
        return wallpaperBlurPasses(actor, appearance.blurRadius, appearance.method,
            appearance.samples, appearance.iterations);
    const effect = new WallpaperBlur();
    effect.configure(appearance);
    return [effect];
}

export function updateWallpaperFilter(effect, actor, appearance) {
    if (effect.configure)
        effect.configure(appearance);
    else
        updateWallpaperBlur(effect, actor, appearance.blurRadius);
}

export function wallpaperStructure(appearance) {
    return supported ? '' : `${appearance.method}:${appearance.samples}:${appearance.iterations}`;
}

// RGBA8 storage estimate, including Clutter's full-size input/finish/cache.
// Driver allocation overhead is deliberately not presented as resident memory.
export function wallpaperBytes(effects) {
    let pixels = 0;
    for (const effect of effects) {
        const texture = effect?.get_texture?.();
        if (texture)
            pixels += texture.get_width() * texture.get_height();
        const filter = effect?.filter;
        if (filter)
            pixels += [...filter.levels, filter.scratch, ...(filter.nodeTargets ?? [])].filter(Boolean)
                .reduce((n, t) => n + t.width * t.height, 0);
    }
    return pixels * 4;
}
