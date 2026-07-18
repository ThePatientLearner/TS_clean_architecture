import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts', 'src/**/*.spec.ts'],
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@domain': resolve(__dirname, './src/domain'),
      '@application': resolve(__dirname, './src/application'),
      '@infrastructure': resolve(__dirname, './src/infrastructure'),
      '@composition': resolve(__dirname, './src/composition'),
      '@shared': resolve(__dirname, './src/shared'),
    },
  },
});
