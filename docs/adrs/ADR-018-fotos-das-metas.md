# ADR-018: fotos das metas de sonho e meta em destaque

Status: aceita (2026-10-09). Decisões do dono P1 a P9. Contrato 2.19.0. Migração V8.16. (O plano cita "ADR-017"; esse número já pertence à competência de renda, então esta é a ADR-018.)

## Contexto
O dono quer cadastrar um sonho (um bem, com preço e várias fotos), marcá-lo como destaque e ver as fotos na Home. A meta continua sendo `Goal.kind = SAVINGS` (ADR-016: prazo, plano, ações consistentes); só ganha mídia. Fotos são dado pessoal e entram por upload do cliente, que não é confiável.

## Decisão
1. **Modelo.** Sem novo `kind`. `Goal` ganha `featured`, `coverPhotoId` e `photos[]` (só metadados: `id, position, width, height, createdAt`). Só `SAVINGS` tem fotos e destaque (`422 GOAL_PHOTOS_KIND_NOT_SUPPORTED`, `422 GOAL_FEATURED_KIND_NOT_SUPPORTED`). A capa é a primeira da lista. Cálculo financeiro (progresso, ritmo, estágio, consistência) não muda e continua só no backend.
2. **Destaque.** Uma só meta em destaque por usuário: índice único parcial `uq_goals_user_featured ON goals (user_id) WHERE featured`, mais `CHECK` (só `SAVINGS` ativa). Marcar outra move o destaque na mesma transação (a anterior é gravada antes), sob um advisory lock por usuário (`lockUserMedia`) para duas requisições concorrentes não violarem o índice. Arquivar limpa o destaque; meta arquivada não é destacada (`GOAL_ARCHIVED`). `GET /v1/goals?featured=true|false` filtra.
3. **Armazenamento.** Os bytes ficam no Postgres (`bytea`) em tabela **separada** dos metadados (`goal_photos` sem bytes; `goal_photo_blobs` com `display` e `thumbnail`), atrás da porta `PhotoStorage` (`core/goal/app/gateways`), adaptador `DbPhotoStorage` (`infra/goal/gateways`). Listar ou ler uma meta nunca toca a tabela de bytes; a rota de conteúdo seleciona só a coluna da variante, juntando por usuário e meta. Motivos: o `pg_dump` (T176) e o snapshot do RDS (ADR-005) já cobrem as fotos, restauração consistente com a meta, zero infraestrutura nova. Um adaptador S3/R2 entra no lugar sem mexer no core (passar de ~1 GB). `ON DELETE CASCADE` liga bytes a metadados e metadados à meta. Filesystem foi descartado (fora do dump, sem atomicidade).
4. **Limites** (`moneylog.goals.photos.*`): 8 fotos por meta, 40 por usuário, 40 MB por usuário (exibição + miniatura), arquivo de até 8 MB, 24 megapixels e 8000 px no maior lado, 30 envios por minuto por usuário. Só JPEG e PNG.
5. **Pipeline de imagem** (`core/goal/photo/PhotoImagePipeline`, Java puro, só `ImageIO` da JDK): (a) tamanho; (b) **magic bytes** (nome, extensão e MIME do cliente nunca entram; o nome do arquivo é ignorado, então não há path traversal por construção); (c) dimensões lidas do **cabeçalho** (`ImageReader.getWidth/getHeight`, que só lê SOF/IHDR) e comparadas com os tetos **antes de decodificar** (anti decompression bomb); (d) decodificação uma por vez (`Semaphore(1)`, instância pequena), com subamostragem na leitura quando a imagem tem mais que o dobro da exibição, e qualquer aviso do decodificador (arquivo truncado) é imagem inválida; (e) orientação EXIF aplicada e descartada; (f) **recodificação sempre** em JPEG (q 0,82) sem metadados: sem EXIF/GPS, sem payload anexado, sem polyglot; PNG com transparência é achatado sobre fundo branco; imagens nunca são ampliadas. Saem a exibição (até 1280 px) e a miniatura (até 320 px); o original não é guardado. Streams em memória (nada de arquivo temporário do `ImageIO`).
6. **Entrega.** `GET /v1/goals/{id}/photos/{photoId}/content?variant=thumb|display` por rota protegida com **Bearer** (sem URL assinada e sem token na query). Cabeçalhos: `Content-Type: image/jpeg` fixo, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`. Foto de outra meta ou de outro usuário: `404 GOAL_PHOTO_NOT_FOUND` (mesma resposta de inexistente). O front busca como `Blob` com o interceptor e cria um object URL.
7. **Upload idempotente.** `Idempotency-Key` opcional (escopo `POST /v1/goals/{id}/photos`, 24 h); o hash do comando é meta + SHA-256 do arquivo. Mesmo arquivo: mesma foto, uma só linha; outro arquivo: `409 IDEMPOTENCY_KEY_REUSED`.
8. **Privacidade.** Foto é dado pessoal: nunca em log (o log leva só ids e tamanho; o comando de envio sobrescreve `toString` sem os bytes), nunca enviada à `AIService`, fora do contexto de IA e das notificações. Entra no `pg_dump`; **não** entra no vault Markdown (ADR-009) nem no backup JSON.
9. **Cache.** Nada é cacheado fora da memória do app: `no-store` no servidor e `ngsw-config.json` sem `dataGroups` (verificação pelo front, T263).

## Alternativas recusadas
- Novo `kind` para o sonho: duplicaria listas, notificações e projeções sem ganho.
- Bytes na mesma linha dos metadados: toda leitura de meta arrastaria `bytea`.
- Guardar o original: mais espaço, EXIF/GPS e conteúdo não confiável persistidos.
- URL assinada ou token na query: token em log e histórico.
- Biblioteca de imagem de terceiros (Thumbnailator, TwelveMonkeys): superfície nova sem necessidade; HEIC/WebP fora do escopo (o seletor do iOS converte).

## Consequências e limites
- Cada foto custa ~100 a 250 KB (exibição) + ~15 KB (miniatura): 40 MB por usuário limitam o crescimento do banco e do dump.
- Decodificar imagem é CPU e heap: semáforo de 1, teto de megapixels e rate limit protegem o `t3.micro`. O heap de pico de uma imagem de 24 MP é da ordem de dezenas de MB graças à subamostragem.
- JPEG CMYK/YCCK e arquivos que o decodificador sinaliza com aviso são recusados como inválidos (rigor deliberado).
- O contador de rate limit é em memória (uma instância), como o do login e da exportação.
- Os bytes são gravados na mesma transação dos metadados; um adaptador de object storage futuro precisará gravar depois do commit e limpar órfãos.
- ADR-005 ganha a nota de que as fotos passam a morar no RDS. Backup JSON não leva `featured` nem fotos (pendência já registrada na ADR-016).
