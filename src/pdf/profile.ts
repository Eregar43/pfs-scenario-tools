import { classifyFont, normaliseFontName, type RunRole } from './roles.ts';
import type { Block, TextRun } from './types.ts';

/**
 * Aufbau der Profildatei. Aendert sich die Bedeutung der Felder, muss die
 * Nummer hoch, damit alte Profile beim Vergleich nicht stillschweigend
 * fehlgedeutet werden.
 */
export const PROFILE_VERSION = 1;

export interface FontProfile {
  name: string;
  rolle: RunRole;
  zweck: string;
  /** Falsch heisst: keine Regel in `roles.ts` passte. */
  erkannt: boolean;
  glyphen: number;
  /** Vorkommende Schriftgrade, haeufigster zuerst. */
  groessen: number[];
  /** Anteil der Zeichen, deren Code zum gemeldeten Zeichen passt. */
  kodierung: number;
}

export interface ScenarioProfile {
  version: number;
  szenario: string;
  quelle: string;
  erstellt: string;
  seiten: number;
  seitenmass: { breite: number; hoehe: number };
  /** Wie viele Seiten wie viele Spalten haben, etwa `{ "2": 28, "1": 5 }`. */
  spalten: Record<string, number>;
  schriften: FontProfile[];
  zeichen: {
    gesamt: number;
    ohneZuordnung: number;
    reparierteSatzzeichen: number;
    ligaturen: number;
  };
  bloecke: Record<string, number>;
  warnungen: string[];
}

function haeufigsteZuerst(values: number[]): number[] {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([value]) => value);
}

export interface ProfileInput {
  title: string;
  source: string;
  runs: TextRun[];
  blocks: Block[];
  pages: Array<{ width: number; height: number; columns: number }>;
  agreement: Map<string, number>;
  chars: ScenarioProfile['zeichen'];
}

/**
 * Haelt fest, wie dieses Szenario gesetzt ist: welche Schriften in welchen
 * Graden vorkommen, wofuer sie stehen und was beim Auslesen auffiel.
 *
 * Die Profile werden im Repo gesammelt. Erst der Vergleich mehrerer Jahrgaenge
 * zeigt, was am Paizo-Satz allgemeingueltig ist und was pro Szenario schwankt.
 */
export function buildProfile(input: ProfileInput): ScenarioProfile {
  const byFont = new Map<string, TextRun[]>();
  for (const run of input.runs) {
    const name = normaliseFontName(run.font);
    const bucket = byFont.get(name);
    if (bucket) bucket.push(run);
    else byFont.set(name, [run]);
  }

  const schriften: FontProfile[] = [];
  for (const [name, runs] of byFont) {
    const groessen = haeufigsteZuerst(runs.map((run) => Math.round(run.size * 10) / 10));
    const { rolle, erkannt, zweck } = classifyFont(name, groessen[0] ?? 0);
    schriften.push({
      name,
      rolle,
      zweck,
      erkannt,
      glyphen: runs.reduce((sum, run) => sum + run.glyphs.length, 0),
      groessen,
      kodierung: Math.round((input.agreement.get(runs[0]!.font) ?? 0) * 100) / 100,
    });
  }
  schriften.sort((a, b) => b.glyphen - a.glyphen);

  const spalten: Record<string, number> = {};
  for (const page of input.pages) {
    const key = String(page.columns);
    spalten[key] = (spalten[key] ?? 0) + 1;
  }

  const seitenmass = haeufigsteZuerst(input.pages.map((page) => Math.round(page.width)))[0] ?? 0;
  const seitenhoehe = haeufigsteZuerst(input.pages.map((page) => Math.round(page.height)))[0] ?? 0;

  const bloecke: Record<string, number> = {};
  for (const block of input.blocks) {
    bloecke[block.role] = (bloecke[block.role] ?? 0) + 1;
  }

  const warnungen: string[] = [];
  for (const font of schriften.filter((font) => !font.erkannt)) {
    warnungen.push(
      `Unbekannte Schrift ${font.name} (${font.glyphen} Zeichen, Grade ${font.groessen.join('/')}) — als Fliesstext behandelt.`,
    );
  }
  if (input.chars.ohneZuordnung > 0) {
    warnungen.push(
      `${input.chars.ohneZuordnung} Zeichen ohne Zuordnung — es fehlen Buchstaben im Ergebnis.`,
    );
  }

  return {
    version: PROFILE_VERSION,
    szenario: input.title,
    quelle: input.source,
    erstellt: new Date().toISOString().slice(0, 10),
    seiten: input.pages.length,
    seitenmass: { breite: seitenmass, hoehe: seitenhoehe },
    spalten,
    schriften,
    zeichen: input.chars,
    bloecke,
    warnungen,
  };
}
