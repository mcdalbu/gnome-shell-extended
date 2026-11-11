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
