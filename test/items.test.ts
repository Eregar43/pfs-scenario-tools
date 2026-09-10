import { describe, expect, it } from 'vitest';
import {
  canonicalise,
  enrichItems,
  enrichPlainItems,
  ItemIndex,
  itemUuid,
  type ItemEntry,
} from '../src/pdf/items.ts';

const equipment = (name: string, id: string): ItemEntry => ({
  name,
  pack: 'pf2e.equipment-srd',
  id,
  kind: 'equipment',
});
const spell = (name: string, id: string): ItemEntry => ({
  name,
  pack: 'pf2e.spells-srd',
  id,
  kind: 'spell',
});

const ENTRIES: ItemEntry[] = [
  equipment('Arboreal Boots', 'aaaaaaaaaaaaaaaa'),
  equipment('Healing Potion (Minor)', 'bbbbbbbbbbbbbbbb'),
  equipment('Aeon Stone (Agate Ellipsoid)', 'cccccccccccccccc'),
  equipment('Acid Flask (Lesser)', 'dddddddddddddddd'),
  equipment('Scimitar', 'eeeeeeeeeeeeeeee'),
  // `Wolf` gibt es als Gegenstand *und* als Zauber — die Probe fuer den
  // getrennten Namensraum.
  equipment('Wolf', 'ffffffffffffffff'),
  spell('Wolf', 'gggggggggggggggg'),
  spell('Illusory Disguise', 'hhhhhhhhhhhhhhhh'),
  // Nicht-magische Gegenstaende, wie sie ohne Kursivsetzung im Text stehen.
  equipment('Ghost Charge (Moderate)', 'iiiiiiiiiiiiiiii'),
  // Zwei Sinnwoerter mit Stufe im Klammerzusatz — 8-06, Missionsausruestung.
  equipment('Antidote (Moderate)', 'nnnnnnnnnnnnnnnn'),
  equipment('Elixir of Life (Lesser)', 'jjjjjjjjjjjjjjjj'),
  // Die kuerzere Fassung ohne Steigerungsstufe — die Probe, dass der
  // laengste Treffer gewinnt.
  equipment('Elixir of Life', 'kkkkkkkkkkkkkkkk'),
  // Echte Kompendiumsnamen mit zu wenig Sinnkern fuer den Klartext-Durchlauf:
  // `The Keep` traegt nur ein Inhaltswort, `Wizard's Tower` zwei — beide
  // kommen als gewoehnliche Wortfolge in jeder Erzaehlung vor.
  equipment('The Keep', 'llllllllllllllll'),
  equipment("Wizard's Tower", 'mmmmmmmmmmmmmmmm'),
];

const index = new ItemIndex(ENTRIES);

describe('canonicalise', () => {
  it('dreht die Wortstellung der Steigerungsstufe um', () => {
    // Paizo-Prosa setzt sie vor den Grundbegriff, das Kompendium dahinter.
    expect(canonicalise('minor healing potion')).toBe(canonicalise('Healing Potion (Minor)'));
    expect(canonicalise('agate ellipsoid aeon stone')).toBe(
      canonicalise('Aeon Stone (Agate Ellipsoid)'),
    );
  });

  it('bildet die Einzahl fuer jedes Wort, nicht nur das letzte', () => {
    expect(canonicalise('minor elixirs of life')).toBe(canonicalise('elixir of life minor'));
  });

  it('ignoriert Satzzeichen und Gross-/Kleinschreibung', () => {
    expect(canonicalise("mage's hat")).toBe(canonicalise("Mage's Hat"));
  });
});

describe('ItemIndex.find', () => {
  it('findet den direkten Treffer, auch mit gedrehter Wortstellung', () => {
    const link = index.find('minor healing potion');
    expect(link?.label).toBe('minor healing potion');
    expect(link?.entry.name).toBe('Healing Potion (Minor)');
  });

  it('bildet die Mehrzahl auf die Einzahl zurueck, behaelt aber die Beschriftung', () => {
    const link = index.find('lesser acid flasks');
    expect(link?.label).toBe('lesser acid flasks');
    expect(link?.entry.name).toBe('Acid Flask (Lesser)');
  });

  it('haelt Gegenstand und Zauber desselben Namens auseinander', () => {
    expect(index.find('wolf')?.entry.kind).toBe('equipment');
  });

  it('schneidet eine fuehrende Rune ab und verweist auf den Grundgegenstand', () => {
    const link = index.find('+1 scimitar');
    expect(link).toMatchObject({ label: 'scimitar', before: '+1 ' });
    expect(link?.entry.name).toBe('Scimitar');
  });

  it('verweist eine Schriftrolle auf den Zauber, nicht auf die Blanko-Rolle', () => {
    const link = index.find('scroll of illusory disguise');
    expect(link).toMatchObject({ label: 'illusory disguise', before: 'scroll of ' });
    expect(link?.entry.kind).toBe('spell');
  });

  it('findet die Mehrzahl der Schriftrolle ebenso', () => {
    expect(index.find('scrolls of illusory disguise')?.entry.name).toBe('Illusory Disguise');
  });

  it('laesst ein szenarioeigenes Unikat in Ruhe', () => {
    expect(index.find('brass compass')).toBeUndefined();
  });

  it('laesst gewoehnliche Woerter in Ruhe', () => {
    expect(index.find('Perception')).toBeUndefined();
    expect(index.find('')).toBeUndefined();
  });
});

describe('itemUuid', () => {
  it('setzt den Verweis mit Item als Dokumenttyp', () => {
    const link = index.find('arboreal boots');
    expect(itemUuid(link!)).toBe(
      '@UUID[Compendium.pf2e.equipment-srd.Item.aaaaaaaaaaaaaaaa]{arboreal boots}',
    );
  });
});

describe('enrichItems', () => {
  it('verlinkt einen kursiven Treffer und bleibt kursiv', () => {
    expect(enrichItems('a pair of *arboreal boots*.', index)).toBe(
      'a pair of *@UUID[Compendium.pf2e.equipment-srd.Item.aaaaaaaaaaaaaaaa]{arboreal boots}*.',
    );
  });

  it('laesst Fettdruck unangetastet', () => {
    // `**Treasure:**` darf nicht als kursiver Lauf `*Treasure:*` misslesen werden.
    const text = '**Treasure:** nothing of note here.';
    expect(enrichItems(text, index)).toBe(text);
  });

  it('laesst einen kursiven Nichttreffer unveraendert', () => {
    const text = 'The device is called the *brass compass*.';
    expect(enrichItems(text, index)).toBe(text);
  });

  it('verlinkt eine Rune und eine Schriftrolle im selben Satz', () => {
    expect(
      enrichItems('three *lesser acid flasks*, a *+1 scimitar*, and a *scroll of illusory disguise*.', index),
    ).toBe(
      'three *@UUID[Compendium.pf2e.equipment-srd.Item.dddddddddddddddd]{lesser acid flasks}*, ' +
        'a *+1 @UUID[Compendium.pf2e.equipment-srd.Item.eeeeeeeeeeeeeeee]{scimitar}*, and ' +
        'a *scroll of @UUID[Compendium.pf2e.spells-srd.Item.hhhhhhhhhhhhhhhh]{illusory disguise}*.',
    );
  });
});

describe('enrichPlainItems', () => {
  it('verlinkt einen nicht-magischen Gegenstand ohne Kursivsetzung', () => {
    // Paizo markiert nur Magisches kursiv -- `ghost charge` steht deshalb in
    // gewoehnlicher Schrift und bekommt trotzdem einen Verweis.
    expect(enrichPlainItems('Sebnet gives the PCs a moderate ghost charge.', index)).toBe(
      'Sebnet gives the PCs a @UUID[Compendium.pf2e.equipment-srd.Item.iiiiiiiiiiiiiiii]{moderate ghost charge}.',
    );
  });

  it('bevorzugt den laengsten Treffer', () => {
    // `Elixir of Life` gibt es als eigenen, kuerzeren Eintrag -- gewinnen soll
    // trotzdem die vierwoertige Fassung mit der Steigerungsstufe.
    expect(enrichPlainItems('three lesser elixirs of life for the road', index)).toBe(
      'three @UUID[Compendium.pf2e.equipment-srd.Item.jjjjjjjjjjjjjjjj]{lesser elixirs of life} for the road',
    );
  });

  it('laesst ein einzelnes Wort in Ruhe', () => {
    // Zu viele Grundgegenstaende heissen `Scimitar`, `Dagger`, `Torch` — als
    // blosses Wort im Fliesstext waere der Treffer geraten, nicht gefunden.
    const text = 'She draws her scimitar and steps forward.';
    expect(enrichPlainItems(text, index)).toBe(text);
  });

  it('laesst einen Zauber in Ruhe', () => {
    // `Wolf` gibt es auch als Zauber -- der zaehlt hier nicht, nur
    // Gegenstaende. Ohnehin faellt ein einzelnes Wort durch MIN_WORDS raus.
    const text = 'Wolf howls echo through the ruins.';
    expect(enrichPlainItems(text, index)).toBe(text);
  });

  it('laesst einen echten Kompendiumsnamen mit zu wenig Sinnkern in Ruhe', () => {
    // `The Keep` ist ein echter Gegenstand, aber "keep the" traegt nur ein
    // Inhaltswort und kommt in jedem zweiten Satz vor.
    const text = "Let's keep the door open so we can hear them coming.";
    expect(enrichPlainItems(text, index)).toBe(text);
  });

  it('laesst zwei Sinnwoerter gelten, wenn der Kompendiumsname eine Stufe traegt', () => {
    // `moderate antidote` sind nur zwei Sinnwoerter, aber `Antidote
    // (Moderate)` ist ein Verbrauchsgut in Stufen -- die Wortfolge steht in
    // Prosa nie zufaellig. In 8-06 blieb die Missionsausruestung sonst ohne
    // Verweis.
    expect(enrichPlainItems('She gives the PCs a moderate antidote.', index)).toBe(
      'She gives the PCs a @UUID[Compendium.pf2e.equipment-srd.Item.nnnnnnnnnnnnnnnn]{moderate antidote}.',
    );
  });

  it('laesst zwei Sinnwoerter allein noch nicht gelten', () => {
    // `Wizard's Tower` hat zwei Inhaltswoerter, taucht aber genauso in
    // gewoehnlicher Beschreibung auf wie `The Keep` mit einem -- erst ab drei
    // Sinnwoertern gilt ein Treffer als Fund, nicht als Zufall.
    const text = 'The portal shows the faintest image of a wizard’s tower made of cardboard.';
    expect(enrichPlainItems(text, index)).toBe(text);
  });

  it('fasst enrichItems und enrichPlainItems nicht an denselben Text an', () => {
    // Erst die Kursivsetzung, dann der Rest -- ein bereits gesetzter Verweis
    // wird nicht ein zweites Mal versucht, ein unentschiedener kursiver Lauf
    // nicht nachtraeglich doch noch als blosses Wortpaar gelesen.
    const withMagic = enrichItems(
      'a pair of *arboreal boots* and a moderate ghost charge, near the *brass compass*.',
      index,
    );
    expect(enrichPlainItems(withMagic, index)).toBe(
      'a pair of *@UUID[Compendium.pf2e.equipment-srd.Item.aaaaaaaaaaaaaaaa]{arboreal boots}* and ' +
        'a @UUID[Compendium.pf2e.equipment-srd.Item.iiiiiiiiiiiiiiii]{moderate ghost charge}, ' +
        'near the *brass compass*.',
    );
  });
});
