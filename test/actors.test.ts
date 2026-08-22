import { describe, expect, it } from 'vitest';
import {
  ActorIndex,
  WeltActorSuche,
  actorUuid,
  adjustedLevel,
  loeseVorlage,
  parseCreatureHeading,
  parseQuelle,
  singularise,
} from '../src/pdf/actors.ts';
import type { ActorEntry } from '../src/pdf/actors.ts';

const creature = (name: string, pack: string, id: string, level: number): ActorEntry =>
  ({ name, pack, id, level, kind: 'creature' });
const hazard = (name: string, pack: string, id: string, level: number): ActorEntry =>
  ({ name, pack, id, level, kind: 'hazard' });

const ENTRIES: ActorEntry[] = [
  creature('Twigjack', 'pf2e.pathfinder-monster-core', '9sGgANyNFCKnu06t', 3),
  creature('Sprigjack', 'pf2e.pathfinder-monster-core', 'TElwkEGZy1zgwoVg', -1),
  creature('Wight', 'pf2e.pathfinder-monster-core', 'DBTbqI9QQRtlJwWh', 3),
  creature('Animated Broom', 'pf2e.pathfinder-monster-core', 'ybkelAOtSIA06fnj', -1),
  creature('Dockhand', 'pf2e.pathfinder-npc-core', 'Wv4jaiD6X8negvH2', 0),
  // `Wolf` gibt es in beiden Arten — die Probe fuer den getrennten Namensraum.
  creature('Wolf', 'pf2e.pathfinder-monster-core', 'BN5Lb6IsQ9Wyu3rL', 1),
  hazard('Wolf', 'pf2e.hazards', 'HHHHHHHHHHHHHHHH', 1),
  hazard('Scythe Blades', 'pf2e.hazards', 'JZs5UEjkAFnPUJdV', 4),
  hazard('Shadow Double Rune', 'pf2e.pfs-season-1-bestiary', 'KKKKKKKKKKKKKKKK', 1),
];

const index = new ActorIndex(ENTRIES);

describe('parseCreatureHeading', () => {
  it('liest Name und Stufe aus der Statblockleiste', () => {
    expect(parseCreatureHeading('Twigjack Creature 3')).toEqual({
      name: 'Twigjack',
      level: 3,
      suffix: ' Creature 3',
      kind: 'creature',
    });
  });

  it('versteht die negative Stufe mit Gedankenstrich', () => {
    expect(parseCreatureHeading('Weak Bodyguard Creature –1')).toEqual({
      name: 'Weak Bodyguard',
      level: -1,
      suffix: ' Creature –1',
      kind: 'creature',
    });
  });

  it('liest die Leiste einer Gefahr wie die einer Kreatur', () => {
    // Fallen und Spukorte sind genauso gesetzt und fuellen im Statistikanhang
    // die halbe Seite; ohne sie bliebe dort die Haelfte ungestaltet.
    expect(parseCreatureHeading('Collapsing Balcony Hazard 5')).toEqual({
      name: 'Collapsing Balcony',
      level: 5,
      suffix: ' Hazard 5',
      kind: 'hazard',
    });
  });

  it('laesst eine gewoehnliche Ueberschrift in Ruhe', () => {
    expect(parseCreatureHeading('Into The Drink Obstacle 1')).toBeUndefined();
    expect(parseCreatureHeading('Running A Chase')).toBeUndefined();
  });
});

describe('adjustedLevel', () => {
  // Die Regel steht in `src/module/actor/npc/document.ts` des PF2e-Systems.
  it('hebt Elite um eins, unter Stufe 1 um zwei', () => {
    expect(adjustedLevel(3, 'elite')).toBe(4);
    expect(adjustedLevel(1, 'elite')).toBe(2);
    expect(adjustedLevel(0, 'elite')).toBe(2);
    expect(adjustedLevel(-1, 'elite')).toBe(1);
  });

  it('senkt Schwach um eins, auf genau Stufe 1 um zwei', () => {
    expect(adjustedLevel(3, 'weak')).toBe(2);
    expect(adjustedLevel(1, 'weak')).toBe(-1);
    expect(adjustedLevel(0, 'weak')).toBe(-1);
  });
});

describe('singularise', () => {
  it('fuehrt die gaengigen Mehrzahlformen zurueck', () => {
    expect(singularise('Animated Brooms')).toContain('Animated Broom');
    expect(singularise('Wolves')).toContain('Wolf');
    expect(singularise('Harpies')).toContain('Harpy');
    expect(singularise('Witches')).toContain('Witch');
  });

  it('beugt nur das letzte Wort', () => {
    expect(singularise('Giant Rats')).toContain('Giant Rat');
  });
});

describe('ActorIndex', () => {
  it('verweist eine Gefahr auf das Gefahrenkompendium', () => {
    const link = index.find('Scythe Blades Hazard 4');
    expect(actorUuid(link!)).toBe(
      '@UUID[Compendium.pf2e.hazards.Actor.JZs5UEjkAFnPUJdV]{Scythe Blades}',
    );
  });

  it('haelt Kreatur und Gefahr desselben Namens auseinander', () => {
    // `Wolf` steht in beiden Arten auf Stufe 1. Ohne getrennte Namensraeume
    // erbte die eine den Verweis der anderen.
    expect(index.find('Wolf Creature 1')?.entry.pack).toBe('pf2e.pathfinder-monster-core');
    expect(index.find('Wolf Hazard 1')?.entry.pack).toBe('pf2e.hazards');
  });

  it('findet die Gefahr auch mit Anzahl und im Plural', () => {
    // `SHADOW DOUBLE RUNES (5) HAZARD 1` — Anzahl weg, Einzahl bilden.
    expect(index.find('Shadow Double Runes (5) Hazard 1')?.entry.pack).toBe(
      'pf2e.pfs-season-1-bestiary',
    );
  });

  it('prueft auch bei der Gefahr die Stufe', () => {
    expect(index.find('Scythe Blades Hazard 7')).toBeUndefined();
  });

  it('findet die Kreatur und setzt den Verweis', () => {
    const link = index.find('Twigjack Creature 3');
    expect(link?.entry.id).toBe('9sGgANyNFCKnu06t');
    expect(actorUuid(link!)).toBe(
      '@UUID[Compendium.pf2e.pathfinder-monster-core.Actor.9sGgANyNFCKnu06t]{Twigjack}',
    );
  });

  it('nimmt die Stufe als Probe', () => {
    // Gleicher Name, andere Stufe: das ist eine fuer das Szenario angepasste
    // Fassung und nicht die Kreatur aus dem Grundwerk.
    expect(index.find('Twigjack Creature 5')).toBeUndefined();
  });

  it('verweist bei Elite auf die unangepasste Kreatur', () => {
    // Der Sprigjack steht auf Stufe −1; als Elite ergibt das Stufe 1. Das
    // Wort `Elite` bleibt Text, verwiesen wird nur der Name.
    const link = index.find('Elite Sprigjack Creature 1');
    expect(link).toMatchObject({
      label: 'Sprigjack',
      before: 'Elite ',
      after: ' Creature 1',
      adjustment: 'elite',
    });
    expect(link?.entry.id).toBe('TElwkEGZy1zgwoVg');
  });

  it('verweist bei Schwach ebenso', () => {
    // Der Wolf steht auf Stufe 1; schwach ergibt das Stufe −1.
    const link = index.find('Weak Wolf Creature –1');
    expect(link).toMatchObject({ label: 'Wolf', before: 'Weak ', adjustment: 'weak' });
  });

  it('prueft auch bei Elite die Stufe', () => {
    // Stimmt die angepasste Stufe nicht, ist es eine andere Fassung.
    expect(index.find('Elite Sprigjack Creature 4')).toBeUndefined();
  });

  it('uebergeht die Anzahl hinter dem Namen', () => {
    const link = index.find('Wight (2) Creature 3');
    expect(link?.label).toBe('Wight');
    expect(link?.entry.id).toBe('DBTbqI9QQRtlJwWh');
  });

  it('findet die Einzahl zur gezaehlten Mehrzahl', () => {
    // Der Verweis behaelt die Mehrzahl als Beschriftung, wie im Vorbild-Journal.
    const link = index.find('Animated Brooms (3) Creature –1');
    expect(link?.label).toBe('Animated Brooms');
    expect(link?.entry.name).toBe('Animated Broom');
  });

  it('verweist nicht auf eine benannte Kreatur des Szenarios', () => {
    // `Burr` ist ein Elite-Twigjack mit eigenem Namen; im Grundwerk steht er
    // nicht, und ein Verweis auf den Twigjack waere falsch.
    expect(index.find('Burr Creature 4')).toBeUndefined();
    expect(index.find('Captain Ashfell Grimme Creature 2')).toBeUndefined();
  });

  it('greift das NPC-Kompendium mit ab', () => {
    expect(index.find('Dockhand Creature 0')?.entry.pack).toBe('pf2e.pathfinder-npc-core');
  });
});

describe('parseQuelle', () => {
  it('erkennt die Fundstelle', () => {
    expect(parseQuelle('*Pathfinder NPC Core* 66 **Perception** +3')).toEqual({
      buch: 'Pathfinder NPC Core',
    });
    expect(parseQuelle('*Pathfinder NPC Core* 5, 82 **Perception** +6')).toEqual({
      buch: 'Pathfinder NPC Core',
    });
  });

  it('erkennt eine Vorlagen-Wortgruppe vor der Fundstelle', () => {
    expect(parseQuelle('Variant pirate (*Pathfinder NPC Core* 147) **Perception** +6')).toEqual({
      vorlage: 'Variant pirate',
      buch: 'Pathfinder NPC Core',
    });
    expect(parseQuelle('Female totenmaske (*Pathfinder Monster Core 2* 324) **Perception** +15')).toEqual({
      vorlage: 'Female totenmaske',
      buch: 'Pathfinder Monster Core 2',
    });
    expect(parseQuelle('Elite twigjack (*Pathfinder Monster Core* 6, 332) **Perception** +11')).toEqual({
      vorlage: 'Elite twigjack',
      buch: 'Pathfinder Monster Core',
    });
  });

  it('erkennt den Kurzverweis der Begegnungsliste', () => {
    expect(parseQuelle('Elite twigjack, page 12 **Initiative** Stealth +13')).toEqual({
      vorlage: 'Elite twigjack',
    });
    // Ein blosses `Page 12` nennt keine Vorlage.
    expect(parseQuelle('Page 12 **Initiative** Stealth +11')).toBeUndefined();
  });

  it('laesst gewoehnlichen Statblock-Text durch', () => {
    expect(parseQuelle('**Perception** +6; low-light vision')).toBeUndefined();
  });
});

describe('loeseVorlage', () => {
  it('kuerzt die Wortgruppe, bis der Name trifft', () => {
    expect(loeseVorlage('Variant pirate', 'creature', vorlagenIndex)?.entry.name).toBe('Pirate');
    expect(loeseVorlage('Female totenmaske', 'creature', vorlagenIndex)?.entry.name).toBe(
      'Totenmaske',
    );
  });

  it('macht ein gestrichenes Elite oder Weak zur Anpassung', () => {
    const burr = loeseVorlage('Elite twigjack', 'creature', vorlagenIndex);
    expect(burr?.entry.name).toBe('Twigjack');
    expect(burr?.anpassung).toBe('elite');

    const schwach = loeseVorlage('Weak pirate', 'creature', vorlagenIndex);
    expect(schwach?.entry.name).toBe('Pirate');
    expect(schwach?.anpassung).toBe('weak');
  });

  it('kommt mit jedem unbekannten Beiwort zurecht', () => {
    // Belegt sind Variant und Female; Male oder andere Beschreibungen
    // funktionieren durch dasselbe Kuerzen — ohne gepflegte Wortliste.
    expect(loeseVorlage('Male totenmaske', 'creature', vorlagenIndex)?.entry.name).toBe(
      'Totenmaske',
    );
    expect(loeseVorlage('Young ambitious pirate', 'creature', vorlagenIndex)?.entry.name).toBe(
      'Pirate',
    );
  });

  it('bleibt still, wenn nichts trifft', () => {
    expect(loeseVorlage('Voellig Unbekannt', 'creature', vorlagenIndex)).toBeUndefined();
  });
});

const vorlagenIndex = new ActorIndex([
  creature('Pirate', 'pf2e.pathfinder-npc-core', 'PPPPPPPPPPPPPPPP', 1),
  creature('Totenmaske', 'pf2e.pathfinder-monster-core-2', 'TTTTTTTTTTTTTTTT', 7),
  creature('Twigjack', 'pf2e.pathfinder-monster-core', 'WWWWWWWWWWWWWWWW', 3),
]);

describe('findeNachName', () => {
  it('findet die Vorlage ohne Stufenprobe', () => {
    // `Variant pirate` auf Stufe 2 zeigt auf den Piraten, dessen Stufe eine
    // andere ist — die Quellenzeile selbst ist die Probe.
    expect(index.findeNachName('creature', 'Twigjack')?.id).toBe('9sGgANyNFCKnu06t');
    expect(index.findeNachName('creature', 'animated brooms')?.name).toBe('Animated Broom');
    expect(index.findeNachName('creature', 'Niemand')).toBeUndefined();
  });

  it('haelt die Namensraeume von Kreatur und Gefahr getrennt', () => {
    expect(index.findeNachName('hazard', 'Wolf')?.pack).toBe('pf2e.hazards');
  });
});

describe('WeltActorSuche', () => {
  const suche = new WeltActorSuche([
    { name: 'Captain Ashfell Grimme', stufe: 2, art: 'creature', uuid: 'Actor.aaaaaaaaaaaaaaaa' },
    { name: 'Weak Bodyguard', stufe: -1, art: 'creature', uuid: 'Actor.bbbbbbbbbbbbbbbb' },
  ]);

  it('verweist auf den Welt-Actor, mit vollem Namen', () => {
    const link = suche.find('Captain Ashfell Grimme Creature 2');
    expect(link?.uuid).toBe('Actor.aaaaaaaaaaaaaaaa');
    expect(actorUuid(link!)).toBe('@UUID[Actor.aaaaaaaaaaaaaaaa]{Captain Ashfell Grimme}');
  });

  it('behaelt Anzahl und Stufe als Text hinter dem Verweis', () => {
    const link = suche.find('Weak Bodyguard (2) Creature –1');
    expect(link?.uuid).toBe('Actor.bbbbbbbbbbbbbbbb');
    expect(link?.after).toBe(' (2) Creature –1');
  });

  it('bleibt still, wenn Name oder Stufe nicht passen', () => {
    expect(suche.find('Captain Ashfell Grimme Creature 3')).toBeUndefined();
    expect(suche.find('Fremder Creature 2')).toBeUndefined();
  });
});
