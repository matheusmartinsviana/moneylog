import { Pipe, type PipeTransform } from '@angular/core';

import { displayText } from '~/util/display-text';

/**
 * Texto de fora (título, nome de arquivo, caminho) sem caracteres bidi/controle/zero-width escondidos (F7):
 * eles aparecem como `‹U+202E›`. Use dentro de um `<bdi>` para isolar também a direção do texto.
 */
@Pipe({ name: 'displayText' })
export class DisplayTextPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return value == null ? '' : displayText(value);
  }
}
