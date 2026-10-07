import { HttpErrorResponse } from '@angular/common/http';

import { Problem, toProblem } from '~/util/api/problem';

function readText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/**
 * Falha de uma requisição com `responseType: 'blob'` → `Problem`. Nesse modo o corpo do erro (o JSON do
 * RFC 9457) chega como `Blob`: lê o texto e entrega ao `toProblem`, para o `code` não se perder. Qualquer
 * corpo que não seja JSON cai no código padrão do status. Nunca lança.
 */
export async function problemFromBlobError(error: unknown): Promise<Problem> {
  if (!(error instanceof HttpErrorResponse) || !(error.error instanceof Blob)) {
    return toProblem(error);
  }
  let body: unknown;
  try {
    body = JSON.parse(await readText(error.error));
  } catch {
    body = null;
  }
  return toProblem(
    new HttpErrorResponse({
      error: body,
      headers: error.headers,
      status: error.status,
      statusText: error.statusText,
      ...(error.url ? { url: error.url } : {}),
    }),
  );
}
