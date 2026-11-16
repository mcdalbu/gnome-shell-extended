# Kawase compacto — ensaio de 16/11/2026

**O ensaio não comprova menor ocupação total de GPU para Kawase.** O filtro
executa menos passadas e captura menos pixels, mas a mediana de ocupação RCS
ficou acima das dos métodos anteriores. As faixas de Gaussian e Kawase se
sobrepõem; não recomendamos converter esses números em promessa de economia
na sessão real. O objetivo relatado de eliminar 20% de GPU em repouso não foi
reproduzido nem considerado resolvido.

GNOME Shell/Mutter 51.1, Intel Arc integrada/driver xe, versão 1.7.0 (24).
Três repetições por caso, com processo/compositor/D-Bus privados novos,
ordem alternada, quatro segundos de aquecimento e doze segundos animados.
Monitor 1440×1000 a 100%/60 Hz. Duas superfícies de 1000×96 e 520×540 sobre
faixas em movimento; raio 24, brilho 0,8, alpha 0,85, sem distorção nem fosco.
O Gaussian deste ensaio usa **13 taps e quatro pares**; não é a configuração
9 taps presente na sessão do usuário. Sem benchmark do Overview ou desktop
completo da sessão real.

GPU é a ocupação RCS do processo Shell privado, CPU é percentual de um núcleo
e memória gráfica é residência DRM/GTT, não VRAM exclusiva nem watts.

| Configuração | GPU RCS % mediana (mín.–máx.) | CPU % mediana | Memória gráfica MiB mediana |
|---|---:|---:|---:|
| Transparência sem blur | 1.23 (1.16–1.44) | 6.17 | 283.95 |
| Box | 3.90 (3.56–4.90) | 15.33 | 297.31 |
| Gaussian 13 taps, 4 pares | 4.48 (3.64–6.31) | 16.16 | 297.45 |
| Kawase compacto | 5.20 (4.12–5.59) | 11.16 | 295.49 |

A frequência `cur_freq` amostrada variou de 600 a 1950 MHz,
sem fixar clocks ou alterar o gerenciamento de energia do usuário.
Isso limita comparações pequenas de ocupação. Não foi medido consumo em watts.
Nas 24 janelas de repouso de dois segundos houve entre
0 e 2 frames por janela,
sem loop contínuo. Esse resultado isolado não explica a atividade da sessão real.

## Trabalho e geometria confirmados

| Filtro | Passadas de filtro | Leituras por pixel reduzido |
|---|---:|---:|
| Box | 6 | 54 |
| Gaussian 13 taps, 4 pares | 8 | 56 |
| Kawase | 3 | 12 |

Todos usam mais duas passadas de redução de 2× e a composição. A captura
acontece uma vez por pintura, não por passada. A contagem foi conferida em um
frame diagnóstico após o intervalo medido, sem instrumentar a animação medida.

As capturas reais mudaram de **1216×320 + 768×768** no Box/Gaussian para
**1152×256 + 704×704** no Kawase: 978.944 para 790.528 pixels, **19,25% menos**.
Isso reduz trabalho e armazenamento, mas não é um percentual de uso total da GPU.
A primeira implementação, que mudou só o kernel sem compactar as capturas,
também não estabeleceu vantagem consistente; seus dados permanecem em
`validation/kawase-benchmark-1.7.0/`.

## Reprodução

```sh
make zip
GSE_APPEARANCE_BENCH_PROFILE=kawase GSE_APPEARANCE_BENCH_REPETITIONS=3 /usr/bin/python3 tests/appearance_benchmark.py
```

[Resumo](benchmarks/kawase-1.7.0/summary.json) e
[metadados completos](benchmarks/kawase-1.7.0/method.json).
Amostras brutas, logs e o ZIP exato medido ficam em
`validation/kawase-compact-benchmark-1.7.0/`, ignorado pelo Git.
O SHA-256 medido é `41419a6b60ff37b30c537a4dd951313f6927dc306f49bbe6e4377cb5fbc4ea2b`.
A documentação de validação foi atualizada depois do ensaio. O renderer da
beta.1 foi comparado byte a byte com o ZIP medido, exceto `metadata.json`.
A **1.7.0-beta.2** acrescenta o controle independente de 1 a 8 iterações,
com padrão 3. Os números deste relatório continuam sendo do pacote original;
não há novo benchmark de GPU para as demais quantidades.
