# Changelog

## 2.2.1 — 2026-11-26

- Substitui os botões de + e − das preferências numéricas por sliders com o valor atual visível. Os limites e incrementos de cada ajuste são preservados.

## 2.2 — 2026-11-26

- Usa as animações nativas do GNOME para a barra superior durante a entrada e a saída do Overview. A transparência, o desfoque e as sombras configurados voltam após o fim da transição de saída.

## 2.1 — 2026-11-25

- Adiciona **Sombra de destaque em textos e ícones** nas preferências do painel. A opção acompanha o estilo claro ou escuro da barra e funciona com o fundo transparente, com ou sem desfoque.

## 2.0 — 2026-11-25

- Reduz a região capturada pelo blur da barra superior quando ela está alinhada ao topo do monitor. Mantém a grade de amostragem das capturas de tela com escala diferente.
- Mantém o raio do desfoque fixo durante a animação do painel e anima a composição do fundo, permitindo respeitar o limite de atualização.
- Suaviza as transições de opacidade da barra ao maximizar, voltar do Overview e sair de tela cheia.
- Remove a opção de realce do Liquid no painel e mostra nas preferências os controles relevantes ao método de blur e ao modo de opacidade selecionados.

## 1.9.7 — 2026-11-25

- O realce opcional do Liquid na barra superior agora perde intensidade gradualmente da borda inferior para dentro do painel.

## 1.9.6 — 2026-11-18

- Adiciona realce opcional na borda inferior do painel quando Liquid está ativo. A linha usa o controle de intensidade do Liquid e ocupa um pixel lógico dentro da barra.

## 1.9.5 — 2026-11-18

- Remove regras GTK residuais do GNOME Extended antigo quando ele está desativado. A limpeza restaura as cores do tema nas laterais do Nautilus e das Configurações e nos menus GTK4, inclusive quando a transparência seletiva já está desligada na inicialização.

## 1.9.4 — 2026-11-18

- Adiciona o slider **Realce do Liquid** em **Blur → Vidro**. O intervalo é de 0% a 200%, com 100% como padrão. O controle ajusta o brilho das bordas independentemente da distorção.

## 1.9.3 — 2026-11-17

- Preserva o realce original de Liquid da 1.9.0 e restaura para esse modelo a suavização de cobertura anterior às alterações de 1.9.1/1.9.2.
- Exclui a barra superior da opção Vidro, tanto Contorno quanto Liquid, nos modos dinâmico e de wallpaper estático. Mantém o blur, a opacidade e a textura fosca independentes.
- Aplica a exclusão antes de escolher/criar a superfície: Vidro sozinho não cria capturas nem filtros na barra. Menus do painel, dock, janelas e demais elementos preservam a configuração global.
- Informa a exceção nas preferências e verifica os dois modelos, combinações de blur/vidro, ausência de capturas desnecessárias e pixels do painel estático.

## 1.9.2 — 2026-11-17

- Corrige a cobertura parcial da borda reta do shader dinâmico em escalas como 180%: a linha final de um painel de 32 px recebia alpha parcial e revelava o fundo sem tratamento. Bordas retas passam a seguir a rasterização por centro de pixel; a suavização permanece nos arcos dos cantos arredondados.
- Adiciona perfil de teste em 180%, mantendo os perfis anteriores em 125%/150%, e isola a cobertura do shader da suavização do fundo CSS do painel. A correção não altera a altura nem a área reservada pelo painel.

## 1.9.1 — 2026-11-17

- Corrige a perda de uma linha de cobertura em recortes herdados com coordenadas fracionárias. A interseção considera o centro dos pixels, acompanhando a rasterização do recorte em vez de arredondar as duas bordas para dentro.
- Acrescenta verificação das três últimas linhas do painel, com Liquid, Box/Gaussian/Kawase e recorte fracionário, tanto no framebuffer nativo quanto na captura de tela. Preserva a altura e a área reservada pelo painel.

## 1.9.0 — 2026-11-17

- Promove a beta.2 para estável, preservando seu código de execução e schemas.
- Inclui Liquid começando nas bordas e nos cantos arredondados, diminuindo para dentro e mantendo o centro estável. Disponível em Blur → Vidro → Modelo do vidro.
- Mantém Contorno como padrão, os controles independentes de blur/distorção, o cache de wallpaper e os limites de atualização 50%/25%.

## 1.9.0-beta.2 — 2026-11-17

- Liquid passa a começar no contorno real do elemento, incluindo cantos arredondados. A refração e o brilho diminuem para dentro, preservando o centro sem uma lente elíptica.

## 1.9.0-beta.1 — 2026-11-17

- Adiciona **Liquid** em **Blur → Vidro → Modelo do vidro**, como opção de refração de esfera com realce artístico na borda. Ajusta a lente ao contorno arredondado do elemento e mantém textos/ícones em primeiro plano.
- Acrescenta `refraction-style` (`contour`/`liquid`), com Contorno como padrão. O modelo é independente dos métodos de blur e usa o controle de intensidade existente.
- Integra Liquid às capturas locais de menus, painel, docks e janelas e ao acabamento de wallpaper, incluindo a barra estática. A troca do modelo atualiza a composição sem trocar o buffer nem recriar os filtros de wallpaper.
- Mantém uma amostra do fundo no acabamento e nenhuma animação própria. Preserva a cadência dos fundos dinâmicos e o cache final do wallpaper.
- Adiciona regressões de pixels para magnificação/simetria, intensidade zero, conteúdo opaco, área externa, seleção ao vivo, modelos combinados e repouso. Referência visual/técnica: Glass Sphere, Shader Learn.


## 1.8.1 — 2026-11-17

- Corrige a opacidade da lateral do Configurações quando existe um lançador da extensão legada: o overlay atual passa a prevalecer sobre variáveis definidas por lançadores `env` aninhados. Preserva argumentos, outros recursos e a restauração do lançador original.
- Inclui regressão com o aplicativo real, medindo 0%, 45%, 90% e 100% sobre fundos preto/branco.
- A aba Blur lê o nome e a versão dos metadados da extensão, substituindo o texto fixo em 1.5.1.
- Corrige a retomada do blur do painel após suspensão/desbloqueio: o modo de usuário pode voltar antes de a proteção da tela terminar sua animação, deixando uma superfície recém-criada com callbacks suspensos.
- Observa `sessionMode.updated` e `screenShield.active-changed`, agrupando a retomada na próxima fase de layout. Dispensa abrir/fechar o Overview e mantém a pausa de consumidores ocultos, sem polling.
- Acrescenta regressão com falha reproduzida na 1.8.0, comparação de pixels, ciclos sem recriação de módulo, sinais reais de user/unlock-dialog, escalas fracionárias, repouso e limpeza de sinais ao desativar.


## 1.8.0 — 2026-11-16

- Promove a 1.8.0-beta.3 para estável, com o mesmo código de execução e esquema de preferências; altera somente a identificação da versão e a documentação.
- Inclui resolução automática/metade/um quarto, atualização 100%/50%/25%, capturas compactas e proteção de redesenho durante mover/redimensionar janelas junto ao dock.
- Inclui os dez pontos principais da revisão de desempenho: suspensão de superfícies ocultas, oclusão conservadora, wallpaper reduzido e cache final, reutilização de armazenamento, snapshots por fase, preferências agrupadas, brilho separado, expiração transitória, cache de uniforms e integrações assíncronas.
- Mantém fallback para informações de opacidade ou APIs de wallpaper indisponíveis. O recorte interno dos widgets de outro aplicativo continua dependendo de informação confiável que o Shell não expõe.
- Publica ZIP instalável, checksums e evidências de validação, sem promessa de redução percentual de GPU ou watts em todas as sessões.


## 1.8.0-beta.3 — 2026-11-16

- Implementa os dez pontos principais da revisão de desempenho da beta.2: suspensão de superfícies ocultas, oclusão conservadora, wallpaper reduzido, reutilização de pirâmides, snapshots por fase, classificação de preferências, acabamento separado, expiração transitória, cache de uniforms/capacidades e I/O fora do processo Shell.
- Wallpaper usa paint nodes para executar as passagens após a pintura da fonte, em alvos menores e com cache final. Passagens agendadas têm alvos reduzidos próprios para preservar a ordem dos journals Cogl; o renderer dinâmico mantém ping-pong imediato. Há fallback para a cadeia anterior quando as APIs necessárias não existem.
- Mantém a árvore do Overview aquecida por até cinco segundos e limita globalmente os caches ocultos a uma estimativa RGBA8 de 128 MiB. Capturas de screenshots expiram em 500 ms, preservando a captura integral de cada operação.
- Oclusão exige RGB/Wayland e cobertura da superfície raiz, sem efeitos, recortes ou transforms desconhecidos. Janelas RGBA continuam renderizando; transparência não é inferida por leitura de pixels.
- Integrações externas usam fila serializada em subprocesso, com snapshots pendentes agrupados e restauração final ordenada. Sombras agrupam alterações e escrevem CSS de forma assíncrona.
- Preserva a proteção durante mover/redimensionar e o retorno automático ao modo Elementos. Inclui regressões de memória, geometria, pixels de wallpaper, oclusão com cliente XRGB real e retomada após exposição.


## 1.8.0-beta.2 — 2026-11-16

- Suspende o redesenho regional enquanto uma janela é movida ou redimensionada, usando o caminho compatível para evitar espera de regiões incompletas durante interação com o dock.
- Inclui operações por teclado e movimentação sem restrições. Mantém a proteção por 250 ms após soltar, sem polling ou loop de frames, e retoma Elementos automaticamente.
- Descarta pedidos regionais pendentes durante a interação. Os sinais de grab pertencem à extensão e são removidos ao desativar, inclusive no meio de um arraste.
- Adiciona regressão com arraste nativo por ponteiro de uma janela Wayland translúcida junto ao Dash to Dock Extended real, com/sem blur de janela/dock, além de testes de retomada e repouso.
- A pausa longa relatada não foi reproduzida na sessão privada a 60 Hz. Esta é uma proteção de estabilidade para o caminho regional; não representa uma medição de ganho de GPU ou garantia de eliminar todo hitch em outras sessões.

## 1.8.0-beta.1 — 2026-11-16

- Estende capturas compactas ao Box e Gaussian, com margem calculada para kernel, redução, reconstrução e distorção.
- Adiciona resolução do filtro dinâmico: automática, metade ou um quarto por eixo. Os três métodos atendem às opções; o wallpaper mantém seu caminho com cache.
- Adiciona atualização do fundo dinâmico em 100%, 50% (half rate) ou 25% (quarter rate), relativa à frequência de cada monitor. Mantém a interface fluida e reutiliza a textura entre capturas.
- Agenda somente um refresh final pendente para não deixar o último estado da animação desatualizado. Remove temporizadores ao liberar o efeito; screenshots ignoram o limitador, e alterações de geometria/filtro invalidam o cache.
- Integra a limitação ao redesenho por Elementos para evitar pedidos de margem na cadência completa. Padrões preservados: resolução automática e atualização 100%.
- Atualiza juntas as capturas com margens sobrepostas e sincroniza seus prazos. Corrige um ciclo de pedidos alternados de região que podia manter o desktop repintando em repouso, inclusive em 100%.
- Adiciona testes com duas superfícies abertas em momentos diferentes, dano assimétrico e margens sobrepostas, além de diagnóstico das capturas e temporizadores em caso de falha no repouso.

## 1.7.0 — 2026-11-16

- Promove a beta.3 a estável, com o mesmo código de execução, exceto a identificação em `metadata.json`.
- Inclui Kawase com 1–8 iterações independentes, padrão 3, e capturas dimensionadas para o alcance do filtro.
- Inclui blur estático do papel de parede na barra superior, com cache da saída dos shaders.
- Inclui redesenho por **Elementos (experimental)** como opção para os fundos dinâmicos. O padrão continua **Monitor (compatível)**; o modo regional pode acrescentar um frame de atraso e mantém fallback automático.
- Publica ZIP instalável, checksum e evidências de validação. As medições de GPU são específicas das cenas descritas, sem promessa de redução percentual para todos os desktops.

## 1.7.0-beta.3 — 2026-11-16

- Adiciona **Blur estático do papel de parede** na aba Painel: filtra só uma faixa do wallpaper e guarda a saída dos shaders em cache, sem capturar janelas ou acompanhar seus danos.
- Atualiza a cópia do papel de parede pelo gerenciador do Shell, incluindo mudanças de imagem/tema e monitor, e preserva as regras de opacidade e Overview da barra.
- Adiciona **Área de redesenho do blur → Elementos (experimental)**: usa a fila de redesenho nativa por região, com a margem do filtro; quando necessário, reaproveita o resultado preparado e atualiza a região no próximo frame.
- Mantém pintura, apresentação e histórico de danos do compositor. O modo pode acrescentar um frame de atraso ao blur; APIs indisponíveis, Overview e monitores rotacionados usam o modo compatível.
- Normaliza a cobertura premultiplicada no wallpaper opaco da barra, evitando que a borda dos buffers revele janelas atrás dela. Adiciona testes de cache, imagem real, regiões externas, repouso e escalas mistas.

## 1.7.0-beta.2 — 2026-11-16

- Adiciona **Iterações do Kawase**, de 1 a 8, com padrão 3 e independente das iterações do Gaussian.
- Cada iteração aplica uma passada de quatro amostras; normaliza os offsets para manter a intensidade aproximada e ajusta a margem de captura ao suporte do kernel.
- Atualiza ao vivo superfícies, painel, dock, janelas e a cadeia em cache do papel de parede; mantém os dois render targets reutilizados.
- Acrescenta testes de passadas pares/ímpares, pixels, controles e atualização ao vivo. O benchmark anterior continua sendo uma medição de três iterações, sem alegação de economia de GPU para outras quantidades.

## 1.7.0-beta.1 — 2026-11-16

- Adiciona **Kawase (leve)**: três passadas diagonais de quatro amostras em resolução reduzida, com alvos reutilizados e intensidade aproximada à do Box.
- Calcula a margem de captura do Kawase a partir do suporte do kernel e da refração; dispensa o tamanho mínimo dos backends antigos, reduzindo a área processada em superfícies estreitas.
- Aplica o método em superfícies, painel, docks, janelas e papéis de parede opcionais; preserva os métodos e as escolhas existentes.
- Inclui testes de pixels, contagem real de passadas, controles, cantos, refração e escalas mistas, além de um perfil de benchmark com transparência como referência.
- A redução do trabalho do filtro não equivale a uma economia garantida de GPU no desktop nem resolve, por si só, redesenhos contínuos de outras fontes.

## 1.6.0 — 2026-11-15

- Fast Gaussian Blur com passadas progressivas, inspirado em amilajack/gaussian-blur.
- Adiciona controle de 1 a 8 iterações; o padrão 4 usa oito passadas alternadas e texturas temporárias reutilizadas.
- Equilibra os eixos e normaliza os passos para manter a intensidade do raio ao mudar a qualidade.
- Aplica o ajuste a superfícies, painel, docks, integrações de janelas e papel de parede; mantém samples 5/9/13 e Box blur independente.
- Verifica o perfil de pixels contra uma curva Gaussian, alteração ao vivo, preferências e a correção da primeira linha do painel.

## 1.5.2 — 2026-11-15

- Corrige a linha sem blur no topo do painel: o arredondamento da captura passa a incluir todos os pixels tocados, respeitando os limites do framebuffer e o recorte da superfície.
- Adiciona regressão das primeiras três linhas do painel real, em screenshot e framebuffer apresentado, com Box blur e Fast Gaussian Blur.

## 1.5.1 — 2026-11-14

- Corrige o quadrado no canto superior esquerdo das superfícies com textura fosca, inclusive com o blur desligado: a textura passa a repetir por toda a área do elemento.
- Mantém o tile compartilhado de 64×64, sem novas capturas, buffers ou processamento de blur.
- Adiciona regressão de pixels para cobertura e limites da superfície nos temas claro e escuro.

## 1.5.0 — 2026-11-14

- Corrige a coluna sem blur junto à transição entre lateral e curva do dock, substituindo o recorte binário das capturas por cobertura arredondada com antialias no shader.
- Preserva recortes do contêiner, textura fosca, fades e efeitos independentes.
- Adiciona **Samples do Fast Gaussian**: 5, 9 ou 13 taps, com 3, 5 ou 7 leituras lineares por direção. O padrão continua 13.
- Troca o kernel ao vivo em superfícies, painel, docks, janelas e papéis de parede opcionais. O seletor é desabilitado para Box blur e quando o blur está desligado.

## 1.4.0 — 2026-11-14

- Substitui o seletor de modos por **Ativar blur** e **Ativar distorção do vidro**, independentes.
- O toggle de blur habilita **Box blur** ou **Fast Gaussian Blur** e o controle de raio; a distorção tem toggle e intensidade próprios.
- Mantém **Textura fosca** como opção separada. Sem blur nem distorção, não cria capturas do fundo.
- Unifica a configuração em menus, painel, docks, janelas selecionadas, Overview e bloqueio.
- Migra uma vez os modos e o método antigos, preservando escolhas explícitas dos novos controles.
- Remove backend, frequência e modos antigos das preferências; suas chaves ficam apenas para compatibilidade de migração.
- Ao desligar o blur, libera também os buffers de filtros de screenshots em cache. Preserva o estilo do painel quando ambos os efeitos estão desligados.

## 1.3.0 — 2026-11-14

- Adiciona **Vidro com desfoque**, com blur e refração controlados independentemente.
- Inclui **Box blur** separável na GPU e **Fast Gaussian Blur**, adaptado do kernel de 13 taps do projeto Experience-Monks (MIT).
- Captura o fundo uma vez, reduz a resolução em etapas e aplica o filtro antes da lente; textos, ícones e conteúdo opaco não entram no filtro.
- Integra os dois métodos às superfícies, painel, docks, janelas selecionadas e papéis de parede opcionais de Overview/bloqueio.
- Preserva os três modos anteriores e seus defaults. Raio zero ou refração zero permitem usar cada efeito separadamente.

## 1.2.0 — 2026-11-14

- Adiciona **Vidro — refração real**, com shader de fragmento GLSL e normais do contorno arredondado, inspirado em LiquidGlass.fx de Pedro Ruedas.
- Copia o fundo na GPU antes do primeiro plano, sem leitura pela CPU nem blur; controla a intensidade da lente separadamente.
- Integra o modo a menus, painel, docks, janelas selecionadas e papéis de parede opcionais.
- Corrige o atraso do backdrop em superfícies animadas, aplicando a posição por translação no mesmo frame.
- Valida visualmente a textura econômica com iluminação pré-calculada de normais, nos temas claro e escuro.

## 1.1.0 — 2026-11-14

- Adiciona **Blur → Modo**: Dinâmico (padrão) ou Econômico — vidro fosco.
- O econômico usa uma textura translúcida compartilhada, sem capturas, cálculo de blur ou proteção de redraw completo. O fundo atrás continua nítido.
- Aplica a escolha às superfícies do Shell, painel, dock, janelas selecionadas e papéis de parede opcionais do Overview/bloqueio.
- Preserva opacidade, cantos, recortes, animações, estilos e restauração ao desativar.
- Desabilita os controles exclusivos do blur dinâmico no modo econômico, sem perder seus valores.

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
