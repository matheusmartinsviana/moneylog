---
tags: [moneylog, adr, arquitetura, backend]
status: aceito
data: 2026-10-03
task: T1 (plano da Etapa 1)
---

# ADR-004: idioma do código e versão da plataforma do backend

## Contexto

1. **Idioma.** O vault (BE 01) pede um idioma só no código, e os exemplos dele estão em português (`Cliente`, `OrdemServico`). O PR 01 já nomeia as entidades em inglês (`Account`, `CreditCard`, `TransactionInstallment`, `Debt`...), e o D1 (`docs/arquitetura/dominio-financeiro.md`) foi escrito com esses nomes. Misturar os dois idiomas gera nomes como `CriarTransactionUseCase`, que o BE 01 cita como antipadrão de nomenclatura inconsistente. Produto, documentação e usuário são brasileiros (S-27).
2. **Versão do Spring Boot.** O plano (S-28) e o D2 §3.1 sugeriam Spring Boot **3.5.x** por ser "a linha de menor risco", deixando a 4.x para uma ADR. A revisão do plano (achado 🟠 9) apontou que o suporte OSS da 3.5 talvez já tivesse terminado. Conferi a política de suporte em 2026-10-03 (calendário oficial de suporte do Spring Boot, espelhado em endoflife.date/spring-boot, e as versões publicadas no Maven Central):

   | Linha   | Lançamento | Fim do suporte OSS         | Última versão        | Java  |
   | ------- | ---------- | -------------------------- | -------------------- | ----- |
   | 3.5     | 2025-05    | **2026-06-30 (encerrado)** | 3.5.16               | 17–25 |
   | 4.0     | 2025-11    | 2026-12-31                 | 4.0.8                | 17–25 |
   | **4.1** | 2026-06    | **2027-07-31**             | **4.1.1**            | 17–26 |
   | 4.2     | —          | —                          | 4.2.0-M2 (milestone) | —     |

   A 3.5 só recebe correção pública via suporte comercial. Começar uma base nova em out/2026 nessa linha contradiz a própria justificativa de "menor risco".

## Decisão

1. **Identificadores de código em inglês** (classes, métodos, campos, enums, pacotes, tabelas e colunas), seguindo os nomes do PR 01 e do D1. **Documentação, ADRs, planos, mensagens de commit e textos de produto em português.** Exceções em português são permitidas onde o leitor é o time:
   - nomes de métodos de teste e `@DisplayName` (BE 07: `deveCriarConta`, "deve rejeitar conta sem nome");
   - factories de teste no padrão `umX()`/`umaX()` (BE 07);
   - mensagens das exceções de domínio (são para log e diagnóstico; a API devolve o `code` estável em inglês, ex.: `ACCOUNT_ARCHIVED`, e o front traduz).
2. **Spring Boot 4.1.1** (linha 4.1, a estável mais recente com suporte OSS até 2027-07-31, compatível com Java 21), em vez da 3.5.x prevista em S-28. A 4.0 foi descartada porque o suporte dela acaba em 2026-12, antes do fim previsto do MVP; a 4.2 ainda é milestone.
3. **Java 21** (LTS), exigido pelo `maven-enforcer-plugin` (`[21,22)`), com Maven 3.9.16 via wrapper.

## Consequências

- O código lê como o glossário do D1 §7 (`Account` = conta, `Debt` = "me devem/eu devo"), e o glossário passa a ser a ponte entre o código e o produto.
- Os testes ficam legíveis em português no relatório do Maven (`@DisplayName`), sem misturar idiomas nos identificadores de produção.
- Spring Boot 4 traz mudanças que afetam o restante da Etapa 2 e que já estão refletidas no `pom.xml`:
  - starters modulares: `spring-boot-starter-webmvc` (no lugar de `-web`), `spring-boot-starter-flyway` (sem ele o Flyway não é autoconfigurado), `spring-boot-starter-webmvc-test` para `@AutoConfigureMockMvc` (pacote `org.springframework.boot.webmvc.test.autoconfigure`);
  - **Jackson 3** (`tools.jackson..`): a regra do ArchUnit proíbe tanto `com.fasterxml..` quanto `tools.jackson..` no core;
  - **Testcontainers 2** (`org.testcontainers:testcontainers-postgresql`, classe `org.testcontainers.postgresql.PostgreSQLContainer`);
  - springdoc precisa da linha **3.x** (compatível com Boot 4) quando o OpenAPI entrar na Etapa 2.
- Os probes `liveness`/`readiness` do actuator foram desligados (`management.endpoint.health.probes.enabled=false`) para o health responder só `{"status":"UP"}` (T1 CA3). Se a topologia de deploy (ADR-005) precisar deles, basta religar.
- A 4.1 sai do suporte OSS em 2027-07: o upgrade para a linha seguinte entra no planejamento antes disso (FE 08/BE 08: atualização coordenada).

## Alternativas consideradas

| Alternativa                                     | Por que não                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| Código em português (como os exemplos do vault) | conflita com os nomes do PR 01/D1 e mistura idiomas com as libs e o Spring |
| Spring Boot 3.5.16                              | fim do suporte OSS em 2026-06-30, sem patches públicos de segurança        |
| Spring Boot 4.0.8                               | suporte OSS termina em 2026-12-31, daqui a 3 meses                         |
| Spring Boot 4.2.0-M2                            | milestone, não é release estável                                           |
