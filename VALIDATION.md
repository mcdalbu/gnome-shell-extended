# Validação — Gnome Shell Extended 1.8.1

## Versão nas preferências — 2026-11-17

O grupo da aba Blur lê `metadata.name` e `metadata['version-name']`, com fallback
para `metadata.version`. Instanciação GTK real em janela oculta confirmou
`Gnome Shell Extended 1.8.1`; o texto anterior estava fixo em 1.5.1.
`make zip` passou a validação de metadados, schemas, sintaxe, lifecycle,
caches de renderização e integrações GTK/Ptyxis/Configurações.

## Opacidade da lateral do Configurações — 2026-11-17

Regressão em GNOME Shell 51.1 privado, com Configurações nativo e um lançador
legado que aplica a classe `gnome-extended-settings`, cujo CSS está em 67%.
Antes da correção, as quatro opacidades solicitadas resultaram em 67,06% nos
pixels: o `env` interno substituía o overlay atual pelo antigo.

Após a correção, fundos preto/branco confirmaram:

| Opacidade solicitada | Lateral medida | Conteúdo medido |
| --- | --- | --- |
| 0% | 0% | 100% |
| 45% | 45,10% | 100% |
| 90% | 89,80% | 100% |
| 100% | 100% | 100% |

O ator da janela permaneceu em 255, sem efeitos de janela, e o lançador
legado foi restaurado exatamente ao desligar a integração. Cada valor usa
um processo novo do Configurações para carregar o CSS atualizado.

`make test` cobre execução real de lançadores `env` aninhados, `env -i`, caminhos
com espaços, preservação de argumentos e de recursos não relacionados.
Reprodução: `make build` e
`GSE_TEST_SETTINGS_OPACITY_ONLY=1 /usr/bin/python3 tests/headless.py`.
Evidências locais: `validation/settings-opacity-baseline-results.json` e
`validation/settings-opacity-fixed-results.json`. A validação foi feita no
GNOME 51.1 instalado; outras versões não foram repetidas para esta correção.

A instalação local recebeu somente o helper corrigido e a sincronização do
lançador/CSS com as preferências atuais. O processo real iniciado por D-Bus
confirmou `G_RESOURCE_OVERLAYS` apontando para o overlay atual. Cópias dos
arquivos anteriores estão em `validation/settings-opacity-local-backup/`.

## Retomada do painel — 2026-11-17

A 1.8.0 (31) reproduziu o relato no GNOME privado: a superfície criada depois
que o módulo é reativado, mas antes de `ScreenShield.active=false`, permaneceu
oculta com callbacks suspensos. O sinal final não retomou o blur; abrir/fechar o
Overview recuperou a captura. A sequência corresponde ao código do Shell 51.1:
`_continueDeactivate()` retorna a `user` antes de `_completeDeactivate()`
remover a proteção após a animação.

A 1.8.1 (32) observa ambos os eventos que alteram a elegibilidade da superfície.
O trabalho é agrupado em `Meta.LaterType.BEFORE_REDRAW`, com leitura atualizada
da visibilidade. As assinaturas são removidas com a superfície; não há timer de
polling, mudança de preferências nem captura enquanto a proteção está ativa.

A regressão passou com um monitor e com views 125%/150% no modo Elementos:
retomada sem evento de Overview, diferença média RGB `[0,0,0]` na amostra do
painel antes/depois, capturas saudáveis, segunda ativação da proteção sem
recarregar módulos, sinalização nativa `user`/`unlock-dialog` e zero frames na
janela final de repouso. Desativar o blur removeu os callbacks de sessão/proteção.

O harness usa somente uma sessão D-Bus/GNOME privada. Ele reproduz a ordem dos
eventos sem suspender fisicamente o computador e sem abrir autenticação; o
ciclo real de suspensão na sessão do usuário precisa ser confirmado após
carregar a atualização.

```sh
make build
GSE_TEST_PANEL_RESUME=1 GSE_TEST_PANEL_RESUME_ONLY=1 /usr/bin/python3 tests/headless.py
GSE_TEST_PANEL_RESUME=1 GSE_TEST_PANEL_RESUME_ONLY=1 GSE_TEST_MULTI=1 GSE_TEST_REGIONAL_REDRAW=1 /usr/bin/python3 tests/headless.py
GSE_TEST_PANEL_RESUME=1 GSE_TEST_REGIONAL_REDRAW=1 GSE_TEST_REGRESSIONS=1 GSE_TEST_FLICKER=1 GSE_TEST_FLICKER_BLUR=1 GSE_TEST_DOCK_DRAG=1 GSE_TEST_STATIC_PANEL=1 /usr/bin/python3 tests/headless.py
```

Evidências: `validation/panel-resume-1.8.1/`, com a falha da 1.8.0 e os testes
após a correção.

## Promoção para estável — 2026-11-16

A release 1.8.0 (31) promove o commit `fde68107580c7bcb4d6e118ef65dae0321675105`
da beta.3. A comparação byte a byte deve confirmar que todos os arquivos de
execução e schemas são idênticos, exceto `metadata.json`. A documentação recebe
a identificação de release estável; nenhuma preferência do usuário é alterada.

A promoção repete build, parsing dos 46 módulos, lifecycle, cache/oclusão,
61 chaves e fila assíncrona de integrações. Uma sessão GNOME privada identifica
a versão estável e verifica memória, retomada, oclusão XRGB, fonte atual do
wallpaper, cache final e descarte de passagens antigas. As seis matrizes da
beta.3 permanecem evidência do mesmo código, incluindo dock real, flicker,
cadência 50%/25%, escalas fracionárias e fallback de wallpaper.

Pacote, comparação com a beta e evidências ficam em `validation/release-1.8.0/`.

## Revisão de desempenho — 2026-11-16

Os dez pontos principais da revisão da beta.2 foram implementados. São 46
módulos JavaScript, 61 chaves e 56 controles; as opções de atualização continuam
100%, 50% e 25%. Testes de lifecycle incluem restauração assíncrona, e os testes
de integração exercitam uma fila real de subprocessos com alterações agrupadas
e restauração final. O orçamento compartilhado de caches ocultos e o cache de
uniforms têm regressões próprias.

As sessões privadas usam GNOME Shell/Mutter 51.1 e Intel xe, com monitor único
ou dois monitores a 125% e 150%. O formato RGB é exercitado por um cliente
Wayland XRGB real; uma janela GTK RGBA visualmente opaca também é testada para
garantir o fallback conservador.

| Verificação | Resultado observado |
| --- | --- |
| Posição/tamanho, superfície de teste com um monitor | De nove para duas consultas por frame de cada getter |
| Uniforms do pipeline aquecido | Zero buscas novas, contra oito por composição na sonda anterior |
| Raios 24→25→26→27 | Mesma pirâmide quando contexto/dimensões/redução permanecem iguais; mudança de identidade de contexto reconstrói o buffer |
| Superfície mapeada com clip vazio | Sem consumidor de danos nem assinaturas de fases após o frame final; retoma ao abrir |
| Pai reaparece mudando somente opacidade | Retoma as assinaturas e a captura; inclui a ferramenta de screenshot |
| Janela sob cobertura XRGB comprovada | Zero novas capturas durante animação externa; retoma ao ser exposta |
| Cobertura RGBA desconhecida | Mantém a renderização normal |
| Mudança de brilho/calendário | Brilho usa `sync(true)` sem varrer janelas; calendário não chama o controlador de janelas |
| Screenshot | Armazenamento transitório liberado após 500 ms, sem polling |
| Wallpaper | Fonte atual, blur de padrão listrado e saída em cache; brilho mantém filtros e geometria; reduzir iterações libera passagens antigas |
| Overview | Árvore aquecida reutilizada ao reabrir; liberada em cinco segundos, sob orçamento global |
| Alvos do Overview, dois monitores | Estimativa RGBA8 de 207,1 MiB na cadeia antiga para 79,5 MiB no renderer novo, com as dimensões observadas |
| Repouso | Zero frames adicionais nas janelas finais dos ensaios completos |

A estimativa de armazenamento soma dimensões dos alvos, sem overhead do driver;
não representa memória residente medida, porcentagem de GPU ou watts. As oito
passagens Gaussian do wallpaper passam a usar alvos reduzidos, com uma textura
por passagem agendada para evitar ciclos nos journals Cogl. O caminho dinâmico
continua usando dois alvos em ping-pong. A nova cadeia acrescenta redução e
cache final, portanto o ganho não deve ser descrito como redução do número
absoluto de draw calls em toda configuração.

A matriz fracionária aprovou filtros, cadência 100/50/25%, fontes sobrepostas,
retomada, captura de tela, papel de parede, integração GTK/Ptyxis/Configurações,
arraste nativo junto ao dock real e dez ciclos de ativação/desativação. A matriz
de regressões também aprovou pixels, clips, revelação de janelas e flicker com
blur. Os limites de cobertura preservam recortes e transforms desconhecidos;
janelas com múltiplas superfícies ou alpha desconhecido mantêm o renderer ativo.

O recorte às regiões transparentes internas de widgets de outro processo não
foi inferido: falta uma API de informação confiável do cliente. As versões do
Shell 45–50 não foram executadas nesta máquina; o fallback da cadeia de
wallpaper é exercitado desativando apenas a detecção de paint nodes numa cópia
do build usado pelo harness privado.

```sh
make build
GSE_TEST_OPTIMIZATIONS=1 GSE_TEST_MULTI=1 GSE_TEST_STATIC_PANEL=1 GSE_TEST_PERFORMANCE=1 GSE_TEST_REGIONAL_REDRAW=1 GSE_TEST_DOCK_DRAG=1 /usr/bin/python3 tests/headless.py
GSE_TEST_OPTIMIZATIONS=1 GSE_TEST_REGIONAL_REDRAW=1 GSE_TEST_REGRESSIONS=1 GSE_TEST_FLICKER=1 GSE_TEST_FLICKER_BLUR=1 GSE_TEST_DOCK_DRAG=1 /usr/bin/python3 tests/headless.py
GSE_TEST_OPTIMIZATIONS=1 GSE_TEST_MULTI=1 GSE_TEST_STATIC_PANEL=1 GSE_TEST_KAWASE=1 GSE_TEST_GAUSSIAN_ITERATIONS=1 GSE_TEST_SAMPLES=1 /usr/bin/python3 tests/headless.py
GSE_TEST_LEGACY_WALLPAPER=1 GSE_TEST_STATIC_PANEL=1 GSE_TEST_KAWASE=1 GSE_TEST_GAUSSIAN_ITERATIONS=1 /usr/bin/python3 tests/headless.py
```

A última sessão completa também aprovou as resoluções automática/metade/um
quarto na barra estática e zero frames finais em repouso. A faixa usa a margem
calculada para o kernel e a reconstrução, incluindo a redução de resolução.

Relatórios e hashes do pacote ficam em `validation/beta-1.8.0-beta.3/`.

## Arraste nativo junto ao dock — 2026-11-16

- Watcher de operações nativas de mover/redimensionar, incluindo variantes por teclado e sem restrições. Lifecycle verifica período de acomodação, ausência de polling, uma atualização final por operação, limpeza no meio do grab, reativação e falha parcial de conexão.
- Build com 39 módulos e 61 chaves aprovado. O número de controles permanece 56; nenhuma preferência foi acrescentada ou alterada pelo arraste.
- Cliente GTK4/Wayland com identidade de Ptyxis e fundo translúcido, ponteiro virtual e `Meta.Window.begin_grab_op`: arraste efetivo em direção ao Dash to Dock Extended real e de volta. A janela cruzou o limite de intellihide e o dock completou mostrar/recolher nos quatro casos Monitor/Elementos × blur de janela/dock desligado/ligado.
- Durante o movimento com grab ativo, a barra e a janela ficaram fora do painter regional. Com blur de janela ligado e atualização 100%, todos os frames em que a posição mudou atualizaram a captura da janela. Elementos voltou após o grab; os quatro cenários passaram na checagem de repouso.
- No ensaio inicial a 100%, os maiores intervalos durante movimento ficaram entre 18,17 e 22,59 ms. Na beta.1, ficaram entre 17,60 e 18,47 ms; a pausa longa relatada não foi reproduzida. As execuções não fixaram clocks nem repetiram ordens para estabelecer ganho de desempenho. A correção evita a espera regional durante a interação, ao custo de redesenhar mais pixels nesse intervalo.

```sh
make build
GSE_TEST_DOCK_DRAG=1 GSE_TEST_DRAG_ONLY=1 /usr/bin/python3 tests/headless.py
GSE_TEST_DOCK_DRAG=1 GSE_TEST_REGIONAL_REDRAW=1 GSE_TEST_REGRESSIONS=1 GSE_TEST_FLICKER=1 GSE_TEST_FLICKER_BLUR=1 /usr/bin/python3 tests/headless.py
GSE_TEST_DOCK_DRAG=1 GSE_TEST_MULTI=1 GSE_TEST_PERFORMANCE=1 GSE_TEST_REGIONAL_REDRAW=1 GSE_TEST_STATIC_PANEL=1 /usr/bin/python3 tests/headless.py
```

Evidências iniciais: `validation/regional-drag-baseline-beta1/single-dock-drag-results.json`
e `validation/single-dock-drag-results.json`.

As duas matrizes completas também passaram, incluindo escalas 125%/150%,
cadências 100/50/25%, margens sobrepostas, barra estática, testes de pixels do
dock real e dez ciclos de ativação/desativação. Zero frames na janela final
de repouso. Relatórios: `validation/flicker-blur-regional-dock-drag-results.json`
e `validation/single-multi-static-panel-regional-performance-dock-drag-results.json`.

## Capturas compactas, resolução e cadência — 2026-11-16

- Build, parsing de 38 módulos, esquema estrito com 61 chaves, lifecycle e integrações aprovados. Preferências: seis páginas, 56 controles e bindings bidirecionais.
- A cadência foi verificada com relógios simulados de 60, 120 e 144 Hz; retomada após repouso e mudança de frequência atualizam imediatamente, sem rajada de compensação.
- Na sessão GNOME Shell/Mutter 51.1 com Intel xe e views a 125%/150%, o modo compatível registrou 120/60/30 capturas em dois segundos para 100%/50%/25%, enquanto a view manteve aproximadamente 120 pinturas. O modo Elementos registrou 60/60/30: a fonte parcial já limitava o modo 100% nessa cena. São limites, não uma exigência de gerar frames.
- Box, Gaussian e Kawase passaram pelas três resoluções com desfoque real, saída RGB neutra e alvos menores. Na superfície de 400×32 a 125%, os alvos de filtro foram Box 176×64 → 96×40 → 52×24; Gaussian 192×80 → 96×40 → 56×28; Kawase 160×48 → 88×32 → 48×16. Margens maiores podem alterar a proporção efetiva de pixels poupados.
- O probe leu o framebuffer apresentado: depois de parar a animação, as três cadências chegaram à cor final correta nos modos Monitor e Elementos. Não restaram temporizadores pendentes; destruir durante o refresh pendente os cancelou. Os três métodos reutilizaram o cache em quarter rate e atualizaram capturas ao mover o elemento.
- A matriz fracionária aprovou bordas da barra, blur combinado com distorção, movimento, janelas Wayland reais, iterações Kawase, cache de wallpaper e dez ciclos de ativação/desativação. Zero frames na janela final de repouso e zero erro médio fora do elemento móvel nos três filtros combinados.
- Foi corrigida uma mudança de amostragem observada ao alterar a distorção: como a lente arredondada desloca a amostra para dentro, a margem reserva o maior alcance entre kernel e lente. Uma lente contida no suporte do filtro não muda desnecessariamente a grade da captura.
- A combinação com o dock real revelou um ciclo regional: em 0,5 s de repouso houve 30 pinturas, com duas capturas alternando filtros e reutilizações e nenhum temporizador ativo. O modo compatível interrompeu o ciclo. O agrupamento das margens sobrepostas corrigiu o caso; o ensaio completo e os seis casos de duas superfícies (Monitor/Elementos × 100/50/25%) terminaram com zero frames em repouso. Os prazos são alinhados para impedir que refreshes finais também se realimentem.
- O teste de revelação de janelas agora espera a janela de cobertura obter foco antes de ativar a janela alvo, para medir uma mudança de foco real.
- A redução de resolução e de capturas não constitui uma medição de economia total de GPU ou watts. O consumo relatado de 20% na sessão real não foi reproduzido nem declarado resolvido. O caminho de wallpaper permanece separado e as opções novas preservam os padrões Automática/100%.

```sh
make build
GSE_TEST_PERFORMANCE=1 GSE_TEST_REGIONAL_REDRAW=1 GSE_TEST_PANEL_EDGE=1 GSE_TEST_MULTI=1 GSE_TEST_COMBINED=1 GSE_TEST_KAWASE=1 GSE_TEST_STATIC_PANEL=1 /usr/bin/python3 tests/headless.py
GSE_TEST_PERFORMANCE=1 GSE_TEST_REGIONAL_REDRAW=1 GSE_TEST_REGRESSIONS=1 GSE_TEST_FLICKER=1 GSE_TEST_FLICKER_BLUR=1 /usr/bin/python3 tests/headless.py
```

Evidência da matriz fracionária:
`validation/single-multi-combined-panel-edge-kawase-static-panel-regional-performance-results.json`.
Evidência do dock real e das margens sobrepostas:
`validation/flicker-blur-regional-performance-results.json`.

## Promoção da beta.3 — 2026-11-16

A versão estável usa o mesmo código de execução da **1.7.0-beta.3 (26)**,
com revisão **27** e nome **1.7.0** em `metadata.json`. A comparação do pacote
confere os scripts, estilos e esquemas da beta byte a byte, exceto os metadados.
O build e a integração headless são verificados novamente para a identificação
estável. O redesenho por Elementos continua opcional e identificado como
experimental; as limitações de compatibilidade e das medições abaixo se aplicam.

Build, lifecycle, 59 chaves e integração da identificação estável aprovados.
A sessão privada conferiu barra estática, região por elemento, imagem real,
preferências (54 controles), integrações e dez ciclos de ativação/desativação.
Zero frames na janela final de repouso, inclusive com o elemento regional ativo.
Os relatórios e a comparação com a beta estão no
[ZIP de validação da 1.7.0](https://github.com/mcdalbu/gnome-shell-extended/releases/download/v1.7.0/gnome-shell-extended-validation-1.7.0.zip),
com checksum separado na release.

## Barra estática e redesenho por elemento — 2026-11-16

- `make build`: 37 módulos, esquema estrito, 59 chaves, lifecycle e integrações em memória aprovados. Preferências: seis páginas e 54 controles.
- Barra estática: sem cópias de framebuffer, assinatura de danos de janelas ou callbacks de frame. A saída dos shaders fica em um cache separado da entrada; durante 61 frames a 100% e 122 frames nas views 125%/150%, houve zero pinturas internas dos filtros.
- Box, Gaussian e Kawase mantiveram pixels do wallpaper mesmo com uma superfície de outra cor animada atrás da barra. Mudanças no wallpaper atualizaram a imagem; ícones/textos ficaram opacos, e Overview/opacidade 100% liberaram o efeito.
- Imagem real de faixas: em escalas mistas, o desvio de contraste caiu de 104,86 no raio 1 para 38,92 no raio 24, confirmando desfoque real da imagem. A fonte foi limitada a uma faixa de 184 pixels lógicos de altura com raio 24 e barra de 32, mais a pequena borda dos alvos offscreen.
- Redesenho regional: observou regiões menores que a view, capturas atualizadas continuamente e ausência de pedidos de refresh para animações fora da captura. Zero frames na janela de repouso com o elemento ainda ativo. Preserva a fila de pintura e o histórico de apresentação nativos; não substitui o painter do stage nem modifica regiões const do compositor.
- Matriz a 125%/150% com fonte estática, borda da barra, blur combinado com refração, movimento, janelas Wayland reais, restauração e dez ciclos de enable/disable aprovada. O modo pode usar o cache por um frame até que toda a margem de captura seja redesenhada.
- Dock Dash to Dock Extended real: recolhimento, alinhamento, fades, fechamento de menus e leitura do framebuffer apresentado aprovados com o modo regional; sem erros de shader/JS nem loop de frames em repouso.
- No ensaio curto a 100%, uma amostra de três segundos sob animação de tela inteira registrou RCS de 2,64% com barra estática e 5,56% com a dinâmica compatível. São observações do Shell privado inteiro, com clocks não fixados, sem repetições suficientes para uma alegação de ganho percentual ou correção dos 20% na sessão do usuário.
- Na cena de um elemento de 260×180 com uma região pequena animada atrás, amostras de três segundos registraram RCS de 1,05% no regional e 4,20% no compatível a 100%; a 125%/150%, 1,00% e 4,59%. A CPU variou entre os ensaios, sem vencedor consistente. São observações, não um benchmark com frequência fixa, qualidade temporal equivalente ou ganho percentual garantido.
- GNOME Shell/Mutter 51.1 e Intel xe. Compatibilidade declarada em outras versões continua sem certificação; o modo regional retorna ao compatível se a API necessária não estiver disponível.

```sh
make build
GSE_TEST_STATIC_PANEL=1 /usr/bin/python3 tests/headless.py
GSE_TEST_REGIONAL_REDRAW=1 /usr/bin/python3 tests/headless.py
GSE_TEST_REGIONAL_REDRAW=1 GSE_TEST_STATIC_PANEL=1 GSE_TEST_PANEL_EDGE=1 GSE_TEST_COMBINED=1 GSE_TEST_MULTI=1 /usr/bin/python3 tests/headless.py
GSE_TEST_REGIONAL_REDRAW=1 GSE_TEST_REGRESSIONS=1 GSE_TEST_FLICKER=1 GSE_TEST_FLICKER_BLUR=1 /usr/bin/python3 tests/headless.py
```

Evidências locais: `validation/single-static-panel-results.json`,
`validation/single-regional-results.json` e
`validation/single-multi-combined-panel-edge-static-panel-regional-results.json` e
`validation/flicker-blur-regional-results.json`.

APIs consultadas: [gerenciamento do wallpaper do GNOME](https://github.com/GNOME/gnome-shell/blob/51.1/js/ui/background.js)
e [fila de redesenho recortada do Clutter](https://github.com/GNOME/mutter/blob/51.1/clutter/clutter/clutter-actor.c).

## Iterações do Kawase — 2026-11-16

- Esquema com `blur-kawase-iterations`, limites 1–8, padrão 3 e independente de `blur-iterations`. Defaults, limites, migração e lifecycle aprovados.
- Preferências: seis páginas, 52 controles, bindings e sensibilidade exclusiva para blur ativo com Kawase selecionado.
- Alteração ao vivo para 1/2/3/8 iterações: contagem real de 1/2/3/8 passadas, sem feedback entre textura e alvo. Painel atualizado automaticamente e cadeia do Overview reconstruída enquanto ele está aberto.
- No raio 64 a 100%, larguras de transição 10–90% de 82/94/102/98 px para 1/2/3/8 iterações. Perfis monotônicos; a normalização mantém a variância ideal, mas o formato da aproximação varia.
- O padrão de três passos mantém o kernel da beta.1. Não foi repetido o benchmark de GPU para cada quantidade; o relatório histórico não representa uma medição da beta.2.

```sh
make build
GSE_TEST_KAWASE=1 GSE_TEST_PANEL_EDGE=1 GSE_TEST_CONTROLS=1 /usr/bin/python3 tests/headless.py
GSE_TEST_KAWASE=1 GSE_TEST_MULTI=1 GSE_TEST_DOCK_CORNERS=1 /usr/bin/python3 tests/headless.py
```

Evidências: `validation/single-controls-panel-edge-kawase-results.json` e
`validation/single-multi-corners-kawase-results.json`.

## Kawase compacto — beta.1, 2026-11-16

Distribuída como beta.1, com o mesmo renderer validado na candidata 1.7.0;
a mudança de identificação está em `metadata.json` e na documentação.

- `make zip`: metadados, sintaxe, esquema estrito, lifecycle, migração e integrações em memória aprovados.
- Kawase: três passadas reais de filtro, sem feedback entre o alvo de escrita e a textura lida. Samples/iterações do Gaussian não alteram seus pixels.
- Degraus nos dois eixos, raios 1/6/24/64/100: transição monotônica e intensidade próxima à do Box. Em 125%/150%, a largura 10–90% no raio 24 foi 39/38 px lógicos no Kawase e 35/36 no Box.
- Painel: as primeiras três linhas e o centro coincidiram (107/255) no framebuffer e na screenshot; sem faixa sem efeito.
- Cantos do dock, recortes vazios, movimento, janelas Wayland reais, alteração do fundo, refração combinada, restauração do lock e limpeza de dez ciclos aprovados em escalas mistas.
- Preferências: seis páginas e 51 controles; a nova escolha preserva os bindings e desabilita qualidade exclusiva do Gaussian. Zero frames na janela de repouso final da suíte funcional; sem erros JS/shader.
- O benchmark de três repetições **não demonstrou menor ocupação total de GPU no Kawase**. A área de captura caiu 19,25% na cena medida e o filtro caiu para 12 leituras por pixel reduzido, mas isso não é uma economia percentual de GPU comprovada. Consulte `BENCHMARK-KAWASE.md` e os dados brutos.
- O relato de 20% de GPU com desktop parado não foi reproduzido no compositor privado. Não há declaração de correção do consumo da sessão real nem de compatibilidade validada em todas as versões declaradas do GNOME.

```sh
make zip
GSE_TEST_KAWASE=1 GSE_TEST_PANEL_EDGE=1 GSE_TEST_CONTROLS=1 /usr/bin/python3 tests/headless.py
GSE_TEST_KAWASE=1 GSE_TEST_PANEL_EDGE=1 GSE_TEST_DOCK_CORNERS=1 GSE_TEST_COMBINED=1 GSE_TEST_MULTI=1 /usr/bin/python3 tests/headless.py
GSE_APPEARANCE_BENCH_PROFILE=kawase GSE_APPEARANCE_BENCH_REPETITIONS=3 /usr/bin/python3 tests/appearance_benchmark.py
```

Evidências locais: `validation/single-controls-panel-edge-kawase-results.json`,
`validation/single-multi-corners-combined-panel-edge-kawase-results.json` e
`validation/kawase-compact-benchmark-1.7.0/`.

## Fast Gaussian progressivo — 2026-11-15

Adaptação do encadeamento decrescente de `amilajack/gaussian-blur`, com pares
horizontal/vertical equilibrados e normalização pela variância. O padrão
de quatro iterações usa oito passadas de filtro. Nas superfícies, cada passada
reutiliza os dois render targets existentes; a captura do fundo não se repete
por passada. O Box blur mantém o algoritmo anterior.

- Degraus de cor independentes nos dois eixos, raio 64 e 9 taps: RMSE do perfil
  renderizado contra uma curva Gaussian caiu de 0,03670 com uma iteração para
  0,00271 com quatro e 0,00267 com oito (RGB normalizado, escala 100%).
  Nenhum ringing acima da tolerância de quantização; perfis iguais nos eixos.
- Troca ao vivo entre 1/4/8 iterações altera os pixels, atualiza o painel e
  reconstrói a cadeia de filtros do Overview com 2/8/16 passadas.
- Kernels 5/9/13 renderizados sobre quadriculado de 32 px; todos reduzem o
  contraste e as escolhas continuam produzindo pixels diferentes.
- Matriz completa a 100% e com monitores privados a 125%/150%: iterações,
  samples, borda do painel, cantos do dock e limpeza aprovados.
- Toggles independentes, combinação com refração, janelas Wayland reais,
  restauração e dez ciclos de ativação/desativação aprovados. Preferências:
  seis páginas e 51 controles, incluindo binding e sensibilidade das iterações.
- Zero frames em repouso na amostra final; sem JS ERROR ou erros de shader.
  Não foi medido ganho de CPU/GPU nem o custo relativo das novas iterações.

```sh
make build
GSE_TEST_GAUSSIAN_ITERATIONS=1 GSE_TEST_SAMPLES=1 GSE_TEST_PANEL_EDGE=1 GSE_TEST_DOCK_CORNERS=1 GSE_TEST_CONTROLS=1 /usr/bin/python3 tests/headless.py
GSE_TEST_GAUSSIAN_ITERATIONS=1 GSE_TEST_SAMPLES=1 GSE_TEST_PANEL_EDGE=1 GSE_TEST_DOCK_CORNERS=1 GSE_TEST_MULTI=1 /usr/bin/python3 tests/headless.py
GSE_TEST_COMBINED=1 /usr/bin/python3 tests/headless.py
make zip
```

Evidências: `validation/single-samples-corners-controls-panel-edge-iterations-results.json`,
`validation/single-multi-samples-corners-panel-edge-iterations-results.json` e
`validation/single-combined-results.json`. Uma execução com todas as flags
agrupadas teve timeout D-Bus ao iniciar uma screenshot no cenário combinado;
o cenário combinado isolado e as matrizes acima passaram.
GNOME Shell/Mutter 51.1, driver xe, D-Bus/Wayland privados. GNOME 45–50,
outros drivers e autenticação de bloqueio real não foram revalidados.

# Validação — Gnome Shell Extended 1.5.2

## Primeira linha do painel — 2026-11-15

Reproduzida uma linha sem blur no topo do painel real em GNOME Shell/Mutter
51.1. O retângulo compartilhado de captura usa um inset subpixel; arredondar
seus limites para dentro no efeito de vidro descartava o primeiro pixel do
framebuffer. A cópia agora arredonda para fora, limitada ao framebuffer;
o scissor e a cobertura do shader continuam limitando a superfície pintada.

- Antes: sobre fundo branco e brilho de 50%, a primeira linha mediu 209 no
  canal vermelho, contra 107 nas linhas seguintes e no centro do painel.
- Depois: as três primeiras linhas e o centro mediram 107, tanto na screenshot
  quanto no framebuffer apresentado, com Box blur e Fast Gaussian Blur.
- Suítes completas a 100% e com monitores a 125%/150% aprovadas; o teste do
  painel usa a view primária a 125% e a screenshot em escala 150% nesta matriz.
- Cantos do dock com Box e Gaussian 5/9/13, transparência sem blur, primeiro
  plano opaco, políticas do painel, restauração e dez ciclos de ativação/
  desativação aprovados. Nenhum erro JS ou shader nos logs; zero frames em repouso.

```sh
make build
GSE_TEST_PANEL_EDGE=1 GSE_TEST_DOCK_CORNERS=1 /usr/bin/python3 tests/headless.py
GSE_TEST_PANEL_EDGE=1 GSE_TEST_DOCK_CORNERS=1 GSE_TEST_MULTI=1 /usr/bin/python3 tests/headless.py
make zip
```

Evidências: `validation/panel-edge-before/`,
`validation/single-corners-panel-edge-results.json` e
`validation/single-multi-corners-panel-edge-results.json`.
D-Bus/Wayland privados, driver xe; nenhuma alteração na sessão principal.
GNOME 45–50 e outros drivers não foram revalidados.

# Validação — Gnome Shell Extended 1.5.1

## Quadrado da textura fosca — 2026-11-14

Reproduzido no GNOME Shell/Mutter 51.1 com blur e distorção desligados.
`TOP_LEFT` restringia a área de pintura ao primeiro tile de 64×64; o repeat
não ampliava essa área. `RESIZE_FILL` faz a textura repetir por toda a alocação,
preservando o tile compartilhado e o caminho sem capturas ou filtros.

- Regressão de pixels sobre fundos uniformes nos temas claro e escuro, em
  pontos com a mesma fase da textura, além das primeiras linhas e colunas de
  tiles. Antes da correção, somente a primeira amostra mudava (18 níveis de
  cinza); as demais não recebiam textura. Depois, todas mudam uniformemente.
- Verificação de pixels externos para detectar vazamentos, conteúdo pequeno
  compartilhado e área de pintura igual à área completa da superfície.
- Dock real Dash to Dock Extended, com blur e distorção desligados, nos dois
  temas; capturas inspecionadas. Menus, painel, janelas Wayland, Overview e
  fixture de bloqueio continuam na suíte de textura fosca e restauração.
- Suíte de samples, cantos, toggles, blur combinado e refração aprovada a 100%.
  Monitores privados a 125% e 150% cobrem a regressão da textura e o dock real.

Evidências: `validation/frost-before/`,
`validation/single-samples-corners-controls-combined-refraction-economic-results.json`
e `validation/single-multi-real-dock-economic-results.json`, com capturas e
logs correspondentes. Os testes usam D-Bus/Wayland privados e driver xe;
não reproduzem a sessão exata do usuário nem medem redução percentual de GPU.

# Validação — Gnome Shell Extended 1.5.0

## Cantos do dock e samples — 2026-11-14

GNOME Shell/Mutter 51.1, driver xe, GPU real. D-Bus/Wayland e configurações
privados; nenhuma alteração no dock ou nas configurações da sessão principal.

- `make zip`: sintaxe de 34 módulos, schema estrito, lifecycle, 55 chaves,
  migração, integrações e integridade do ZIP.
- Reproduzida uma coluna sem blur na tangente entre a lateral e a curva do
  dock: cobertura medida zero nas duas linhas verificadas antes da correção.
  O recorte binário arredondava para dentro o primeiro pixel de cada linha.
- As capturas passam a usar cobertura arredondada com antialias no shader,
  scissor conservador e composição premultiplicada. O recorte do contêiner é
  preservado. A textura fosca mantém um recorte próprio, sem offscreen novo.
- Regressão sobre fundo uniforme, com Box blur e Gaussian 5/9/13, nos quatro
  cantos e por monitor. A cobertura junto às tangentes permanece acima de 60%
  nas amostras; antes era zero no canto que reproduziu a falha.
- Kernels Gaussian de 5, 9 e 13 taps, usando 3, 5 e 7 leituras lineares por
  direção; default 13. Troca ao vivo altera o shader e os pixels do fundo.
- Fonte quadriculada nas duas direções: os três kernels reduzem o contraste.
  Overview acompanha a seleção; mesma configuração compartilhada com painel,
  dock e janelas. O número de leituras não é um benchmark de consumo.
- Preferências: seis abas e 50 controles, binding das três escolhas e
  sensibilidade ligada apenas a blur ativo + Fast Gaussian.
- Dock real Dash to Dock Extended copiado para a sessão privada: três kernels,
  blur + distorção, alinhamento e primeiro plano opaco. Inspeção das capturas.
- Matriz dos toggles, janelas Wayland reais, centro plano da lente, recortes,
  textura fosca, callbacks de dano, limpeza e reinício da extensão aprovados.
- Repouso sem frames extras; probe de movimento sem alteração de pixels fora
  das superfícies nas cenas medidas. Sem erros do renderer da extensão.

Evidências em `validation/single-samples-corners-controls-combined-refraction-economic-results.json`
e `validation/single-multi-real-dock-samples-corners-controls-combined-refraction-economic-results.json`.
A conferência do dock real também fica em
`validation/single-multi-real-dock-samples-corners-results.json`, com capturas
e logs correspondentes. Escalas verificadas: 100%, 125% e 150%.

Na conferência dedicada, a fonte branca fica abaixo do dock e a lixeira está
desativada na fixture. Uma asserção de pixels impede capturas vazias; a
inspeção não depende apenas da existência de atores. Não foi medido percentual
de GPU; GNOME 45–50, outros drivers e a sessão exata da imagem do usuário não
foram revalidados.

# Validação — Gnome Shell Extended 1.4.0

## Controles independentes — 2026-11-14

GNOME Shell/Mutter 51.1, driver xe, GPU real. Testes em D-Bus/Wayland e
configurações privados; a instalação principal não é usada pelos testes.

- `make zip`: sintaxe de 33 módulos, schema estrito, lifecycle, 54 chaves,
  migração de configurações, integrações e integridade do ZIP.
- Preferências: seis abas e 49 controles visíveis. Blur tem toggle próprio,
  seletor Box blur/Fast Gaussian e raio. Distorção tem toggle e intensidade.
  Método/raio seguem apenas o blur; intensidade segue apenas a distorção.
  Não há seletor de modos nem opções de backend/frequência na interface.
- Migração em GSettings de Dinâmico, Refração, Combinado e Econômico; método
  antigo e backend Desativado. Valores novos explícitos são respeitados e
  a migração não se repete na reativação.
- Matriz das quatro combinações dos toggles, nos dois métodos, em menu,
  painel, dock e janelas Wayland reais. A configuração é a mesma em todos.
- Blur desligado com distorção ligada: nenhuma pirâmide de blur permanece,
  incluindo caches de screenshots que não foram repintados. Os dois desligados
  liberam capturas/assinaturas de dano; o painel conserva seu estilo próprio.
- Textura fosca opcional, sozinha e combinada com efeitos. Em superfícies,
  ela é pintada acima das capturas, sem entrar na própria amostragem.
- Pixel tests dos filtros, centro plano da lente, conteúdo opaco e textos;
  dano da janela-fonte, fechamento de menus e recortes vazios de dock.
- Probe nativo de movimento/saída da tela sem screenshots durante a animação.
  Erro médio zero nos pixels externos nos frames medidos. Repouso sem frames
  extras depois da estabilização.
- Overview, fixture de bloqueio e restauração do efeito nativo; cold start,
  dez ciclos de enable/disable e suíte existente de integração.
- Capturas das preferências e dos efeitos inspecionadas visualmente.

```sh
GSE_TEST_CONTROLS=1 GSE_TEST_COMBINED=1 GSE_TEST_REFRACTION=1 GSE_TEST_ECONOMIC=1 /usr/bin/python3 tests/headless.py
GSE_TEST_MULTI=1 GSE_TEST_CONTROLS=1 GSE_TEST_COMBINED=1 GSE_TEST_REFRACTION=1 GSE_TEST_ECONOMIC=1 /usr/bin/python3 tests/headless.py
```

Evidências: `validation/single-controls-combined-refraction-economic-results.json`
e `validation/single-multi-controls-combined-refraction-economic-results.json`,
com logs e capturas correspondentes. Escalas: 100%, 125% e 150%.
Os nomes históricos dos cenários econômicos/combinados foram mantidos nos
arquivos de teste; eles agora escrevem os toggles independentes.
Não foi medido consumo percentual de GPU. GNOME 45–50 e outros drivers não
foram revalidados. O teste de bloqueio continua limitado à fixture.

# Validação — Gnome Shell Extended 1.3.0

## Vidro com desfoque — 2026-11-14

GNOME Shell/Mutter 51.1, driver xe, GPU real, D-Bus/Wayland e configurações
privados. Os testes não modificam a instalação da sessão principal.

- `make zip`: 32 módulos, schema estrito, lifecycle, 49 configurações,
  integrações de CSS/launcher/Ptyxis e ZIP íntegro.
- Novo modo combinado, com Box blur e Fast Gaussian Blur de 13 taps / sete
  leituras lineares por direção; normais e refração calculadas depois do blur.
- Inspeção visual de menus, superfícies sintéticas, janelas Wayland, docks por
  monitor e Overview nos dois métodos. Textos/ícones continuam nítidos.
- Fonte quadriculada em duas direções: o desvio de cor do centro caiu para
  0% da referência com Box blur e cerca de 3,6–3,8% com Fast Gaussian, no raio
  nominal 24 desta fixture. São medidas de pixels, não de desempenho.
- Alterar a intensidade da refração preserva o centro plano; raio zero volta
  ao fundo nítido, conservando a lente. Refração zero conserva o blur.
- Probe de frames nativos em movimento e saída da tela: erro médio zero nos
  pixels externos, nos frames medidos para cada método. Sem screenshot durante
  a animação; marcador opaco identifica a posição realmente desenhada.
- Duas janelas GTK4/Wayland reais: alteração do fundo quando a janela-fonte se
  afasta, retorno à composição anterior, conteúdo opaco inalterado e foco.
  A fonte é deslocada amplamente porque blur forte apaga a fase de faixas finas.
- Recortes vazios do dock, troca econômico/combinado, reinício já no combinado,
  limpeza de efeitos e restauração do efeito nativo na fixture de bloqueio.
- Zero frames em repouso após estabilização nos dois filtros e no econômico.
- Preferências: seis abas/49 controles, quarto modo, seletor de filtro,
  bindings e sensibilidade independente dos controles de raio/refração.
- Suíte existente de integração passou; o econômico manteve textura
  compartilhada, nenhuma captura e proteção de redesenho completo desligada.

```sh
GSE_TEST_COMBINED=1 /usr/bin/python3 tests/headless.py
GSE_TEST_NO_OPTIONAL=1 GSE_TEST_MULTI=1 GSE_TEST_COMBINED=1 GSE_TEST_ECONOMIC=1 /usr/bin/python3 tests/headless.py
```

Resultados: `validation/single-combined-results.json` e
`validation/fallback-multi-combined-economic-results.json`, ambos com
`passed: true`. Escalas 100%, 125% e 150%; sem erros JS/shader ou geração
excessiva de variantes nos logs do Shell. Não foi feito benchmark de GPU,
nem revalidação de GNOME 45–50, outros drivers ou intellihide do dock real.

# Validação — Gnome Shell Extended 1.2.0

## Refração e textura econômica — 2026-11-14

GNOME Shell/Mutter 51.1, driver xe, GPU real, D-Bus e Wayland privados.
A extensão não foi instalada na sessão principal.

- `make zip`: sintaxe de 31 módulos, schema estrito, lifecycle, 48 configurações,
  restauração de CSS/launcher/Ptyxis e integridade do ZIP.
- Shader GLSL inspirado em LiquidGlass.fx: normais do contorno arredondado,
  refração nas bordas e centro plano. Sem normal map externo ou blur.
- Pixels comparados em duas intensidades: alteração junto à borda; centro e
  região externa preservados. Capturas inspecionadas visualmente.
- Probe em `after-paint`, sem screenshots durante as animações: movimento
  horizontal, saída pela borda superior e ocultação. Sem alteração dos pixels
  fora da superfície nos frames medidos. Um marcador opaco identifica a posição
  efetivamente renderizada, independentemente do relógio da animação.
- O teste detectou um frame de atraso do backdrop por alocação tardia; aplicar
  a posição por translação no mesmo frame eliminou a diferença medida.
- Docks sintéticos em cada monitor: captura por view, clip vazio e restauração.
  Não foi repetido o teste de intellihide com o dock real nesta versão.
- Duas janelas GTK4/Wayland reais: refração em região translúcida, atualização
  ao mover a janela-fonte, conteúdo opaco inalterado e primeiro plano a 255.
- Shader compartilhado entre as superfícies, sem geração excessiva de variantes.
- Refração → econômico → refração, reinício da extensão já na refração,
  limpeza ao desativar e zero frames em repouso após estabilização.
- Overview com papel de parede próprio e fixture de bloqueio: apenas a textura
  de fundo é distorcida; desativar restaura o efeito nativo de bloqueio.
- Textura econômica com iluminação pré-calculada por normais inspecionada nos
  temas claro e escuro; compartilhamento de 64 × 64, ausência de capturas,
  redesenho parcial, opacidade zero e backend desligado confirmados.
- Preferências: seis abas, 48 controles, bindings e sensibilidade por modo.
  A suíte gráfica existente também passou nas duas configurações abaixo.

```sh
GSE_TEST_REFRACTION=1 GSE_TEST_ECONOMIC=1 /usr/bin/python3 tests/headless.py
GSE_TEST_NO_OPTIONAL=1 GSE_TEST_MULTI=1 GSE_TEST_REFRACTION=1 GSE_TEST_ECONOMIC=1 /usr/bin/python3 tests/headless.py
```

Evidências locais em `validation/single-refraction-economic-results.json` e
`validation/fallback-multi-refraction-economic-results.json`, com capturas e
logs correspondentes. Escalas: 100%, 125% e 150%; backend opcional presente
na primeira sessão e ausente na segunda. Sem JS ERROR ou erros de shader.
Não foi medido percentual de consumo da GPU. GNOME 45–50 e outros drivers
não foram revalidados; o fallback de driver sem cópia de framebuffer não foi
exercitado em hardware sem essa capacidade.

# Validação — Gnome Shell Extended 1.1.0

## Modos de aparência — 2026-11-14

Testes em GNOME Shell/Mutter 51.1, GPU real, D-Bus/Wayland privados e
configurações temporárias. Nenhuma instalação na sessão principal.

- Schema, sintaxe, lifecycle e integrações: `make zip` (30 módulos e 47 configurações).
- Modo dinâmico como padrão; alternância imediata e reinício da extensão já no econômico.
- Econômico: nenhuma captura/efeito de blur ativo, sem assinatura de dano do fundo,
  proteção de redraw completo desativada durante a pintura e zero frames em repouso.
- Textura compartilhada de 64 × 64 px; temas claro/escuro, opacidade zero,
  raio zero e backend desativado. Textos e ícones preservam a opacidade.
- Painel, menus, dock em movimento/recortado, Overview e bloqueio; restauração
  do efeito nativo de bloqueio e limpeza na desativação.
- Janelas Wayland translúcidas: aparência, retorno ao dinâmico, retorno ao econômico,
  geometria, foco e preservação do conteúdo opaco.
- Preferências: seis abas, bindings de todas as opções e sensibilidade dos
  controles exclusivos do dinâmico; captura visual inspecionada.
- Suíte de integração existente executada junto com os novos cenários.

Execuções aprovadas:

```sh
GSE_TEST_ECONOMIC=1 python3 tests/headless.py
GSE_TEST_NO_OPTIONAL=1 GSE_TEST_MULTI=1 GSE_TEST_ECONOMIC=1 python3 tests/headless.py
```

Resultados: `validation/single-economic-results.json` (100%, backend opcional
presente) e `validation/fallback-multi-economic-results.json` (125% e 150%,
backend opcional ausente), ambos com `passed: true`. Sem JS ERROR nos logs.
A retirada do trabalho de blur foi verificada estruturalmente; não foi medido
percentual de redução de uso/energia da GPU. GNOME 45–50 não foi revalidado.

# Validação — Gnome Shell Extended 0.3.11

## Publicação 0.3.11 — 2026-11-13

Código de execução promovido da 0.3.11-beta.1, sem alterações funcionais adicionais.
`make zip` passou: sintaxe de 29 módulos, schema estrito, lifecycle,
46 configurações e testes de restauração das integrações.
`/usr/bin/python3 tests/headless.py` passou em GNOME Shell 51.1, compositor
Wayland e D-Bus privados (`validation/single-results.json`, `passed: true`).
A matriz verificou superfícies, políticas do painel, correção de lacuna,
repouso (zero frames) e limpeza/restauração na desativação.
O código foi comparado byte a byte com a beta-1 fornecida, exceto metadata.json.
Não foram refeitos nesta publicação os testes de escalas mistas, hotplug,
retenção de janela oculta por 5 segundos ou benchmarks de CPU/GPU/RAM.
As evidências abaixo documentam validações anteriores da base.

Data: 12 de novembro de 2026, America/Fortaleza.

## Ambiente

GNOME Shell/Mutter 51.1 (Fedora 45), GJS 1.90.1, Wayland headless, GBM/EGL com
driver xe. D-Bus, configurações e extensões de teste ficam em diretórios XDG
privados. A sessão de trabalho do usuário não foi modificada.

`make test` valida 29 módulos ESModule, metadata, esquema estrito, 46 opções
GSettings, lifecycle/imports assíncronos, descarte de recursos, restauração de
CSS/launcher do Configurações e perfis Ptyxis.

## Remoção da lacuna entre painel e janela maximizada

- Suíte headless completa em escala 100% e dois monitores com 125%/150%: PASS.
- Regressão nova: com painel e reserva nativa de 32 px, a janela real passa de y=32 para y=31, mantendo o painel em 32 px. Essa situação não era corrigida pela versão 0.3.8.
- Fixture de tema com `padding-bottom: 1px` no panelBox reproduz uma reserva de 33 px para painel de 32 px. Com a opção ativa, a janela maximizada real começa em y=31, sem alterar o tamanho do painel ou adicionar faixa pintada.
- Desativar restaura a reserva e o posicionamento originais. A geometria das janelas normais é preservada.
- Desativar o módulo restaura a reserva nativa e remove o ator transparente de reserva. Preferências, demais superfícies e dez ciclos de ativação/desativação: PASS.
- Evidências: `validation/single-results.json` e `validation/single-panel-gap-maximized.png`. A lacuna do desktop do usuário ainda precisa ser conferida após carregar a atualização; o teste confirma sobreposição de 1 px na junção, não a reprodução exata do aplicativo da imagem enviada.

## Regressões verificadas

Evidências da versão 0.3.6: `validation/flicker-results.json` e
`validation/flicker-blur-multi-results.json`. As evidências locais ficam fora
do pacote e do Git por conterem dados da sessão de teste.

| Cenário | Resultado |
| --- | --- |
| Dock real | Dash to Dock Extended 32 do repositório local, copiado somente para a sessão de teste |
| Intellihide com janela maximizada | Três ciclos de retorno por ponteiro virtual e recolhimento, em cada sessão |
| Dock oculto mas ainda mapeado | Clip vazio oculta o grupo de blur; remover o clip o restaura |
| Detecção sob o ponteiro | Backdrop não intercepta o teste com `PickMode.ALL` |
| Captura de tela real | Redução de contraste da textura atrás dos controles, confirmando blur visível |
| Janelas | Capturas criadas para Configurações, mantidas imediatamente atrás da janela; barra lateral inspecionada visualmente com blur |
| Painel | Alteração de claro/escuro sem reiniciar a extensão; botões usam cor de primeiro plano escura no esquema claro |
| Painel no Overview | Estilos personalizados suspensos, fundo nativo transparente e rastreamento de janelas desligado |
| Saída do Overview | Fade configurado em 250 ms no fundo; atores do painel e dos botões permanecem em opacidade 255 |
| Interrupção do fade | Reabrir o Overview cancela o retorno e mantém o fundo transparente |
| Escala | Uma view a 100% e duas views a 125%/150%, confirmadas pelo compositor |
| Preferências | Seis páginas e 45 controles com leitura/escrita |
| Limpeza | Estilos, capturas e launcher restaurados; 10 ciclos enable/disable por sessão |
| Repouso | 0 frames novos na amostra de 0,5 segundo após estabilização |

A captura de tela, os diálogos e os seletores Alt+Tab são comparados com
raio 48 e raio zero, mantendo a mesma transparência. O teste exige redução
de contraste na faixa do fundo, além de alpha inferior a 255 e primeiro
plano opaco. As cenas sintéticas não representam um benchmark geral de qualidade.
Na captura, a métrica usa diferenças horizontais de segunda ordem para medir
as bordas das faixas, separando-as do gradiente lento criado pela seleção clara
e pela máscara escura. Diálogos e seletores usam o desvio de cor na faixa testada.

A barra lateral transparente do Configurações foi comparada sobre duas cenas;
a região de conteúdo opaco manteve diferença média **0,00**. A opacidade do
ator da janela permaneceu 255. A imagem da barra lateral foi inspecionada para
confirmar que as faixas do fundo aparecem desfocadas e os controles permanecem
nítidos. A ordem dos backdrops também é atualizada quando outro ator é inserido
na pilha de janelas.

Calendário, configurações rápidas, menus, notificações, diálogos, pastas,
ambos os switchers, OSD e ferramenta de captura foram abertos durante as sessões.
A seleção de backend opcional e o limite por capacidade continuaram passando.
A biblioteca opcional presente era gnome-rounded-blur 1.0.2-4.local; o backend
nativo foi usado nos testes de renderização citados. O fallback por ausência de
namespace já havia sido verificado na versão 0.2.0.

## Frames do intellihide e transição do painel

O probe de teste lê o framebuffer em `after-paint`, sem gerar screenshots que
forçariam novos repaints. Foram executados três ciclos de hover/recolhimento
com animação de 200 ms, nas variantes sem blur (uma view) e com blur nativo
(views a 125% e 150%). Além dos pixels fora da região do dock e de sua sombra,
o teste verifica o alinhamento do backdrop e recortes vazios transitórios.

Na regressão original da versão 0.3.1, o cenário com blur e escalas mistas
reproduziu dois frames residuais perto do
final do recolhimento: erro médio máximo de 2,88 níveis RGB fora do dock antes
da correção. Após preservar o redraw da view anteriormente pintada e reduzir
o filtro conforme o dock sai da tela, o teste passou com 69 frames, erro máximo
de 0,49 e desalinhamento zero. Na variante sem blur, a superfície usa somente
CSS nativo, sem criar backdrop ou callbacks de frame. Esses números descrevem
as cenas de teste; não garantem ausência de artefatos em todos os drivers.

O retorno usa duração configurada de 250 ms e curva EASE_IN_OUT_CUBIC, com
valores intermediários de alpha confirmados no painel e no dock real. O teste
aceita a cadência de apresentação do compositor ao medir o frame concluído.
A limpeza de estilo feita pelo próprio Shell ao terminar o Overview não
reinicia o fade nem produz um frame opaco.

## Fechamento e descoberta tardia (0.3.2)

Os menus de calendário/notificações e configurações rápidas são observados
em `after-paint` durante o fechamento nativo. O teste exige que a superfície
continue viva, seu alpha permaneça translúcido e a opacidade do backdrop
acompanhe a do conteúdo. Quando o conteúdo chega a opacidade zero, o backdrop
deve estar invisível; depois do unmap a superfície deve ter sido liberada.
Isso cobre a restauração antecipada de CSS causada por `isOpen = false` no
início do fechamento.

O fade de retorno é exercitado também no Dash to Dock Extended real. A cada
frame seu alpha deve coincidir com a opacidade configurada multiplicada pelo
progresso do fade (tolerância de dois níveis por arredondamento), enquanto os
ícones permanecem opacos. A opção de fundo invisível no Overview está ativa
nesse teste; desligá-la conserva o fundo configurado durante o Overview.
Painel e dock usam o mesmo ator como referência do relógio de animação para
evitar que views diferentes avancem suas transições em frames distintos.

As prévias de janelas do AppSwitcher são descobertas depois da lista principal,
sem polling. A mesma comparação de pixels é executada sobre elas. Capturas
fullscreen com escala diferente da view usam a escala do framebuffer de
captura ao construir o recorte, evitando o deslocamento observado durante a
validação em escalas mistas.

Resultados históricos da versão 0.3.2 com duas views (125%/150%):

| Medida | Resultado |
| --- | --- |
| Frames do hover/intellihide com blur | 78; erro médio máximo fora do dock de 0,0011 níveis RGB; desalinhamento zero |
| Fade no dock real | 33 apresentações observadas, alpha dentro de dois níveis do valor esperado |
| Progresso do fade painel/dock | Diferença máxima zero nas apresentações medidas |
| Primeiro frame de retorno concluído | 265 ms; duração configurada de 250 ms |
| Fechamento calendário/configurações rápidas | 9 e 17 apresentações; efeito retido e opacidade acompanhada |
| Desvio de cor: diálogo, sem/com blur | 13,96 → 4,28 |
| Desvio de cor: lista de janelas, sem/com blur | 33,08 → 9,25 |
| Desvio de cor: lista de aplicativos, sem/com blur | 33,07 → 7,10 |
| Desvio de cor: prévias de janelas, sem/com blur | 32,61 → 9,14 |
| Bordas na captura, sem/com blur | 0,576 → 0,295 (diferença horizontal de segunda ordem) |
| Repouso após estabilização | 0 frames na amostra de 0,5 segundo |

## Painel, contorno e diálogos de sessão (0.3.3)

A barra superior tem binding próprio, sem interferir no lease de cor e estilo
do módulo de painel. Seu blur usa o backend e os parâmetros globais. O teste
compara os pixels com raio 48 e raio zero, mantém textos opacos, verifica a
liberação do efeito quando o fundo fica opaco e sua suspensão no Overview.
A opção `panel-blur` acrescenta o 45º controle às preferências.

O dock anima a opacidade somente do widget decorativo, incluindo todos os
seus pixels de fundo, borda e sombra, nos dois sentidos. Os testes acompanham
o fade-out e o fade-in do dock real, exigem valores intermediários, verificam
que a decoração acompanha o progresso da animação e que o primeiro plano
permanece opaco. O filtro não muda de raio durante o fade da decoração,
evitando mudanças de tamanho das capturas nessa transição. A opacidade
original é restaurada no disable.

A descoberta de diálogos usa `dialogLayout`, `contentLayout` e `buttonLayout`,
identificando subclasses que não têm “ModalDialog” no nome. Os testes abrem
os modos de sair, desligar e reiniciar de `Main.endSessionDialog`, com seus
layouts e botões nativos, na sessão privada. Não chamam `OpenAsync`, não
iniciam countdown e não acionam botões de confirmação. Cada modo passa pela
comparação de pixels e por cancelamento com liberação do backdrop.

Os demais alvos exercitados continuam sendo calendário, configurações rápidas,
menu genérico, banner, pastas, OSD, captura, os dois seletores e prévias do
Alt+Tab. Overview e bloqueio mantêm seus adaptadores de papel de parede; a
validação de bloqueio continua limitada à fixture descrita abaixo.

Execução final a 125%/150%: `passed: true`, seis páginas/45 controles,
0 frames em repouso, 35 apresentações do fade-out e 33 do fade-in do dock.
O desvio de cor na barra caiu de 40,21 para 20,33 com blur. Nos diálogos de
sair/desligar/reiniciar caiu, respectivamente, de 14,03/14,00/14,13 para
4,69/4,66/4,74. Todos mantiveram primeiro plano opaco e liberaram a superfície
ao cancelar. Os testes de hover/intellihide, fechamento de menus e dez ciclos
de enable/disable também passaram.

A execução final a 100% também passou: barra 39,33 → 19,87; desligar/reiniciar
16,17 → 2,78; zero frames em repouso. O helper grava as evidências com I/O
assíncrono para não bloquear o compositor durante a substituição dos PNGs e
não mistura screenshots adicionais com o probe dos frames nativos do dock.

## Faixa inferior do dock (0.3.4)

O teste adicional abre o dock real sobre faixas de cor e compara separadamente
três linhas da margem superior e três da inferior, com blur de raio 24 e sem
blur. Os backends `native` e `auto` são exercitados. Além da redução de
contraste em ambas as margens, a diferença entre suas razões de contraste
com/sem blur deve ficar abaixo de 0,05. Cada retângulo de captura deve caber
inteiramente no framebuffer de sua view.

Na reprodução a 100%, o dock ocupou y=916..996 em um monitor de altura 1000.
A captura antiga ia de y=832 a 1152, ultrapassando a tela. O desvio de cor da
margem inferior foi 20,22, contra 17,92 na superior. Com a captura deslocada
para y=680..1000 e a mesma altura de 320 pixels, a margem inferior caiu para
17,89, mantendo a superior em 17,92. Sem blur, as margens mediram 30,77 e
30,89. A diferença entre as razões passou de 0,077 para 0,0013. O backend
automático selecionou a biblioteca opcional e apresentou os mesmos resultados.
Essas métricas descrevem a cena sintética; não são um benchmark geral.

Na configuração de views a 125%/150%, a captura da view primária ficou em
y=424..1000, dentro do framebuffer de altura 1000. As duas margens mediram
20,23 com blur e 30,76 sem blur, para ambos os backends. A sessão completa
terminou com `passed: true`, incluindo hover/intellihide, fades, diálogos,
painel, restauração de estilos e dez ciclos enable/disable.

A correção usa o mesmo limite por view nos quatro lados da tela e mantém o
tamanho das texturas durante o deslocamento. O teste não grava screenshots
enquanto o probe de intellihide mede os frames nativos.

## Fade renderizado da barra (0.3.5)

O teste adicional coloca uma fonte estática de faixas acima do fundo do
Overview e abaixo do painel. Um probe lê os pixels do framebuffer em
`after-paint`, sem screenshots, e associa o contraste da faixa ao progresso
da transição. Isso separa o efeito da barra da animação do papel de parede.
Nos primeiros 15% do progresso, o detalhe deve permanecer acima de 80% da
referência transparente, em vez de cair imediatamente para o blur final.
Ao terminar, o detalhe deve estar abaixo de 70% da referência.

A regressão anterior foi reproduzida: com progresso 0,0092, o desvio de cor
saltava de 44,81 para 20,71. Depois da correção, nesse mesmo progresso ficou
em 44,45; em 0,032 passou a 42,96, em 0,077 a 41,50 e em 0,146 a 37,29.
O resultado final permaneceu em 8,23. O primeiro frame do retorno concluído
foi observado em aproximadamente 263 ms, com duração configurada de 250 ms.

A cor do painel, o raio efetivo do blur e o brilho usam o mesmo progresso.
A área de captura é calculada com o raio final, evitando variar sua geometria
por frame durante essa animação. O backend ainda pode escolher sua resolução
interna conforme o raio efetivo. Na entrada do Overview, a transição é feita
no sentido inverso; ao ficar totalmente aberto, o estilo nativo é restaurado
e as capturas são liberadas. Interromper a animação mantém o valor atual.

## Retorno visível após fechar o Overview (0.3.6)

A 0.3.5 foi testada sobre uma fonte acima do fundo do Overview. Esse teste
isolava o raio do blur, mas mascarava a troca de entrada quando o Overview
sumia. A regressão agora mantém o fundo real e conta o tempo a partir de
`hidden`. Com a versão antiga, o primeiro frame do desktop já tinha progresso
1 e alpha 171 (67%), cerca de 4 ms após hidden; não havia fade restante no
desktop.

A correção mantém o painel personalizado suspenso durante `hiding`. Após
`hidden` e a limpeza de estilo do Shell, mistura por 250 ms uma cobertura
opaca da cor do Overview com a transparência final. A composição é feita no
próprio RGBA do painel, sem ator ou textura adicionais. O primeiro plano
mantém a opacidade 255. O dock conserva sua animação própria durante o
fechamento; a barra só inicia a revelação após ele.

O novo teste exige continuidade RGB entre o último frame do Overview e o
primeiro do desktop (diferença inferior a quatro níveis), alpha inicial de
pelo menos 250, valores intermediários já no desktop e alpha final 171 em
200–400 ms após hidden. Também verifica o modo em que o painel é ativado com
o Overview já aberto e a interrupção por reabertura.

Na execução a 100%, os dois lados da troca mediram RGB (34,34,38). O primeiro
frame do desktop teve alpha 255 e progresso zero, cerca de 8 ms após hidden.
Aos 43/52/70/86 ms, o alpha passou por 244/235/225/216, chegando a 171 em
aproximadamente 271 ms (250 ms configurados mais a cadência de apresentação).
A sessão completa passou, incluindo limpeza e zero frames em repouso na
amostra. Estes valores são específicos dessa execução.

## Fade de blur em janelas (0.3.10)

Evidências: `validation/window-fade-0.3.10/{flicker,flicker-blur-multi}-results.json`,
ambas com `passed: true`. O teste em escalas mistas também inclui as regressões
da reserva do painel da versão 0.3.9.

Duas janelas GTK4/Wayland reais são abertas em uma fixture do compositor
privado. A janela-alvo usa a identidade Ptyxis para entrar no mesmo caminho
selecionado da integração, com uma lateral translúcida e conteúdo opaco. A
segunda pertence a outra aplicação e pinta faixas opacas, fornecendo uma
fonte nítida abaixo da alvo quando ela é elevada. Não é um terminal Ptyxis real.

O probe lê os pixels apresentados durante a elevação da alvo. A versão
anterior apresentou apenas um frame com progresso 1 e desvio de cor 3,82,
isto é, blur já completo. Com a transição, a execução inicial a 100% observou
29 frames, com desvio de cor passando por 102,13 → 78,21 → 46,27 → 3,82.
O ator da janela manteve opacidade 255, e a amostra de conteúdo opaco ficou
em RGB (50,55,60) durante toda a animação.

O teste também minimiza/restaura a janela, move e refoca uma janela já exposta,
alterna o foco rapidamente e desativa o blur durante a sessão. Exige valores
intermediários na restauração, não reiniciar por movimento, concluir após as
trocas de foco e descartar ajustes, fontes e capturas ao desativar. A fixture
é encerrada ao final; as preferências e o launcher do Configurações continuam
sob a validação de restauração existente. A transição usa 250 ms e a geometria
de amostragem é calculada com o raio final. Não há timer em repouso.

## Limites

Não foram executados GNOME 45–50, Ubuntu Dock, Dash to Dock upstream ou
lock/unlock com autenticação real. O teste de bloqueio usa uma fixture de
papel de parede. Nautilus/menus GTK ainda precisam de matriz por versão; Ptyxis
foi verificado pela API de perfis em memória. Não há medição comparativa de
CPU/RAM/GPU nem teste de longa duração. A ausência de frames em repouso não
constitui medição de economia de recursos.

## Reproduzir

```sh
make test
make build
env GSE_TEST_REGRESSIONS=1 GSE_TEST_FLICKER=1 GSE_TEST_FLICKER_BLUR=1 GSE_TEST_DOCK_BOTTOM=1 /usr/bin/python3 tests/headless.py
env GSE_TEST_REGRESSIONS=1 GSE_TEST_FLICKER=1 GSE_TEST_FLICKER_BLUR=1 GSE_TEST_DOCK_BOTTOM=1 GSE_TEST_MULTI=1 /usr/bin/python3 tests/headless.py
make zip
```

Os testes com dock real usam a pasta irmã `dash-to-dock-extended/` e compilam
seu esquema somente na cópia temporária. Cantos ativos são desligados nessa
sessão para que a posição inicial (0,0) do ponteiro virtual não abra o Overview.
O helper Eval, o dock e as fixtures não são incluídos no ZIP de distribuição.
O probe exige GCC, pkg-config, headers Cogl do Mutter e as ferramentas
g-ir-scanner/g-ir-compiler; sua biblioteca temporária também fica fora do ZIP.
