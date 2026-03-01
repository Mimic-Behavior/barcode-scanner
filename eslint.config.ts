import js from '@eslint/js'
import perfectionist from 'eslint-plugin-perfectionist'
import prettier from 'eslint-plugin-prettier/recommended'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
    {
        extends: ['js/recommended'],
        files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        plugins: {
            js,
        },
    },
    tseslint.configs.recommended,
    perfectionist.configs['recommended-alphabetical'],
    prettier,
])
