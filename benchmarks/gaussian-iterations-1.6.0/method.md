# Box versus Gaussian progressivo — método, 15/11/2026

Pacote 1.6.0, revisão interna 23. Três configurações somente: Box blur, Fast Gaussian com três iterações, Fast Gaussian com quatro iterações. Cada iteração é um par H/V: seis, seis e oito passadas de filtro, respectivamente. Gaussian fixado em 13 taps (sete leituras lineares por direção). Refração e textura fosca desligadas.

Cinco blocos em ordem pseudoaleatória determinística, com as três configurações em cada bloco. Compositor GNOME Shell/Mutter 51.1 Wayland headless novo por amostra, GPU real Intel Arc/xe, D-Bus e diretórios XDG privados. Nenhuma alteração de configurações ou código na sessão principal. ZIP extraído intacto, sem patches no renderer. SHA-256 e identificação do hardware em method.json.

Mesma geometria do benchmark anterior: monitor virtual 1440×1000, escala 100%, aproximadamente 60 Hz. Faixas verticais de 40 px deslizam 80 px/s sob duas superfícies sintéticas de 1000×96 e 520×540. São atores do módulo de docks, com a geometria controlada; não um dock com aplicativos ou um menu completo. Raio 24, brilho 0,8 e opacidade 0,85. Painel/menus desabilitados em todos os casos para isolar essas duas superfícies. A área visível total é 376.800 px (26,2% da tela); o padding das capturas também entra no custo e é registrado nos JSONs.

Dois segundos de aquecimento estático, coleta de lixo antes da amostragem, dois segundos de repouso, quatro segundos de aquecimento da animação, doze segundos medidos em movimento. Depois da medição, a animação para e um frame diagnóstico conta chamadas reais de desenho nos filtros. Essa instrumentação é restaurada no fim do frame e nunca participa da medição ativa. Exige seis passadas para Box/Gaussian 3 e oito para Gaussian 4, além das duas passadas de redução comuns aos três. Após um segundo de estabilização, mede dois segundos em repouso. Buffers auxiliares de screenshot são excluídos da contagem de passadas do framebuffer apresentado.

CPU: tempo de processo / tempo monotônico, em percentual de um núcleo. GPU: delta drm-cycles-rcs / delta drm-total-cycles-rcs dos clientes DRM distintos do compositor, sem duplicar descritores. RAM: média VmRSS. Unidades B/KiB/MiB/GiB de fdinfo são normalizadas antes de calcular a memória residente. Memória gráfica: soma de drm-resident-* dos clientes distintos. Nesta GPU integrada é memória GTT compartilhada, não memória adicional que se possa somar ao RSS como uso exclusivo. Frequências solicitada/instantânea de GPU são apenas observadas a cada 0,5 s; não são fixadas ou usadas para normalizar a utilização. Nenhuma medição de watts/autonomia.

Os valores incluem o compositor de teste inteiro. Comparar somente os três casos deste ensaio: o Gaussian mudou desde 1.5.1, e o novo ensaio usa intervalos/aquecimento maiores. Os valores antigos não devem ser usados como controle dessa comparação. Ensaios de smoke não integram os resultados finais.

Referências dos contadores: [DRM](https://www.kernel.org/doc/html/latest/gpu/drm-usage-stats.html) e [xe](https://www.kernel.org/doc/html/latest/gpu/xe/xe-drm-usage-stats.html). Reportar mediana e faixa mínimo–máximo. Oscilações de frequência/cache/agendamento não são eliminadas; faixas sobrepostas não estabelecem vantagem garantida. Não compara qualidade visual equivalente, múltiplos monitores ou outras cargas.

Reprodução:

```sh
GSE_APPEARANCE_BENCH_PROFILE=iterations /usr/bin/python3 tests/appearance_benchmark.py
```

A coleta inicial anterior à correção do parser de unidades e da seleção de buffers foi descartada integralmente; seus números não integram os resultados.
