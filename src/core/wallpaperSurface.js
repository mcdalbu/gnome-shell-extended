// SPDX-License-Identifier: GPL-3.0-only
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {readAppearance} from './appearance.js';
import {childSignal} from './actors.js';
import {Signals} from './render/signals.js';
import {BackdropGroup, BackdropWidget} from './render/backdropGroup.js';
import {WallpaperCache, wallpaperFilters, updateWallpaperFilter, wallpaperStructure, wallpaperBytes} from './render/wallpaperBlur.js';
import {wallpaperRefraction, setWallpaperStrength} from './render/refraction.js';
import {forgetHidden, retainHidden} from './render/hiddenCache.js';
import {capturePadding} from './render/blurPerformance.js';
import {RoundedClip} from './render/roundedClip.js';
import {syncFrostedGlass, clearFrostedGlass} from './render/frostedGlass.js';

// Panel-only wallpaper source. No framebuffer copies, window damage tracking,
// stage frame callbacks or full-redraw guard. BackgroundManager owns loading,
// theme variants and wallpaper updates, sharing Shell's background resources.
export class WallpaperSurface {
    constructor(box, anchor, settings, _logger, options = {}) {
        Object.assign(this, {box, anchor, settings, options});
        this.signals = new Signals();
        this.managerSignals = new Signals();
        this._state = {captures: new Map()};
        try {
            this.group = new BackdropGroup({name: 'gse-surface', reactive: false, width: 0, height: 0});
            this.blur = new BackdropWidget({name: 'gse-static-wallpaper', reactive: false});
            this.viewport = new St.Widget({name: 'gse-wallpaper-viewport', reactive: false, clip_to_allocation: true});
            this.source = new St.Widget({name: 'gse-wallpaper-strip', reactive: false, clip_to_allocation: true});
            this.paper = new St.Widget({reactive: false});
            this.group.add_child(this.blur);
            this.blur.add_child(this.viewport);
            this.viewport.add_child(this.source);
            this.source.add_child(this.paper);
            this._state.blur = this.blur;
            this.clip = new RoundedClip();
            this.clip.clipSource = box;
            this.blur.add_effect_with_name('gse-rounded-clip', this.clip);
            this.cache = new WallpaperCache();
            this.viewport.add_effect_with_name('gse-wallpaper-cache', this.cache);
            anchor.get_parent().insert_child_below(this.group, anchor);
            this.signals.connect(box, 'destroy', () => this.destroy());
            if (box !== anchor)
                this.signals.connect(anchor, 'destroy', () => this.destroy());
            this.signals.connect(this.group, 'destroy', () => { this.group = null; this.destroy(); });
            for (let actor = box; actor; actor = actor.get_parent()) {
                for (const property of ['allocation', 'mapped', 'opacity', 'translation-x', 'translation-y', 'scale-x', 'scale-y'])
                    this.signals.connect(actor, `notify::${property}`, () => this._queueSync());
                if (actor === anchor)
                    break;
            }
            this.signals.connect(box, 'style-changed', () => this._queueSync());
            this.signals.connect(Main.layoutManager, 'monitors-changed', () => {
                this._clearManager();
                this._queueSync();
            });
            this.signals.connect(St.ThemeContext.get_for_stage(global.stage), 'changed', () => this._queueSync());
            this.signals.connect(this.paper, childSignal(this.paper), (_paper, actor) => this._sizePaper(actor));
            this.update();
        } catch (error) {
            this.destroy();
            throw error;
        }
    }

    _queueSync() {
        if (this._destroyed || this._later)
            return;
        this._later = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._later = 0;
            this.update();
            return false;
        });
    }

    _sizePaper(actor) {
        if (!this.monitor)
            return;
        actor.set_size(this.monitor.width, this.monitor.height);
        // BackgroundManager's defaults are intended for the dimmed Overview.
        // This copy must start with the desktop wallpaper's original colors.
        if (actor.content) {
            actor.content.brightness = 1;
            actor.content.vignette = false;
        }
    }

    _clearManager() {
        this.managerSignals.clear();
        this.manager?.destroy();
        this.manager = null;
        this.monitor = null;
    }

    update() {
        if (this._destroyed || !this.group)
            return;
        const monitor = Main.layoutManager.findMonitorForActor(this.box);
        const [x, y] = this.box.get_transformed_position();
        const [width, height] = this.box.get_transformed_size();
        const visible = this.box.mapped && this.anchor.mapped && width > 0 && height > 0 &&
            this.box.get_paint_opacity() > 0 && monitor && !Main.sessionMode.isLocked;
        this.group.visible = !!visible;
        if (!visible) {
            retainHidden(this, wallpaperBytes([this.cache, this.finish, ...(this.filters ?? [])]), () => {
                if (!this._destroyed && !this.group.visible)
                    this._clearFilters();
            });
            return;
        }
        forgetHidden(this);
        const parent = this.anchor.get_parent();
        if (!parent || parent !== this.group.get_parent()) {
            this.destroy();
            return;
        }
        if (this.anchor.get_previous_sibling() !== this.group)
            parent.set_child_below_sibling(this.group, this.anchor);
        const [ok, left, top] = parent.transform_stage_point(x, y);
        const [end, right, bottom] = parent.transform_stage_point(x + width, y + height);
        if (!ok || !end)
            return;
        const appearance = readAppearance(this.settings, this.options);
        this._state.glassConfig = appearance;
        const {blurRadius, strength} = appearance;
        const scale = this.source.get_resource_scale() || 1;
        const pad = Math.ceil(capturePadding(appearance, scale) / scale) + 4;
        const sw = Math.min(monitor.width, Math.ceil(width + 2 * pad));
        const sh = Math.min(monitor.height, Math.ceil(height + 2 * pad));
        const sx = Math.max(0, Math.min(x - monitor.x - pad, monitor.width - sw));
        const sy = Math.max(0, Math.min(y - monitor.y - pad, monitor.height - sh));
        const geometry = JSON.stringify([left, top, right, bottom, sx, sy, sw, sh, monitor.index,
            monitor.x, monitor.y, monitor.width, monitor.height]);
        if (geometry !== this._geometryKey) {
            this._geometryKey = geometry;
            this.blur.set_position(left, top);
            this.blur.set_size(right - left, bottom - top);
            this.viewport.set_size(right - left, bottom - top);
            this.source.set_position(monitor.x + sx - x, monitor.y + sy - y);
            this.source.set_size(sw, sh);
            this.paper.set_position(-sx, -sy);
            this.paper.set_size(monitor.width, monitor.height);
        }
        if (!this.manager || this.monitor.index !== monitor.index) {
            this._clearManager();
            this.monitor = monitor;
            this.manager = new Background.BackgroundManager({container: this.paper, monitorIndex: monitor.index,
                controlPosition: false});
            const sized = () => { for (const actor of this.paper.get_children()) this._sizePaper(actor); };
            this.managerSignals.connect(this.manager, 'loaded', sized);
            this.managerSignals.connect(this.manager, 'changed', sized);
            sized();
        }
        const corner = Math.max(...[0, 1, 2, 3].map(c => this.box.get_theme_node().get_border_radius(c)));
        this.clip.radius = Math.min(corner, width / 2, height / 2);
        const brightness = this.settings.get_double('blur-brightness');
        const filterKey = `${blurRadius > 0}:${wallpaperStructure(appearance)}`;
        if (filterKey !== this._filterKey) {
            this._filterKey = filterKey;
            for (const filter of this.filters ?? []) {
                this.source.remove_effect(filter);
                filter.run_dispose();
            }
            this.filters = blurRadius > 0 ? wallpaperFilters(this.source, appearance) : [];
            for (const [i, filter] of this.filters.entries())
                this.source.add_effect_with_name(`gse-static-blur-${i}`, filter);
        }
        for (const filter of this.filters)
            updateWallpaperFilter(filter, this.source, appearance);
        if (!this.finish) {
            this.finish = wallpaperRefraction(this.viewport, strength, brightness, true, appearance.glassStyle);
            this.viewport.add_effect_with_name('gse-static-finish', this.finish);
        } else {
            setWallpaperStrength(this.finish, this.viewport, strength, brightness, appearance.glassStyle);
        }
        if (appearance.frosted)
            syncFrostedGlass(this._state, (this.options.opacity?.() ?? 1) * 0.32);
        else
            clearFrostedGlass(this._state);
        this.setFade(this.options.fade?.() ?? 1);
    }

    _clearFilters() {
        for (const filter of this.filters ?? []) {
            this.source.remove_effect(filter);
            filter.run_dispose();
        }
        this.filters = [];
        this._filterKey = null;
        // Disabling releases native offscreen storage; re-enable for resume.
        for (const effect of [this.cache, this.finish]) {
            if (effect) {
                effect.enabled = false;
                effect.enabled = true;
            }
        }
    }

    setFade(value) {
        if (this._destroyed || !this.group)
            return;
        const opacity = this.group.get_parent()?.get_paint_opacity() ?? 255;
        this.group.opacity = Math.round(Math.min(255, 255 * this.box.get_paint_opacity() / Math.max(1, opacity)) * value);
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        forgetHidden(this);
        if (this._later)
            global.compositor.get_laters().remove(this._later);
        this._later = 0;
        this.signals.clear();
        this._clearManager();
        clearFrostedGlass(this._state);
        this.group?.destroy();
        this.group = null;
        this.filters = [];
        this.finish = null;
        this.cache = null;
    }
}
