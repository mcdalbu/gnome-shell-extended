// SPDX-License-Identifier: GPL-3.0-only
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Mtk from 'gi://Mtk';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {windowMotionActive} from './windowMotion.js';

const owners = new Map();
const sources = new Map();
let signal = 0;
let failed = false;
const pending = new Map();
let later = 0;
export const diagnostics = {frames: 0, deferred: 0, ready: 0, skipped: 0, throttled: 0, requests: 0, fullView: true, failure: null};
export const supported = typeof global.stage.queue_redraw_with_clip === 'function' &&
    typeof Clutter.StageView.prototype.get_transform === 'function' &&
    typeof Mtk.Region.prototype.contains_rectangle === 'function' &&
    GObject.signal_lookup('paint-view', Clutter.Stage) > 0;

function captureRectangle(child, view) {
    const layout = view.layout;
    const [x, y] = child.get_transformed_position();
    const [w, h] = child.get_transformed_size();
    const left = Math.max(layout.x, Math.floor(x));
    const top = Math.max(layout.y, Math.floor(y));
    const right = Math.min(layout.x+layout.width, Math.ceil(x+w));
    const bottom = Math.min(layout.y+layout.height, Math.ceil(y+h));
    return right > left && bottom > top
        ? new Mtk.Rectangle({x:left,y:top,width:right-left,height:bottom-top}) : null;
}

function overlaps(a, b) {
    return a.x < b.x+b.width && b.x < a.x+a.width && a.y < b.y+b.height && b.y < a.y+a.height;
}

function requestRefresh(owner, rect) {
    const rectangles = pending.get(owner) ?? [];
    rectangles.push(rect);
    pending.set(owner, rectangles);
    if (!later)
        later = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, flushRequests);
}

function flushRequests() {
    later = 0;
    if (windowMotionActive()) {
        pending.clear();
        return false;
    }
    try {
        redrawRequests();
    } catch (error) {
        failed = true;
        diagnostics.failure = error.message;
        pending.clear();
        console.error(`GSE regional redraw: ${error.message}; using compatible redraws`);
        global.stage.queue_redraw();
    }
    return false;
}

function redrawRequests() {
    // Refresh the connected set of overlapping capture margins together.
    // Otherwise A's refresh only partly damages B, which requests B next;
    // B then partly damages A and can keep an idle desktop painting forever.
    const requests = [];
    const seen = new Set();
    const add = (owner, rect) => {
        const key = `${rect.x}:${rect.y}:${rect.width}:${rect.height}`;
        if (seen.has(key))
            return;
        seen.add(key);
        requests.push({owner, rect});
    };
    for (const [owner, rectangles] of pending)
        if (owner._regionActor?.mapped)
            for (const rect of rectangles)
                add(owner, rect);
    pending.clear();
    const candidates = [];
    for (const [owner, actor] of sources) {
        if (!actor.mapped || actor.get_paint_opacity() === 0)
            continue;
        for (const child of actor.get_children()) {
            const view = child.get_effect('gse-capture-view')?.view;
            const effect = child.get_effect('gse-backdrop-blur');
            if (!child.visible || !view || !effect?.isRefraction)
                continue;
            const rect = captureRectangle(child, view);
            if (rect)
                candidates.push({owner, rect, effect, view});
        }
    }
    const affected = new Set();
    for (let i = 0; i < requests.length; i++)
        for (const candidate of candidates)
            if (overlaps(requests[i].rect, candidate.rect)) {
                add(candidate.owner, candidate.rect);
                affected.add(candidate);
            }
    // All prepared sources in this batch become fresh together. Reusing a
    // not-yet-due neighbour here would schedule another trailing refresh and
    // recreate the same loop at the reduced rate.
    for (const {effect, view} of affected)
        effect.forceNextRefresh(view);
    for (const {owner, rect} of requests) {
        const target = owner._regionActor;
        if (!target?.mapped)
            continue;
        const [a, x, y] = target.transform_stage_point(rect.x, rect.y);
        const [b, right, bottom] = target.transform_stage_point(rect.x+rect.width, rect.y+rect.height);
        if (a && b) {
            target.queue_redraw_with_clip(new Mtk.Rectangle({x:Math.floor(x),y:Math.floor(y),
                width:Math.ceil(right)-Math.floor(x),height:Math.ceil(bottom)-Math.floor(y)}));
            diagnostics.requests++;
        }
    }
}

// Keep the compositor's native painter, damage history, presentation and other
// paint-view handlers. Never edit its const region or paint the stage twice.
// If a source margin wasn't refreshed, reuse the previous filtered image and
// request only that rectangle for the next frame. This can add one frame of
// latency; a completed refresh schedules nothing further, so idle stays idle.
function paint(stage, view, original) {
    if (!original || failed || windowMotionActive())
        return;
    try {
        let captures = 0;
        const current = [];
        for (const [owner, state] of owners) {
            if (view !== state.view)
                continue;
            for (const child of state.actor.get_children()) {
                const effect = child.get_effect('gse-backdrop-blur');
                if (!child.visible || !effect?.isRefraction)
                    continue;
                const rect = captureRectangle(child, view);
                if (!rect)
                    continue;
                current.push({effect, rect});
                const overlap = original.contains_rectangle(rect);
                const ready = overlap === Mtk.RegionOverlap.IN;
                effect.captureDeferred = !ready;
                state.effects.add(effect);
                effect.regionalRefresh ??= () => {
                    if (failed || windowMotionActive() || !sources.has(owner) || !child.mapped || Main.overview.visible ||
                        view.get_transform() !== 0 || owner._settings?.get_string('blur-render-area') !== 'elements')
                        return;
                    const rect = captureRectangle(child, view);
                    if (rect)
                        requestRefresh(owner, rect);
                };
                // An unrelated update outside this capture needs neither a
                // fresh background nor another frame to refresh its margin.
                if (overlap === Mtk.RegionOverlap.OUT) {
                    diagnostics.skipped++;
                    captures++;
                    continue;
                }
                if (ready) {
                    diagnostics.ready++;
                } else if (effect.deferForRate(view)) {
                    diagnostics.throttled++;
                } else {
                    requestRefresh(owner, rect);
                    diagnostics.deferred++;
                }
                captures++;
            }
        }
        // Wait for the complete group instead of filtering a ready neighbour
        // now and again on the batched frame. This preserves the rate budget
        // when damage fully covers one source but only partly covers another.
        const grouped = [...pending.values()].flat();
        const deferred = new Set();
        for (let i = 0; i < grouped.length; i++) {
            for (const source of current) {
                if (!deferred.has(source.effect) && overlaps(grouped[i], source.rect)) {
                    deferred.add(source.effect);
                    source.effect.captureDeferred = true;
                    grouped.push(source.rect);
                }
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
    if (!supported || failed || !view || Main.overview.visible || view.get_transform() !== 0 || windowMotionActive())
        return false;
    owners.set(owner, {actor, view, effects: new Set()});
    sources.set(owner, actor);
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
    sources.delete(owner);
    pending.delete(owner);
    owner._regionActor = null;
    if (!pending.size && later) {
        global.compositor.get_laters().remove(later);
        later = 0;
    }
}
