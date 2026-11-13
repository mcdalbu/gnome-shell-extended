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
