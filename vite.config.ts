import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const MODULE_ID = 'pfs-scenario-tools';

/**
 * Ein Artefakt, keine zweite Ladereihenfolge: pdf.js wird mitgebuendelt.
 *
 * Zwei Teile lassen sich nicht buendeln und werden deshalb kopiert:
 *
 * - `pdf.worker.min.mjs` — pdf.js baut daraus selbst `new Worker(src)`,
 *   die Datei muss also unter einer eigenen URL erreichbar sein.
 * - `standard_fonts/` — nicht fuer die Darstellung (wir zeichnen nie), sondern
 *   weil `src/pdf/roles.ts` **am Schriftnamen** entscheidet. Faellt pdf.js bei
 *   einem nicht eingebetteten Standardfont auf einen Ersatz zurueck,
 *   verschieben sich die Rollen und das Journal zerfaellt.
 *
 * `cmaps/` bleibt bewusst draussen: die werden nur fuer vordefinierte
 * CJK-Kodierungen gebraucht, die Paizo-PDFs sind lateinisch gesetzt.
 */
export default defineConfig({
  build: {
    lib: {
      entry: 'src/module.ts',
      formats: ['es'],
      fileName: () => `${MODULE_ID}.js`,
    },
    outDir: 'dist',
    emptyOutDir: true,
    // Lesbare Stapelspuren sind hier mehr wert als hundert Kilobyte.
    minify: false,
    sourcemap: true,
    target: 'es2022',
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',
          dest: '.',
        },
        {
          src: 'node_modules/pdfjs-dist/standard_fonts',
          dest: '.',
        },
      ],
    }),
  ],
});
