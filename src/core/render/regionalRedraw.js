// SPDX-License-Identifier: GPL-3.0-only
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Mtk from 'gi://Mtk';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const owners = new Map();
let signal = 0;
let failed = false;
const pending = new Map();
let later = 0;
export const diagnostics = {frames: 0, deferred: 0, ready: 0, skipped: 0, requests: 0, fullView: true, failure: null};
export const supported = typeof global.stage.queue_redraw_with_clip === 'function' &&
    typeof Clutter.StageView.prototype.get_transform === 'function' &&
    typeof Mtk.Region.prototype.contains_rectangle === 'function' &&
    GObject.signal_lookup('paint-view', Clutter.Stage) > 0;

// Keep the compositor's native painter, damage history, presentation and other
// paint-view handlers. Never edit its const region or paint the stage twice.
// If a source margin wasn't refreshed, reuse the previous filtered image and
// request only that rectangle for the next frame. This can add one frame of
// latency; a completed refresh schedules nothing further, so idle stays idle.
function paint(stage, view, original) {
    if (!original || failed)
        return;
    try {
        let captures = 0;
        for (const [owner, state] of owners) {
            if (view !== state.view)
                continue;
            const layout = view.layout;
            for (const child of state.actor.get_children()) {
                const effect = child.get_effect('gse-backdrop-blur');
                if (!child.visible || !effect?.isRefraction)
                    continue;
                const [x, y] = child.get_transformed_position();
                const [w, h] = child.get_transformed_size();
                const left = Math.max(layout.x, Math.floor(x));
                const top = Math.max(layout.y, Math.floor(y));
                const right = Math.min(layout.x+layout.width, Math.ceil(x+w));
                const bottom = Math.min(layout.y+layout.height, Math.ceil(y+h));
                if (right <= left || bottom <= top)
                    continue;
                const rect = new Mtk.Rectangle({x: left, y: top, width: right-left, height: bottom-top});
                const overlap = original.contains_rectangle(rect);
                const ready = overlap === Mtk.RegionOverlap.IN;
                effect.captureDeferred = !ready;
                state.effects.add(effect);
                // An unrelated update outside this capture needs neither a
                // fresh background nor another frame to refresh its margin.
                if (overlap === Mtk.RegionOverlap.OUT) {
                    diagnostics.skipped++;
                    captures++;
                    continue;
                }
                if (ready) {
                    diagnostics.ready++;
                } else {
                    const rectangles = pending.get(owner) ?? [];
                    rectangles.push(rect);
                    pending.set(owner, rectangles);
                    if (!later) {
                        later = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
                            later = 0;
                            for (const [requestedOwner, requested] of pending) {
                                const target = requestedOwner._regionActor;
                                if (!target?.mapped)
                                    continue;
                                for (const rectangle of requested) {
                                    const [a, x, y] = target.transform_stage_point(rectangle.x, rectangle.y);
                                    const [b, right, bottom] = target.transform_stage_point(rectangle.x+rectangle.width, rectangle.y+rectangle.height);
                                    if (a && b)
                                        target.queue_redraw_with_clip(new Mtk.Rectangle({x:Math.floor(x),y:Math.floor(y),
                                            width:Math.ceil(right)-Math.floor(x),height:Math.ceil(bottom)-Math.floor(y)}));
                                }
                                diagnostics.requests++;
                            }
                            pending.clear();
                            return false;
                        });
                    }
                    diagnostics.deferred++;
                }
                captures++;
            }
        }
        if (captures) {
            diagnostics.frames++;
            diagnostics.fullView = original.contains_rectangle(view.layout) === Mtk.RegionOverlap.IN;
        }
    } catch (error) {
        failed = true;
        diagnostics.failure = error.message;
        console.error(`GSE regional redraw: ${error.message}; using compatible redraws`);
        stage.queue_redraw(); // One recovery frame, followed by compatible guards.
    }
}

export function begin(owner, actor, view) {
    if (!supported || failed || !view || Main.overview.visible || view.get_transform() !== 0)
        return false;
    owners.set(owner, {actor, view, effects: new Set()});
    owner._regionActor = actor;
    if (!signal)
        signal = global.stage.connect('paint-view', paint);
    return true;
}

export function end(owner) {
    for (const effect of owners.get(owner)?.effects ?? [])
        effect.captureDeferred = false;
    owners.delete(owner);
    if (!owners.size && signal) {
        global.stage.disconnect(signal);
        signal = 0;
    }
}

export function cancel(owner) {
    end(owner);
    pending.delete(owner);
    owner._regionActor = null;
    if (!pending.size && later) {
        global.compositor.get_laters().remove(later);
        later = 0;
    }
}
