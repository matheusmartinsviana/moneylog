---
tags: [moneylog, plano, metas, fotos, home]
data: 2026-10-15
tasks: T254 a T264
status: aguardando respostas das perguntas P1 a P9 (recomendações já assumidas no plano)
---

# Plano: metas de sonho (bem com preço e fotos) e slider na Home

Todos os exemplos são sintéticos (ex.: "Carro de exemplo", preço 10000.00). Nenhuma foto real entra no repositório, no demo ou nos testes.

## 1. Objetivo

Permitir cadastrar uma meta de sonho (um bem, com preço e várias fotos), marcá-la como destaque e mostrar na Home um slider automático e acessível das fotos, mantendo a meta dentro do conceito existente (prazo → plano → ações consistentes, ADR-016).

## 2. Escopo

Entra: fotos por meta `SAVINGS`; `featured`; upload/ordem/capa/remoção; leitura autenticada; slider na Home; galeria na tela da meta; backup/demo.
Não entra (MVP): edição/recorte de imagem, legenda por foto, vídeo, compartilhar, foto em metas `DEBT_PAYOFF`/`METRIC`, links/anotações novos no bem (ver P8), S3 de fotos (a porta já nasce preparada), IA lendo fotos (nunca).

## 3. Decisões de desenho (com base no código atual)

**(a) Modelo.** O sonho é `Goal.kind = SAVINGS` (sem novo `kind`). `target` = preço do bem; reservas em conta, `progress = current ÷ target`, `requiredPace`, estágio, consistência e plano continuam idênticos e calculados no backend (ADR-016). Fotos e `featured` são atributos aditivos da meta, aceitos só em `SAVINGS` (`422 GOAL_PHOTOS_KIND_NOT_SUPPORTED` nos outros). Novo `kind` duplicaria listas, notificações e projeções sem ganho.

**(b) Armazenamento.** Recomendado: **Postgres (`bytea`) em tabela separada** `goal_photo_blobs` (a linha de metadados `goal_photos` nunca carrega bytes; leitura do blob só na rota de conteúdo). Motivos: o `pg_dump` do T176 e o snapshot/PITR do RDS (ADR-005) já cobrem as fotos, restauração consistente com a meta, isolamento por `user_id` no mesmo modelo, zero infraestrutura nova no free tier (RDS 20 GB). Atrás da porta `PhotoStorage` (adaptador `DbPhotoStorage` agora; `S3PhotoStorage` possível depois, como `BackupStorage`). Filesystem foi descartado: exige volume, fica fora do `pg_dump` e quebra a atomicidade.
- Só guardamos as versões processadas (display ≤ 1280 px e miniatura ≤ 320 px, JPEG ~q82, ~100-250 KB e ~15 KB). O original não é guardado.
- Limites (configuráveis): 8 fotos por meta; 40 por usuário; 40 MB de fotos por usuário; upload ≤ 8 MB; ≤ 24 megapixels e lado ≤ 8000 px; tipos aceitos JPEG e PNG.
- Validação: magic bytes (JPEG `FFD8FF`, PNG `89504E47...`), nunca o MIME/extensão/nome enviados; dimensões lidas pelo `ImageReader` **antes** de decodificar (anti decompression bomb); decodificar e **re-codificar sempre** (derruba polyglot, payload anexado e EXIF/GPS, pois o `ImageIO` grava sem metadados). Aplicar a orientação EXIF antes de descartá-la (senão fotos de celular giram). PNG com alpha é achatado sobre fundo neutro. Nome do arquivo enviado é ignorado (nunca vira caminho; sem path traversal por construção). Decodificação com semáforo (1 simultânea) por causa do `t3.micro`. Só `ImageIO` da JDK, sem biblioteca nova. Redimensionamento no servidor (o cliente não é confiável).
- Entrega: `GET .../content` por rota protegida com **Bearer**. Como `<img>` não envia header, o front busca com `HttpClient` (interceptor existente) como `Blob` e usa `URL.createObjectURL` (revogado ao destruir), com cache em memória por sessão limpo no logout. Sem URL assinada nem token na query (evita token em log/histórico). Cabeçalhos: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Content-Type: image/jpeg` fixo. Outro usuário ou meta inexistente → `404`.
- Privacidade: fotos são dados pessoais. Nunca em logs (log só id/tamanho), nunca enviadas à `AIService`, fora do contexto de IA e das notificações/push. Ficam fora do ZIP do vault (ADR-009, só Markdown) e fora do backup JSON; o `pg_dump` as inclui (documentar em `docs/operacao/backup.md`). Crescimento do backup limitado pelos 40 MB por usuário.
- Service worker: `ngsw-config.json` não tem `dataGroups` e `/v1/**` não é cacheado; a task T263 transforma isso em verificação (script `check-*`) para que ninguém adicione cache de `/v1/goals/*/photos`.

**(c) Destaque.** `featured` é boolean na meta, **uma só em destaque por usuário** (índice único parcial `WHERE featured`). Marcar outra a move (a anterior é desmarcada na mesma transação). Só meta não arquivada; arquivar limpa o destaque. O slider da Home usa as fotos da meta em destaque, na ordem (capa = posição 0).

## 4. Perguntas em aberto (recomendação já assumida)

| # | Pergunta | Dono | Recomendação |
|---|---|---|---|
| P1 | Uma ou várias metas em destaque? | Produto | Uma (Home sucinta, sem rolagem) |
| P2 | O slider mistura fotos de metas diferentes? | Produto/UX | Não; só a meta em destaque |
| P3 | Limite de fotos | Produto | 8 por meta, 40 por usuário, 40 MB |
| P4 | Onde guardar | Arquitetura | `bytea` no Postgres atrás de `PhotoStorage`; S3 só se passar de ~1 GB |
| P5 | Intervalo padrão do slider | UX | 5 s; configurável por constante (3-10 s) e, se quiser, preferência do usuário depois |
| P6 | Formatos | Produto | JPEG e PNG; HEIC/WebP não (iOS converte para JPEG no seletor); aviso claro no erro |
| P7 | Fotos entram no backup/exportação? | Produto | Backup de banco sim; vault Markdown e backup JSON não |
| P8 | O bem terá link/anotações? | Produto | Não agora; reaproveitar `planNote` (≤ 500) |
| P9 | Meta com foto exige prazo? | Produto | Não; sem prazo = Fantasia, a escada já cobre |

## 5. Contrato de API (aditivo, vira contrato 2.18.0; feito em T254)

Novos campos em `Goal`: `featured: boolean`, `coverPhotoId: uuid|null`, `photos: GoalPhoto[]` (só metadados, ordenados), vazio fora de `SAVINGS`. `GoalPhoto = { id, position, width, height, createdAt }`. `GET /v1/goals` aceita `featured=true`.

| Método e rota | Corpo | Sucesso | Erros |
|---|---|---|---|
| `POST /v1/goals/{id}/photos` | multipart `file`; `Idempotency-Key` opcional (24 h; mesma chave+mesmo arquivo devolve a mesma foto, outro arquivo `409 IDEMPOTENCY_KEY_REUSED`) | `201` `GoalPhoto` + `Location` | `404`; `413/422 GOAL_PHOTO_TOO_LARGE`; `422 GOAL_PHOTO_UNSUPPORTED_TYPE`; `422 GOAL_PHOTO_INVALID_IMAGE`; `422 GOAL_PHOTO_DIMENSIONS_EXCEEDED`; `422 GOAL_PHOTO_LIMIT_REACHED` (meta); `422 GOAL_PHOTO_QUOTA_EXCEEDED` (usuário); `422 GOAL_PHOTOS_KIND_NOT_SUPPORTED`; `429` |
| `GET /v1/goals/{id}/photos/{photoId}/content?variant=thumb\|display` | - | `200` bytes `image/jpeg` | `404`; `400` variante inválida |
| `PUT /v1/goals/{id}/photos/order` | `{ photoIds: [uuid] }` (conjunto exato) | `200` `Goal` | `422 GOAL_PHOTOS_ORDER_MISMATCH` |
| `PUT /v1/goals/{id}/photos/{photoId}/cover` | - | `200` `Goal` (foto vai para posição 0) | `404` |
| `DELETE /v1/goals/{id}/photos/{photoId}` | - | `200` `Goal` | `404` |
| `PUT /v1/goals/{id}/featured` | `{ featured: boolean }` | `200` `Goal` | `404`; `422 GOAL_ARCHIVED` |

Ações devolvem o recurso atualizado (BE 04). Escrita sem `Idempotency-Key` repetida pode duplicar foto; a UI desabilita o botão durante o envio e envia a chave.

## 6. Tasks

**T254 · dev-backend · Contrato 2.18.0 e ADR-017**
Arquivos: `contracts/openapi.yaml` (seção Goals), `docs/adrs/ADR-017-fotos-das-metas.md` (decisões da seção 3). Sem código de produção.
- Dado o contrato, Quando rodar o validador/lint do OpenAPI e `check-api-types`, Então passa e todos os códigos de erro acima estão documentados.
- Dado o ADR, Quando lido, Então registra armazenamento, limites, privacidade e política de cache.
Depende de: aprovação de P1 a P9.

**T255 · dev-backend · Migração e destaque**
Arquivos: `V8.15__goal_photos_and_featured.sql` (`goals.featured`, índice único parcial por usuário, `goal_photos`, `goal_photo_blobs`, FK com `ON DELETE CASCADE`), entidade/repositório/porta `PhotoStorage`/`DbPhotoStorage`, `PUT /featured`, campos no `Goal` e filtro `featured`.
- Dado uma meta A em destaque, Quando marco B, Então B é `featured=true`, A volta a `false` e a resposta traz B.
- Dado uma meta arquivada, Quando marco destaque, Então `422 GOAL_ARCHIVED`; Dado A em destaque, Quando arquivo A, Então `featured=false`.
- Dado o banco vazio, Quando o Flyway roda, Então a migração aplica com `ddl-auto: validate` e uma meta sem fotos devolve `photos: []`.
Depende de: T254.

**T256 · dev-backend · Pipeline de imagem (núcleo puro)**
Arquivos: `core/.../photo/PhotoImagePipeline` + testes (sem Spring).
- Dado um JPEG/PNG sintético gerado no teste, Quando processo, Então saem display (≤ 1280 px) e miniatura (≤ 320 px) em JPEG, proporção preservada.
- Dado um JPEG sintético com EXIF (GPS e orientação 6), Quando processo, Então o resultado não contém EXIF/GPS e está girado conforme a orientação.
- Dado um arquivo `.jpg` com conteúdo de texto, HTML, SVG ou ZIP (magic bytes errados), Então `GOAL_PHOTO_UNSUPPORTED_TYPE`.
- Dado um PNG com cabeçalho declarando dimensões acima de 24 MP e poucos KB (decompression bomb), Então rejeita sem decodificar (heap estável no teste) com `GOAL_PHOTO_DIMENSIONS_EXCEEDED`.
- Dado um JPEG válido com bytes de script/ZIP anexados (polyglot), Então a saída não contém o payload.
- Dado imagem truncada/corrompida, Então `GOAL_PHOTO_INVALID_IMAGE` sem stack trace ao cliente.
Depende de: T254 (códigos de erro). Paralela a T255.

**T257 · dev-backend · Endpoints de fotos**
Arquivos: `infra/.../controller` (multipart), caso de uso de upload/ordem/capa/remoção/conteúdo, `application.yaml` (limites, 8 MB no caso de uso), rate limit de upload, log sem conteúdo.
- Dado `moneylog.goals.photos.max-per-goal=8`, Quando envio a 9ª foto, Então `422 GOAL_PHOTO_LIMIT_REACHED` e nada é gravado.
- Dado o limite de 40 MB do usuário, Quando excede, Então `422 GOAL_PHOTO_QUOTA_EXCEEDED`.
- Dado o nome de arquivo `../../x.jpg`, Quando envio uma imagem válida, Então é aceita e nenhum caminho do nome é usado.
- Dado o usuário B, Quando pede a foto/ordem/remoção de uma meta de A, Então `404` em todas.
- Dado a mesma `Idempotency-Key` e o mesmo arquivo, Quando repito, Então `201/200` com a mesma foto e uma só linha.
- Dado o GET de conteúdo, Então `Cache-Control: no-store`, `nosniff`, `image/jpeg`, e sem token na URL; Dado sem Bearer, Então `401`.
- Dado a ordem com id faltando ou duplicado, Então `422 GOAL_PHOTOS_ORDER_MISMATCH`; Dado remover a capa, Então a próxima vira capa e `coverPhotoId` acompanha.
- Dado um envio, Quando inspeciono os logs do teste, Então não há bytes, nome original nem EXIF.
Depende de: T255, T256.

**T258 · dev-backend · Backup, demo e documentação**
Arquivos: `docs/operacao/backup.md` (fotos vão no `pg_dump`; vault/JSON não), seed do demo com imagens **geradas por `ImageIO`** (gradientes com texto), `backend/README.md`.
- Dado o demo semeado, Quando abro a meta de sonho de exemplo, Então tem 3 fotos sintéticas, preço 10000.00 e destaque; nenhum arquivo binário novo versionado.
- Dado backup e restauração em banco limpo (IT com Testcontainers), Quando restauro, Então as fotos voltam com o mesmo conteúdo (hash).
Depende de: T257.

**T259 · dev-frontend · Tipos e serviço de fotos**
Arquivos: `features/goals/services/goal-photos.service.ts` (+ spec), tipos da API, `check-api-types.mjs` verde.
- Dado uma foto, Quando peço a miniatura, Então o serviço usa `HttpClient` com Bearer, devolve um object URL em cache de memória e o revoga ao liberar.
- Dado o logout, Quando ocorre, Então o cache é limpo e todos os object URLs são revogados.
- Dado upload, Então envia `FormData` com `Idempotency-Key` e trata os códigos de erro com mensagens traduzidas (voz do DS).
Depende de: T257 (para integração real; pode começar com tipos do contrato de T254).

**T260 · dev-frontend · Formulário da meta de sonho e gerenciador de fotos**
Arquivos: `goal-smart-form.page.*` (modo "bem": nome, preço, prazo), componente `goal-photo-manager` (selecionar/arrastar, ordenar por arrastar e por botões subir/descer, capa, remover com confirmação), i18n.
- Dado o formulário, Quando informo nome e preço e salvo, Então cria `SAVINGS` com `target` = preço e depois envia as fotos, mostrando progresso por foto.
- Dado 9 fotos, Então o 9º é recusado antes do envio com a mensagem de limite; Dado um arquivo `.txt`, Então erro claro sem chamar a API.
- Dado teclado apenas, Quando reordeno, Então os botões funcionam e o anúncio `aria-live` informa a nova posição.
- Dado falha no meio dos envios, Então as já enviadas permanecem e há "tentar de novo" só para as que falharam.
Depende de: T259.

**T261 · dev-frontend · Galeria na tela da meta e destaque**
Arquivos: `goal.page.*`, componente `goal-gallery` (capa grande, miniaturas, visualização ampliada com Esc/setas, dimensões fixas, `loading="lazy"`, `decoding="async"`), alternância "Meta em destaque".
- Dado uma meta com fotos, Quando abro, Então vejo a galeria, o progresso (valor reservado ÷ preço, vindo da API) e o estágio na escada, sem cálculo no front.
- Dado ativar destaque, Então a resposta atualiza a tela e a meta anterior deixa de aparecer como destaque.
- Dado meta sem fotos, Então há estado vazio com chamada para adicionar.
Depende de: T259 (e T260 para adicionar).

**T262 · dev-frontend · Slider automático na Home**
Arquivos: `features/home/components/featured-goal` (substitui o placeholder "Meta em destaque"), spec.
- Dado meta em destaque com ≥ 2 fotos, Quando a Home abre, Então avança sozinha a cada 5 s (constante `SLIDER_INTERVAL_MS`) e pré-carrega só a próxima.
- Dado hover, toque ou foco dentro do slider, Então pausa e retoma ao sair; existe botão visível Pausar/Reproduzir (WCAG 2.2.2) com `aria-pressed`.
- Dado `prefers-reduced-motion: reduce`, Então não há autoplay nem transição animada (o usuário navega pelos botões); Dado `prefers-reduced-transparency`, Então sem fundos translúcidos/blur nos controles.
- Dado leitor de tela, Então `aria-live="off"` durante o autoplay e `polite` quando pausado ou navegado manualmente, botões anterior/próximo com rótulo, indicadores como lista de botões com `aria-current`.
- Dado a aba oculta (`visibilitychange`), Então o timer para.
- Dado 1 foto, Então sem controles de slider; Dado nenhuma foto ou falha ao carregar, Então mostra fallback (nome, preço e barra de progresso) sem layout quebrado.
- Dado o layout da Home "cabe sem rolar", Então a faixa ocupa altura/aspecto fixo (sem CLS), no mobile (360 px) e no desktop.
- Dado o progresso exibido, Então vem da API (`progress`, `current`, `target`).
Depende de: T259, T257 (integração).

**T263 · dev-frontend · PWA/offline e guardas**
Arquivos: `ngsw-config.json` (sem cache de `/v1`), novo `scripts/check-photo-cache.mjs` (+ teste) ligado ao `npm run check`.
- Dado o `ngsw-config.json`, Quando o check roda, Então falha se existir `dataGroups` ou asset que case `/v1/**` fotos.
- Dado offline, Quando a Home abre, Então o slider cai no fallback sem erro no console e o resto da Home funciona.
- Dado logout, Então nenhuma foto permanece em memória/Cache Storage.
Depende de: T262.

**T264 · tester · Segurança e ponta a ponta**
Arquivos: ITs/E2E em `backend/src/test` e `docs/qa/`, arquivos sintéticos gerados no teste.
- Dado arquivo falso (texto com `.jpg`), imagem enorme (> 8 MB), pixel-bomb, polyglot, `../` no nome, EXIF com GPS, Quando enviados, Então rejeitados ou higienizados conforme T256/T257, sem 500.
- Dado dois usuários, Quando A tenta ler/alterar fotos de B, Então `404`; Dado o limite por usuário, Então bloqueado.
- Dado o fluxo completo (criar sonho, 3 fotos, reordenar, capa, destaque, Home), Então o slider mostra a ordem e a capa corretas; Dado `pg_dump` + restauração, Então as fotos persistem.
- Dado `npm run check` e a suíte do backend, Então verdes; revisão de logs: sem dados de foto.
Depende de: T258, T263.

## 7. Ordem de execução

1. Respostas de P1 a P9 (usuário). 2. T254 (contrato + ADR). 3. Em paralelo: T255 e T256 (back) e, só tipos/mocks do contrato, início de T259. 4. T257 (após T255+T256). 5. T258 (back) em paralelo com T259 (integração real) → T260 e T261 em paralelo → T262 → T263. 6. T264 por último. Nenhuma task mistura back e front; o front só integra de verdade depois de T257.

## 8. Riscos

- Memória no `t3.micro` ao decodificar imagens grandes: teto de megapixels, semáforo de 1 e teste de heap.
- Crescimento do banco/backup: cotas de 40 MB por usuário e monitoramento; porta `PhotoStorage` permite migrar para S3.
- HEIC do iPhone: rejeitado com mensagem clara (P6); validar no dispositivo real.
- Autoplay e acessibilidade (WCAG 2.2.2, vestibular): mitigado em T262 com pausa visível e `prefers-reduced-motion`.
- Object URLs vazando memória: revogação testada em T259.
- Backup JSON não leva fotos nem os campos novos (já é pendência do ADR-016): documentar.
- ADR necessária: ADR-017 (T254). ADR-005 ganha nota de que fotos entram no RDS.

## Decisões do dono (2026-10-08)
- **P1:** uma só meta em destaque por vez.
- **P2:** o slider não mistura fotos de metas diferentes.
- **P3:** 8 fotos por meta, 40 por usuário e 40 MB por usuário (limites aceitos).
- **P4:** armazenamento em `bytea` no Postgres atrás da abstração `PhotoStorage`; troca futura por object storage (ex.: Cloudflare R2 ou S3) via novo adaptador.
- **P5:** intervalo de 5 s.
- **P6:** só JPEG e PNG (o Safari converte HEIC no seletor de arquivos).
- **P7 a P9:** conforme a recomendação do plano (fotos no `pg_dump`, fora do vault e do backup JSON; sem campos novos no bem; meta com foto não exige prazo).
- **Princípio adicional do dono:** toda meta deve ser criada percorrendo os 4 passos (meta, prazo, plano e ações consistentes); ver `docs/planos/2026-10-15-habitos-e-consistencia.md`.

## Registro de execução do backend (2026-10-09, T254 a T258; T259 do plano é o do front)
- **ADR e contrato:** `docs/adrs/ADR-018-fotos-das-metas.md` (o número 017 já era a competência de renda); `contracts/openapi.yaml` na **2.19.0** (a 2.18.0 já era a competência de renda). `Goal` ganha `featured`, `coverPhotoId`, `photos[]`; `GoalPhoto = {id, position, width, height, createdAt}`; `GET /v1/goals?featured=`; seis rotas novas (upload, content, order, cover, delete, featured).
- **Migração V8.16** (a V8.15 já era a competência de renda): `goals.featured` + índice único parcial por usuário + `CHECK` (SAVINGS ativa); `goal_photos` (sem bytes, posição única adiada, `ON DELETE CASCADE`); `goal_photo_blobs` (`bytea` de exibição e miniatura). Contagens dos testes de migração atualizadas (+1).
- **Porta `PhotoStorage`** (`core/goal/app/gateways`) com `DbPhotoStorage` (Postgres, `infra/goal/gateways`); metadados dentro do agregado `Goal` (como o plano declarado), sincronizados por JDBC em `GoalGatewayImpl`.
- **Pipeline** `core/goal/photo/PhotoImagePipeline` (Java puro): magic bytes, dimensões do cabeçalho antes de decodificar, `Semaphore(1)`, orientação EXIF aplicada, recodificação sempre em JPEG sem metadados, avisos do decodificador = imagem inválida. Streams em memória (sem arquivo temporário).
- **Endpoints:** upload multipart idempotente (hash = meta + SHA-256 do arquivo), conteúdo autenticado (`no-store`, `nosniff`, CSP `sandbox`), reordenar, capa, remover, destaque (marcar move; advisory lock por usuário). Erros: `GOAL_PHOTO_*` 422, `GOAL_PHOTO_NOT_FOUND` 404. Upload acima do teto do container (21 MB) devolve `GOAL_PHOTO_TOO_LARGE` (não o código do vault).
- **Desvios:** (1) `GOAL_PHOTO_TOO_LARGE` é sempre 422 (o plano dizia 413/422); (2) código extra `GOAL_FEATURED_KIND_NOT_SUPPORTED` para destacar meta que não é `SAVINGS`; (3) **não há seed de demo no repositório**, então o item "demo com 3 fotos" ficou como regra no README (gerar com `SyntheticImages`/`ImageIO`); (4) rate limit de 30 envios/min por usuário (em memória).
- **Testes:** `PhotoImagePipelineTest` (11), `GoalPhotosTest` (10), `GoalPhotoUseCasesTest` (9), `GoalPhotosIT` (16: arquivo falso, enorme, pixel-bomb, polyglot, `../` no nome, EXIF/GPS, limites por meta/usuário/MB, isolamento, idempotência, destaque único, 401) e `BackupRestoreIT` estendido (fotos voltam com o mesmo hash). Imagens 100% sintéticas, geradas por código.
- **Pendências:** front (T259 a T263 do plano); backup JSON e vault não levam fotos nem `featured` (decisão P7); HEIC/WebP recusados; validar no iPhone real (JPEG com aviso do decodificador é recusado, por rigor).
