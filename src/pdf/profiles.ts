import type { ScenarioProfile } from './profile.ts';

/**
 * Vergleicht die Schriftprofile mehrerer Szenarien miteinander.
 *
 * Erst mehrere Jahrgaenge nebeneinander zeigen, was am Paizo-Satz
 * allgemeingueltig ist und was nur in einem Heft so aussah. Die Profile
 * enthalten keinen Szenariotext, nur Schriften, Grade und Zaehlwerte.
 *
 * Herkunft: `src/profiles.ts` des PaizoPFSScenarioTextExtractor. Das Lesen
 * und Schreiben der Profildateien blieb dort — im Browser gibt es kein
 * `profiles/`-Verzeichnis. Die Auswertung selbst ist unveraendert.
 */

export interface FontAcrossScenarios {
  name: string;
  /** In wie vielen Szenarien die Schrift vorkommt. */
  szenarien: string[];
  rollen: Set<string>;
  groessen: Set<number>;
  erkannt: boolean;
}

/** Stellt zusammen, welche Schrift in welchen Szenarien wofuer steht. */
export function compareFonts(profiles: ScenarioProfile[]): FontAcrossScenarios[] {
  const fonts = new Map<string, FontAcrossScenarios>();

  for (const profile of profiles) {
    for (const font of profile.schriften) {
      let entry = fonts.get(font.name);
      if (!entry) {
        entry = {
          name: font.name,
          szenarien: [],
          rollen: new Set(),
          groessen: new Set(),
          erkannt: font.erkannt,
        };
        fonts.set(font.name, entry);
      }
      entry.szenarien.push(profile.szenario);
      entry.rollen.add(font.rolle);
      for (const size of font.groessen) entry.groessen.add(size);
      if (!font.erkannt) entry.erkannt = false;
    }
  }

  return [...fonts.values()].sort(
    (a, b) => b.szenarien.length - a.szenarien.length || a.name.localeCompare(b.name),
  );
}

/**
 * Was in allen bisherigen Szenarien gleich ist — die Kandidaten fuer eine
 * allgemeine Regel. Bei nur einem Profil ist das noch keine Erkenntnis,
 * sondern nur eine Beobachtung; darauf weist der Bericht hin.
 */
export function findConstants(profiles: ScenarioProfile[]): string[] {
  if (profiles.length === 0) return [];
  const constants: string[] = [];

  const widths = new Set(profiles.map((p) => p.seitenmass.breite));
  const heights = new Set(profiles.map((p) => p.seitenmass.hoehe));
  if (widths.size === 1 && heights.size === 1) {
    constants.push(`Seitenmass ${[...widths][0]} x ${[...heights][0]} pt`);
  }

  const mainColumns = profiles.map((p) => {
    const entries = Object.entries(p.spalten).sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] ?? '?';
  });
  if (new Set(mainColumns).size === 1) {
    constants.push(`vorherrschend ${mainColumns[0]}-spaltig`);
  }

  const fonts = compareFonts(profiles);
  const ueberall = fonts.filter((font) => font.szenarien.length === profiles.length);
  if (ueberall.length > 0) {
    constants.push(`${ueberall.length} Schriften in allen Szenarien vorhanden`);
  }

  const eindeutig = ueberall.filter((font) => font.rollen.size === 1);
  if (eindeutig.length > 0) {
    constants.push(`${eindeutig.length} davon durchgehend in derselben Rolle`);
  }

  return constants;
}

export function renderReport(profiles: ScenarioProfile[]): string {
  if (profiles.length === 0) {
    return 'Keine Profile vorhanden. Erst ein Szenario auslesen.\n';
  }

  const lines: string[] = [];
  lines.push(`Profile: ${profiles.length}`);
  for (const profile of profiles) {
    lines.push(
      `  ${profile.szenario} — ${profile.seiten} Seiten, ${profile.schriften.length} Schriften, ` +
        `${profile.zeichen.reparierteSatzzeichen} Satzzeichen repariert`,
    );
  }

  lines.push('', 'Schriften ueber alle Szenarien:');
  const fonts = compareFonts(profiles);
  const nameWidth = Math.max(...fonts.map((font) => font.name.length));
  for (const font of fonts) {
    const marker = !font.erkannt ? ' <- keine Regel' : font.rollen.size > 1 ? ' <- Rolle wechselt' : '';
    lines.push(
      `  ${font.name.padEnd(nameWidth)}  ${String(font.szenarien.length).padStart(2)}/${profiles.length}  ` +
        `${[...font.rollen].join(',').padEnd(16)} ${[...font.groessen].sort((a, b) => a - b).join('/')}${marker}`,
    );
  }

  if (fonts.some((font) => font.rollen.size > 1)) {
    lines.push(
      '',
      'Ein Rollenwechsel kann gewollt sein: der Bericht vergleicht je Schrift nur',
      'eine Rolle, waehrend die Regeln zusaetzlich den Schriftgrad heranziehen.',
      'Ironstrike-Black etwa traegt ab 20 pt den Kolumnentitel, darunter die',
      'Bildunterschrift.',
    );
  }

  const warnungen = profiles.flatMap((profile) =>
    profile.warnungen.map((warnung) => `  ${profile.szenario}: ${warnung}`),
  );
  if (warnungen.length > 0) {
    lines.push('', 'Warnungen:', ...warnungen);
  }

  lines.push('', 'Gemeinsam in allen Profilen:');
  const constants = findConstants(profiles);
  lines.push(...(constants.length > 0 ? constants.map((c) => `  ${c}`) : ['  nichts gefunden']));
  if (profiles.length === 1) {
    lines.push('', 'Hinweis: bei einem Profil ist das noch keine Regel, nur eine Beobachtung.');
  }

  return `${lines.join('\n')}\n`;
}
