// SPDX-License-Identifier: GPL-3.0-only
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import {RoundedClip} from './roundedClip.js';

// Two tiny, shared textures. No framebuffer reads, offscreen effects or timers.
const textures = new Map();
const SIZE = 64;
const clients = new Set();
let interfaceSettings = null;
let themeSignal = 0;

function lightTheme() {
    return interfaceSettings.get_string('color-scheme') !== 'prefer-dark';
}

function track(actor) {
    if (!interfaceSettings) {
        interfaceSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        themeSignal = interfaceSettings.connect('changed::color-scheme', () => {
            const content = texture(lightTheme());
            for (const client of clients)
                client.content = content;
        });
    }
    clients.add(actor);
    actor.connect('destroy', () => {
        clients.delete(actor);
        if (!clients.size) {
            interfaceSettings.disconnect(themeSignal);
            interfaceSettings = null;
            themeSignal = 0;
            textures.clear();
        }
    });
}

function texture(light) {
    if (textures.has(light))
        return textures.get(light);
    const pixels = new Uint8Array(SIZE * SIZE * 4);
    // Bake diffuse lighting from a periodic surface normal. The result tiles
    // seamlessly and is shared by all surfaces, without per-frame shading.
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const u = 2 * Math.PI * x / SIZE;
            const v = 2 * Math.PI * y / SIZE;
            const nx = 0.22 * Math.cos(3 * u + v) + 0.12 * Math.cos(u - 2 * v);
            const ny = 0.16 * Math.cos(3 * u + v) - 0.17 * Math.cos(u - 2 * v);
            const inv = 1 / Math.hypot(nx, ny, 1);
            const lighting = (nx * -0.35 + ny * -0.45 + 0.82) * inv;
            const value = Math.max(0, Math.min(255,
                Math.round((light ? 235 : 32) + (lighting - 0.82) * 35)));
            const i = (y * SIZE + x) * 4;
            pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
            pixels[i + 3] = 255;
        }
    }
    // Clutter.Image was replaced by St.ImageContent in newer GNOME versions.
    const content = Clutter.Image ? new Clutter.Image() : St.ImageContent.new_with_preferred_size(SIZE, SIZE);
    const args = [pixels, Cogl.PixelFormat.RGBA_8888, SIZE, SIZE, SIZE * 4];
    if (Clutter.Image)
        content.set_data(...args);
    else
        content.set_data(global.stage.get_context().get_backend().get_cogl_context(), ...args);
    textures.set(light, content);
    return content;
}

const GlassOwner = GObject.registerClass(class GseGlassOwner extends Clutter.Effect {
    vfunc_paint(_node, context, _flags) {
        if (!this.owner.mapped || !this.owner.visible || this.owner.opacity === 0 ||
            this.owner.get_parent() !== this.backdrop.get_parent() ||
            this.owner.get_previous_sibling() !== this.backdrop)
            return;
        this.get_actor().continue_paint(context);
    }
});

// Existing surfaces already supply their theme tint; add a subtle frost behind
// that tint. Callers choose the extra alpha without changing foreground actors.
export function syncFrostedGlass(state, alpha, owner = null) {
    if (!state.glass) {
        state.glass = new Clutter.Actor({name: 'gse-frosted-glass', reactive: false,
            // Repeat tiles across the allocation. TOP_LEFT limits the content
            // box (and therefore the painted area) to a single 64px tile.
            content_gravity: Clutter.ContentGravity.RESIZE_FILL,
            content_repeat: Clutter.ContentRepeat.BOTH});
        track(state.glass);
        state.glass.add_constraint(new Clutter.BindConstraint({source: state.blur,
            coordinate: Clutter.BindCoordinate.SIZE}));
        if (owner) {
            const guard = new GlassOwner();
            guard.owner = owner;
            guard.backdrop = state.blur;
            state.glass.add_effect_with_name('gse-glass-owner', guard);
        }
        const clip = state.blur.get_effect('gse-rounded-clip') ?? state.blur.get_effect('gse-window-clip');
        if (clip) {
            state.glassClip = new RoundedClip();
            state.glassClip.radius = clip.radius;
            state.glass.add_effect_with_name('gse-frosted-clip', state.glassClip);
        }
        state.blur.add_child(state.glass);
    }
    const light = lightTheme();
    const content = texture(light);
    if (state.glass.content !== content)
        state.glass.content = content;
    state.glass.opacity = Math.round(255 * Math.max(0, Math.min(1, alpha)));
}

export function clearFrostedGlass(state) {
    state.glass?.destroy();
    state.glass = null;
    state.glassClip = null;
}
