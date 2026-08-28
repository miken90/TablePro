import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Vitest stubs every CSS import to '' by default, regardless of a `?raw`
    // query — src/styles/token-names.test.ts needs the real file text to
    // check the design token layer. No other test imports CSS today.
    css: true,
  },
  resolve: {
    alias: {
      '@tauri-apps/api/core': path.resolve(__dirname, 'src/__tests__/mocks/tauri.ts'),
    },
  },
});
