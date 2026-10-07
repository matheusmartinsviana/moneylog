import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/angular';
import { configure as configureDom } from '@testing-library/dom';
import { afterEach } from 'vitest';

// Os testes localizam elementos por `data-cy` (FE 07), nunca por texto que muda com o idioma.
// O render() da Angular Testing Library reaplica a config `dom`; testes sem render() usam a do DOM.
configure({ dom: { testIdAttribute: 'data-cy' } });
configureDom({ testIdAttribute: 'data-cy' });

afterEach(() => {
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    // storage indisponível no ambiente
  }
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.lang = '';
});
