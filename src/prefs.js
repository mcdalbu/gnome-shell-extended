// SPDX-License-Identifier: GPL-3.0-only
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import {migrateAppearance} from './core/appearance.js';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class GnomeShellExtendedPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        migrateAppearance(settings);
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
        const slider = (parent, key, title, lower, upper, step = 1, subtitle = '', {format, mark} = {}) => {
            const row = new Adw.ActionRow({title, subtitle});
            const scale = new Gtk.Scale({name: `setting-${key}`, orientation: Gtk.Orientation.HORIZONTAL,
                draw_value: true, width_request: 180, valign: Gtk.Align.CENTER,
                digits: step < 1 ? 2 : 0,
                adjustment: new Gtk.Adjustment({lower, upper, step_increment: step, page_increment: step * 10}),
            });
            scale.connect('change-value', (_scale, _scroll, value) => {
                const snapped = lower + Math.round((value - lower) / step) * step;
                scale.set_value(Number(snapped.toFixed(scale.digits)));
                return true;
            });
            if (format)
                scale.set_format_value_func(format);
            if (mark !== undefined)
                scale.add_mark(mark, Gtk.PositionType.BOTTOM, null);
            scale.update_property([Gtk.AccessibleProperty.LABEL], [title]);
            settings.bind(key, scale.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
            settings.bind_writable(key, scale, 'sensitive', false);
            row.add_suffix(scale);
            parent.add(row);
            return row;
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
            return row;
        };
        const dependent = (parent, key, title, description = '') => {
            const value = group(parent, title, description);
            settings.bind(key, value, 'sensitive', Gio.SettingsBindFlags.GET);
            return value;
        };

        const elements = page('elements', 'Elementos', 'view-grid-symbolic');
        const targets = group(elements, 'Superfícies do Shell', 'O blur é criado ao abrir a superfície e liberado ao fechá-la. Textos e ícones permanecem opacos.');
        toggle(targets, 'blur-enabled', 'Aplicar efeitos no Shell');
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
        const blurOptions = group(blur, 'Desfoque', 'Aplica o método selecionado ao fundo das superfícies habilitadas.');
        toggle(blurOptions, 'blur-filter-enabled', 'Ativar blur');
        const blurControls = [
            choice(blurOptions, 'blur-method', 'Método de blur', ['box', 'fast-gaussian', 'kawase'],
                ['Box blur', 'Fast Gaussian Blur', 'Kawase (leve)'],
                'Cada iteração do Kawase usa uma passada de quatro amostras. Prioriza menor custo do filtro, com aparência aproximada.'),
            slider(blurOptions, 'blur-radius', 'Raio do desfoque (pixels lógicos)', 0, 100),
        ];
        const samplesControl = choice(blurOptions, 'blur-samples', 'Samples do Fast Gaussian',
            ['13', '9', '5'], ['13 taps', '9 taps', '5 taps'],
            '13, 9 e 5 taps usam 7, 5 e 3 leituras de textura por direção.');
        const iterationsControl = slider(blurOptions, 'blur-iterations', 'Iterações do Fast Gaussian', 1, 8, 1,
            'Passos progressivamente menores suavizam o desfoque. Cada iteração usa duas passadas na GPU; o padrão 4 usa oito passadas.');
        const kawaseIterationsControl = slider(blurOptions, 'blur-kawase-iterations', 'Iterações do Kawase', 1, 8, 1,
            'Cada iteração usa uma passada de quatro amostras na GPU. Menos iterações reduzem o trabalho do filtro; o padrão é 3.');
        const glassOptions = group(blur, 'Vidro', 'A distorção pode ser usada sozinha ou combinada com o blur. Não se aplica à barra superior.');
        toggle(glassOptions, 'refraction-enabled', 'Ativar distorção do vidro');
        const glassStyleControl = choice(glassOptions, 'refraction-style', 'Modelo do vidro',
            ['contour', 'liquid'], ['Contorno', 'Liquid'],
            'Liquid refrata o fundo nas bordas e nos cantos arredondados, com um brilho sutil. Textos e ícones permanecem nítidos.');
        const strengthControl = slider(glassOptions, 'refraction-strength', 'Intensidade da distorção', 0, 24, 0.5);
        const highlightControl = slider(glassOptions, 'refraction-highlight', 'Realce do Liquid', 0, 200, 1,
            '100% é o brilho original. 0% remove o realce.',
            {format: (_scale, value) => `${Math.round(value)}%`, mark: 100});
        const appearance = group(blur, 'Aparência');
        slider(appearance, 'blur-brightness', 'Brilho do fundo', 0, 1, 0.05);
        slider(appearance, 'surface-opacity', 'Opacidade do fundo', 0, 1, 0.05);
        toggle(appearance, 'frosted-glass-enabled', 'Textura fosca',
            'Textura estática compartilhada, sem capturar ou desfocar o fundo.');
        const syncEffects = () => {
            for (const control of blurControls)
                control.sensitive = settings.get_boolean('blur-filter-enabled');
            samplesControl.visible = samplesControl.sensitive =
                settings.get_boolean('blur-filter-enabled') && settings.get_string('blur-method') === 'fast-gaussian';
            iterationsControl.visible = iterationsControl.sensitive = samplesControl.sensitive;
            kawaseIterationsControl.visible = kawaseIterationsControl.sensitive =
                settings.get_boolean('blur-filter-enabled') && settings.get_string('blur-method') === 'kawase';
            strengthControl.sensitive = settings.get_boolean('refraction-enabled');
            glassStyleControl.sensitive = strengthControl.sensitive;
            highlightControl.visible = highlightControl.sensitive =
                strengthControl.sensitive && settings.get_string('refraction-style') === 'liquid';
            resolutionControl.visible = settings.get_boolean('blur-filter-enabled') && settings.get_int('blur-radius') > 0;
            const hasCapture = resolutionControl.visible ||
                (strengthControl.sensitive && settings.get_double('refraction-strength') > 0);
            renderAreaControl.visible = refreshControl.visible = hasCapture;
        };
        const performance = group(blur, 'Recursos',
            'Para reduzir o custo, combine Kawase com uma resolução menor ou limite a frequência de atualização. A textura fosca pode ser usada sem capturar o fundo.');
        const renderAreaControl = choice(performance, 'blur-render-area', 'Área de redesenho do fundo', ['monitor', 'elements'],
            ['Monitor (compatível)', 'Elementos (experimental)'],
            'Atualiza os elementos e suas margens pelo redesenho nativo, podendo atrasar o blur em um frame. Usa o modo compatível durante mover/redimensionar janelas e quando indisponível.');
        const resolutionControl = choice(performance, 'blur-resolution', 'Resolução do filtro', ['auto', 'half', 'quarter'],
            ['Automática', 'Metade por eixo', 'Um quarto por eixo'],
            'Texturas menores economizam trabalho do filtro, com perda de detalhes. Aplica-se a Box, Gaussian e Kawase, incluindo o papel de parede quando suportado; a saída estática fica em cache.');
        const refreshControl = choice(performance, 'blur-refresh-rate', 'Atualização do fundo dinâmico', ['100', '50', '25'],
            ['100% — full rate', '50% — half rate', '25% — quarter rate'],
            'Limite relativo a cada monitor: em 60 Hz, até 60, 30 ou 15 atualizações por segundo. A interface mantém sua frequência normal; capturas de tela são atualizadas integralmente.');
        for (const key of ['blur-filter-enabled', 'blur-method', 'blur-radius', 'refraction-enabled', 'refraction-style', 'refraction-strength'])
            connections.push(settings.connect(`changed::${key}`, syncEffects));
        syncEffects();

        const panel = page('panel', 'Painel', 'view-more-symbolic');
        toggle(group(panel, 'Barra superior'), 'panel-enabled', 'Ativar painel adaptativo');
        const panelOptions = dependent(panel, 'panel-enabled', 'Aparência e comportamento',
            'A barra segue as animações do GNOME no Overview. A transparência, o desfoque e as sombras configurados voltam após o fechamento.');
        choice(panelOptions, 'panel-style', 'Cor do fundo', ['theme', 'light', 'dark'], ['Do tema', 'Clara', 'Escura']);
        toggle(panelOptions, 'panel-foreground-shadow', 'Sombra de destaque em textos e ícones',
            'Melhora a leitura com o fundo transparente, com ou sem desfoque.');
        toggle(panelOptions, 'panel-blur', 'Efeitos no fundo da barra', 'Usa os parâmetros da aba Blur. Suspenso no Overview e quando o fundo está opaco.');
        const staticPanelControl = toggle(panelOptions, 'panel-static-blur', 'Blur estático do papel de parede',
            'Usa somente o papel de parede e guarda o efeito em cache. Janelas atrás da barra não atualizam o blur.');
        const syncStaticPanel = () => { staticPanelControl.sensitive = settings.get_boolean('panel-blur'); };
        connections.push(settings.connect('changed::panel-blur', syncStaticPanel));
        syncStaticPanel();
        toggle(panelOptions, 'panel-remove-gap', 'Remover lacuna entre a barra e janelas maximizadas', 'Posiciona o topo da janela 1 px sob a borda inferior da barra para fechar a junção, sem aumentar o painel.');
        toggle(panelOptions, 'panel-auto-opacity', 'Opacidade automática', 'Suaviza as mudanças de opacidade conforme as janelas no monitor da barra.');
        slider(panelOptions, 'panel-opacity', 'Opacidade normal', 0, 1, 0.05);
        for (const [key, title] of [['panel-maximized-opacity', 'Com janela maximizada'],
            ['panel-fullscreen-opacity', 'Com janela em tela cheia']]) {
            const row = slider(panelOptions, key, title, 0, 1, 0.05);
            settings.bind('panel-auto-opacity', row, 'visible', Gio.SettingsBindFlags.GET);
        }

        const docks = page('dock', 'Dock', 'view-app-grid-symbolic');
        toggle(group(docks, 'Integração com docks', 'Detecta Dash to Dock e Ubuntu Dock por seus atores, sem importar outra extensão.'),
            'docks-enabled', 'Ativar integração');
        const dockOptions = dependent(docks, 'docks-enabled', 'Fundo do dock');
        toggle(dockOptions, 'dock-blur', 'Aplicar efeitos de fundo');
        slider(dockOptions, 'dock-opacity', 'Opacidade do fundo', 0, 1, 0.05);
        toggle(dockOptions, 'dock-invisible-overview', 'Fundo invisível no Overview', 'Mantém ícones e interação disponíveis. Fundo, contorno e sombra usam fade de 250 ms ao entrar e sair.');

        const shadows = page('icons', 'Ícones', 'starred-symbolic');
        toggle(group(shadows, 'Sombras'), 'shadows-enabled', 'Ativar sombras dos ícones');
        const shadowOptions = dependent(shadows, 'shadows-enabled', 'Aplicação e aparência');
        toggle(shadowOptions, 'shadow-app-grid', 'Grade e pastas');
        toggle(shadowOptions, 'shadow-dock', 'Dock');
        toggle(shadowOptions, 'shadow-alt-tab', 'Alt+Tab');
        slider(shadowOptions, 'shadow-opacity', 'Opacidade da sombra', 0, 1, 0.05);
        slider(shadowOptions, 'shadow-radius', 'Desfoque (px)', 0, 64);
        slider(shadowOptions, 'shadow-offset-x', 'Deslocamento horizontal (px)', -64, 64);
        slider(shadowOptions, 'shadow-offset-y', 'Deslocamento vertical (px)', -64, 64);

        const apps = page('windows', 'Aplicativos', 'application-x-executable-symbolic');
        toggle(group(apps, 'Integração opcional', 'As opções GTK escrevem um bloco identificado em ~/.config/gtk-4.0/gtk.css. Feche e reabra os aplicativos para aplicar ou restaurar. O blur aparece somente nas áreas que o aplicativo desenha com transparência.'),
            'opacity-enabled', 'Ativar transparência seletiva');
        const appOptions = dependent(apps, 'opacity-enabled', 'Fundos dos aplicativos',
            'A disponibilidade depende da versão e dos estilos do aplicativo. Aplicativos Flatpak podem não ler o CSS do host.');
        toggle(appOptions, 'windows-blur', 'Efeitos nos fundos transparentes', 'Aplica às integrações selecionadas com fade-in de 250 ms ao mostrar/restaurar ou trazer a janela para a frente. Preserva os pixels opacos do aplicativo.');
        slider(appOptions, 'gtk-background-opacity', 'Opacidade do fundo', 0, 1, 0.05);
        toggle(appOptions, 'opacity-gtk-files-sidebar', 'Barra lateral do Arquivos', 'Para versões com sidebar-pane/content-pane.');
        toggle(appOptions, 'opacity-gtk-menus', 'Menus GTK4', 'Aplica o fundo dos popovers de menu em aplicativos que leem o CSS do usuário.');
        toggle(appOptions, 'opacity-ptyxis', 'Terminal Ptyxis', 'Usa a preferência nativa dos perfis; preserva a opacidade dos caracteres e restaura os valores anteriores ao desativar.');
        toggle(appOptions, 'opacity-gtk-settings-sidebar', 'Barra lateral do Configurações',
            'Adiciona uma classe CSS via overlay do recurso CcWindow e lançador D-Bus reversível do usuário. Requer gresource e reinício do aplicativo.');

        const maintenance = group(blur, `${this.metadata.name} ${this.metadata['version-name'] ?? this.metadata.version}`, 'GNOME 45–51 são alvos de compatibilidade. Consulte README e VALIDATION para os ambientes efetivamente testados.');
        slider(maintenance, 'resize-debounce-ms', 'Agrupar eventos de layout (ms)', 0, 1000, 10,
            'Aplicado na próxima ativação do módulo.');
        toggle(maintenance, 'debug-logging', 'Logs de depuração', 'Aplicado na próxima ativação da extensão.');
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
