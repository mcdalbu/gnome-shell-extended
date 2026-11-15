> Comparação mais recente: [Box versus Fast Gaussian com 3 e 4 iterações, versão 1.6.0](BENCHMARK-ITERATIONS.md). Os dados abaixo são históricos da versão 1.5.1.

# Comparação de recursos — Gnome Shell Extended 1.5.1

Medição em 15/11/2026: GNOME Shell/Mutter 51.1, Intel Core Ultra 7 256V, GPU integrada Intel Arc 130V/140V (8086:64a0), driver xe, kernel 7.3.3-300.fc45.x86_64.

Três repetições de 11 configurações, cada uma em um GNOME privado novo, usando o ZIP publicado da versão 1.5.1. Monitor 1440×1000 a 100%, duas superfícies sintéticas de 1000×96 e 520×540 sobre o mesmo fundo animado; raio 24, brilho 0,8, opacidade 0,85, distorção 6. Cada amostra mede oito segundos animados após aquecimento, além de repouso antes/depois. Frequências de CPU/GPU não foram fixadas.

**Resultado:** sem distorção, Fast Gaussian exigiu menos ocupação de GPU que Box nas amostras medidas. Entre 5/9/13 samples não houve classificação consistente: as faixas se sobrepõem. A textura fosca ficou próxima da transparência simples em GPU. Com distorção, as faixas dos métodos de blur também se sobrepõem.

Os números abaixo são medianas; os intervalos indicam mínimo–máximo das três repetições. GPU é ocupação do motor render do **compositor privado inteiro**, não uso total da máquina, potência elétrica ou custo exclusivo da extensão. CPU usa 100% para um núcleo. RAM é VmRSS, incluindo memória compartilhada. A memória gráfica residente é GTT compartilhada nesta GPU integrada e não deve ser somada ao RSS como memória exclusiva.

| Configuração | GPU % (faixa) | CPU % de 1 núcleo (faixa) | RAM RSS MiB | Memória gráfica MiB |
|---|---:|---:|---:|---:|
| Transparência simples | 3.26 (2.15–3.29) | 5.50 (4.87–5.62) | 248.7 | 283.6 |
| Textura fosca | 3.03 (2.79–3.68) | 8.12 (8.00–9.75) | 248.8 | 284.0 |
| Distorção sem blur | 4.19 (3.75–4.28) | 10.87 (9.87–13.87) | 246.0 | 292.5 |
| Box blur | 8.42 (8.19–10.32) | 10.87 (8.75–12.37) | 247.9 | 297.3 |
| Fast Gaussian 5 | 7.17 (4.97–7.31) | 10.50 (9.50–12.37) | 249.5 | 297.3 |
| Fast Gaussian 9 | 5.95 (5.55–6.26) | 11.74 (8.12–13.25) | 249.3 | 297.4 |
| Fast Gaussian 13 | 6.17 (6.16–7.37) | 9.87 (9.62–13.37) | 251.4 | 297.3 |
| Box + distorção | 5.85 (5.65–7.74) | 11.62 (8.37–14.62) | 249.4 | 297.3 |
| Gaussian 5 + distorção | 7.54 (5.73–7.56) | 12.62 (11.87–13.75) | 247.9 | 297.2 |
| Gaussian 9 + distorção | 6.15 (4.80–7.33) | 13.62 (8.37–13.74) | 247.4 | 297.3 |
| Gaussian 13 + distorção | 7.69 (6.33–8.30) | 10.49 (9.37–12.12) | 249.0 | 297.3 |

Todas as amostras ficaram entre 59.85 e 59.99 FPS. Não houve falha do renderer nem fallback silencioso: cada amostra verifica os toggles, filtros, redução e capturas efetivos.

RAM RSS ficou entre 245.2 e 252.4 MiB nas 33 amostras; não aparece uma vantagem de RAM consistente para um kernel. A referência ocupa 283.6 MiB de memória gráfica; a textura adiciona aproximadamente 0.4 MiB, a distorção sozinha 8.9 MiB, e os métodos de blur cerca de 14 MiB nesta geometria. São diferenças entre medianas do processo, não alocações exclusivas da extensão.

Em repouso, houve 0 ou 1 frame em cada janela de dois segundos, tanto antes quanto depois da animação. A mediana de GPU foi 0%, com máximo abaixo de 0,09%. Não foi observado loop contínuo de redraw. As diferenças principais desta comparação aparecem enquanto o fundo muda; os buffers continuam ocupando memória quando parados.

O Box com distorção apresentou menos ocupação de GPU que o Box sozinho. Isso **não demonstra que ligar distorção economiza energia**: o benchmark não mede watts nem fixa ou acompanha as frequências durante a amostragem. Os JSONs confirmam que os filtros continuam ativos. Não atribuímos uma causa precisa ao resultado; a ocupação do motor, isoladamente, não estabelece eficiência energética.

## Trabalho dos filtros na implementação

| Filtro | Passadas H/V | Leituras lineares por pixel filtrado, somadas nas passadas |
|---|---:|---:|
| Box blur | 6 | 54 |
| Fast Gaussian 5 | 2 | 6 |
| Fast Gaussian 9 | 2 | 10 |
| Fast Gaussian 13 | 2 | 14 |

A contagem vem de `src/core/render/glassBlur.js` e `gaussianKernels.js`. Considera apenas os filtros na resolução reduzida: não inclui captura, redução, composição, recortes e lógica JavaScript. Com raio 24 e escala 100%, os filtros medidos reduzem a resolução por 4 em cada eixo. Os Gaussian compartilham a quantidade de passadas e buffers; variar samples muda o kernel. O menor número de leituras do Gaussian 5 não se converteu em menor ocupação de GPU de forma consistente neste ensaio.

A textura fosca usa o tile compartilhado de 64×64 e dispensa captura/filtros do fundo. A distorção sozinha captura o fundo sem pirâmide de blur. Quando blur e distorção estão juntos, a captura é compartilhada: o custo não é a soma de duas capturas independentes. Os resultados não comparam qualidade visual equivalente, energia/autonomia, várias escalas/monitores ou todo o desktop.

## Reprodução e evidências

```sh
/usr/bin/python3 tests/appearance_benchmark.py
```

[Metodologia completa](benchmarks/appearance-1.5.1/method.md) e [resumo com faixas](benchmarks/appearance-1.5.1/summary.json).
As amostras e contadores brutos e a identificação do ambiente estão no
[ZIP de evidências da release 1.6.0](https://github.com/mcdalbu/gnome-shell-extended/releases/download/v1.6.0/gnome-shell-extended-benchmarks-2026-11-15.zip),
na pasta `benchmarks/appearance-1.5.1/`. Esses dados são históricos da 1.5.1.
Os originais permanecem em `validation/appearance-benchmark-1.5.1/`, ignorados pelo Git.

Os contadores seguem a [especificação DRM](https://www.kernel.org/doc/html/latest/gpu/drm-usage-stats.html) e a [implementação xe](https://www.kernel.org/doc/html/latest/gpu/xe/xe-drm-usage-stats.html).

SHA-256 do ZIP medido: `1158626f8faca005b093f0e82dd18c4c18f112021b2c9764b8790ff65a8582dd`.
