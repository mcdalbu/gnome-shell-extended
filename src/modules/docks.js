// SPDX-License-Identifier: GPL-3.0-only
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Signals} from '../core/render/signals.js';
import {ResourceScope} from '../core/utils.js';
import {StyleLease} from '../core/style.js';
import {SurfaceBinding, childSignal, findActor} from '../core/actors.js';

export default class DocksModule {
    constructor({settings, logger}) {
        Object.assign(this, {settings, logger});
        this.signals = new Signals();
        this.scope = new ResourceScope(error => logger.error('Dock cleanup', error));
        this.records = new Map();
    }

    enable() {
        this.active = true;
        this.scan = this.scope.debounce(this.settings.get_int('resize-debounce-ms'), () => this._scan());
        this.signals.connect(Main.uiGroup, childSignal(Main.uiGroup), this.scan);
        this.signals.connect(Main.extensionManager, 'extension-state-changed', this.scan);
        this.signals.connect(Main.layoutManager, 'monitors-changed', this.scan);
        this.signals.connect(Main.overview, 'showing', () => this.sync());
        this.signals.connect(Main.overview, 'hidden', () => this.sync());
        this.signals.connect(this.settings, 'changed', (_settings, key) => {
            if (key.startsWith('dock-') || key.startsWith('blur-') || key === 'update-frequency')
                this.sync();
        });
        this._scan();
    }

    _scan() {
        const visit = (actor, depth = 0) => {
            if (actor === Main.layoutManager.overviewGroup || actor === Main.layoutManager.panelBox || actor.name?.startsWith('gse-'))
                return;
            const isDock = actor.name === 'dashtodockContainer' ||
                actor.has_style_class_name?.('dashtodock') || actor.has_style_class_name?.('dash-to-dock');
            if (isDock) {
                const box = findActor(actor, child => child.has_style_class_name?.('dash-background'));
                if (this.records.has(actor) && this.records.get(actor).box !== box)
                    this._drop(actor);
                if (box && !this.records.has(actor))
                    this._watch(actor, box);
                return;
            }
            if (depth < 3) {
                for (const child of actor.get_children())
                    visit(child, depth + 1);
            }
        };
        for (const actor of Main.uiGroup.get_children())
            visit(actor);
        this.sync();
    }

    _invisible() {
        return this.settings.get_boolean('dock-invisible-overview') && Main.overview.visible;
    }

    _watch(actor, box) {
        const signals = new Signals();
        const record = {actor, box, signals, style: new StyleLease(box)};
        this.records.set(actor, record);
        signals.connect(actor, childSignal(actor), this.scan);
        signals.connect(actor, 'destroy', () => this._drop(actor, true));
        signals.connect(box, 'destroy', () => {
            this._drop(actor, true);
            this.scan();
        });
        record.binding = new SurfaceBinding({box, anchor: actor,
            settings: this.settings, logger: this.logger,
            enabled: () => this.active && !this._invisible(),
            options: {dock: true, opacity: () => this.settings.get_double('dock-opacity'),
                blur: () => this.settings.get_boolean('dock-blur')},
        });
    }

    sync() {
        for (const record of this.records.values()) {
            if (this._invisible()) {
                record.binding.sync();
                record.style.set('background-color: transparent; background-image: none; box-shadow: none; border-color: transparent;');
            } else {
                record.style.restore();
                record.binding.sync();
            }
        }
    }

    _drop(actor, destroyed = false) {
        const record = this.records.get(actor);
        if (!record)
            return;
        this.records.delete(actor);
        record.signals.clear();
        record.binding?.destroy(destroyed);
        if (!destroyed)
            record.style.restore();
    }

    disable() {
        this.active = false;
        this.signals.clear();
        this.scope.dispose();
        for (const actor of this.records.keys())
            this._drop(actor);
    }
}
