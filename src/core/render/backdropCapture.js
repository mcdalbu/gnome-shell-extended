// SPDX-License-Identifier: GPL-2.0-or-later
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import {applyBlurParameters, applyBlurRate} from '../blurBackend.js';

const CaptureView = GObject.registerClass(class GseCaptureView extends Clutter.Effect {
    vfunc_paint(_node, context, _flags) {
        // A sibling backdrop must never paint independently of its owner,
        // including the frame before a queued focus/restack update runs.
        if (this.owner && (!this.owner.mapped || !this.owner.visible || this.owner.opacity === 0 ||
            this.owner.get_parent() !== this.backdrop.get_parent() ||
            this.owner.get_previous_sibling() !== this.backdrop))
            return;
        // PaintContext.get_stage_view() is not introspectable in Mutter.
        // The framebuffer identifies the view without a private GI call.
        const framebuffer = context.get_framebuffer();
        const onStage = this.get_actor().peek_stage_views()
            .some(view => view.get_framebuffer() === framebuffer);
        // Screenshots can paint into a separate framebuffer. Keep one capture
        // in that path, rather than omitting blur or drawing every view twice.
        if (framebuffer === this.view.get_framebuffer() || (!onStage && this.primary))
            this.get_actor().continue_paint(context);
    }
});

// All dynamic surfaces use the same physical-pixel grid and filter support.
export function updateCaptureAppearance(state, radiusProperty, radius, brightness, rate) {
    for (const capture of state.captures.values()) {
        const scale = capture.view.get_scale();
        const appearance = `${radius}:${scale}:${brightness}:${rate}`;
        if (capture.appearance === appearance)
            continue;
        applyBlurParameters(capture.effect, radiusProperty, radius, scale, brightness);
        applyBlurRate(capture.effect, rate, capture.view.get_refresh_rate?.() ?? 60);
        capture.appearance = appearance;
    }
}

export function syncBackdropCapture(state, view, backend, radiusProperty, radius, brightness, rate, owner = null) {
    // A view owns a physical-pixel sampling grid and its own effect/cache.
    // Sharing a logical grid, or changing one capture between differently
    // scaled views, shifts the blur phase during movement.
    if (!view) {
        for (const stageView of state.blur.peek_stage_views())
            syncBackdropCapture(state, stageView, backend, radiusProperty, radius, brightness, rate, owner);
        return;
    }
    const [x, y] = state.blur.get_transformed_position();
    const [width, height] = state.blur.get_transformed_size();
    const scaleX = width / state.blur.width;
    const scaleY = height / state.blur.height;
    if (!(scaleX > 0 && scaleY > 0))
        return;
    const layout = view.layout;
    if (x >= layout.x + layout.width || x + width <= layout.x ||
        y >= layout.y + layout.height || y + height <= layout.y)
        return;
    let capture = state.captures.get(view);
    if (!capture) {
        const actor = new St.Widget({name: 'gse-backdrop-capture', reactive: false,
            style: 'background-color: transparent;'});
        const onlyView = new CaptureView();
        onlyView.view = view;
        onlyView.primary = state.captures.size === 0;
        onlyView.owner = owner;
        onlyView.backdrop = state.blur;
        actor.add_effect_with_name('gse-capture-view', onlyView);
        const effect = state.captures.size === 0 && state.effect
            ? state.effect : new backend.BlurEffect({mode: backend.BlurMode.BACKGROUND});
        actor.add_effect_with_name('gse-backdrop-blur', effect);
        state.blur.add_child(actor);
        capture = {actor, effect, view};
        state.captures.set(view, capture);
        state.capture ??= actor;
        state.effect ??= effect;
    }
    updateCaptureAppearance(state, radiusProperty, radius, brightness, rate);
    const scale = view.get_scale();
    const physicalRadius = Math.round(radius * scale);
    const steps = Math.max(0, Math.ceil(Math.log2(Math.max(1, physicalRadius / 12))));
    const tile = Math.max(64, 2 ** steps);
    const padding = Math.ceil(3 * radius * scale);
    const gridLeft = Math.floor(((x - layout.x) * scale - padding) / tile) * tile;
    const gridTop = Math.floor(((y - layout.y) * scale - padding) / tile) * tile;
    // Reserve an extra tile for the offset from the window to the grid.
    // Constant capture dimensions prevent backend downscale thresholds
    // and FBO allocations from changing while a window only moves.
    // Both backends stop downsampling when either dimension is <= 256.
    // Give thin panels and large windows the same radius-driven sampling
    // resolution, rather than letting their shapes choose the filter.
    const minimum = steps ? 256 * 2 ** (steps - 1) + tile : tile;
    const viewWidth = Math.round(layout.width * scale);
    const viewHeight = Math.round(layout.height * scale);
    const captureWidth = Math.min(viewWidth,
        Math.max(minimum, (Math.ceil((width * scale + 2 * padding) / tile) + 1) * tile));
    const captureHeight = Math.min(viewHeight,
        Math.max(minimum, (Math.ceil((height * scale + 2 * padding) / tile) + 1) * tile));
    // BACKGROUND blits must stay inside the source framebuffer. Shift a
    // constant-sized capture inward at screen edges instead of sampling past
    // the bottom/right edge or shrinking its texture as the dock slides.
    const left = Math.max(0, Math.min(gridLeft, viewWidth - captureWidth));
    const top = Math.max(0, Math.min(gridTop, viewHeight - captureHeight));
    const right = left + captureWidth;
    const bottom = top + captureHeight;
    const geometry = `${left}:${top}:${right}:${bottom}:${x}:${y}:${scaleX}:${scaleY}:${scale}`;
    if (capture.geometry === geometry)
        return;
    capture.geometry = geometry;
    // Stay just inside the integer capture box: float transforms must not
    // make the backend's outward rounding add a whole source pixel.
    const inset = 1 / 256;
    capture.actor.set_position((layout.x + (left + inset) / scale - x) / scaleX,
        (layout.y + (top + inset) / scale - y) / scaleY);
    capture.actor.set_size((right - left - 2 * inset) / scale / scaleX,
        (bottom - top - 2 * inset) / scale / scaleY);
    capture.effect.queue_repaint();
}
