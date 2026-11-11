// SPDX-License-Identifier: GPL-3.0-only
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
const app = new Adw.Application({application_id: 'org.gnome.ShellExtended.TestWindow'});
app.connect('activate', () => {
    for (const title of ['GSE policy test', 'GSE switcher test']) {
        const window = new Adw.ApplicationWindow({application: app,
            title, default_width: 600, default_height: 400,
            content: new Gtk.Label({label: 'Private integration test'}),
        });
        window.present();
    }
});
app.run([]);
