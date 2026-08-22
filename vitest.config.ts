import { defineConfig } from 'vitest/config';

/**
 * Eigene Datei statt eines `test`-Blocks in `vite.config.ts`: dort steht eine
 * `build.lib`-Konfiguration, die fuer die Tests nichts zu suchen hat.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
