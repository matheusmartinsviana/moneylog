/**
 * Texto de fora (título vindo do front matter, nome de arquivo do zip, caminho, destino de link) pode trazer
 * caracteres que **enganam o olho** sem executar nada (F7): marcas bidi (U+202E "RLO" inverte o que vem
 * depois: `fdp.exe` parece `exe.pdf`), controles, zero-width e separadores invisíveis. `displayText` troca
 * cada um por uma marca **visível** (`‹U+202E›`), então nada fica escondido nem reordena o resto da linha. É
 * só para exibir: o dado original nunca é alterado nem reenviado assim.
 */

/* eslint-disable no-control-regex */
const HIDDEN_ALWAYS =
  /[\u{0}-\u{8}\u{b}\u{c}\u{e}-\u{1f}\u{7f}-\u{9f}\u{61c}\u{180e}\u{200b}-\u{200f}\u{2028}\u{2029}\u{202a}-\u{202e}\u{2060}-\u{206f}\u{feff}\u{fff9}-\u{fffb}]/gu;
// Em campos de uma linha, tabulação, `\n` e `\r` também enganam (ou quebram o layout).
const HIDDEN_SINGLE_LINE =
  /[\u{0}-\u{1f}\u{7f}-\u{9f}\u{61c}\u{180e}\u{200b}-\u{200f}\u{2028}\u{2029}\u{202a}-\u{202e}\u{2060}-\u{206f}\u{feff}\u{fff9}-\u{fffb}]/gu;
/* eslint-enable no-control-regex */

function mark(char: string): string {
  const code = char.codePointAt(0) ?? 0;
  return `‹U+${code.toString(16).toUpperCase().padStart(4, '0')}›`;
}

/**
 * Troca controles, marcas bidi e zero-width por `‹U+XXXX›`. Com `multiline`, mantém `\n`, `\r` e `\t` (corpo de
 * nota, bloco de código); sem ele, são também trocados (título, nome de arquivo, caminho).
 */
export function displayText(text: string, options: { readonly multiline?: boolean } = {}): string {
  return text.replace(options.multiline ? HIDDEN_ALWAYS : HIDDEN_SINGLE_LINE, mark);
}
