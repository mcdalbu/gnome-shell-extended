// SPDX-License-Identifier: GPL-3.0-only
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Signals} from '../core/render/signals.js';
import {ResourceScope} from '../core/utils.js';
import {SurfaceBinding, childSignal} from '../core/actors.js';

export default class BlurModule {
    constructor({settings, logger}) {
        Object.assign(this, {settings, logger});
        this.signals = new Signals();
        this.scope = new ResourceScope(error => logger.error('Blur cleanup', error));
        this.bindings = new Map();
        this.roots = new Map();
    }

    enable() {
        this.active = true;
        const sync = this.scope.debounce(this.settings.get_int('resize-debounce-ms'), () => this.sync());
        this.signals.connect(this.settings, 'changed', (_settings, key) => {
            if (key.startsWith('blur-') || ['surface-opacity', 'update-frequency'].includes(key))
                this.sync();
        });
        this.signals.connect(Main.layoutManager, 'startup-complete', () => this.sync());
        this.signals.connect(Main.layoutManager, 'monitors-changed', sync);
        this.signals.connect(Main.sessionMode, 'updated', () => this.sync());
        for (const group of new Set([Main.uiGroup, Main.layoutManager.modalDialogGroup,
            Main.layoutManager.screenshotUIGroup, Main.layoutManager.overviewGroup,
            Main.messageTray?._bannerBin])) {
            if (!group)
                continue;
            this.signals.connect(group, childSignal(group), (_group, actor) => this._discover(actor));
            for (const actor of group.get_children())
                this._discover(actor);
        }
        this.sync();
    }

    _bind(identity, box, anchor, key, menu = null, options = {}) {
        if (!box || !anchor?.get_parent() || this.bindings.has(identity))
            return;
        const binding = new SurfaceBinding({
            box, anchor, menu, options, settings: this.settings, logger: this.logger,
            enabled: () => this.active && !Main.sessionMode.isLocked &&
                this.settings.get_boolean(key),
            onDestroy: () => this.bindings.delete(identity),
        });
        this.bindings.set(identity, binding);
    }

    _discover(actor) {
        if (this.roots.has(actor) || actor.name?.startsWith('gse-'))
            return;
        const signals = new Signals();
        this.roots.set(actor, signals);
        signals.connect(actor, 'destroy', () => {
            signals.clear();
            this.roots.delete(actor);
        });
        const inspect = () => {
            const name = actor.constructor.name;
            const delegate = actor._delegate;
            if (delegate?.isOpen !== undefined && delegate.box && delegate.actor)
                this._bind(actor, delegate.box, delegate.actor, 'blur-menus', delegate);
            else if (actor.dialogLayout && actor.contentLayout && actor.buttonLayout)
                this._bind(actor, actor.dialogLayout?._dialog ?? actor.dialogLayout, actor, 'blur-dialogs');
            else if (name.includes('AppFolderDialog'))
                this._bind(actor, actor._viewBox, actor, 'blur-folders');
            else if (name.includes('SwitcherPopup')) {
                this._bind(actor, actor._switcherList, actor, 'blur-alt-tab');
                // AppSwitcher creates its window previews after a delay, once
                // the main app list is already mapped.
                if (actor._thumbnails)
                    this._bind(actor._thumbnails, actor._thumbnails, actor, 'blur-alt-tab', null,
                        {allowSiblingGaps: true});
            }
            else if (name.includes('OsdWindow'))
                this._bind(actor, actor._hbox, actor, 'blur-osd');
            else if (name.includes('ScreenshotUI'))
                // The fullscreen screenshot texture is painted inside actor.
                // Sample it immediately behind the controls, above that texture.
                this._bind(actor, actor._panel, actor._panel, 'blur-screenshot');
            else if (actor.get_parent() === Main.messageTray?._bannerBin)
                this._bind(actor, actor, Main.messageTray._bannerBin, 'blur-notifications');
        };
        // Root actors can be inserted before their constructor builds children.
        signals.connect(actor, 'notify::mapped', inspect);
        if (actor.constructor.name.includes('SwitcherPopup'))
            signals.connect(actor, childSignal(actor), inspect);
        inspect();
    }

    sync() {
        if (!this.active)
            return;
        for (const [key, menu] of [
            ['blur-calendar', Main.panel.statusArea.dateMenu?.menu],
            ['blur-quick-settings', Main.panel.statusArea.quickSettings?.menu],
        ]) {
            if (menu?.box && menu.actor) {
                // Known panel menus take precedence over generic popup discovery.
                const binding = this.bindings.get(menu.actor);
                if (binding && binding.menu === menu && binding.key !== key) {
                    binding.destroy();
                    this.bindings.delete(menu.actor);
                }
                this._bind(menu.actor, menu.box, menu.actor, key, menu);
                const current = this.bindings.get(menu.actor);
                if (current)
                    current.key = key;
            }
        }
        for (const binding of this.bindings.values())
            binding.sync();
        const needsBackgrounds = this.settings.get_boolean('blur-overview') ||
            this.settings.get_boolean('blur-lock-screen');
        if (needsBackgrounds && !this.backgrounds && !this.backgroundLoading) {
            this.backgroundLoading = true;
            import('../core/backgrounds.js').then(({Backgrounds}) => {
                this.backgroundLoading = false;
                if (!this.active)
                    return;
                this.backgrounds = new Backgrounds(this.settings, this.logger);
                this.backgrounds.enable();
            }).catch(error => this.logger.error('Wallpaper blur', error));
        }
        this.backgrounds?.sync();
    }

    disable() {
        this.active = false;
        this.signals.clear();
        this.scope.dispose();
        this.backgrounds?.disable();
        this.backgrounds = null;
        for (const signals of this.roots.values())
            signals.clear();
        this.roots.clear();
        for (const binding of [...this.bindings.values()])
            binding.destroy();
        this.bindings.clear();
    }
}
