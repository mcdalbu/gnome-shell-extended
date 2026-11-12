// SPDX-License-Identifier: GPL-3.0-only
// Two real Wayland clients on the private test bus: one translucent target and
// one opaque patterned window, so raising the target exposes a sharp source.
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

const app = new Gtk.Application({application_id: 'org.gnome.Ptyxis',
    flags: Gio.ApplicationFlags.NON_UNIQUE});
let coverApp;
app.connect('activate', () => {
    const provider = new Gtk.CssProvider();
    provider.load_from_string(`
        window.gse-fade-target { background-color: transparent; }
        .gse-fade-sidebar { background-color: rgba(20,25,30,0.25); color: white; }
        .gse-fade-content { background-color: rgb(50,55,60); color: white; }
    `);
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), provider,
        Gtk.STYLE_PROVIDER_PRIORITY_USER + 1);
    const target = new Gtk.ApplicationWindow({application: app, title: 'GSE fade target',
        decorated: false, default_width: 600, default_height: 360,
        css_classes: ['gse-fade-target']});
    const row = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL});
    const sidebar = new Gtk.Box({width_request: 200, vexpand: true,
        css_classes: ['gse-fade-sidebar']});
    sidebar.append(new Gtk.Label({label: 'Translucent sidebar', valign: Gtk.Align.CENTER}));
    const content = new Gtk.Box({hexpand: true, vexpand: true,
        css_classes: ['gse-fade-content']});
    content.append(new Gtk.Label({label: 'Opaque content', valign: Gtk.Align.CENTER}));
    row.append(sidebar);
    row.append(content);
    target.set_child(row);
    target.present();

    coverApp = new Gtk.Application({application_id: 'org.gnome.ShellExtended.FadeCover',
        flags: Gio.ApplicationFlags.NON_UNIQUE});
    coverApp.register(null);
    const cover = new Gtk.ApplicationWindow({application: coverApp, title: 'GSE fade cover',
        decorated: false, default_width: 600, default_height: 360});
    const drawing = new Gtk.DrawingArea();
    drawing.set_draw_func((_area, cr, width, height) => {
        for (let x = 0; x < width; x += 16) {
            cr.setSourceRGB(x % 32 ? 0.9 : 0.1, x % 32 ? 0.7 : 0.2, x % 32 ? 0.3 : 0.8);
            cr.rectangle(x, 0, 16, height);
            cr.fill();
        }
    });
    cover.set_child(drawing);
    cover.present();
});
app.run([]);
