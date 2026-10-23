import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const alias = {
  '@': path.resolve(__dirname, 'src/renderer'),
  '@shared': path.resolve(__dirname, 'src/shared'),
  '@renderer': path.resolve(__dirname, 'src/renderer'),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'shared',
          environment: 'node',
          include: ['src/shared/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'main',
          environment: 'node',
          include: ['src/main/**/*.test.ts'],
          setupFiles: ['src/test/setup-main.ts'],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['src/test/setup-renderer.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: [
        'src/shared/**/*.ts',
        'src/main/**/*.ts',
        'src/renderer/**/*.{ts,tsx}',
      ],
      exclude: [
        'src/**/*.test.*',
        'src/test/**',
        'src/shared/types.ts',
        'src/shared/engine-protocol.ts',
        'src/renderer/types/**',
      ],
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      // Patamares iniciais (ratchet). O domínio shared e os managers do main já
      // estão acima de 90%; estes limites evitam regressões enquanto a cobertura
      // do renderer cresce. Suba-os conforme novas suítes forem adicionadas.
      thresholds: {
        statements: 42,
        branches: 84,
        functions: 84,
        lines: 42,
      },
    },
  },
});
