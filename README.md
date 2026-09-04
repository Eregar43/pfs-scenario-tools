# PFS Scenario Tools

**Deutsch** · [English](README.en.md)

Foundry-VTT-Modul (v14, System **pf2e**). Es liest das PDF eines
Pathfinder-Society-Szenarios im Browser und legt daraus direkt in der Welt an,
was am Spieltisch gebraucht wird: das Journal, die Bilder, die Szenen, die
Kreaturen und die NPCs.

Unterstützt sind derzeit die vier Hefte der **Season 8** (Year of Clockwork
Mystery): **8-01 bis 8-04**. Gegen sie ist alles gemessen, und nur für ihre
Karten liegen Gitterwerte und Wände bereit. Andere Hefte lassen sich einlesen,
das Ergebnis ist dann aber ungeprüft; ältere Seasons laufen durch, sind aber
nicht das Ziel (siehe [Seasons](#seasons)).

## Installation

In Foundry unter **Add-on Modules → Install Module** diese Manifest-URL
eintragen:

```
https://github.com/Eregar43/pfs-scenario-tools/releases/latest/download/module.json
```

Voraussetzungen: Foundry VTT v14, System Pathfinder Second Edition. Für die
Kompendium-Verweise und den Kreaturen-Import müssen die PF2e-Kompendien der
Instanz verfügbar sein (Monster Core, NPC Core usw., je nachdem, worauf das
Szenario verweist).

## Benutzung

Im **Journal-Reiter** der Seitenleiste steht unten ein Knopf (nur für
Spielleiter): **PFS-Szenarien**. Er öffnet das Verwaltungsfenster, und darin
steht alles:

- die Liste der importierten Szenarien, je Zeile mit einer
  **Vollständigkeitsprobe** — `Journalseiten 15/15`, `Szenen 1/2`,
  `Actors 0/7`, `Bilder 13/13`. Grüner Haken heißt vollständig, gelbes
  Dreieck „da fehlt etwas", rotes Kreuz „ganz weg". Steht dort
  „Sollwert unbekannt", wurde das Szenario mit einer älteren Fassung
  importiert, die sich die Stückzahlen noch nicht gemerkt hat;
- ein Hinweis, wenn eine ältere Modulfassung importiert hat — dann lohnt
  meist ein neuer Import;
- unten die Knöpfe **PFS-Szenarien importieren**, **Ausgewählte entfernen**,
  **Erste Schritte** und **Schließen**.

Das Fenster bleibt beim Arbeiten offen und frischt sich nach jedem Griff auf.

Beim ersten Start in einer Welt erscheint **Erste Schritte** von selbst: ein
Fenster mit dem Weg zum Import und dem Hinweis auf den Bildordner. Es kommt
danach nicht wieder — der gleichnamige Knopf holt es zurück.

Alle drei Fenster gibt es auch in der Konsole:
`game.pfsScenarioTools.importieren()`, `game.pfsScenarioTools.uebersicht()`
und `game.pfsScenarioTools.willkommen()`.

### Der Import, Schritt für Schritt

1. **PDF wählen** — auch mehrere auf einmal. Die Dateien werden ausschließlich
   im Browser gelesen und nirgends hochgeladen, auch nicht in Foundrys
   Datenbaum. Das ist Absicht: Paizo-PDFs sind personalisiert und tragen den
   Namen des Käufers im Wasserzeichen.
2. **In die Welt schreiben.** Vorher läuft der Bilderlauf, dann zeigt eine
   **Vorschau**, was passieren würde: Ordner, Journal, Seiten, Verweise,
   Bilder, Szenen, Kreaturen, Hazards, Spielhilfen, Handouts — und wo ein
   Statblock von seiner Kompendium-Vorlage abweicht. Erst der Klick auf
   **Anlegen**/**Aktualisieren** ändert etwas.

Bei **mehreren Dateien** wird eines nach dem anderen abgearbeitet: lesen,
Vorschau, entscheiden, schreiben, nächstes. So liegt immer nur ein Heft im
Speicher. Der Fenstertitel zählt mit („2 von 4"), und es gibt einen dritten
Knopf: **Abbrechen** lässt nur dieses Heft aus, **Alle abbrechen** beendet den
Durchlauf. Am Ende steht eine Summenmeldung.

### Der Lesebericht

Kennung, Seiten, Blöcke, Schriften und die Blockrollen stehen nach **jedem**
Lesen in der Browser-Konsole (F12), zusammengeklappt. Warnungen dort ernst
nehmen — unbekannte Schriften bedeuten, dass die Gliederung leidet.

Als **Fenster** erscheint der Bericht nur, wenn die Einstellung „Lesebericht
nach dem Import zeigen" an ist (standardmäßig aus). Dort sitzt auch der Knopf
**journal.json herunterladen**; wer die Datei braucht, schaltet das Fenster
ein.

### Was dabei entsteht

Alles liegt in einem Ordnerbaum nach dem Schema
`Season 8 - Year of …` › `8-01 Titel`, je Dokumentart (Journale, Szenen,
Actors) einmal, in der Farbe der Season. Das Schema ist mit
`showstopping_tools` abgestimmt, dessen Makro „Build PFS Adventures" die
Inhalte einsammelt.

- **Journal** mit einer Seite je Abschnitt, Vorlesekästen, Statblock-Leisten
  und Verweisen auf Proben, Gegenstände, Zauber, Bedingungen und Kreaturen.
  Schadensangaben im Fließtext sind würfelbar (`4d10 piercing damage`), und
  eine Aufzählung von Fertigkeiten bekommt je Fertigkeit eine eigene Probe.
- **Spielhilfen-Journal** („Game Aids"): je Bild des Appendix eine Bildseite —
  zum Zeigen am Tisch.
- **Handout-Journal** („Handouts"): je Handout des Hefts — Briefe und Notizen
  für die Spieler — eine Textseite mit dem Wortlaut, zum Teilen mit den
  Spielern. Nur, wenn das Heft welche hat.
- **Bilder** als WebP unterhalb des gewählten Bildordners
  (`<Bildordner>/pfs_s08_01/…`). Figuren mit Bildunterschrift stehen zusätzlich
  im Journaltext, die Golarion-Übersichtskarte in ihrem Kasten.
- **Szenen** — je Schlachtkarte eine, mit schwarzem Rand und ausgeblendetem
  Foundry-Gitter (das Raster ist ja aufgedruckt). Für vermessene Karten sitzen
  Gittergröße und Versatz sofort richtig, und **Wände samt Türen** stehen
  bereits (siehe unten).
- **Kreaturen** als Welt-Actors, kopiert aus den Kompendien: direkte Treffer,
  Elite-/Weak-Fassungen über die Anpassung des PF2e-Systems, und **Varianten**
  über die Quellenzeile des Statblocks („Variant pirate …") — der Actor heißt
  dann wie im Szenario, samt Token-Namen.

  Die Kopie wird dabei **an den abgedruckten Statblock angeglichen**: Merkmale,
  Sinne, Sprachen, Bewegungsrate, Werte, Fertigkeiten und Angriffe. Aus dem
  Rigger wird so wirklich der `Dwarf Rigger` mit Dunkelsicht, Zwergisch,
  Tempo 25 und Sippendolch. Die Vorschau zählt jeden Punkt einzeln auf, mit dem
  Wortlaut des Hefts und dem der Vorlage nebeneinander.

  Was sich nicht anwenden lässt, wird **gemeldet statt geraten** — etwa ein
  Merkmal, das das PF2e-System nicht kennt, oder ein Satzfehler im Heft.

  Trägt ein Personenbild des Hefts denselben Namen wie der Statblock, wird es
  das **Bild des Actors** — und auch das **Token**, mit einem dynamischen Ring
  darum. Der Ring schneidet das hochformatige Porträt rund zu. Ein
  unpassendes Token der Vorlage wird dabei ersetzt; Actors ohne Bild aus dem
  Heft bleiben unangetastet.
- **NPC-Actors** für Personen, die das Heft im Spielhilfen-Anhang zeigt, aber
  nicht ausrechnet, in 8-04 etwa `Tolla` und `Emrick`. Sie bekommen einen
  schlanken Actor: Stufe 1, 10 Trefferpunkte, das schmale NPC-Blatt des
  Systems, das Bild aus dem Heft, die Einstufung **neutral** und in den
  Spielleiternotizen einen Verweis zurück auf ihre Bildseite. Vorbild sind die
  offiziellen Season-Module.
- **Effekte** für die Zusagen des Hefts: Sätze wie „alle SC erhalten +1 auf
  Initiative im Kampf gegen den Kapitän" werden Effekt-Gegenstände mit
  passendem Regelbaustein, verlinkt an ihrer Fundstelle im Journal. Der
  Spielleiter zieht sie zur Begegnung auf die Charaktere. **Spieler sehen sie
  nicht** — in der Seitenleiste fehlen sie ihnen, auf dem Blatt sind sie
  maskiert. Ist das Ziel nicht sicher zuzuordnen, entsteht der Effekt ohne
  Regelbaustein, nur mit dem Satz.

  Nennt das Heft eine Seite („in the chase on page 7"), ist der Bonus auf
  **diese Begegnung** eingegrenzt: Die Proben jener Seite tragen eine
  Wurf-Option, der Effekt fragt sie ab. Er darf dann die ganze Zeit auf dem
  Charakter liegen.
- **Hazards** als Welt-Actors. Haben sie eine Vorlage im Kompendium, werden
  sie kopiert; szenarioeigene werden aus dem abgedruckten Statblock **gebaut** —
  Heimlichkeit, Beschreibung, Entschärfen, Routine, Rücksetzung, Rüstung,
  Härte, Trefferpunkte, Rettungswürfe, Immunitäten und Schwächen, dazu je ein
  Eintrag für jeden Angriff und jede benannte Fähigkeit.

### Erneuter Import

Ein zweiter Lauf **aktualisiert statt zu verdoppeln**: Journalseiten,
Bildseiten und Szenen werden über stabile Kennungen wiedererkannt, Verweise
und Lesezeichen bleiben gültig. Was der Spielleiter eingerichtet hat, bleibt
unangetastet — Licht und Tokens einer Szene ebenso wie angepasste Actors.
Entfallenes wird gemeldet, aber **nie gelöscht**.

Das gilt auch für Kreaturen und Hazards: Ein vorhandener Actor wird **nie
aufgefrischt**, weil an ihm Handarbeit hängen kann. Wer eine Verbesserung des
Moduls an einer schon importierten Kreatur sehen will, muss sie erst über
**PFS-Szenarien** entfernen und dann neu importieren.

Zwei Dinge setzt der Import dagegen bei jedem Lauf, weil sie mitgeliefert
sind: die vermessenen Gitterwerte und die Wände einer Karte. Weichen sie ab,
zeigt die Vorschau die Szene als geändert. Karten ohne mitgelieferte Werte
bleiben komplett in der Hand des Spielleiters.

### Entfernen

Über **PFS-Szenarien** → Szenarien ankreuzen → **Ausgewählte entfernen**;
es dürfen mehrere auf einmal sein. Die Bestätigung zählt exakt auf, was
fällt: Journal, Spielhilfen, Szenen, Kreaturen, Effekte und die
Szenario-Ordner.

Der **Season-Ordner darüber fällt mit**, sobald nach dem Zug nichts mehr
darin steht — die Bestätigung nennt ihn dann beim Namen. Wohnt dort noch ein
zweites Szenario oder etwas Eigenes, bleibt er unangetastet.

Die **Bilddateien bleiben liegen**: Foundry-Module können keine Dateien
löschen; der Dialog nennt den Ordner für den Griff zum Dateibrowser.

## Einstellungen

| Einstellung | Bedeutung |
|---|---|
| **Bildordner** (eigenes Fenster mit Verzeichnis-Wähler) | Wurzel, unter der die Bilder liegen. Ohne Auswahl wird ohne Bilder importiert — die Vorschau sagt es. |
| **Name des Journals** | `8-01 Titel` (wie der Ordner) oder `PFS #08-01 - Titel` (wie die Abenteuer). |
| **Verweise auf Kompendien setzen** | Schaltet die Anreicherung ab — dann gibt es auch keine Kreaturen-Actors, denn die brauchen den Index. |
| **Kreaturverweise im Journal** | Zeigen die Statblock-Verweise auf die **Kompendien** oder auf die **Welt-Actors**, die der Import selbst anlegt. Der Welt-Modus kennt auch Varianten, die im Kompendium niemand findet. |
| **Eigenes Journal-Design verwenden** | Weist neuen Journalen das Blatt „PFS-Szenario-Journal" zu (siehe unten). Standardmäßig an. |
| **Effekte aus dem Heft anlegen** | Legt für jede Zusage des Hefts einen Effekt-Gegenstand an. Für Spieler unsichtbar, auf dem Charakterblatt maskiert. Standardmäßig an. |
| **Dynamische Token-Ringe verwenden** | Gibt Actors mit einem Bild aus dem Heft einen dynamischen Ring um das Token. Das Porträt wird auch ohne Ring zum Token. Hazards bekommen nie einen Ring. Standardmäßig an, wirkt nur auf neu angelegte Actors. |
| **NPC-Actors ohne Werte anlegen** | Legt für jede Person aus dem Spielhilfen-Anhang ohne Statblock einen schlanken NPC an. Aus, bleiben sie nur ein Bild im Journal. Standardmäßig an, wirkt nur auf neu angelegte Actors. |
| **Statblöcke an das Heft angleichen** | Überträgt die Abweichungen des Hefts auf die Kompendium-Kopie. Aus, bleibt die Kopie so, wie das Kompendium sie führt; die Vorschau nennt die Abweichungen trotzdem. Standardmäßig an, wirkt nur auf neu angelegte Kreaturen. |
| **Lesebericht nach dem Import zeigen** | Zeigt das Fenster mit Kennzahlen und dem Knopf zum Herunterladen der `journal.json`. In die Konsole wird der Bericht immer geschrieben. Standardmäßig **aus**, gilt nur für dich. |
| **Ausführliche Protokollausgabe** | Nur zur Fehlersuche. |

## Journal-Design

Das Modul bringt ein eigenes Journal-Blatt mit: **PFS-Szenario-Journal**.
Es verhält sich wie Foundrys Standardblatt und gestaltet nur. Der Entwurf
heißt „Heftseite", also gedrucktes Szenario im Fenster: Pergamentgrund,
Goldlinien, Seitentitel mittig über einer kurzen Doppellinie, getönte
Vorlese- und Seitenkästen, Merkmalsplaketten wie im Regelwerk. Die
Schriften (Eczar für Überschriften, Vollkorn für den Text) bringt das
PF2e-System mit; das Modul liefert keine eigenen.

Die Akzentfarbe ist die Hausfarbe der Season, dieselbe, die der
Season-Ordner in der Seitenleiste trägt, und für Season 7 damit dieselbe
wie im offiziellen Season-Modul. Auch das Inhaltsverzeichnis des Journals
liegt in dieser Farbe. Für dunkle Themen wird sie aufgehellt, ohne den
Farbton zu verlieren.

Hell und dunkel folgen der Themeneinstellung von Foundry, das Journal
schaltet also mit um.

Der Import weist es zu, solange die Einstellung an ist **und** am Journal
noch kein Blatt gewählt wurde. Umstellen geht jederzeit von Hand: über das
Menü in der Titelleiste des Journals → *Sheet Configuration* → **This
Sheet**; eine dort getroffene Wahl überschreibt kein späterer Import.

Ohne das Blatt — und auch ohne dieses Modul — bleiben die Journale
vollständig lesbar: Vorlesekästen und Statblock-Leisten tragen ihre
Grundgestaltung inline am Element.

## Vermessene Karten

Die Kästchengröße des aufgedruckten Rasters lässt sich nicht zuverlässig aus
dem Bild errechnen. Deshalb führt
`src/world/karten-einstellungen.ts` eine handgepflegte Tabelle: je Karte
Gittergröße, Versatz und gegebenenfalls eine Skalierung der Leinwand. Die
Werte werden mit Foundrys Gitterwerkzeug einmal ausgemessen und eingetragen;
der Import setzt sie dann bei jedem Lauf. Alle Karten der Season 8 sind
vermessen. Unvermessene Karten bekommen Foundry-Standardwerte, und der
Import fasst dort nie an, was von Hand eingestellt wurde.

## Wände auf den Karten

Die Wände werden wie die Gitterwerte einmal in Foundry gezeichnet und liegen
dann als JSON unter `daten/waende/<szenario>/<datei>.json`, eingetragen in
`src/world/waende.ts`. Alle sechs Karten der Season 8 sind
bewandet; fünf davon haben auch Türen (Delusions of Grandeur kommt ohne aus).

Liegt für eine Karte eine Wanddatei vor, ist **das Repo die Quelle**: Der
Import ersetzt bei Abweichung die Wände der Szene. Wer am Tisch nachbessert,
exportiert den neuen Stand zurück, statt ihn beim nächsten Lauf zu verlieren:

```bash
node tools/exportiere-waende.mjs "<Szenenname in Foundry>" 08-04/the-gallivanting-ghoul
```

Das Werkzeug liest die Wände aus der LevelDB der Testwelt (lesend, die
Instanz darf laufen) und nennt Wand- und Türzahl zum Gegenprüfen. Karten
**ohne** Wanddatei fasst der Import nicht an; dort bleiben selbstgezeichnete
Wände unangetastet.

## Seasons

Ziel sind **Season 8 und aufwärts**. Ältere Seasons laufen durch, zerfallen
aber in zu viele Journalseiten — das Modul warnt, heilt es aber nicht.

Jede neue Season bringt eine neue Hausschrift, und die Erkennung von
Überschriften hängt genau daran. Sie braucht deshalb je einen Eintrag in
`src/pdf/season.ts` (`SEASON_NAMES`) und `src/pdf/roles.ts` (`DISPLAY_FONTS`).
Fehlen sie, fallen alle Überschriften stumm auf Fließtext zurück. Das Modul
meldet unbekannte Schriften nach jedem Lauf; mehr Pflege braucht eine neue
Season nicht.

## Lizenz

MIT, siehe [LICENSE](LICENSE). Hinweise zu Paizo-Inhalten in [NOTICE.md](NOTICE.md).
