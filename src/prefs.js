// SPDX-License-Identifier: GPL-3.0-only
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class GnomeShellExtendedPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const connections = [];
        window.set_default_size(820, 720);
        window.search_enabled = true;
        const page = (name, title, icon) => {
            const value = new Adw.PreferencesPage({name, title, icon_name: icon});
            window.add(value);
            return value;
        };
        const group = (parent, title, description = '') => {
            const value = new Adw.PreferencesGroup({title, description});
            parent.add(value);
            return value;
        };
        const toggle = (parent, key, title, subtitle = '', sensitive = true) => {
            const row = new Adw.SwitchRow({name: `setting-${key}`, title, subtitle, sensitive});
            settings.bind(key, row, 'active', sensitive ? Gio.SettingsBindFlags.DEFAULT :
                Gio.SettingsBindFlags.DEFAULT | Gio.SettingsBindFlags.NO_SENSITIVITY);
            parent.add(row);
            return row;
        };
        const number = (parent, key, title, lower, upper, step = 1, subtitle = '') => {
            const row = new Adw.SpinRow({name: `setting-${key}`, title, subtitle,
                digits: step < 1 ? 2 : 0,
                adjustment: new Gtk.Adjustment({lower, upper, step_increment: step, page_increment: step * 10}),
            });
            settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            parent.add(row);
        };
        const choice = (parent, key, title, values, labels, subtitle = '') => {
            const row = new Adw.ComboRow({name: `setting-${key}`, title, subtitle,
                model: Gtk.StringList.new(labels), selected: values.indexOf(settings.get_string(key)),
            });
            row.connect('notify::selected', () => {
                if (row.selected < values.length)
                    settings.set_string(key, values[row.selected]);
            });
            connections.push(settings.connect(`changed::${key}`, () => {
                row.selected = values.indexOf(settings.get_string(key));
            }));
            parent.add(row);
        };
        const dependent = (parent, key, title, description = '') => {
            const value = group(parent, title, description);
            settings.bind(key, value, 'sensitive', Gio.SettingsBindFlags.GET);
            return value;
        };

        const elements = page('elements', 'Elementos', 'view-grid-symbolic');
        const targets = group(elements, 'Superfícies do Shell', 'O blur é criado ao abrir a superfície e liberado ao fechá-la. Textos e ícones permanecem opacos.');
        toggle(targets, 'blur-enabled', 'Ativar blur no Shell');
        const surfaces = dependent(elements, 'blur-enabled', 'Aplicar em');
        for (const [key, title] of [
            ['calendar', 'Calendário e notificações'], ['quick-settings', 'Configurações rápidas'],
            ['menus', 'Outros menus'], ['notifications', 'Banners de notificação'],
            ['dialogs', 'Diálogos'], ['folders', 'Pastas de aplicativos'],
            ['alt-tab', 'Alternador Alt+Tab'], ['osd', 'Indicadores de volume e brilho'],
            ['screenshot', 'Ferramenta de captura de tela'], ['overview', 'Papel de parede no Overview'],
            ['lock-screen', 'Papel de parede na tela de bloqueio'],
        ])
            toggle(surfaces, `blur-${key}`, title);

        const blur = page('blur', 'Blur', 'preferences-desktop-wallpaper-symbolic');
        const appearance = group(blur, 'Aparência', 'Os parâmetros também são usados pelo blur dos docks.');
        choice(appearance, 'blur-backend', 'Backend', ['auto', 'native', 'lightweight', 'off'],
            ['Auto', 'Nativo', 'Leve', 'Desativado'],
            'O backend leve requer a biblioteca Blur compatível. Sem ela, é usado o nativo.');
        number(appearance, 'blur-radius', 'Raio (pixels lógicos)', 0, 100);
        number(appearance, 'blur-brightness', 'Brilho do fundo', 0, 1, 0.05);
        number(appearance, 'surface-opacity', 'Opacidade do fundo', 0, 1, 0.05);
        const performance = group(blur, 'Recursos', 'O backend nativo acompanha o compositor e não limita a frequência de captura. Overview e bloqueio usam blur nativo do papel de parede, com cache do compositor.');
        number(performance, 'update-frequency', 'Limite solicitado de captura (Hz)', 0, 120, 1,
            '0 = compositor. Aplicado apenas se o backend opcional expuser frame-divisor.');
        number(performance, 'resize-debounce-ms', 'Debounce de eventos (ms)', 0, 1000, 10,
            'Aplicado na próxima ativação do módulo; animações acompanham os frames do Shell.');
        toggle(performance, 'debug-logging', 'Logs de depuração', 'Aplicado na próxima ativação da extensão.');

        const panel = page('panel', 'Painel', 'view-more-symbolic');
        toggle(group(panel, 'Barra superior'), 'panel-enabled', 'Ativar painel adaptativo');
        const panelOptions = dependent(panel, 'panel-enabled', 'Aparência e comportamento',
            'No Overview, o estilo personalizado é suspenso. Após o Overview fechar, o fundo passa da cor opaca do Overview à transparência configurada em 250 ms; textos e ícones permanecem opacos.');
        choice(panelOptions, 'panel-style', 'Cor do fundo', ['theme', 'light', 'dark'], ['Do tema', 'Clara', 'Escura']);
        toggle(panelOptions, 'panel-blur', 'Blur no fundo da barra', 'Usa os parâmetros da aba Blur. Suspenso no Overview e quando o fundo está opaco.');
        toggle(panelOptions, 'panel-remove-gap', 'Remover lacuna entre a barra e janelas maximizadas', 'Ajusta o espaço reservado à barra para que a janela encoste na borda inferior, sem aumentar o painel.');
        toggle(panelOptions, 'panel-auto-opacity', 'Opacidade automática', 'Considera as janelas do workspace no monitor da barra.');
        number(panelOptions, 'panel-opacity', 'Opacidade normal', 0, 1, 0.05);
        number(panelOptions, 'panel-maximized-opacity', 'Com janela maximizada', 0, 1, 0.05);
        number(panelOptions, 'panel-fullscreen-opacity', 'Com janela em tela cheia', 0, 1, 0.05);

        const docks = page('dock', 'Dock', 'view-app-grid-symbolic');
        toggle(group(docks, 'Integração com docks', 'Detecta Dash to Dock e Ubuntu Dock por seus atores, sem importar outra extensão.'),
            'docks-enabled', 'Ativar integração');
        const dockOptions = dependent(docks, 'docks-enabled', 'Fundo do dock');
        toggle(dockOptions, 'dock-blur', 'Aplicar blur');
        number(dockOptions, 'dock-opacity', 'Opacidade do fundo', 0, 1, 0.05);
        toggle(dockOptions, 'dock-invisible-overview', 'Fundo invisível no Overview', 'Mantém ícones e interação disponíveis. Fundo, contorno e sombra usam fade de 250 ms ao entrar e sair.');

        const shadows = page('icons', 'Ícones', 'starred-symbolic');
        toggle(group(shadows, 'Sombras'), 'shadows-enabled', 'Ativar sombras dos ícones');
        const shadowOptions = dependent(shadows, 'shadows-enabled', 'Aplicação e aparência');
        toggle(shadowOptions, 'shadow-app-grid', 'Grade e pastas');
        toggle(shadowOptions, 'shadow-dock', 'Dock');
        toggle(shadowOptions, 'shadow-alt-tab', 'Alt+Tab');
        number(shadowOptions, 'shadow-opacity', 'Opacidade da sombra', 0, 1, 0.05);
        number(shadowOptions, 'shadow-radius', 'Desfoque (px)', 0, 64);
        number(shadowOptions, 'shadow-offset-x', 'Deslocamento horizontal (px)', -64, 64);
        number(shadowOptions, 'shadow-offset-y', 'Deslocamento vertical (px)', -64, 64);

        const apps = page('windows', 'Aplicativos', 'application-x-executable-symbolic');
        toggle(group(apps, 'Integração opcional', 'As opções GTK escrevem um bloco identificado em ~/.config/gtk-4.0/gtk.css. Feche e reabra os aplicativos para aplicar ou restaurar. O blur aparece somente nas áreas que o aplicativo desenha com transparência.'),
            'opacity-enabled', 'Ativar transparência seletiva');
        const appOptions = dependent(apps, 'opacity-enabled', 'Fundos dos aplicativos',
            'A disponibilidade depende da versão e dos estilos do aplicativo. Aplicativos Flatpak podem não ler o CSS do host.');
        toggle(appOptions, 'windows-blur', 'Blur nos fundos transparentes', 'Aplica às integrações selecionadas, preservando os pixels opacos do aplicativo.');
        number(appOptions, 'gtk-background-opacity', 'Opacidade do fundo', 0, 1, 0.05);
        toggle(appOptions, 'opacity-gtk-files-sidebar', 'Barra lateral do Arquivos', 'Para versões com sidebar-pane/content-pane.');
        toggle(appOptions, 'opacity-gtk-menus', 'Menus GTK4', 'Aplica o fundo dos popovers de menu em aplicativos que leem o CSS do usuário.');
        toggle(appOptions, 'opacity-ptyxis', 'Terminal Ptyxis', 'Usa a preferência nativa dos perfis; preserva a opacidade dos caracteres e restaura os valores anteriores ao desativar.');
        toggle(appOptions, 'opacity-gtk-settings-sidebar', 'Barra lateral do Configurações',
            'Adiciona uma classe CSS via overlay do recurso CcWindow e lançador D-Bus reversível do usuário. Requer gresource e reinício do aplicativo.');

        const maintenance = group(blur, 'Gnome Shell Extended 0.3.8', 'GNOME 45–51 são alvos de compatibilidade. Consulte README e VALIDATION para os ambientes efetivamente testados.');
        const reset = new Adw.ActionRow({title: 'Restaurar configurações da extensão'});
        const button = new Gtk.Button({label: 'Restaurar', valign: Gtk.Align.CENTER});
        button.connect('clicked', () => {
            for (const key of settings.settings_schema.list_keys())
                settings.reset(key);
        });
        reset.add_suffix(button);
        maintenance.add(reset);
        const cleanup = () => {
            for (const id of connections.splice(0))
                settings.disconnect(id);
        };
        window.connect('unrealize', cleanup);
    }
}
