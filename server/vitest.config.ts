import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    env: {
      NODE_ENV: 'test',
      DB_HOST: '127.0.0.1',
      DB_PORT: '1',
      DB_NAME: 'logmaster_unit_tests',
      DB_USER: 'fixture',
      DB_PASSWORD: 'unit-fixture-only',
      JWT_SECRET: 'unit-fixture-access-secret-never-used-outside-tests',
      JWT_REFRESH_SECRET: 'unit-fixture-refresh-secret-never-used-outside-tests',
      ENCRYPTION_KEY: '1919191919191919191919191919191919191919191919191919191919191919',
      EDIT_PASSWORD: 'Unit!EditOnly123',
    },
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/models/**', 'src/migrations/**'],
    },
  },
});
