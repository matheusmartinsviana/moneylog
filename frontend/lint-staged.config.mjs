/** Pre-commit: lint e formatação só nos arquivos alterados (FE 07). O lint:deps roda no hook. */
export default {
  '*.{ts,html}': ['eslint --max-warnings=0 --no-warn-ignored', 'prettier --check'],
  '*.{css,json,md,mjs,cjs,js}': ['prettier --check'],
  '*.css': () => 'node scripts/check-styles.mjs',
  '*.{ts,html,css}': () => 'node scripts/check-native-controls.mjs',
};
