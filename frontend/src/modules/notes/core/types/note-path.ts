import { MAX_NOTE_BYTES, MAX_PATH_LENGTH } from '~/modules/notes/core/types/note';
import type { NoteSummary } from '~/modules/notes/core/types/note';

/** Caracteres que o backend recusa no caminho (ADR-009 §5): `<>:"|?*#^[]`, `\`, controles. */
const FORBIDDEN_PATH_CHARS =
  // eslint-disable-next-line no-control-regex
  /[<>:"|?*#^[\]\\\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/;
const MAX_DEPTH = 10;

export type PathProblem = 'EMPTY' | 'TOO_LONG' | 'TOO_DEEP' | 'INVALID';

/** Nome do arquivo sem a pasta e sem `.md` (`reviews/2026-10.md` → `2026-10`). */
export function noteName(path: string): string {
  const file = path.slice(path.lastIndexOf('/') + 1);
  return file.replace(/\.md$/i, '');
}

/** Pasta do caminho (`reviews/2026-10.md` → `reviews`); `''` na raiz. */
export function noteFolder(path: string): string {
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index);
}

/** Caminho sem a extensão (o que um `[[wikilink]]` leva). */
export function pathWithoutExtension(path: string): string {
  return path.replace(/\.md$/i, '');
}

/** Junta pasta e nome num caminho `.md`. */
export function buildNotePath(folder: string, name: string): string {
  const cleanFolder = folder
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join('/');
  const file = name.trim().replace(/\.md$/i, '').trim();
  return `${cleanFolder === '' ? '' : `${cleanFolder}/`}${file}.md`;
}

/**
 * Validação rápida do caminho **antes** de enviar (o backend é a verdade e responde `NOTE_PATH_INVALID`).
 * Devolve o motivo ou `null`.
 */
export function pathProblem(path: string): PathProblem | null {
  if (path.replace(/\.md$/i, '').replace(/\//g, '').trim() === '') return 'EMPTY';
  if (path.length > MAX_PATH_LENGTH) return 'TOO_LONG';
  const segments = path.split('/');
  if (segments.length > MAX_DEPTH) return 'TOO_DEEP';
  if (path.startsWith('/') || path.includes('..') || FORBIDDEN_PATH_CHARS.test(path)) {
    return 'INVALID';
  }
  if (segments.some((segment) => segment.trim() === '' || segment.startsWith('.'))) {
    return 'INVALID';
  }
  return null;
}

/** Sugere um nome de arquivo seguro a partir de um rótulo livre (texto de uma entidade). */
export function safeFileName(label: string): string {
  return (
    label
      .replace(/[<>:"|?*#^[\]\\/]/g, ' ')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^[.\s]+|[.\s]+$/g, '')
      .slice(0, 80)
      .trim()
  );
}

/** Bytes UTF-8 do texto (o limite do backend é em bytes, não em caracteres). */
export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function isTooLarge(text: string): boolean {
  // Atalho: 1 caractere tem no mínimo 1 byte e no máximo 4; só mede quando pode estourar.
  if (text.length <= MAX_NOTE_BYTES / 4) return false;
  return utf8Length(text) > MAX_NOTE_BYTES;
}

/** Um nó da árvore de pastas, derivada dos caminhos (S: o backend não tem endpoint de pastas). */
export interface FolderNode {
  /** Caminho da pasta (`projetos/clientes`); `''` na raiz. */
  readonly path: string;
  readonly name: string;
  /** Notas dentro da pasta e das subpastas. */
  readonly count: number;
  readonly children: readonly FolderNode[];
}

/** Monta a árvore de pastas a partir dos caminhos das notas ativas; ordem alfabética sem acento. */
export function buildFolderTree(notes: readonly Pick<NoteSummary, 'path'>[]): FolderNode {
  interface Mutable {
    path: string;
    name: string;
    count: number;
    children: Map<string, Mutable>;
  }
  const root: Mutable = { path: '', name: '', count: 0, children: new Map() };
  for (const note of notes) {
    root.count++;
    const parts = noteFolder(note.path).split('/').filter(Boolean);
    let node = root;
    let acc = '';
    for (const part of parts) {
      acc = acc === '' ? part : `${acc}/${part}`;
      let child = node.children.get(part);
      if (!child) {
        child = { path: acc, name: part, count: 0, children: new Map() };
        node.children.set(part, child);
      }
      child.count++;
      node = child;
    }
  }
  const freeze = (node: Mutable): FolderNode => ({
    path: node.path,
    name: node.name,
    count: node.count,
    children: [...node.children.values()]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .map(freeze),
  });
  return freeze(root);
}
