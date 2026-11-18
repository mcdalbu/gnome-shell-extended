// SPDX-License-Identifier: GPL-3.0-only
// Snell refraction across a bevel following the element's rounded contour.
// Conceptual reference: https://www.shader-learn.com/examples/glass-sphere
// One background sample in the caller; no animation or readback.
export const liquidSource = `
vec3 liquidLens(vec2 point, vec2 size, float corner, float strength) {
    vec2 halfSize = max(size * 0.5, vec2(0.001));
    corner = clamp(corner, 0.0, min(halfSize.x, halfSize.y));
    vec2 p = point - halfSize;
    float distance = glassDistance(p, halfSize, corner);
    float width = min(32.0, min(halfSize.x, halfSize.y));
    float slope = clamp(1.0 + distance / width, 0.0, 1.0);
    if (slope <= 0.0 || strength <= 0.0 || distance > 1.0)
        return vec3(0.0);
    vec2 q = abs(p) - halfSize + corner;
    vec2 outer = max(q, vec2(0.0));
    float extent = length(outer);
    vec2 outward = extent > 0.0001 ? outer / extent :
        (q.x > q.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
    outward *= sign(p);
    vec3 normal = vec3(outward * slope, sqrt(max(0.0, 1.0 - slope * slope)));
    vec3 transmitted = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / 1.45);
    float amount = min(strength, width);
    float slope2 = slope * slope;
    float slope4 = slope2 * slope2;
    float rim = slope4 * slope4 * 0.15 * min(strength / 6.0, 1.0);
    return vec3(transmitted.xy * amount, rim);
}`;
