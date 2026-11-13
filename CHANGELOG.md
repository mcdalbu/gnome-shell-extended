# Changelog

## 1.0.0 — 2026-11-13

Primeira versão 1.0 estável, baseada na 0.3.11, sem alterações funcionais.

## 0.3.11 — 2026-11-13

Promove a versão 0.3.11-beta.1, preservando seu código de execução.

- Evita sincronizações redundantes do painel e atualizações de aparência sem mudanças.
- Mantém um cache do raio dos cantos do tema, invalidado quando o estilo muda.
- Libera capturas de janelas ocultas após aproximadamente 5 segundos e cancela a liberação ao reexibir.
- Descarta capturas fora do monitor e libera os efeitos antes das capturas em mudanças de monitores.
- Mantém a proteção contra redraws recortados e a captura integral das janelas.
- Inclui o benchmark isolado de CPU/GPU e verificações de redraw em repouso já presentes no repositório.

## 0.3.10 — 2026-11-12

- Adiciona fade-in de 250 ms ao blur de janelas ao mostrar, restaurar ou trazê-las de trás de outra janela.
- Anima intensidade e brilho do fundo, preservando a opacidade do ator da janela e os pixels opacos.
- Evita reinícios por geometria/dano e reduz o recuo do efeito nas sobreposições parciais.
- Preserva o progresso em trocas rápidas de foco e cancela transições ao ocultar/remover/desativar.
- Valida os pixels de janelas Wayland reais, restauração, conteúdo opaco e descarte dos recursos.
- Incorpora as correções de lacuna do painel da versão 0.3.9.

## 0.3.9 — 2026-11-12

- Fecha a junção também quando o painel e sua reserva já têm a mesma altura.
- A opção de remover lacuna coloca o topo da janela maximizada 1 pixel lógico sob a borda inferior da barra; o painel mantém sua altura original.
- Adiciona regressão com reserva nativa, além do caso de espaçamento excessivo do tema.

## 0.3.8 — 2026-11-12

- Substitui a extensão visual de 1 px por **Remover lacuna entre a barra e janelas maximizadas**.
- Corrige a reserva do painel no layout do Mutter, sem aumentar o painel ou mover diretamente as janelas.
- Restaura o comportamento original ao desativar a opção ou o módulo.

## 0.3.7 — 2026-11-12

- Adiciona a opção de estender o fundo da barra superior em 1 px para cobrir a lacuna inferior.
- Estende fundo e blur sem deslocar indicadores ou alterar a área de trabalho das janelas.
- Preserva opacidade automática, fades e suspensão no Overview; funciona com blur desativado.

## 0.3.6 — 2026-11-12

- Inicia o fade de retorno da barra após o Overview fechar, em vez de concluí-lo durante o fechamento.
- Revela a transparência em 250 ms a partir da cor opaca do Overview, sem salto no primeiro frame do desktop.
- Mistura fundo e primeiro plano por cor, preservando a opacidade dos textos e ícones, sem criar ator/texture de cobertura.
- Mantém o painel suspenso enquanto o Overview fecha, inclusive quando o módulo foi ativado com ele já aberto.
- Substitui a regressão com fundo artificial por medição de pixels com o fundo real do Overview e tempo contado após hidden.

## 0.3.5 — 2026-11-12

- Faz blur, brilho e cor do painel acompanharem o fade de 250 ms ao entrar e sair do Overview.
- Corrige a aparição abrupta do blur no primeiro frame visível da barra.
- Continua transições interrompidas a partir do valor atual e libera capturas no Overview aberto.
- Mantém a geometria da captura do painel estável enquanto varia a intensidade do blur.
- Adiciona uma regressão baseada nos pixels apresentados, com fonte estática isolada da animação do Overview.

## 0.3.4 — 2026-11-12

- Corrige a perda de intensidade do blur na faixa inferior do dock.
- Mantém os retângulos de captura dentro do framebuffer de cada monitor, deslocando-os sem reduzir suas dimensões durante o movimento.
- Adiciona comparação de pixels entre as faixas superior e inferior do dock, com backend nativo e automático.

## 0.3.3 — 2026-11-11

- Inclui bordas e sombras no fade de entrada e saída do fundo do dock.
- Restaura a opacidade original do widget de fundo ao desativar a integração.
- Implementa blur próprio da barra superior com opção dedicada e suspensão no Overview.
- Evita capturas desnecessárias quando o painel está opaco ou oculto.
- Corrige a descoberta de subclasses de diálogos, incluindo sair, desligar e reiniciar.
- Valida os pixels dos três diálogos reais sem countdown nem confirmação de energia.
- Mantém estável o filtro do dock durante seu fade de decoração.

## 0.3.2 — 2026-11-11

- Suaviza o fade-in do painel com curva cúbica e mantém a duração de 250 ms.
- Adiciona o mesmo fade-in ao fundo do dock na saída do Overview invisível.
- Mantém blur e transparência até o fim do fechamento dos menus, acompanhando sua opacidade nativa.
- Verifica o alpha e o blur nos pixels de diálogos e seletores Alt+Tab.
- Descobre as prévias de janelas criadas tardiamente pelo Alt+Tab e aplica seus efeitos.
- Corrige o recorte de blur nas capturas fullscreen quando a escala de captura difere da escala do monitor.
- Sincroniza a captura das preferências com seu fechamento no teste isolado.

## 0.3.1 — 2026-11-11

- Remove a camada de framebuffer do dock quando somente a transparência está ativa.
- Consolida notificações de recorte/alocação antes de atualizar o fundo de blur.
- Preserva a proteção de redraw até o final do frame de ocultação.
- Limpa a última view pintada quando o dock sai da tela e reduz o filtro com sua área visível.
- Suspende os estilos do painel no Overview e restaura o fundo com fade de 250 ms ao fechar.
- Cancela o fade ao reabrir o Overview, preservando a opacidade de textos e ícones.
- Adiciona teste de pixels dos frames apresentados durante hover/intellihide.

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
