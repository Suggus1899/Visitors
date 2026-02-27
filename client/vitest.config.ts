/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

const root = path.resolve(__dirname);
const iconStub = path.resolve(root, 'src/__tests__/__mocks__/icon-stub.tsx');

/** Vite plugin: redirect all lucide deep-path icon imports to a lightweight stub */
const lucideIconStubPlugin = {
  name: 'lucide-icon-stub',
  resolveId(id: string) {
    if (id.startsWith('lucide-react/dist/esm/icons/')) {
      return iconStub;
    }
    return null;
  },
};

export default defineConfig({
  // @ts-expect-error — slight plugin-type mismatch between vitest's bundled vite and project vite
  plugins: [react(), lucideIconStubPlugin],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/__tests__/**', 'src/main.tsx', 'src/vite-env.d.ts'],
    },
  },
});
