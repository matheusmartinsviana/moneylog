/// <reference lib="webworker" />
import type { MarkdownWorkerRequest } from '~/util/markdown/markdown-render';
import { handleMarkdownRequest } from '~/util/markdown/markdown-worker-handler';

/**
 * Entrada do Web Worker do Markdown (F1): recebe o texto, faz o lexing/parsing e devolve a **árvore de dados**
 * (nunca HTML). Fica numa thread própria: se o lexer do `marked` se enrolar, a página encerra o worker.
 */
addEventListener('message', (event: MessageEvent<MarkdownWorkerRequest>) => {
  postMessage(handleMarkdownRequest(event.data));
});
postMessage({ type: 'ready' });
