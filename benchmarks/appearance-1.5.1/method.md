# Método — comparação de aparência 1.5.1, 15/11/2026

Compositor: GNOME Shell/Mutter 51.1. CPU: Intel Core Ultra 7 256V; GPU integrada Intel Arc 130V/140V (PCI 8086:64a0), driver xe; Fedora/kernel 7.3.3-300.fc45.x86_64. Identificação completa, pacote e SHA-256 em method.json.

A versão medida é o ZIP publicado 1.5.1, revisão interna 21. Cada caso/repetição extrai esse pacote em diretórios XDG temporários, inicia um D-Bus e um GNOME Shell Wayland headless privados com GPU real. Não usa nem configura a extensão da sessão principal. O helper de Eval existe somente no barramento privado.

Monitor virtual 1440×1000, escala 100%, alvo aproximadamente 60 Hz. Fundo com 38 faixas coloridas de 40 pixels; uma timeline move o conjunto 80 pixels por segundo. Duas superfícies sintéticas usam o caminho real SurfaceBinding/TintSurface/Surface do módulo de docks: uma de 1000×96 em (220,860), outra de 520×540 em (880,100). A soma da área visível é 376.800 pixels (26,2% do monitor). Não são o dock real com seus aplicativos nem um menu completo: a geometria fixa permite isolar o custo dos efeitos. O padding das capturas também entra no custo e é registrado em cada JSON.

Todos os casos mantêm opacidade 0,85, tema escuro, raio de blur 24, brilho 0,8 e intensidade de distorção 6. A referência mantém apenas transparência. Os módulos de painel e menus estão desabilitados em todos os casos, para comparar somente as duas superfícies. São 11 configurações: transparência, textura fosca, refração, Box blur e Gaussian 5/9/13, com e sem refração nos quatro métodos de blur.

Três blocos, cada um com as 11 configurações em ordem pseudoaleatória determinística. Compositor novo por amostra. Aquecimento estático de dois segundos e uma coleta de lixo explícita antes de medir, igual em todos os casos; dois segundos de repouso; dois segundos de aquecimento da animação; oito segundos animados; parada e estabilização por um segundo; dois segundos de repouso final. Nenhuma coleta de lixo forçada ou screenshot durante os intervalos medidos. Os ensaios preliminares de smoke não integram os resultados.

CPU: variação de utime+stime do processo GNOME Shell / tempo monotônico; 100% corresponde a um núcleo, não aos oito núcleos do computador. GPU: delta de drm-cycles-rcs / delta de drm-total-cycles-rcs para clientes DRM distintos do processo, sem duplicar descritores. RAM: média VmRSS; memória gráfica residente: soma de drm-resident-* dos clientes distintos, em MiB. Nesta GPU integrada essa memória é compartilhada GTT; não se deve somá-la ao RSS como memória exclusiva. Todos os valores são do compositor privado inteiro, não memória/custo exclusivo da extensão.

Contadores: [DRM client usage stats](https://www.kernel.org/doc/html/latest/gpu/drm-usage-stats.html) e [implementação xe](https://www.kernel.org/doc/html/latest/gpu/xe/xe-drm-usage-stats.html). A atividade de GPU é a ocupação relativa do motor render do compositor medido; não é potência elétrica nem uso total de todos os processos/motores.

Relatar mediana e faixa mínimo–máximo das três repetições. As frequências e caches do sistema não são fixados; diferenças pequenas ou faixas sobrepostas não estabelecem uma classificação confiável. CPU, FPS e repouso são medidas auxiliares. Não mede energia/autonomia, qualidade visual equivalente, múltiplos monitores, escalas fracionárias ou toda a variedade de cenas/aplicativos. A sessão principal pode compartilhar CPU/GPU e introduzir variação de agendamento/frequência.

Reprodução, a partir da raiz do projeto:

```sh
/usr/bin/python3 tests/appearance_benchmark.py
```

O caminho do ZIP pode ser definido por GSE_APPEARANCE_BENCH_PACKAGE; a saída por GSE_APPEARANCE_BENCH_OUTPUT. Os resultados brutos têm uma amostra a cada 0,5 segundo e incluem a configuração efetiva, geometrias, capturas, filtros e detecção de falha do renderer.
