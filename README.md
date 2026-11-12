# Gnome Shell Extended

Extensão modular para GNOME Shell **45–51**, com blur e transparência por
superfície, painel adaptativo, integração com docks, sombras de ícones e
preferências GTK4/Libadwaita. Versão **0.3.8**.
Licença **GPL-3.0-only**; código reaproveitado identificado em `THIRD_PARTY.md`.

## Funcionalidades

| Módulo | Implementação |
| --- | --- |
| Blur | Calendário, configurações rápidas, menus, banners, diálogos, pastas, Alt+Tab, volume/brilho e ferramenta de captura; papel de parede no Overview e bloqueio |
| Painel | Cor por tema/clara/escura e opacidade normal, com janelas maximizadas ou em tela cheia; considera workspace e monitor da barra |
| Docks | Dash to Dock/Ubuntu Dock: blur, opacidade do fundo e fundo invisível no Overview, preservando os ícones |
| Sombras | Grade, pastas, dock e Alt+Tab; intensidade, raio e deslocamentos |
| Aplicativos | Integração opcional por CSS para barras laterais do Nautilus/Configurações e menus GTK4; opacidade nativa dos perfis do Ptyxis |
| Preferências | Seis abas, 45 opções, limites de valores e restauração de defaults |

Por padrão, blur do calendário/configurações rápidas e painel adaptativo ficam
ativos. Outros elementos podem ser habilitados individualmente. As integrações
com aplicativos, docks e sombras ficam desligadas por padrão.

**Blur de janelas:** a aba Aplicativos inclui `Blur nos fundos transparentes`.
Ele é aplicado atrás das janelas dos aplicativos selecionados e fica visível
somente onde o aplicativo já desenha transparência. O conteúdo opaco, os textos
e os ícones continuam sendo desenhados pelo aplicativo. O módulo é liberado
quando a opacidade está em 100%, ao desativar a opção ou a integração.

**Limites desta versão:** a árvore de widgets de outro processo não está
acessível ao Shell. O CSS opcional depende das classes/versões dos aplicativos,
precisa de reinício desses aplicativos e pode não alcançar Flatpaks.

GNOME 45–51 são alvos declarados. Consulte `VALIDATION.md` para a versão e os
cenários efetivamente testados. Não há alegação de ganho medido de CPU/GPU/RAM
nem de compatibilidade certificada em todas as versões.

## Correção da versão 0.3.8

Na aba **Painel**, ative **Remover lacuna entre a barra e janelas maximizadas**.
O ajuste substitui a opção de estender o fundo: corrige o espaço reservado à
barra para que o Mutter posicione as janelas maximizadas junto à sua borda
inferior. O painel mantém suas dimensões, sem faixa adicional de fundo ou blur.
A opção vem desativada por padrão e restaura a reserva original ao desativar.
Em escala fracionária, a reserva usa a borda inferior arredondada para baixo
em pixels lógicos, evitando uma linha descoberta por arredondamento.

## Correções da versão 0.3.6

- O retorno da transparência da barra começa **depois que o Overview fecha**.
  Durante o fechamento, o estilo personalizado fica suspenso. No desktop,
  a barra passa da cor opaca do fundo do Overview para sua cor/transparência
  configurada ao longo de 250 ms, preservando a continuidade do primeiro frame.
- A mistura é feita no próprio estilo de fundo, sem textura de tela inteira,
  ator de cobertura ou mudança da opacidade dos textos e ícones.
- A validação usa o fundo real do Overview e mede os frames imediatamente
  anteriores e posteriores ao desaparecimento dele. O teste anterior com uma
  fonte colocada acima desse fundo mascarava essa mudança de entrada.
- Mantém as correções de blur, contorno e faixa inferior do dock.

## Correções da versão 0.3.5

- A barra superior faz fade-out ao entrar no Overview e fade-in ao sair, em
  250 ms, mantendo textos e ícones opacos. Cor, intensidade do blur e brilho
  acompanham a mesma transição; o blur não aparece inteiro no primeiro frame.
- Reabrir ou fechar o Overview durante a transição continua a partir do valor
  atual. No Overview totalmente aberto, o painel volta ao estilo nativo e
  libera suas capturas.
- A área de captura do painel usa o raio final durante a animação, evitando
  redimensionar a área de amostragem a cada passo do fade.
- O teste acompanha os pixels apresentados sobre uma fonte estática, além dos
  valores CSS, para detectar uma entrada abrupta do blur.

## Correções da versão 0.3.4

- Corrige o blur mais fraco na faixa inferior do dock junto ao limite da tela.
  A captura é deslocada para dentro do framebuffer do monitor, preservando
  suas dimensões durante o movimento em vez de ler pixels fora da tela.
- O teste compara separadamente as faixas superior e inferior do dock real,
  com os backends nativo e automático, e verifica os limites de cada captura.

## Correções da versão 0.3.3

- O fade de 250 ms do dock funciona na entrada e na saída do Overview, incluindo
  fundo, bordas e sombras. Apenas o widget decorativo muda de opacidade; os
  ícones e a área de interação ficam preservados. A opacidade original é
  restaurada ao desativar a integração.
- A barra superior agora tem blur próprio, controlado pela opção **Blur no fundo
  da barra**. Usa os parâmetros globais de blur e acompanha o fade de retorno.
  O efeito é liberado no Overview, quando a barra está oculta ou seu fundo é
  completamente opaco; as regras de opacidade automática continuam disponíveis.
- Diálogos do Shell são identificados por sua estrutura, incluindo subclasses
  como sair, desligar, reiniciar e outros diálogos modais. A validação abre e
  cancela os três diálogos de sessão reais em um compositor privado, sem iniciar
  contagem regressiva nem confirmar ações de energia.
- Revisados calendário/notificações, configurações rápidas, menus, banners,
  pastas, Alt+Tab e prévias, OSD e captura de tela. A escolha de cada alvo
  continua disponível nas preferências.

## Correções da versão 0.3.2

- O retorno do fundo do painel usa fade-in de 250 ms com aceleração e
  desaceleração suaves. O dock usa a mesma curva quando a opção **Fundo
  invisível no Overview** está ativa; textos e ícones mantêm sua opacidade.
- Menus conservam a transparência e o blur durante toda a animação de
  fechamento. O backdrop acompanha a opacidade do conteúdo e só é liberado
  quando o widget deixa de estar mapeado, evitando a restauração opaca antecipada.
- A validação verifica o alpha e os pixels de diálogos e dos dois seletores
  Alt+Tab, incluindo as prévias de janelas criadas após a lista principal.
  Ative **Diálogos** e **Alt+Tab** na aba de blur para aplicar os efeitos;
  essas opções continuam desligadas por padrão.
- Capturas fullscreen usam a escala do framebuffer de captura no recorte,
  evitando deslocamentos quando os monitores usam escalas diferentes.

## Correções da versão 0.3.1

- Transparência sem blur usa apenas o estilo nativo do widget: não cria atores
  de fundo, capturas nem callbacks por frame.
- Alterações de recorte durante a alocação são consolidadas antes de atualizar
  a visibilidade, geometria e captura do blur; recortes intermediários vazios
  não provocam alternâncias de fundo durante o recolhimento.
- A proteção de redraw limpa também a view que exibiu o blur no frame anterior,
  mesmo quando o dock já saiu da tela. O filtro diminui com a área visível do dock.
- No Overview, o painel devolve seus estilos ao tema do Shell. Ao fechar, o
  fundo configurado retorna com fade de 250 ms, como no legado, sem alterar a
  opacidade de textos e ícones. Reabrir o Overview cancela o fade imediatamente.
- O teste de animação lê o framebuffer apresentado, sem gerar uma captura de
  tela adicional que poderia esconder artefatos de redraw parcial.

## Correções da versão 0.3.0

- Intellihide: o fundo acompanha clips vazios mesmo quando o dock permanece
  mapeado; o último frame é limpo ao esconder e os backdrops são excluídos
  de toda detecção sob o ponteiro, incluindo `PickMode.ALL`.
- As mudanças de estilo do dock são aplicadas depois da atualização do tema,
  sem interferir na leitura temporária do estilo nativo pelo próprio dock.
- A captura de tela amostra a textura capturada imediatamente atrás do painel
  de controles, acima da imagem fullscreen que encobria o efeito anterior.
- Painel: troca de esquema claro/escuro em tempo real, fundo e contraste dos
  botões, com restauração dos estilos ao desligar.
- Blur de janelas: backdrops independentes para as integrações selecionadas,
  com manutenção da ordem em relação à janela e liberação de efeitos/sinais.

## Build e instalação

Repositório: [mcdalbu/gnome-shell-extended](https://github.com/mcdalbu/gnome-shell-extended).
Baixe o ZIP e o checksum na [última release](https://github.com/mcdalbu/gnome-shell-extended/releases/latest).

Dependências de build: Python 3, GNU Make, GJS e `glib-compile-schemas` (GLib).
A integração opcional com Configurações requer `gresource` com suporte a ELF
e um template CcWindow compatível no aplicativo instalado.
Não há dependências npm ou downloads durante o build.

```sh
make test
make zip
# Pacote: dist/gnome-shell-extended@mcda.zip
```

O pacote inclui `extension.js`, `prefs.js`, `metadata.json`, `core/`, `modules/`
e `schemas/gschemas.compiled` na raiz esperada pelo Shell. `src/` sozinho não é
instalável. O build não instala nem reinicia a extensão da sua sessão.

Para instalar o ZIP gerado:

```sh
gnome-extensions install dist/gnome-shell-extended@mcda.zip
# Encerre a sessão e entre novamente se o Shell ainda não reconhecer o UUID.
gnome-extensions enable gnome-shell-extended@mcda
gnome-extensions prefs gnome-shell-extended@mcda
```

Para atualizar uma instalação existente, adicione `--force` ao comando install.
Desative a extensão legada durante os testes para evitar efeitos sobrepostos.
O UUID da extensão é `gnome-shell-extended@mcda`. Não há migração automática
das configurações de `gnome-extended@local`.

## Estrutura

```text
gnome-shell-extended/
├── src/
│   ├── extension.js
│   ├── prefs.js
│   ├── stylesheet.css
│   ├── metadata.json
│   ├── core/
│   │   ├── config.js
│   │   ├── logger.js
│   │   ├── moduleManager.js
│   │   ├── utils.js
│   │   ├── actors.js
│   │   ├── tintSurface.js
│   │   ├── surface.js
│   │   ├── backgrounds.js
│   │   ├── blurBackend.js
│   │   ├── style.js
│   │   ├── gtkStyle.js
│   │   ├── ptyxis.js
│   │   ├── settingsLauncher.js
│   │   ├── windowSurfaces.js
│   │   └── render/             # captura por view, recorte e sinais compartilhados
│   └── modules/
│       ├── blur.js
│       ├── panel.js
│       ├── opacity.js
│       ├── shadows.js
│       └── docks.js
├── schemas/org.gnome.shell.extensions.gschema.xml
├── tests/
├── Makefile
├── tools.py
├── README.md
├── VALIDATION.md
├── THIRD_PARTY.md
└── LICENSE
```

## Arquitetura e recursos

Cada módulo é importado somente quando sua chave de ativação é solicitada.
O gerenciador isola falhas parciais e invalida imports pendentes durante o
desligamento. `enable()`/`disable()` dos módulos são síncronos; os carregamentos
assíncronos pertencem ao gerenciador ou a um binding que verifica sua geração.

O blur de uma superfície é importado/criado quando ela abre e descartado no
fechamento. Screenshots e outras superfícies são descobertos por eventos dos
atores, sem importar os módulos de interface do Shell nem fazer polling.
As rotinas compartilhadas de frame só conectam ao stage enquanto existem
superfícies; não há timer contínuo chamando `queue_redraw()`.

As capturas são separadas por view/monitor e ajustadas à escala física. O
recorte usa uma região em cache e acompanha os cantos do tema. Eventos de
janelas são compartilhados e só invalidam superfícies próximas do dano.
Redraw completo é habilitado temporariamente durante um frame existente que
precisa de amostragem BACKGROUND; ele não inicia um loop de frames.

O backend nativo usa `Shell.BlurEffect`. O modo BACKGROUND depende do conteúdo
abaixo da superfície; não oferece cache estático garantido nem limitação de
frequência. Overview/bloqueio usam ACTOR no papel de parede para permitir cache
do compositor. A biblioteca opcional `gi://Blur` é carregada sob demanda e
validada; indisponibilidade provoca fallback nativo.

`update-frequency` solicita uma frequência de captura para o backend opcional
que expuser `frame-divisor`. O divisor considera a frequência da view e é
limitado às capacidades do efeito; portanto um backend com divisor máximo 4
não atinge pedidos abaixo de 15 Hz em uma view de 60 Hz. Esse controle não
limita o monitor, as animações ou o backend nativo. Nenhuma biblioteca nativa
externa está incluída no pacote.

`resize-debounce-ms` é lido na ativação do módulo para eventos de descoberta e
estado de janelas. A geometria do blur acompanha os frames existentes para
não atrasar animações. O cache EGL é gerenciado pelo backend; esta extensão não introduz uma nova biblioteca EGL.

Ao desativar: os sinais, timers, efeitos, capturas e estilos próprios são
removidos. Estilos alterados externamente são preservados. As folhas de sombra
são descarregadas e seu arquivo temporário é apagado. Durante o bloqueio,
painel, docks, sombras e integração de aplicativos são suspensos; apenas o
módulo de blur permanece para o papel de parede, sem alterar autenticação.

## Integrações com aplicativos

As opções GTK escrevem apenas um bloco delimitado em
`~/.config/gtk-4.0/gtk.css`, com backup e checagem de etag para não sobrescrever
uma edição concorrente. Ao desativar, o bloco é removido; o CSS restante é
preservado. Blocos incompletos ou duplicados provocam erro e preservação do
arquivo. Reinicie os aplicativos para aplicar a restauração também.

O Configurações recebe a classe `gse-settings-window` por um overlay local de
`cc-window.ui`. Um lançador D-Bus do usuário em
`~/.local/share/dbus-1/services/org.gnome.Settings.service` fornece o overlay
ao processo; o estado anterior fica em
`~/.config/gnome-shell-extended/settings-launcher.json`. O lançador é restaurado
ao desligar a integração, preservando mudanças manuais. Aplicativos iniciados
por outros caminhos podem precisar de nova ativação D-Bus. O adaptador valida
o template e mantém o binário original do aplicativo. A integração é para a
instalação nativa de Configurações, com reinício do aplicativo.

O Ptyxis usa a chave nativa `opacity` de cada perfil. Os valores anteriores,
inclusive defaults sem valor explícito, são persistidos em
`~/.config/gnome-shell-extended/ptyxis-opacity.json` antes da alteração. A
restauração preserva ajustes manuais feitos enquanto a integração está ativa.
Depois de uma interrupção abrupta do Shell, reative e desative o módulo para
processar a recuperação persistida. Não se altera a opacidade de WindowActor.

## Configuração e testes

Esquema: `org.gnome.shell.extensions.gnome-shell-extended`, caminho
`/org/gnome/shell/extensions/gnome-shell-extended/`. O nome do XML não determina
o ID. Os valores de opacidade/brilho estão em 0–1; raio e deslocamentos em
pixels lógicos; frequência em Hz (0 acompanha o compositor).

```sh
make test          # sintaxe, XML estrito, lifecycle, GTK/Ptyxis em memória
make integration   # GNOME headless + D-Bus privados; requer /usr/bin/python3 + PyGObject
make clean
```

O teste de integração copia o build para diretórios XDG temporários, cria um
D-Bus privado e inicia um compositor Wayland headless. O helper que permite
Eval existe apenas nessa sessão e não entra no ZIP. Resultados e capturas são
gravados em `validation/`. Os testes não habilitam a extensão na sessão atual.

A próxima etapa de distribuição é executar a matriz GNOME 45–50, outros docks,
lock/unlock de uma conta de teste, hotplug e escalas mistas; verificar
aplicativos GTK por versão; e medir CPU/RSS/GPU com hardware identificado.
O histórico de versões está em `CHANGELOG.md`, e os resultados funcionais
e limites de validação estão em `VALIDATION.md`.

## Referências

- [Shell.BlurEffect: modos e custo de BACKGROUND](https://gnome.pages.gitlab.gnome.org/gnome-shell/shell/class.BlurEffect.html)
- [Extension e ESModules](https://gjs.guide/extensions/topics/extension.html)
- [Regras de limpeza e revisão](https://gjs.guide/extensions/review-guidelines/review-guidelines.html)
