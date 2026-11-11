# Validação — Gnome Shell Extended 0.3.0

Data: 11 de novembro de 2026, America/Fortaleza.

## Ambiente

GNOME Shell/Mutter 51.1 (Fedora 45), GJS 1.90.1, Wayland headless, GBM/EGL com
driver xe. D-Bus, configurações e extensões de teste ficam em diretórios XDG
privados. A sessão de trabalho do usuário não foi modificada.

`make test` valida 27 módulos ESModule, metadata, esquema estrito, 44 opções
GSettings, lifecycle/imports assíncronos, descarte de recursos, restauração de
CSS/launcher do Configurações e perfis Ptyxis.

## Regressões verificadas

Evidências: `validation/regressions-results.json` e
`validation/regressions-multi-results.json`, ambos com `passed: true`.

| Cenário | Resultado |
| --- | --- |
| Dock real | Dash to Dock Extended 32 do repositório local, copiado somente para a sessão de teste |
| Intellihide com janela maximizada | Três ciclos de retorno por ponteiro virtual e recolhimento, em cada sessão |
| Dock oculto mas ainda mapeado | Clip vazio oculta o grupo de blur; remover o clip o restaura |
| Detecção sob o ponteiro | Backdrop não intercepta o teste com `PickMode.ALL` |
| Captura de tela real | Redução de contraste da textura atrás dos controles, confirmando blur visível |
| Janelas | Capturas criadas para Configurações, mantidas imediatamente atrás da janela; barra lateral inspecionada visualmente com blur |
| Painel | Alteração de claro/escuro sem reiniciar a extensão; botões usam cor de primeiro plano escura no esquema claro |
| Escala | Uma view a 100% e duas views a 125%/150%, confirmadas pelo compositor |
| Preferências | Seis páginas e 44 controles com leitura/escrita |
| Limpeza | Estilos, capturas e launcher restaurados; 10 ciclos enable/disable por sessão |
| Repouso | 0 frames novos na amostra de 0,5 segundo após estabilização |

A captura de tela foi comparada com raio 48 e raio zero, mantendo a mesma
transparência. O desvio de cor na faixa testada caiu de **19,10 para 2,81** em
100% e de **19,06 para 12,22** na configuração de escalas mistas. Os valores
são específicos dessas cenas, não um benchmark geral de qualidade.

A barra lateral transparente do Configurações foi comparada sobre duas cenas;
a região de conteúdo opaco manteve diferença média **0,00**. A opacidade do
ator da janela permaneceu 255. A imagem da barra lateral foi inspecionada para
confirmar que as faixas do fundo aparecem desfocadas e os controles permanecem
nítidos. A ordem dos backdrops também é atualizada quando outro ator é inserido
na pilha de janelas.

Calendário, configurações rápidas, menus, notificações, diálogos, pastas,
ambos os switchers, OSD e ferramenta de captura foram abertos durante as sessões.
A seleção de backend opcional e o limite por capacidade continuaram passando.
A biblioteca opcional presente era gnome-rounded-blur 1.0.2-4.local; o backend
nativo foi usado nos testes de renderização citados. O fallback por ausência de
namespace já havia sido verificado na versão 0.2.0.

## Limites

Não foram executados GNOME 45–50, Ubuntu Dock, Dash to Dock upstream ou
lock/unlock com autenticação real. O teste de bloqueio usa uma fixture de
papel de parede. Nautilus/menus GTK ainda precisam de matriz por versão; Ptyxis
foi verificado pela API de perfis em memória. Não há medição comparativa de
CPU/RAM/GPU nem teste de longa duração. A ausência de frames em repouso não
constitui medição de economia de recursos.

## Reproduzir

```sh
make test
make build
env GSE_TEST_REGRESSIONS=1 /usr/bin/python3 tests/headless.py
env GSE_TEST_REGRESSIONS=1 GSE_TEST_MULTI=1 /usr/bin/python3 tests/headless.py
make zip
```

Os testes com dock real usam a pasta irmã `dash-to-dock-extended/` e compilam
seu esquema somente na cópia temporária. Cantos ativos são desligados nessa
sessão para que a posição inicial (0,0) do ponteiro virtual não abra o Overview.
O helper Eval, o dock e as fixtures não são incluídos no ZIP de distribuição.
