/**
 * Der eine Griff in Vites Typen, den dieses Repo braucht.
 *
 * `tsconfig` fuehrt `"types": []`, damit weder Node- noch Vite-Typen ins
 * Modul sickern. `import.meta.glob` ist aber eine Vite-Funktion, die beim
 * Bauen (und in Vitest) durch die gefundenen Dateien ersetzt wird — sie
 * braucht deshalb diese eine Zeile, aus demselben Grund wie
 * `foundry-shim.d.ts`.
 */
interface ImportMeta {
  glob<T>(muster: string, optionen: { eager: true; import: 'default' }): Record<string, T>;
}
