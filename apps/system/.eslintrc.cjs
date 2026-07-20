module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    extends: ['next/core-web-vitals'],
    ignorePatterns: ['dist', '.next', '.eslintrc.cjs', 'node_modules'],
    rules: {
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-explicit-any': 'warn',
        '@next/next/no-page-custom-font': 'off',
    },
};
