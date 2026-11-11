# Changelog

## 0.3.0 — 2026-11-11

Primeira release publicada de Gnome Shell Extended, UUID
`gnome-shell-extended@mcda`.

- Corrige o retorno por hover no intellihide e a caixa residual de blur do dock.
- Exclui backdrops decorativos da detecção sob o ponteiro e acompanha clips vazios.
- Corrige a posição do blur da ferramenta de captura de tela.
- Adiciona blur atrás dos fundos transparentes dos aplicativos selecionados.
- Atualiza fundo e contraste dos botões do painel ao alternar o esquema de cores.
- Inclui cinco módulos independentes, seis abas de preferências e 44 opções.
- Oferece backend nativo e integração opcional com GNOME Rounded Blur.

Validação: GNOME Shell/Mutter 51.1, dock Dash to Dock Extended 32 real,
três ciclos de hover/intellihide em cada sessão, uma view a 100% e duas views a
125%/150%. Consulte `VALIDATION.md` para evidências e limitações.

GNOME 45–50, Ubuntu Dock e Dash to Dock upstream permanecem alvos sem
validação funcional nesta release. A biblioteca de blur opcional não está
incluída no pacote.

## 0.2.0

Implementação funcional inicial local, anterior às correções da versão 0.3.0.

## 0.1.0

Scaffold, esquema GSettings, lifecycle e ferramentas de build.
