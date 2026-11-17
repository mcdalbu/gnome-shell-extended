// SPDX-License-Identifier: GPL-3.0-only
// Locations belong to a pipeline. Cache values too: a cached backdrop still
// paints at compositor rate, but its geometry/uniforms usually do not change.
export function uniforms(pipeline) {
    const locations = new Map();
    const values = new Map();
    const location = name => {
        if (!locations.has(name))
            locations.set(name, pipeline.get_uniform_location(name));
        return locations.get(name);
    };
    return {
        scalar(name, value) {
            if (values.get(name) === value)
                return;
            pipeline.set_uniform_1f(location(name), value);
            values.set(name, value);
        },
        vector(name, value) {
            const previous = values.get(name);
            if (previous && previous.length === value.length && value.every((v, i) => previous[i] === v))
                return;
            pipeline.set_uniform_float(location(name), value.length, 1, value);
            values.set(name, value.slice());
        },
    };
}
