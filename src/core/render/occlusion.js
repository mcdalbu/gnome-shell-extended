// SPDX-License-Identifier: GPL-3.0-only
// Subtract only proven opaque rectangles. Unknown alpha, effects and unusual
// transforms must leave the backdrop enabled rather than guessing visibility.
export function coveredBy(rect, covers) {
    const valid = r => r && [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0;
    if (!valid(rect))
        return false;
    let remaining = [rect];
    for (const cover of covers) {
        if (!valid(cover))
            continue;
        const next = [];
        for (const r of remaining) {
            const x = Math.max(r.x, cover.x), y = Math.max(r.y, cover.y);
            const right = Math.min(r.x+r.width, cover.x+cover.width);
            const bottom = Math.min(r.y+r.height, cover.y+cover.height);
            if (right <= x || bottom <= y) { next.push(r); continue; }
            if (y > r.y) next.push({x:r.x,y:r.y,width:r.width,height:y-r.y});
            if (bottom < r.y+r.height) next.push({x:r.x,y:bottom,width:r.width,height:r.y+r.height-bottom});
            if (x > r.x) next.push({x:r.x,y,width:x-r.x,height:bottom-y});
            if (right < r.x+r.width) next.push({x:right,y,width:r.x+r.width-right,height:bottom-y});
        }
        remaining = next;
        if (!remaining.length)
            return true;
        // A pathological stack must not spend unbounded time fragmenting a
        // region. Falling back to drawing preserves pixels in that case.
        if (remaining.length > 128)
            return false;
    }
    return false;
}
