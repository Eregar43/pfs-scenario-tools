# Changelog

Hier steht, was ein **Anwender** merkt — neue Knöpfe, geändertes Verhalten,
behobene Fehler.

## 1.3.0 — 2026-10-08

- **Geprüfter Umfang: Season 8, Hefte 8-01 bis 8-08.** Begrüßung und README
  nannten noch 8-01 bis 8-04.
- **Proben im Abschnitt „Getting Started" sind verdeckt.** Alle Proben
  zwischen „Getting Started" und der nächsten Hauptüberschrift tragen das
  Merkmal „secret" — Recall Knowledge und, in 8-07, Gather Information. In
  der Season 8 sind das drei bis fünf Proben je Heft.
- **Runen werden verlinkt.** „*shadow rune*" (8-08) zeigt jetzt auf die Rune
  „Shadow" im Kompendium. Verlinkt wird nur, was dort wirklich eine Rune ist.
- **Schriftrollen mit Rang werden verlinkt.** „*3rd-rank scroll of soothe*"
  (8-07) blieb ohne Verweis, weil der Rang mit im Kursivsatz steht. Jetzt
  bleibt der Rang Text, und der Zauber bekommt den Verweis.
- **Gegenstände mit Quellenangabe werden verlinkt, auch mit zwei Wörtern.**
  Steht hinter dem Namen Buch und Seite, etwa „(*Pathfinder Treasure Vault*
  47)", bekommt der Name einen Verweis. Neu verlinkt: diplomat’s charcuterie
  (8-07), phantom roll (8-08), dueling pistol und flintlock pistol (8-05).
- **Karte von 8-07 „In the Halls of Dead Justice" vermessen und bewändet.**
  „This Stinks" bekommt beim Import Gitter, Versatz und die Wände des
  Ballsaals.
- **Karte von 8-08 „Treatise on the Study of Clockwork" vermessen und
  bewändet.** „Escorting Luiza" bekommt Gitter, Versatz, die Wände des
  Herrenhauses und seine neun Türen.
- **Tempo-Zusatz nach Semikolon bleibt erhalten.** „20 feet; troop movement"
  verlor bisher den Zusatz; bei gebauten Kreaturen steht er jetzt am Tempo.
- **Drei Lesefehler in Statblöcken behoben.** Ein Tempo, das im Satz an der
  Fähigkeit davor klebt, geht nicht mehr verloren; eine doppelte
  Aktionsplakette bleibt nicht mehr im Angriffsnamen stehen; ein
  abgesprengter Anfangsbuchstabe der Merkmalszeile wird wieder angefügt.
  Gefunden in 8-07.
- **Kreaturen ohne Vorlage werden aus dem Statblock gebaut.** Steht ein
  Statblock nur im Heft (keine Quellenzeile), entsteht ein vollständiger NPC
  statt gar keinem Actor — in 8-07 Leshtakap und Undead Workers United
  Local 1014. Die Vorschau nennt sie in einer eigenen Zeile und darunter,
  was nicht unterkam (Gegenstände, Zauber).
- **Keine 10-TP-NSCs mehr für solche Kreaturen.** Hatte eine Kreatur ohne
  Vorlage ein Porträt im Anhang, legte der Import sie bisher als einfachen
  NSC mit Stufe 1 an.
- **Porträts mit abgekürztem Namen werden erkannt.** Die Bildunterschrift
  „UWU Local 1014" gehört zum Statblock „Undead Workers United Local 1014".
- **Angriffsnamen ohne Kursiv-Sternchen.** Ein kursiv gesetzter Waffenname
  stand bisher als `*bastard sword*` im Blatt.
- **Ein Bonus auf „skill checks and attack rolls" wirkt jetzt auf Fertigkeiten
  und Angriffe.** Bisher galt jede Nennung von „checks" als Fertigkeiten und
  Rettungswürfe — die Rettungswürfe zu viel, die Angriffe fehlten. Betroffen
  ist der Effekt aus 8-08; er heißt jetzt „+1 checks and attacks".

## 1.2.0 — 2026-09-11

- **Krankheiten des Hefts bekommen eine Seite im Spielhilfen-Journal.** Ein
  Statblock „… Disease N" im Anhang wird eine Textseite mit Rettungswurf,
  Onset und Stufen wie gedruckt, hinter den Bildseiten; der Haupttext
  verweist an der ersten Nennung darauf. In der Season 8 betrifft das „Sewer
  Haze" in 8-06. Vorschau, Übersicht und Entfernen zählen die Seite mit.
- **Starfinder-Vorlagen über „Starfinder Anachronism".** Nennt ein Statblock
  ein Starfinder-Buch als Vorlage (der Mining Robot in 8-06), wird sie in den
  Bestiarien des Moduls `sf2e-anachronism` gesucht — nach den
  Pathfinder-Grundwerken. Fehlt das Modul, sagt die Vorschau das und legt die
  Kreatur nicht an.
- **Seiten mit kurzem Titel werden wieder zweispaltig gelesen.** In 8-06
  „Falling Sparks" lag der Titel zusammen mit Autorenzeile und einer
  Bildunterschrift im Bundsteg, und Seite 3 wurde einspaltig gelesen — die
  Sidebar „Where on Golarion?" stand zeilenweise im Fließtext verschränkt.
- **Porträts mit Bildunterschrift auf dem Bild gehen nicht mehr verloren.**
  Sie galten als Kastenhintergrund. Betroffen waren Dagur Hawksight und
  Vulri Gearturner in 8-06 und der Giant Fly in 8-05; stattdessen kam in
  8-06 eine Rost-Textur unter dem Namen „Dagur Hawksight" in den Bildordner.
- **Karten mit Alphakanal werden als Karte erkannt.** Die Schlachtkarte von
  8-06 ist im PDF durchsichtig um den Höhlenumriss gesetzt und lief als
  Figur, es entstand keine Szene. Eine Karte ist jetzt, worauf
  Kartenbeschriftungen stehen. Die Golarion-Übersicht landet damit auch in
  8-05 und 8-06 als Einschub in ihrem Kasten.
- **Verbrauchsgüter in Stufen werden im Klartext verlinkt.** „moderate
  antidote" und „moderate antiplague" (8-06, Missionsausrüstung) sind nur
  zwei Sinnwörter; für Kompendiumsnamen mit Stufe im Klammerzusatz genügt
  das jetzt.
- **Karten von 8-05 „A Shark’s Guide to Piracy" vermessen und bewändet.**
  „Nan’s Watch" und „The Gunpowder Keg" bekommen beim Import Gitter, Versatz
  und fertige Wände, die Gunpowder Keg auch ihre Tür.
- **Karte von 8-06 „Falling Sparks" vermessen und bewändet.** „Finding the
  Mine" bekommt beim Import Gitter, Versatz und die Wände der Höhle.

## 1.1.1 — 2026-09-07

- **Spielhilfen- und Handout-Journal sind für Spieler geöffnet, ihre Seiten
  nicht.** Beide Journale stehen auf „Observer", jede ihrer Seiten auf „None".
  Spieler sehen so das Journal, aber keine Seite, bis der Spielleiter sie
  einzeln freigibt. Bisher standen die Journale auf „None" und die Seiten auf
  „Inherit" — Spieler sahen nichts oder, nach einer Freigabe des Journals,
  alle Seiten auf einmal. Ein erneuter Import setzt die Rechte auch bei
  vorhandenen Journalen; Freigaben an einzelne Spieler bleiben stehen. Das
  Hauptjournal ist nicht betroffen.

## 1.1.0 — 2026-09-05

- **Handout-Journal.** Enthält das Heft Handouts — Briefe und Notizen für
  die Spieler im Appendix „Game Aids" —, entsteht neben dem Spielhilfen-Journal
  ein Journal „Handouts" mit einer Textseite je Handout, im Journal-Blatt des
  Moduls und mit abgesetztem Wortlaut. Vorschau, Übersicht,
  Vollständigkeitsprobe und Entfernen kennen es. In der Season 8 betrifft das
  8-01 und 8-04; Hefte ohne Handout bekommen kein leeres Journal.

## 1.0.0 — 2026-08-22

Erste Ausgabe. Das Modul liest das PDF eines Pathfinder-Society-Szenarios im
Browser und legt daraus in der Welt an:

- **Journal** mit einer Seite je Abschnitt, Vorlesekästen, Statblock-Leisten
  und Verweisen auf Proben, Gegenstände, Zauber, Bedingungen und Kreaturen;
  Schadensangaben sind würfelbar. Dazu ein eigenes Journal-Blatt in der Farbe
  der Season.
- **Spielhilfen-Journal** mit einer Bildseite je Anhang-Bild, und die
  **Bilder** als WebP im gewählten Bildordner.
- **Szenen** je Schlachtkarte, mit vermessenen Gitterwerten und fertigen
  Wänden samt Türen für alle Karten der Season 8.
- **Kreaturen und Hazards** als Welt-Actors: kopiert aus den Kompendien,
  an den abgedruckten Statblock angeglichen, Elite- und Weak-Fassungen und
  Varianten eingeschlossen. Szenarioeigene Hazards werden gebaut. Das Porträt
  aus dem Heft wird Actor-Bild und Token, mit dynamischem Ring.
- **NPCs** für Personen ohne Statblock und **Effekte** für die Zusagen des
  Hefts, für Spieler unsichtbar.
- **Verwaltungsfenster** mit Vollständigkeitsprobe, Mehrfachauswahl und
  Entfernen; beim Entfernen fallen auch leer gewordene Ordner. Beim ersten
  Start führt ein Fenster „Erste Schritte" durch die Einrichtung.

Ein zweiter Import aktualisiert, statt zu verdoppeln, und fasst nichts an,
woran der Spielleiter gearbeitet hat.

Unterstützt sind die vier Hefte der **Season 8**: 8-01 bis 8-04.
