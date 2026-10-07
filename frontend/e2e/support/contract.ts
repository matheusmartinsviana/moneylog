import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

/**
 * Validação ajv das requisições e respostas reais de `/v1` contra `contracts/openapi.yaml` (T44 CA5).
 * O contrato é OpenAPI 3.1 (S-84): os schemas são JSON Schema 2020-12, então o `ajv/dist/2020` os lê
 * direto, com `$ref` interno resolvido por ponteiro (`openapi#/components/...`). A falha lista a
 * operação, o status e o caminho do erro.
 */
interface OpenApi {
  paths: Record<string, Record<string, Operation>>;
  components: Record<string, Record<string, unknown>>;
}
interface Operation {
  operationId: string;
  requestBody?: { content?: Record<string, { schema?: unknown }> };
  responses: Record<string, unknown>;
}

const CONTRACT = resolve(__dirname, '..', '..', '..', 'contracts', 'openapi.yaml');
const METHODS = ['get', 'post', 'put', 'delete', 'patch'];

const spec = parse(readFileSync(CONTRACT, 'utf8')) as OpenApi;

const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: true });
addFormats(ajv);
// O `format: int64` e os formatos próprios do OpenAPI não existem no ajv-formats.
for (const f of ['int32', 'int64', 'double', 'float']) ajv.addFormat(f, true);
ajv.addSchema(spec as object, 'openapi');

const routes = Object.entries(spec.paths).map(([template, item]) => ({
  template,
  regex: new RegExp(
    '^' + template.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+') + '/?$',
  ),
  item,
}));

const pointer = (...parts: string[]): string =>
  parts.map((p) => p.replace(/~/g, '~0').replace(/\//g, '~1')).join('/');

export interface OperationRef {
  template: string;
  method: string;
  operationId: string;
  base: string;
}

/** Acha a operação do contrato para `método + caminho` (sem query). `null` se o contrato não a declara. */
export function findOperation(method: string, path: string): OperationRef | null {
  const m = method.toLowerCase();
  if (!METHODS.includes(m)) return null;
  // O contrato declara `/v1/auth/login` como literal e `/v1/accounts/{id}` como template: literais antes.
  const sorted = [...routes].sort(
    (a, b) => Number(b.template.includes('{')) - Number(a.template.includes('{')),
  );
  const hit = sorted
    .filter((r) => r.regex.test(path))
    .sort((a, b) => a.template.split('{').length - b.template.split('{').length)[0];
  const op = hit?.item[m];
  if (!hit || !op) return null;
  return {
    template: hit.template,
    method: m,
    operationId: op.operationId,
    base: `/paths/${pointer(hit.template)}/${m}`,
  };
}

const validators = new Map<string, ReturnType<typeof ajv.compile> | null>();

function compiled(ptr: string, resolveRef: boolean) {
  const key = `${ptr}|${resolveRef}`;
  if (validators.has(key)) return validators.get(key) ?? null;
  const validate = ajv.compile({ $ref: `openapi#${ptr}` });
  validators.set(key, validate);
  return validate;
}

const NON_JSON_BODY = 'NON_JSON_BODY';

/** Ponteiro do schema JSON de uma resposta (segue o `$ref` da resposta, ex.: `components/responses/NotFound`). */
function responseSchemaPointer(op: OperationRef, status: number): string | null {
  const operation = spec.paths[op.template]?.[op.method];
  const response = (operation?.responses[String(status)] ?? operation?.responses['default']) as
    { $ref?: string; content?: Record<string, { schema?: unknown }> } | undefined;
  if (!response) return null;
  let base = `${op.base}/responses/${status}`;
  let resolved = response;
  if (response.$ref) {
    base = response.$ref.replace(/^#/, '');
    resolved = base
      .split('/')
      .slice(1)
      .reduce<unknown>(
        (node, key) => (node as Record<string, unknown>)[unescapeKey(key)],
        spec,
      ) as typeof response;
  }
  const content = resolved.content ?? {};
  const media = Object.keys(content).find((m) => m.includes('json'));
  // Corpo declarado, mas não JSON (ex.: `text/csv` do export): a validação de schema não se aplica.
  if (!media && Object.keys(content).length > 0) return NON_JSON_BODY;
  if (!media || !content[media]?.schema) return null;
  return `${base}/content/${pointer(media)}/schema`;
}

const unescapeKey = (k: string): string => k.replace(/~1/g, '/').replace(/~0/g, '~');

export interface ContractFailure {
  where: string;
  detail: string;
}

/** Valida o corpo de uma resposta. Devolve as falhas (vazio = ok). */
export function validateResponse(
  method: string,
  path: string,
  status: number,
  body: unknown,
  hasBody: boolean,
): ContractFailure[] {
  const op = findOperation(method, path);
  const where = `${method.toUpperCase()} ${path} -> ${status}`;
  if (!op) return [{ where, detail: 'operação não declarada em contracts/openapi.yaml' }];
  const operation = spec.paths[op.template]?.[op.method];
  if (!operation?.responses[String(status)] && !operation?.responses['default']) {
    return [{ where, detail: `status ${status} não declarado para ${op.operationId}` }];
  }
  const ptr = responseSchemaPointer(op, status);
  if (!ptr) {
    // Resposta sem corpo (204): precisa vir sem corpo.
    return hasBody ? [{ where, detail: `${op.operationId} não declara corpo para ${status}` }] : [];
  }
  if (ptr === NON_JSON_BODY) return [];
  const validate = compiled(ptr, false);
  if (!validate) return [];
  if (validate(body)) return [];
  return (validate.errors ?? []).map((e) => ({
    where: `${where} (${op.operationId})`,
    detail: `${e.instancePath || '/'} ${e.message ?? ''} ${JSON.stringify(e.params)}`,
  }));
}

/** Valida o corpo JSON de uma requisição. */
export function validateRequest(method: string, path: string, body: unknown): ContractFailure[] {
  const op = findOperation(method, path);
  const where = `${method.toUpperCase()} ${path} (requisição)`;
  if (!op) return [{ where, detail: 'operação não declarada em contracts/openapi.yaml' }];
  const operation = spec.paths[op.template]?.[op.method];
  const content = operation?.requestBody?.content;
  const media = content ? Object.keys(content).find((m) => m.includes('json')) : undefined;
  if (!media || !content?.[media]?.schema) return [];
  const ptr = `${op.base}/requestBody/content/${pointer(media)}/schema`;
  const validate = compiled(ptr, false);
  if (!validate || validate(body)) return [];
  return (validate.errors ?? []).map((e) => ({
    where: `${where} (${op.operationId})`,
    detail: `${e.instancePath || '/'} ${e.message ?? ''} ${JSON.stringify(e.params)}`,
  }));
}

export const OPERATIONS_IN_CONTRACT = routes.flatMap((r) =>
  Object.keys(r.item)
    .filter((k) => METHODS.includes(k))
    .map((k) => `${k.toUpperCase()} ${r.template}`),
);
