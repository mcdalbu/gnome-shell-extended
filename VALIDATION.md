# Validação — Gnome Shell Extended 0.3.1

Data: 11 de novembro de 2026, America/Fortaleza.

## Ambiente

GNOME Shell/Mutter 51.1 (Fedora 45), GJS 1.90.1, Wayland headless, GBM/EGL com
driver xe. D-Bus, configurações e extensões de teste ficam em diretórios XDG
privados. A sessão de trabalho do usuário não foi modificada.

`make test` valida 28 módulos ESModule, metadata, esquema estrito, 44 opções
GSettings, lifecycle/imports assíncronos, descarte de recursos, restauração de
CSS/launcher do Configurações e perfis Ptyxis.

## Regressões verificadas

Evidências da versão 0.3.1: `validation/flicker-results.json` e
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
| Preferências | Seis páginas e 44 controles com leitura/escrita |
| Limpeza | Estilos, capturas e launcher restaurados; 10 ciclos enable/disable por sessão |
| Repouso | 0 frames novos na amostra de 0,5 segundo após estabilização |

A captura de tela foi comparada com raio 48 e raio zero, mantendo a mesma
transparência. O desvio de cor na faixa testada caiu de **19,10 para 2,81** em
100% e de **19,06 para 12,22** na configuração de escalas mistas. Os valores
são específicos dessas cenas, não um benchmark geral de qualidade.

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

O cenário com blur e escalas mistas reproduziu dois frames residuais perto do
final do recolhimento: erro médio máximo de 2,88 níveis RGB fora do dock antes
da correção. Após preservar o redraw da view anteriormente pintada e reduzir
o filtro conforme o dock sai da tela, o teste passou com 69 frames, erro máximo
de 0,49 e desalinhamento zero. Na variante sem blur, a superfície usa somente
CSS nativo, sem criar backdrop ou callbacks de frame. Esses números descrevem
as cenas de teste; não garantem ausência de artefatos em todos os drivers.

No teste com escalas mistas, a primeira apresentação do fade concluído ocorreu
264 ms após o sinal de fechamento do Overview, com duração configurada de
250 ms e valores intermediários de alpha confirmados. A diferença inclui a
cadência dos frames. A limpeza de estilo feita pelo próprio Shell ao terminar
o Overview não reinicia o fade nem produz um frame opaco.

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
env GSE_TEST_REGRESSIONS=1 GSE_TEST_FLICKER=1 /usr/bin/python3 tests/headless.py
env GSE_TEST_REGRESSIONS=1 GSE_TEST_FLICKER=1 GSE_TEST_FLICKER_BLUR=1 GSE_TEST_MULTI=1 /usr/bin/python3 tests/headless.py
make zip
```

Os testes com dock real usam a pasta irmã `dash-to-dock-extended/` e compilam
seu esquema somente na cópia temporária. Cantos ativos são desligados nessa
sessão para que a posição inicial (0,0) do ponteiro virtual não abra o Overview.
O helper Eval, o dock e as fixtures não são incluídos no ZIP de distribuição.
O probe exige GCC, pkg-config, headers Cogl do Mutter e as ferramentas
g-ir-scanner/g-ir-compiler; sua biblioteca temporária também fica fora do ZIP.
