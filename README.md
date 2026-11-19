# Gnome Shell Extended

Extensão modular para GNOME Shell **45–51**, com blur e transparência por
superfície, painel adaptativo, integração com docks, sombras de ícones e
preferências GTK4/Libadwaita. Versão **1.9.6**.
Licença **GPL-3.0-only**; código reaproveitado identificado em `THIRD_PARTY.md`.

## Funcionalidades

| Módulo | Implementação |
| --- | --- |
| Blur | Calendário, configurações rápidas, menus, banners, diálogos, pastas, Alt+Tab, volume/brilho e ferramenta de captura; papel de parede no Overview e bloqueio |
| Painel | Cor por tema/clara/escura e opacidade normal, com janelas maximizadas ou em tela cheia; considera workspace e monitor da barra |
| Docks | Dash to Dock/Ubuntu Dock: blur, opacidade do fundo e fundo invisível no Overview, preservando os ícones |
| Sombras | Grade, pastas, dock e Alt+Tab; intensidade, raio e deslocamentos |
| Aplicativos | Integração opcional por CSS para barras laterais do Nautilus/Configurações e menus GTK4; opacidade nativa dos perfis do Ptyxis |
| Preferências | Seis abas, 57 controles, limites de valores e restauração de defaults |

Por padrão, blur do calendário/configurações rápidas e painel adaptativo ficam
ativos. Outros elementos podem ser habilitados individualmente. As integrações
com aplicativos, docks e sombras ficam desligadas por padrão.

**Blur de janelas:** a aba Aplicativos inclui `Efeitos nos fundos transparentes`.
Ele é aplicado atrás das janelas dos aplicativos selecionados e fica visível
somente onde o aplicativo já desenha transparência. O conteúdo opaco, os textos
e os ícones continuam sendo desenhados pelo aplicativo. O módulo é liberado
quando a opacidade está em 100%, ao desativar a opção ou a integração.

**Limites desta versão:** a árvore de widgets de outro processo não está
acessível ao Shell. O CSS opcional depende das classes/versões dos aplicativos,
precisa de reinício desses aplicativos e pode não alcançar Flatpaks.

GNOME 45–51 são alvos declarados. Consulte `VALIDATION.md` para a versão e os
cenários efetivamente testados. As medições são de cenas específicas; não há
garantia de ganho percentual de CPU/GPU/RAM nem certificação em todas as versões.

## Liquid — 1.9.0

A opção Vidro (Contorno e Liquid) não se aplica à barra superior, inclusive no modo de blur estático. A barra mantém seus controles de blur e opacidade; os menus abertos a partir dela continuam recebendo Vidro.

Em **Blur → Vidro**, ative **Ativar distorção do vidro** e selecione
**Modelo do vidro → Liquid**. O controle de intensidade regula o deslocamento
do fundo. A opção Contorno continua sendo o padrão.

Liquid usa refração esférica e um realce suave na borda, inspirados no exemplo
[Glass Sphere](https://www.shader-learn.com/examples/glass-sphere). A lente é
ajustada às bordas e aos cantos arredondados de cada elemento, com intensidade que diminui para dentro e centro estável.
Textos, ícones e conteúdo opaco dos aplicativos permanecem sobre o efeito.

Pode ser usado sozinho ou com Box, Gaussian e Kawase nos elementos habilitados,
incluindo painel/dock, menus, fundos transparentes das janelas e wallpaper.
O acabamento Liquid faz uma leitura do fundo por fragmento e reutiliza a
captura existente; blur combinado conserva o custo do filtro selecionado.
O shader não usa tempo nem animação própria. O painel estático mantém o cache
final, e os fundos dinâmicos respeitam as opções de atualização 50%/25%.

## Correções — 1.8.1

A lateral do Configurações passa a respeitar a opacidade escolhida mesmo
quando existe um lançador legado com outro overlay. O recurso atual prevalece,
preservando os demais argumentos e a restauração do lançador. Feche e reabra
o aplicativo para carregar o CSS atualizado.

A aba Blur mostra a versão dos metadados da extensão, sem um texto de versão fixo.

Corrige o painel que voltava sem blur após acordar e só se recuperava ao abrir e
fechar o Overview. A superfície observa a mudança da sessão e a desativação da
proteção da tela de bloqueio para retomar seus callbacks e capturas na próxima
fase de layout. Preserva a suspensão de trabalho enquanto estiver oculta e não
usa polling nem força redesenho contínuo.

## Release estável — 1.8.0

Promove a beta.3 com o mesmo código de execução, alterando apenas a identificação
da versão e a documentação. Inclui resolução reduzida, atualização 50%/25%,
wallpaper em cache, suspensão de superfícies ocultas, oclusão conservadora e
integrações assíncronas. Mantém a proteção durante arrastes junto ao dock.

## Revisão de desempenho — 1.8.0-beta.3

- Superfícies ocultas deixam de acompanhar danos e fases de frame após a limpeza final. Sinais de layout/clip retomam o blur ao reaparecer.
- Janelas inteiramente cobertas suspendem capturas quando uma superfície Wayland RGB, sem efeitos ou recortes, comprova cobertura opaca. Formato RGBA, transforms ou cobertura desconhecida preservam o caminho normal.
- Wallpaper usa filtros em resolução reduzida e cache da saída final quando as APIs de paint nodes estão disponíveis. Overview pode reutilizar sua árvore por até cinco segundos; versões sem essas APIs mantêm os filtros anteriores.
- Pirâmides são reutilizadas por dimensões/redução, brilho atualiza apenas o acabamento e uniforms estáveis ficam em cache. Alterações de preferências são agrupadas e encaminhadas aos consumidores pertinentes.
- Capturas transitórias de screenshot expiram após 500 ms. Caches ocultos compartilham um orçamento estimado de 128 MiB e expiram em cinco segundos; liberar armazenamento não agenda um loop de pintura.
- Integrações GTK/Ptyxis/Configurações executam em processos auxiliares serializados, com snapshots agrupados, backups e ETags preservados. Escrita de sombras passa a ser assíncrona.

A resolução também atende o wallpaper no renderer novo; o limite de atualização
50%/25% continua exclusivo dos fundos dinâmicos. A proteção de arraste da beta.2
permanece ativa. O recorte às partes transparentes internas de outro aplicativo
continua dependendo de informação do cliente que o Shell não expõe; não se
estima essa área a partir de pixels ou do formato RGBA.

## Movimento de janelas perto do dock — 1.8.0-beta.2

O modo **Elementos** usa temporariamente o redesenho compatível durante um
arraste ou redimensionamento nativo de janela, inclusive pelo teclado. Isso
evita esperar regiões incompletas do fundo enquanto a janela e o dock estão
se movendo. Após soltar, mantém a proteção por 250 ms para a animação do dock
e retoma Elementos nos próximos frames. A preferência selecionada é mantida.

O caminho compatível pode desenhar mais pixels nesse intervalo. A barra
estática continua independente; resolução e limite de atualização mantêm
suas configurações. Não há polling nem temporizador repetitivo: o período é
verificado apenas em frames que o compositor já desenharia.

## Economia de renderização — 1.8.0-beta.1

Em **Blur → Recursos**, os novos controles são independentes:

- **Resolução do filtro dinâmico**: Automática, Metade por eixo e Um quarto por eixo. A resolução automática acompanha o raio físico; as outras opções reduzem ainda mais as texturas do filtro. Podem suavizar demais detalhes e revelar aproximações. A captura mantém a margem necessária ao kernel e à refração.
- **Atualização do fundo dinâmico**: **100% (full rate)**, **50% (half rate)** e **25% (quarter rate)** da frequência de cada monitor. Em 60 Hz, são limites de 60, 30 e 15 atualizações por segundo; em 144 Hz, 144, 72 e 36. A interface continua na frequência normal. O compositor ou o redesenho regional podem produzir menos atualizações que o limite.

As opções atendem Box, Fast Gaussian e Kawase em menus, barra dinâmica,
docks e fundos de janelas. Desde a beta.3, a resolução também atende a barra
estática, o Overview e o bloqueio no renderer de wallpaper com paint nodes.
Essas fontes continuam usando sua política de cache, sem o limitador de cadência.
Os padrões continuam **Automática** e **100%**.

Entre atualizações, a textura preparada é reaproveitada. Um único refresh
pendente garante o último estado do fundo quando uma animação para; não há
polling em repouso. Movimento/redimensionamento da captura e mudanças no
filtro atualizam a fonte assim que a região necessária estiver disponível.
Capturas de tela sempre usam pixels novos. Desativar/destruir o efeito cancela
os refreshes pendentes. Se a API de frequência do monitor estiver indisponível,
o limitador é desconsiderado.

No modo **Elementos**, capturas cujas margens se cruzam são atualizadas juntas.
Isso evita um ciclo em que uma pede a margem da outra indefinidamente, mesmo
com o fundo parado. Os prazos do limitador também são alinhados por monitor.

Box e Gaussian também passam a usar capturas compactas, sem o tamanho mínimo
herdado dos backends antigos. A margem considera todo o kernel, a redução,
a reconstrução e a refração. Isso pode poupar área principalmente em barras
estreitas; reduzir a resolução também pode exigir margens maiores. Menos
pixels nas passadas não equivale ao mesmo percentual de economia total de GPU.

## Blur estático da barra e desenho por elemento — 1.7.0

Em **Painel**, ative **Blur estático do papel de parede** para usar só o
papel de parede como fonte da barra. A faixa da barra, com margem para o
filtro, é processada e o resultado final dos shaders fica em cache. Textos
e ícones continuam sendo desenhados normalmente. Janelas e animações atrás
da barra não invalidam esse cache; mudanças no papel de parede, monitor,
geometria ou parâmetros dos efeitos o atualizam. O cache é liberado no
Overview, quando a barra fica opaca ou ao desativar seus efeitos.

Em **Blur → Recursos → Área de redesenho do blur**, a opção
**Elementos (experimental)** permite que os fundos dinâmicos usem o redesenho
nativo por região, incluindo as margens necessárias ao filtro. Atualizações
fora da captura não pedem um novo blur. Se uma margem do fundo ainda não foi
redesenhada, o efeito usa a imagem preparada e agenda aquela região para o
próximo frame; isso pode acrescentar um frame de atraso ao blur. A animação
do aplicativo continua independente.

As capturas dinâmicas já são recortadas aos elementos; o modo novo evita a
exigência adicional de redesenhar o monitor inteiro. As áreas que o próprio
desktop/aplicativo altera continuam sendo desenhadas. Em versões sem a API
necessária, no Overview e em monitores rotacionados, usa o caminho compatível.
O padrão continua **Monitor (compatível)**, com o estático desligado. O modo
estático não precisa da proteção de redesenho, independentemente dessa escolha.

Os testes verificaram cache, pixels, atualização do fundo e repouso. As
medições curtas registradas em `VALIDATION.md` são observações de uma cena,
sem garantia de economia percentual na sessão real.

## Iterações do Kawase — 1.7.0-beta.2

O controle **Iterações do Kawase** vai de **1 a 8**, com padrão **3**.
Cada iteração aplica uma passada de quatro amostras. Menos iterações reduzem
o trabalho do filtro e mudam a aproximação; os passos são normalizados para
manter a intensidade próxima ao mesmo raio. A margem de captura acompanha
o alcance do kernel. O controle só fica disponível com blur ligado e Kawase
selecionado; o valor do Gaussian continua independente.

A alteração é aplicada ao vivo em superfícies, painel, dock, janelas e papéis
de parede opcionais. O padrão preserva os três passos da beta.1. O benchmark
abaixo é da implementação de três passos; não foi repetido para cada quantidade.

## Kawase com menor trabalho de filtro — 1.7.0-beta.1

Em **Blur → Método de blur**, selecione **Kawase (leve)**. Por padrão, o método usa três
passadas diagonais, cada uma com quatro leituras lineares, nas texturas
reduzidas já utilizadas pelo renderer. São **12 leituras somadas por pixel
filtrado**, contra 54 no Box e 56 no Gaussian padrão (13 taps, quatro pares).
Essas contagens não incluem captura, redução e composição e não representam
uma redução percentual garantida no uso total da GPU.

O Kawase também usa uma captura com margem calculada para seu kernel e sem
as dimensões mínimas exigidas pelos backends antigos. Isso reduz a área
capturada e filtrada, principalmente em painéis e docks estreitos. As dimensões
continuam estáveis durante movimento e fades; a refração entra no cálculo da
margem quando habilitada. Não há captura por passada nem leitura para a CPU.

Os três passos aproximam a intensidade do Box para o mesmo raio, com outro
perfil de suavização. Samples e iterações do Gaussian não afetam Kawase.
O método vale para todas as superfícies e para os papéis de parede opcionais;
estes mantêm o cache de atores do compositor. As escolhas existentes são
preservadas: a atualização não muda automaticamente o método selecionado.

O custo de redesenhar a cena também importa. Se a GPU permanece ocupada com
a área de trabalho parada, compare os períodos de repouso e procure a origem
dos frames; diminuir o filtro sozinho não comprova a correção desse caso.
O [ensaio da 1.7.0](BENCHMARK-KAWASE.md) confirmou menos pixels e passadas,
mas **não demonstrou menor ocupação total de GPU para Kawase**; as frequências
variaram e o consumo alto em repouso da sessão real não foi reproduzido.
O perfil reproduzível da versão atual é:

```sh
make zip
GSE_APPEARANCE_BENCH_PROFILE=kawase /usr/bin/python3 tests/appearance_benchmark.py
```

## Gaussian progressivo — 1.6.0

O **Fast Gaussian Blur** usa passadas com passos progressivamente menores,
inspiradas na [demonstração de Amila](https://amilajack.github.io/gaussian-blur/).
O controle **Iterações do Fast Gaussian** vai de 1 a 8; cada iteração aplica
uma passada horizontal e uma vertical. O padrão 4 corresponde a oito passadas.
**9 taps**, quatro iterações e distorção desligada usam o kernel da referência
com esse encadeamento progressivo.

Na adaptação ao Shell, os dois eixos recebem o mesmo filtro e os passos são
normalizados para preservar a intensidade associada ao raio. Mais iterações
suavizam a aproximação e aumentam o número de passadas na GPU. As texturas
temporárias das superfícies são reutilizadas; não há captura por passada.
O ajuste vale também para o papel de parede no Overview e bloqueio. Box blur
conserva suas três iterações próprias e ignora esse controle.

## Blur e vidro — 1.5.0

A aba **Blur** tem dois controles independentes:

- **Ativar blur**: permite escolher **Box blur**, **Fast Gaussian Blur** ou **Kawase (leve)** e
  ajustar o raio. Ambos filtram o fundo na GPU; o método e o raio ficam
  indisponíveis quando o blur está desligado, sem perder seus valores.
- **Ativar distorção do vidro**: habilita a lente nas bordas arredondadas, com
  intensidade própria. Funciona com o blur ligado ou desligado.

Com os dois ligados, o fundo é desfocado antes da distorção. Com os dois
desligados, não há captura do fundo: ficam apenas a transparência e os estilos
configurados. As escolhas valem para todas as superfícies habilitadas.
As opções nas abas Elementos, Painel, Dock e Aplicativos selecionam onde os
efeitos são aplicados; não substituem os toggles globais da aba Blur.

**Textura fosca** é uma opção separada em Aparência. Usa iluminação
pré-calculada por normais em uma textura compartilhada de 64 × 64 pixels,
sem capturar ou desfocar o fundo. Pode ser combinada com os outros efeitos.
Usada sozinha, preserva o redesenho parcial e não acompanha danos do fundo.

O Box blur usa três iterações horizontal/vertical. O Fast Gaussian Blur usa
kernels de **5, 9 ou 13 taps**, escolhidos em **Samples do Fast Gaussian**.
Eles usam, respectivamente, **3, 5 ou 7 leituras lineares de textura por direção**.
13 taps é o padrão; menos taps reduz leituras em cada passada,
com outra aproximação do desfoque. Samples e iterações do Gaussian só ficam disponíveis com blur ligado
e Fast Gaussian selecionado; Kawase tem seu próprio controle de iterações. Os kernels foram adaptados de Experience-Monks sob MIT. Nas superfícies, os filtros usam uma
pirâmide de redução de 2× a 8×, conforme o raio. No Overview/bloqueio, apenas
o papel de parede é processado, com o cache de atores do compositor.
A aparência de um mesmo raio nominal varia entre os métodos.

A refração usa normais do contorno arredondado e preserva o centro plano,
com base na referência Windows-Liquid-glass descrita em `THIRD_PARTY.md`.
O recorte das capturas usa cobertura arredondada com antialias no shader,
evita o degrau de um pixel junto às tangentes do dock e respeita o clip do
seu contêiner. Textos, ícones e pixels opacos dos aplicativos são preservados. Em uma falha
de cópia do framebuffer, mantém a transparência nativa sem reutilizar capturas
antigas. Não há alegação de ganho percentual de GPU medido.

Na atualização, os modos anteriores são migrados uma vez: Dinâmico ativa o
blur; Refração ativa só a distorção; Combinado ativa ambos; Econômico ativa só
a textura fosca. Método, raio e intensidade são preservados. Um antigo backend
Desativado no modo Dinâmico migra para blur desligado. O seletor de modos e os
controles de backend/frequência deixam de aparecer na interface.

## Versão 1.0.0

Primeira versão 1.0 estável, baseada na 0.3.11, sem alterações funcionais.

## Novidades da versão 0.3.11

Promove a versão 0.3.11-beta.1, preservando seu código de execução.

- Evita sincronizações redundantes do painel e atualizações de aparência sem mudanças.
- Mantém um cache do raio dos cantos do tema, invalidado quando o estilo muda.
- Libera capturas de janelas ocultas após aproximadamente 5 segundos e cancela a liberação ao reexibir.
- Descarta capturas fora do monitor e libera os efeitos antes das capturas em mudanças de monitores.
- Mantém a proteção contra redraws recortados e a captura integral das janelas.
- Inclui o benchmark isolado de CPU/GPU e verificações de redraw em repouso já presentes no repositório.

## Novidades da versão 0.3.10

- Janelas com blur ativo recebem fade-in de 250 ms ao mostrar/restaurar ou
  voltar à frente de uma janela sobreposta. A intensidade e o brilho do blur
  avançam gradualmente; o ator da janela e os pixels opacos não mudam de opacidade.
- Movimentos, redimensionamentos, atualizações do aplicativo e refoco de uma
  janela já exposta não reiniciam a transição. Sobreposições parciais partem
  de uma intensidade mais próxima da final, evitando limpar o blur já visível.
- Trocas rápidas de foco continuam a transição em andamento. Ocultar, remover
  a janela ou desativar a integração cancela e descarta as animações.
- A captura conserva a geometria do raio final durante o fade, sem timer em
  repouso. O efeito continua limitado às integrações de aplicativos selecionadas.
- Mantém a opção de remover a lacuna do painel introduzida na versão 0.3.9.

## Correção da versão 0.3.9

Na aba **Painel**, ative **Remover lacuna entre a barra e janelas maximizadas**.
O ajuste substitui a opção de estender o fundo: corrige o espaço reservado à
barra para que o Mutter posicione o topo das janelas maximizadas um pixel
lógico sob a borda inferior da barra. O painel mantém suas dimensões, sem faixa adicional de fundo ou blur.
A opção vem desativada por padrão e restaura a reserva original ao desativar.
Em escala fracionária, a reserva usa a borda inferior arredondada para baixo
em pixels lógicos e desconta mais 1 px. O ajuste atua também quando a reserva
já tem a mesma altura do painel, caso que a versão 0.3.8 não corrigia.

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

Veja a [comparação de Box e Gaussian com três/quatro iterações](https://github.com/mcdalbu/gnome-shell-extended/blob/main/BENCHMARK-ITERATIONS.md),
com metodologia, medianas, faixas e dados brutos. Nesta cena a 100%, as faixas
de uso de GPU se sobrepõem; o ensaio não estabelece vantagem garantida nem
economia de energia para um método. O [benchmark de aparência da 1.5.1](https://github.com/mcdalbu/gnome-shell-extended/blob/main/BENCHMARK.md)
fica como referência histórica, com algoritmo Gaussian e condições diferentes.

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
No modo compatível, redraw completo é habilitado temporariamente durante um
frame existente que precisa de amostragem BACKGROUND; ele não inicia um loop
de frames. O modo experimental Elementos usa pedidos regionais e cache durante
a atualização da margem; a barra estática dispensa essa proteção.

No Fedora 45/Mutter 51, use a [biblioteca opcional `6.local` ou mais recente](https://github.com/mcdalbu/gnome-rounded-blur-rpm/releases/tag/v1.0.2-6.local.fc45)
para limitar capturas sem o loop de redraw em repouso observado com vários
efeitos na mesma view. A correção está na biblioteca; não exige trocar a
versão da extensão. O benchmark reproduzível está em `tests/benchmark.py`;
`GSE_BENCH_CHECK_IDLE=1` também verifica repouso antes/depois da animação.

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

Lançadores herdados da extensão antiga podem definir seu próprio overlay.
A integração atual aplica seu recurso depois dessas definições, para que a
lateral siga a opacidade escolhida em Aplicativos. Outros recursos e argumentos
do lançador são preservados, assim como sua restauração ao desligar a integração.

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
