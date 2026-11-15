# Box versus Fast Gaussian com 3 e 4 iterações

Benchmark de 15/11/2026, versão **1.6.0**, revisão interna 23. Intel Core Ultra 7 256V, GPU integrada Intel Arc 130V/140V, driver xe, GNOME Shell/Mutter 51.1.

**Resultado: uso de GPU próximo entre as três configurações nesta cena.** As medianas diferem menos de 0,3 ponto percentual e as faixas mínimo–máximo se sobrepõem. CPU e memória também não estabelecem um vencedor consistente pelas faixas observadas.

São cinco repetições por caso, com um compositor privado novo em cada uma e ordem alternada. Fast Gaussian fixado em **13 samples**, raio 24, brilho 0,8, opacidade 0,85, distorção e textura fosca desligadas. As opções 3 e 4 são **iterações do controle da extensão**, cada uma com um par horizontal/vertical: seis e oito passadas de filtro. Box mantém três pares, ou seis passadas.

Monitor virtual 1440×1000 a 100%. Mesma cena do ensaio anterior: fundo de faixas em movimento sob duas superfícies sintéticas de 1000×96 e 520×540. Aquecimento animado de quatro segundos, seguido por doze segundos medidos. Isso compara o renderer compartilhado dessas superfícies; não todo o desktop ou o papel de parede do Overview.

Valores são do **processo GNOME Shell privado inteiro**, não custo exclusivo da extensão. GPU significa ocupação do motor render RCS pelos contadores DRM, não watts ou uso total da GPU por todos os processos. CPU: 100% é um núcleo. RAM: VmRSS, incluindo páginas compartilhadas. Números abaixo são medianas; intervalos são mínimo–máximo das cinco repetições.

| Método | Passadas de filtro H/V | GPU % (faixa) | CPU % de 1 núcleo (faixa) | RAM MiB (faixa) | Memória gráfica MiB (faixa) | FPS mediano |
|---|---:|---:|---:|---:|---:|---:|
| Box blur | 6 | 8.65 (4.91–8.97) | 19.16 (10.91–23.15) | 248.38 (247.74–252.16) | 297.40 (297.33–311.17) | 59.98 |
| Fast Gaussian — 3 iterações | 6 | 8.81 (5.62–8.93) | 17.99 (13.66–23.24) | 248.07 (247.38–249.11) | 297.40 (297.38–311.25) | 59.98 |
| Fast Gaussian — 4 iterações | 8 | 8.92 (5.22–9.20) | 15.00 (12.08–20.57) | 247.27 (245.51–251.35) | 297.45 (297.32–318.06) | 59.99 |

Todos os ensaios ficaram entre 59.89 e 60.06 FPS. Nas 30 janelas de repouso de dois segundos, houve zero frames e zero atividade de GPU medida. Nenhuma falha do renderer foi encontrada. A contagem real das passadas foi conferida em um frame diagnóstico **depois** do intervalo ativo, sem instrumentação durante a medição.

A CPU teve variação ampla. A mediana menor do Gaussian 4 não demonstra que acrescentar passadas economiza CPU: as faixas se sobrepõem e as frequências do sistema não foram fixadas. As leituras medianas de `cur_freq` da GPU por amostra variaram de 550 a 1800 MHz. Por isso, diferenças pequenas não devem ser tratadas como vantagem garantida ou economia de energia.

A memória gráfica mediana ficou em aproximadamente **297,4 MiB** nos três casos. Nesta GPU integrada é GTT compartilhada; não deve ser somada ao RSS como memória exclusiva. Houve picos por buffers auxiliares em alguns ensaios, registrados em `info.buffers`; as iterações reutilizam os mesmos render targets, sem alocar um novo par por passada.

## Trabalho do filtro

| Método | Passadas H/V | Leituras lineares somadas por pixel filtrado |
|---|---:|---:|
| Box blur | 6 | 54 |
| Gaussian 13 samples, 3 iterações | 6 | 42 |
| Gaussian 13 samples, 4 iterações | 8 | 56 |

Contagem derivada de `glassBlur.js` e `gaussianKernels.js`, apenas para os filtros na resolução reduzida. Há mais duas passadas de redução comuns aos três casos, além da captura e composição; esses custos não estão na coluna de leituras. A redução foi de quatro em cada eixo em todas as amostras. O teste não mede qualidade visual equivalente nem tempo isolado de cada etapa do pipeline.

As variantes atuais usam passos progressivamente menores com normalização da variância. Não comparar os números absolutos com o teste da 1.5.1: o Gaussian daquela versão usava apenas um par H/V e o aquecimento/duração também eram diferentes. O Box foi medido novamente na mesma versão e nas mesmas condições dos dois Gaussian.

## Reprodução e evidências

```sh
GSE_APPEARANCE_BENCH_PROFILE=iterations /usr/bin/python3 tests/appearance_benchmark.py
```

[Método completo](benchmarks/gaussian-iterations-1.6.0/method.md) e [resumo com faixas](benchmarks/gaussian-iterations-1.6.0/summary.json).
As amostras e contadores brutos, identificação do ambiente e cópias dos coletores usados estão no
[ZIP de evidências da release 1.6.0](https://github.com/mcdalbu/gnome-shell-extended/releases/download/v1.6.0/gnome-shell-extended-benchmarks-2026-11-15.zip),
na pasta `benchmarks/gaussian-iterations-1.6.0/`. O checksum acompanha o ZIP na release.
Os arquivos originais permanecem em `validation/gaussian-iterations-benchmark-1.6.0/`, ignorados pelo Git.

A coleta diagnóstica inicial foi descartada: o parser de memória precisava normalizar KiB/MiB e o contador de passadas incluía um buffer auxiliar inativo. O ensaio final inteiro foi repetido com o parser corrigido e contagem apenas dos filtros do framebuffer apresentado. Os 15 resultados acima pertencem somente à coleta corrigida.

Os contadores seguem a [especificação DRM](https://www.kernel.org/doc/html/latest/gpu/drm-usage-stats.html) e a [implementação xe](https://www.kernel.org/doc/html/latest/gpu/xe/xe-drm-usage-stats.html).

SHA-256 do ZIP medido: `e9118ee72ef2b0d78b093b6dcda1fce65ecc0ffc19c1721e97931b9addd27057`.
