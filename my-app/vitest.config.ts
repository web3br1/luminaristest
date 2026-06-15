import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Frontend test runner (Vitest + Testing Library). Mirrors the tsconfig
// path alias `@/* -> ./*` so tests can import the same way app code does.
export default defineConfig({
  // `as any`: known nominal Plugin type clash between the app's vite and the
  // vite version nested under vitest — runtime is unaffected. Tooling-only.
  plugins: [react() as any],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'e2e'],
    css: false,
  },
});
