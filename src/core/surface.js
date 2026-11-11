// SPDX-License-Identifier: GPL-3.0-only
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {loadBackend, radiusProperty} from './blurBackend.js';
import {StyleLease} from './style.js';
import {Signals} from './render/signals.js';
import {FrameSignals} from './render/frameSignals.js';
import {BlurRedrawGuard} from './render/blurRedrawGuard.js';
import {RoundedClip} from './render/roundedClip.js';
import {syncBackdropCapture} from './render/backdropCapture.js';
import {windowDamage, boundsIntersect} from './render/windowDamage.js';
import {BackdropGroup} from './render/backdropGroup.js';

// One instance per visible surface, released on close. Sibling capture keeps
// offscreen popup effects from blurring foreground text or sampling themselves.
export class Surface {
    constructor(box, anchor, settings, logger, options = {}) {
        this.box = box;
        this.anchor = anchor;
        this.settings = settings;
        this.logger = logger;
        this.options = options;
        this.signals = new Signals();
        this.frames = new FrameSignals();
        this.guard = new BlurRedrawGuard(Clutter, Meta);
        this.style = new StyleLease(box);
        this._destroyed = false;
        this._generation = 0;
        this._state = {captures: new Map()};
        this._paintedViews = new Set();
        try {
            this.group = new BackdropGroup({name: 'gse-surface', width: 0, height: 0, reactive: false});
            this.blur = new St.Widget({name: 'gse-blur', reactive: false,
                style: 'background-color: transparent;'});
            this.group.add_child(this.blur);
            this._state.blur = this.blur;
            this.clip = new RoundedClip();
            this.clip.clipSource = box;
            this.blur.add_effect_with_name('gse-rounded-clip', this.clip);
            anchor.get_parent().insert_child_below(this.group, anchor);
            this.signals.connect(box, 'destroy', () => this.destroy(true));
            if (anchor !== box)
                this.signals.connect(anchor, 'destroy', () => this.destroy(true));
            this.signals.connect(this.group, 'destroy', () => {
                this.group = null;
                this.destroy();
            });
            this.signals.connect(St.ThemeContext.get_for_stage(global.stage), 'changed', () => this.update());
            this.signals.connect(box, 'style-changed', () => {
                // Dock theming temporarily clears its inline style to read the
                // theme. Do not reapply our style inside that native operation.
                if (!this._destroyed && !this._styling && this.box.get_style() !== this.style.applied && !this._appearanceLater) {
                    this._appearanceLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
                        this._appearanceLater = 0;
                        this.update();
                        return false;
                    });
                }
            });
            // A dock can remain mapped while its slide container has an empty
            // clip. Allocate/clip changes must also clear the last painted frame.
            for (let source = box; source; source = source.get_parent()) {
                for (const property of ['allocation', 'has-clip', 'clip-rect', 'clip-to-allocation', 'mapped', 'opacity'])
                    this.signals.connect(source, `notify::${property}`, () => this._queueLayoutSync());
                if (source === anchor)
                    break;
            }
            this.signals.connect(Main.layoutManager, 'monitors-changed', () => {
                this._paintedViews.clear();
                this._clearCaptures();
                this._geometry();
                this._repaint();
            });
            this.frames.connect(global.stage, 'before-update', (_stage, view) => {
                this._inFrame = true;
                // A final hide still needs the previous sampled area cleared
                // during this frame. Keep the guard until after-update.
                const previouslyPainted = view ? this._paintedViews.has(view) : this._paintedViews.size > 0;
                if (previouslyPainted)
                    this.guard.begin(this.blur, view, this.box, true);
                if (!this._syncVisibility()) {
                    return;
                }
                const parent = this.anchor.get_parent();
                if (parent !== this.group.get_parent()) {
                    this.destroy();
                    return;
                }
                if (this.anchor.get_previous_sibling() !== this.group)
                    parent.set_child_below_sibling(this.group, this.anchor);
                this._geometry();
                if (!previouslyPainted && this.backend && this._radius > 0 && this._alpha < 1)
                    this.guard.begin(this.blur, view, this.box);
            });
            this.frames.connect(global.stage, 'before-paint', (_stage, view) => {
                if (!this._syncVisibility()) {
                    if (view)
                        this._paintedViews.delete(view);
                    else
                        this._paintedViews.clear();
                    return;
                }
                this._geometry();
                if (this.backend && this._visible())
                    this._capture(view);
                if (view) {
                    const [x, y] = this.box.get_transformed_position();
                    const [w, h] = this.box.get_transformed_size();
                    const r = view.layout;
                    if (this.blur.visible && x < r.x + r.width && x + w > r.x && y < r.y + r.height && y + h > r.y)
                        this._paintedViews.add(view);
                    else
                        this._paintedViews.delete(view);
                }
            });
            this.frames.connect(global.stage, 'after-update', () => {
                this._inFrame = false;
                this.guard.end();
            });
            this.signals.connect(global.display, 'restacked', () => this._repaint());
            this.update();
        } catch (error) {
            this.destroy();
            throw error;
        }
    }

    _visible() {
        if (this._destroyed || !this.box.mapped || this.box.get_paint_opacity() === 0 ||
            Main.sessionMode.isLocked || Main.screenShield?.active)
            return false;
        for (let source = this.box; source; source = source.get_parent()) {
            if (source.has_clip) {
                const [, , width, height] = source.get_clip();
                if (width <= 0 || height <= 0)
                    return false;
            }
            if (source.clip_to_allocation && (source.width <= 0 || source.height <= 0))
                return false;
        }
        const [x, y] = this.box.get_transformed_position();
        const [width, height] = this.box.get_transformed_size();
        return Main.layoutManager.monitors.some(m => x < m.x + m.width &&
            x + width > m.x && y < m.y + m.height && y + height > m.y);
    }

    _syncVisibility() {
        if (!this.group || this._destroyed)
            return false;
        const visible = this._visible();
        if (this.group.visible !== visible) {
            this.group.visible = visible;
            if (!visible) {
                if (!this._inFrame)
                    this.guard.end();
                // BACKGROUND sampling can exceed the damage rectangle. Clear
                // it once on hide, never continuously from a frame callback.
                global.stage.queue_redraw();
            } else {
                this._geometry();
                this._repaint();
            }
        }
        return visible;
    }

    _queueLayoutSync() {
        if (this._destroyed || this._layoutLater)
            return;
        // Allocation notifications describe individual steps of the slider's
        // layout. Commit only its final clip, geometry and capture together.
        this._layoutLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._layoutLater = 0;
            if (this._syncVisibility()) {
                this._geometry();
                this._capture();
            }
            return false;
        });
    }

    update() {
        if (this._destroyed)
            return;
        this._alpha = this.options.opacity?.() ?? this.settings.get_double('surface-opacity');
        this._radius = this.settings.get_int('blur-radius');
        this._brightness = this.settings.get_double('blur-brightness') * 100;
        this._hz = this.settings.get_int('update-frequency');
        this._styling = true;
        this.style.restore();
        const color = this.box.get_theme_node().get_background_color();
        this.style.set(`background-color: rgba(${color.red}, ${color.green}, ${color.blue}, ${this._alpha}); background-image: none;`);
        this._styling = false;
        const wantBlur = this.options.blur?.() !== false && this._alpha < 1 && this._radius > 0 &&
            this.settings.get_string('blur-backend') !== 'off';
        this.blur.visible = wantBlur;
        if (!wantBlur) {
            this._generation++;
            this._loading = null;
            this._clearCaptures();
            this.backend = null;
            this._stopDamage?.();
            this._stopDamage = null;
        } else {
            const preference = this.settings.get_string('blur-backend');
            if (this._preference !== preference || (!this.backend && !this._loading)) {
                const token = ++this._generation;
                this._preference = preference;
                this._loading = loadBackend(preference).then(backend => {
                    if (this._destroyed || token !== this._generation)
                        return;
                    this._clearCaptures();
                    this.backend = backend;
                    this.property = radiusProperty(backend.api);
                    this._loading = null;
                    this._geometry();
                    this._capture();
                    this._repaint();
                }).catch(error => {
                    this._loading = null;
                    this.logger.error('Blur backend', error);
                });
            }
            this._stopDamage ??= windowDamage.subscribe(bounds => {
                if (!this._visible())
                    return;
                const [x, y] = this.box.get_transformed_position();
                const [w, h] = this.box.get_transformed_size();
                const margin = this._radius * 3;
                const area = {x: x - margin, y: y - margin, right: x + w + margin, bottom: y + h + margin};
                if (bounds.some(rect => boundsIntersect(rect, area)))
                    this._repaint();
            });
        }
        this._geometry();
        this._syncVisibility();
        this._repaint();
    }

    _geometry() {
        if (!this._visible() || !this.group)
            return;
        const [x, y] = this.box.get_transformed_position();
        const [w, h] = this.box.get_transformed_size();
        const parent = this.group.get_parent();
        const [ok, left, top] = parent.transform_stage_point(x, y);
        const [end, right, bottom] = parent.transform_stage_point(x + w, y + h);
        if (!ok || !end || ![left, top, right, bottom].every(Number.isFinite) || w <= 0 || h <= 0)
            return;
        const geometry = [left - this.group.x, top - this.group.y, right - left, bottom - top];
        const key = geometry.join(':');
        if (this._geometryKey !== key) {
            this._geometryKey = key;
            this.blur.set_position(geometry[0], geometry[1]);
            this.blur.set_size(geometry[2], geometry[3]);
            this._repaintEffects();
        }
        const node = this.box.get_theme_node();
        const radius = Math.max(...[0, 1, 2, 3].map(corner => node.get_border_radius(corner)));
        this.clip.radius = Math.min(radius * geometry[2] / Math.max(1, this.box.width), geometry[2] / 2, geometry[3] / 2);
    }

    _capture(view = null) {
        if (!this.backend || !this.blur.visible || !this._visible())
            return;
        let fade = this.box.get_paint_opacity() / 255;
        if (this.options.dock) {
            const [x, y] = this.box.get_transformed_position();
            const [width, height] = this.box.get_transformed_size();
            if (width > 0 && height > 0) {
                const area = Main.layoutManager.monitors.reduce((sum, m) => sum +
                    Math.max(0, Math.min(x + width, m.x + m.width) - Math.max(x, m.x)) *
                    Math.max(0, Math.min(y + height, m.y + m.height) - Math.max(y, m.y)), 0);
                fade *= Math.min(1, area / (width * height));
            }
        }
        syncBackdropCapture(this._state, view, this.backend.api, this.property,
            this._radius * fade, 100 + (this._brightness - 100) * fade, this._hz);
    }

    _repaintEffects() {
        for (const {effect} of this._state.captures.values())
            effect.queue_repaint();
    }

    _repaint() {
        if (!this._destroyed && this.blur?.mapped) {
            this._repaintEffects();
            this.blur.queue_redraw(); // Only settings, geometry or source damage.
        }
    }

    _clearCaptures() {
        for (const {actor, effect} of this._state.captures.values()) {
            actor.remove_effect(effect);
            effect.run_dispose();
            actor.destroy();
        }
        this._state.captures.clear();
        this._state.effect = null;
        this._state.capture = null;
    }

    destroy(boxDestroyed = false) {
        if (this._destroyed)
            return;
        this._destroyed = true;
        if (this._layoutLater)
            global.compositor.get_laters().remove(this._layoutLater);
        this._layoutLater = 0;
        if (this._appearanceLater)
            global.compositor.get_laters().remove(this._appearanceLater);
        this._appearanceLater = 0;
        this._generation++;
        this.signals.clear();
        this.frames.clear();
        this._paintedViews.clear();
        this.guard.end();
        this._stopDamage?.();
        this._stopDamage = null;
        this._clearCaptures();
        if (!boxDestroyed)
            this.style.restore();
        if (this.group) {
            this.blur.remove_effect(this.clip);
            this.clip.run_dispose();
            this.group.destroy();
        }
        this.group = null;
        this.backend = null;
        global.stage.queue_redraw();
    }
}
