# Código reaproveitado

As rotinas em `src/core/render/{signals,frameSignals,blurRedrawGuard,windowDamage,
roundedClip,backdropCapture}.js` e o armazenamento/restauração de perfis em
`src/core/{ptyxis,settingsLauncher,windowSurfaces}.js` são derivados do projeto local GNOME Extended
(https://github.com/mcdalbu/gnome-extended), versão 34.

Os avisos SPDX GPL-2.0-or-later originais foram preservados. Esta distribuição
seleciona GPL versão 3, compatível com a licença GPL-3.0-only do código novo.
Alterações: nomes isolados para evitar colisões GObject, imports reorganizados,
novo esquema, seleção de backend e frequência por capacidade.

Essas rotinas não constituem uma biblioteca EGL nova. O pipeline opcional
GNOME Rounded Blur é uma dependência externa não incluída no ZIP. O backend
nativo usa Shell.BlurEffect fornecido pelo GNOME Shell.

O probe de framebuffer em `tests/frame_probe.py` e `tests/frame-probe.{c,h}`
também deriva do GNOME Extended, sob GPL-2.0-or-later. Ele é compilado em uma
pasta temporária apenas para testes e não é incluído na extensão distribuída.

## Referência do shader de refração (2026-11-14)

`src/core/render/refraction.js` adapta o cálculo de distância, normal e perfil
de lente do shader [LiquidGlass.fx](https://github.com/PedroRuedas/Windows-Liquid-glass/blob/main/src/LiquidGlass/Effects/Shaders/LiquidGlass.fx),
do projeto Windows-Liquid-glass, de Pedro Ruedas (GPL-3.0). A adaptação GLSL/Cogl
usa o fundo já pintado pelo compositor GNOME; não inclui o código de captura
de janelas do Windows, dispersão cromática ou as sombras do shader original.

## Kawase (2026-11-16)

`src/core/render/kawase.js` implementa o princípio de passadas diagonais de
quatro amostras com offsets crescentes, conhecido como Kawase blur.
Referência conceitual: [ARM, Bandwidth-efficient graphics, SIGGRAPH 2015](https://developer.arm.com/cfs-file/__key/communityserver-blogs-components-weblogfiles/00-00-00-20-66/siggraph2015_2D00_mmg_2D00_marius_2D00_notes.pdf).
O código foi escrito para este renderer, sem copiar shaders da referência.
Os offsets são normalizados pela variância do Box existente. Esta versão usa
ping-pong na resolução reduzida; não implementa a cadeia Dual Kawase de
redução/reconstrução em múltiplos níveis descrita na apresentação.

## Fast Gaussian Blur (2026-11-14)

`src/core/render/gaussianKernels.js` e `glassBlur.js` adaptam os pesos e
deslocamentos de `5.glsl`, `9.glsl` e `13.glsl`
do [glsl-fast-gaussian-blur](https://github.com/Experience-Monks/glsl-fast-gaussian-blur),
Copyright (c) 2015 Jam3, sob MIT. A adaptação usa Cogl, filtragem linear,
passadas horizontal/vertical e redução de resolução antes da refração.

O encadeamento progressivo em `gaussianKernels.js`/`glassBlur.js` foi inspirado
em [`amilajack/gaussian-blur`, `src/index.ts`](https://github.com/amilajack/gaussian-blur/blob/master/src/index.ts),
Copyright (c) 2018-present Amila, sob a mesma licença MIT abaixo. Na adaptação,
cada iteração usa um par horizontal/vertical equilibrado, os passos decrescentes
são normalizados pela variância e os dois render targets são reutilizados.
A referência alterna eixos com passos diferentes e usa wrap REPEAT; no Shell,
mantemos CLAMP_TO_EDGE para não trazer pixels da borda oposta do monitor.

> The MIT License (MIT)
> Copyright (c) 2015 Jam3
> Copyright (c) 2018-present Amila
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.
