import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'supabase/.temp'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  reactRefresh.configs.vite,
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs', 'vite.config.ts'],
    languageOptions: { globals: globals.node }
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error'
    }
  }
)
