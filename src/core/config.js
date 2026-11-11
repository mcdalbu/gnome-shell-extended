// SPDX-License-Identifier: GPL-3.0-only
export const MODULE_KEYS = Object.freeze({
    blur: 'blur-enabled',
    panel: 'panel-enabled',
    opacity: 'opacity-enabled',
    shadows: 'shadows-enabled',
    docks: 'docks-enabled',
});

export const MODULE_LOADERS = Object.freeze({
    blur: () => import('../modules/blur.js'),
    panel: () => import('../modules/panel.js'),
    opacity: () => import('../modules/opacity.js'),
    shadows: () => import('../modules/shadows.js'),
    docks: () => import('../modules/docks.js'),
});
