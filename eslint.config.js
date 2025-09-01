// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';
import eslintPluginN from 'eslint-plugin-n';

export default [
    {
        name: 'global ignores',
        ignores: ['dist/', 'build/', 'node_modules/', 'coverage/', 'frontend/', 'rock-s0/'],
    },
    eslint.configs.recommended,
    ...tseslint.configs.strict,
    ...tseslint.configs.stylistic,
    // ...tseslint.configs.strictTypeChecked,
    // ...tseslint.configs.stylisticTypeChecked,
    eslintPluginPrettier,
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
        },
        linterOptions: {
            reportUnusedDisableDirectives: 'warn',
        },
        rules: {
            'no-console': 'warn',
            'no-undef': 'off',
            'spaced-comment': ['error', 'always'],
        },
    },
    {
        name: 'javascript',
        files: ['**/*.js'],
        ...tseslint.configs.disableTypeChecked,
    },
    {
        name: 'typescript',
        files: ['**/*.ts'],
        ignores: ['**/__test__/*', '**/*.test.ts', '**/*.spec.ts'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parser: tseslint.parser,
            parserOptions: {
                project: './tsconfig.json',
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: {
            '@typescript-eslint': tseslint.plugin,
        },
    },
    {
        name: 'node',
        files: ['**/*.ts'],
        plugins: {
            n: eslintPluginN,
        },
        rules: {
            'n/prefer-node-protocol': 'error',
        },
    },
];
