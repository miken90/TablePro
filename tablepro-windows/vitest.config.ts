import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@tauri-apps/api/core': path.resolve(__dirname, 'src/__tests__/mocks/tauri.ts'),
    },
  },
});
