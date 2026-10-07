# Checklist manual: baixar e compartilhar arquivos no iPhone (Safari e PWA instalado)

**Estado: PENDENTE. Nada deste checklist foi executado.** O ambiente de desenvolvimento não tem iPhone nem simulador iOS; os testes automáticos (Vitest, Playwright Chromium e WebKit desktop) provam a lógica da tela (o arquivo só é salvo num clique, o toast só aparece na ação final, o `ObjectURL` é revogado), mas **não** provam o comportamento do iOS. Este checklist existe porque o risco da revisão A2 (a página navegar para o `blob:` sem barra de volta, no PWA instalado) só se confirma num aparelho real.

Origem: revisão de código da Etapa 5 (frontend), achado A2; suposição FE-S-168. Telas: Configurações, "Seus dados" (`/settings`).

## Fluxo implementado (o que se espera ver)

1. Tocar em **Exportar movimentações (CSV)** ou **Baixar backup**: aparece "Preparando..." e depois o cartão **Arquivo pronto** com o nome do arquivo. **Nada é salvo nem aberto sozinho**, e **não há** mensagem de sucesso ainda.
2. Tocar em **Salvar**: o iOS inicia o download (Safari: ícone de downloads; PWA: folha do sistema, se houver). Só então aparece o aviso "Download de ... iniciado".
3. Se o aparelho suporta compartilhar arquivos, aparece **Compartilhar**: abre a folha do sistema; o aviso "Arquivo ... compartilhado" só aparece se o compartilhamento concluir (cancelar não mostra nada).
4. **Fechar** some com o cartão.

## Preparação

- [ ] iPhone com iOS atual e, se possível, um segundo com iOS uma versão anterior. Anotar modelo e versão: ______
- [ ] Ambiente servido por HTTPS (produção ou túnel), com uma conta com movimentações.
- [ ] Safari: abrir o app numa aba normal. PWA: "Adicionar à Tela de Início" e abrir pelo ícone (modo standalone).
- [ ] Instalar uma versão limpa do PWA (remover e reinstalar) antes da rodada do PWA.

## Casos (repetir em Safari e em PWA instalado; marcar OK/FALHA e anotar)

| #   | Caso                                                                                           | Esperado                                                                                                                                       | Safari | PWA |
| --- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --- |
| 1   | Exportar CSV sem datas, esperar o cartão                                                       | Cartão "Arquivo pronto" com o nome; **nenhum** download, navegação ou toast sozinho                                                            |        |     |
| 2   | Tocar em **Salvar** (CSV)                                                                      | Download inicia; o app **continua na tela de Configurações** (sem abrir o arquivo na janela do app, sem tela em branco/visualizador sem volta) |        |     |
| 3   | Achar o arquivo salvo (Arquivos > Downloads, ou folha do sistema) e abrir                      | CSV abre; acentos corretos (BOM UTF-8); separador `;`                                                                                          |        |     |
| 4   | Tocar em **Compartilhar** (CSV) e escolher "Salvar em Arquivos"                                | Folha do sistema abre, arquivo salva; só então o aviso "compartilhado"                                                                         |        |     |
| 5   | Tocar em **Compartilhar** e **cancelar** a folha                                               | Nenhum aviso de sucesso; o cartão continua; dá para tocar em Salvar                                                                            |        |     |
| 6   | Exportar o **backup** e **Salvar**                                                             | Mesmo comportamento do caso 2; arquivo `.json` abre e traz o aviso de privacidade visível antes                                                |        |     |
| 7   | Compartilhar o backup por AirDrop ou Mensagens                                                 | Arquivo chega com o nome `moneylog-backup...json`                                                                                              |        |     |
| 8   | Salvar duas vezes seguidas o mesmo arquivo                                                     | Segundo download funciona (o link ainda é válido) ou o iOS pergunta; **sem** tela de erro                                                      |        |     |
| 9   | Exportar de novo com o cartão aberto                                                           | O cartão passa a mostrar o arquivo novo; Salvar baixa o novo                                                                                   |        |     |
| 10  | Tocar em **Fechar** e depois navegar para outra tela                                           | Sem travamento; (opcional, Web Inspector) sem `blob:` pendente                                                                                 |        |     |
| 11  | Exportar com o idioma em **Español**                                                           | Aparece a nota "O cabeçalho do CSV ainda não existe neste idioma"; CSV com cabeçalho em português                                              |        |     |
| 12  | Com **modo avião**, exportar                                                                   | Mensagem de rede com "Tentar de novo"; **nenhum** cartão "Arquivo pronto"                                                                      |        |     |
| 13  | PWA: com o cartão pronto, mandar o app para segundo plano (voltar à tela de início) e retornar | Cartão ainda lá ou refeito sem erro; **Salvar** continua funcionando                                                                           |        |     |
| 14  | PWA: depois de Salvar, a barra/gesto de voltar do sistema                                      | O app **não** ficou preso num `blob:`; é possível voltar ao app                                                                                |        |     |
| 15  | Rotação do aparelho e fonte grande (Texto maior)                                               | Cartão e botões legíveis, sem scroll horizontal                                                                                                |        |     |
| 16  | VoiceOver ligado                                                                               | O texto "Arquivo ... está pronto" é anunciado; Salvar/Compartilhar/Fechar têm nome e são alcançáveis                                           |        |     |

## Critério de aceite (antes do merge)

- Casos 2, 4, 6 e 14 **OK no Safari e no PWA instalado**. Se o caso 2 ou 14 falhar no PWA: **bloqueia o merge** (o backup é a saída dos dados do usuário). Alternativa a avaliar com a Arquitetura: no iOS standalone oferecer só **Compartilhar** (folha do sistema) e esconder Salvar.
- Qualquer falha: anotar versão do iOS, modo (Safari/PWA), passos e o que apareceu na tela; abrir bug em `docs/qa/` e devolver ao `dev-frontend`.

## Registro

- Executado por: ______ em ______ (iOS ____, modelo ____)
- Resultado: ______
- Observações: ______
