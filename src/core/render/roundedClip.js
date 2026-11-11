// SPDX-License-Identifier: GPL-2.0-or-later
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
let Mtk;
let Cairo;
try {
    Mtk = (await import('gi://Mtk')).default;
} catch {
    Cairo = (await import('cairo')).default;
}

// Clip the destination framebuffer directly: an offscreen mask would change
// the framebuffer that BACKGROUND blur captures. Cache the pixel region.
export const RoundedClip = GObject.registerClass(class GseRoundedClip extends Clutter.Effect {
    _init() {
        super._init();
        this.radius = 0;
    }

    vfunc_paint(_node, context, _flags) {
        const actor = this.get_actor();
        const framebuffer = context.get_framebuffer();
        const views = actor.peek_stage_views();
        const view = views.find(v => v.get_framebuffer() === framebuffer) ?? views[0];
        if (!view) {
            actor.continue_paint(context);
            return;
        }
        const layout = view.layout;
        const scale = view.get_scale();
        // The dock backdrop is a sibling of its root, so Clutter does not
        // inherit the slide container's clip. Read it at paint time: layout
        // can finish after before-update, and a hidden dock remains mapped.
        let sourceClip = null;
        for (let source = this.clipSource; source; source = source.get_parent()) {
            if (!source.mapped || source.get_paint_opacity() === 0)
                return;
            const clips = [];
            if (source.has_clip)
                clips.push(source.get_clip());
            if (source.clip_to_allocation)
                clips.push([0, 0, source.width, source.height]);
            for (const [cx, cy, cw, ch] of clips) {
                if (cw <= 0 || ch <= 0)
                    return;
                const points = [[cx, cy], [cx + cw, cy], [cx, cy + ch], [cx + cw, cy + ch]]
                    .map(([px, py]) => source.apply_relative_transform_to_point(global.stage,
                        new Graphene.Point3D({x: px, y: py, z: 0})));
                const bounds = [Math.min(...points.map(p => p.x)), Math.min(...points.map(p => p.y)),
                    Math.max(...points.map(p => p.x)), Math.max(...points.map(p => p.y))];
                sourceClip = sourceClip
                    ? [Math.max(sourceClip[0], bounds[0]), Math.max(sourceClip[1], bounds[1]),
                        Math.min(sourceClip[2], bounds[2]), Math.min(sourceClip[3], bounds[3])]
                    : bounds;
            }
        }
        if (sourceClip && (sourceClip[2] <= sourceClip[0] || sourceClip[3] <= sourceClip[1]))
            return;
        const [stageX, stageY] = actor.get_transformed_position();
        const [stageWidth, stageHeight] = actor.get_transformed_size();
        const x = Math.ceil((stageX - layout.x) * scale);
        const y = Math.ceil((stageY - layout.y) * scale);
        const width = Math.floor((stageX + stageWidth - layout.x) * scale) - x;
        const height = Math.floor((stageY + stageHeight - layout.y) * scale) - y;
        const transformScale = Math.min(stageWidth / actor.width, stageHeight / actor.height);
        const radius = Math.min(this.radius * scale * transformScale, width / 2, height / 2);
        const key = `${x}:${y}:${width}:${height}:${radius}`;
        if (key !== this._key) {
            const region = Mtk ? Mtk.Region.create() : new Cairo.Region();
            const add = (left, top, w, h) => {
                if (w <= 0 || h <= 0)
                    return;
                const rect = {x:left, y:top, width:w, height:h};
                if (Mtk)
                    region.union_rectangle(new Mtk.Rectangle(rect));
                else
                    region.unionRectangle(rect);
            };
            const rows = Math.ceil(radius);
            add(x, y + rows, width, height - rows * 2);
            for (let row = 0; row < rows; row++) {
                const dy = Math.max(0, radius - row - 0.5);
                const inset = Math.ceil(radius - Math.sqrt(Math.max(0, radius * radius - dy * dy)));
                add(x + inset, y + row, width - inset * 2, 1);
                add(x + inset, y + height - row - 1, width - inset * 2, 1);
            }
            this._region = region;
            this._key = key;
        }
        framebuffer.push_region_clip(this._region);
        if (sourceClip) {
            const left = Math.ceil((sourceClip[0] - layout.x) * scale);
            const top = Math.ceil((sourceClip[1] - layout.y) * scale);
            const right = Math.floor((sourceClip[2] - layout.x) * scale);
            const bottom = Math.floor((sourceClip[3] - layout.y) * scale);
            const rect = {x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top)};
            const region = Mtk ? Mtk.Region.create() : new Cairo.Region();
            if (rect.width > 0 && rect.height > 0) {
                if (Mtk)
                    region.union_rectangle(new Mtk.Rectangle(rect));
                else
                    region.unionRectangle(rect);
            }
            framebuffer.push_region_clip(region);
        }
        try {
            actor.continue_paint(context);
        } finally {
            if (sourceClip)
                framebuffer.pop_clip();
            framebuffer.pop_clip();
        }
    }
});
