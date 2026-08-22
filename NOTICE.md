# Hinweise zu Rechten Dritter

## Paizo-Inhalte

Dieses Repository enthält **keine** Inhalte von Paizo Inc.: keine PDFs, keine
daraus gewonnenen Journale, keine Bilder, keine Textauszüge. `.gitignore` hält
`pdf/`, `referenz/` und `out/` bewusst draußen.

Das gilt ausdrücklich auch für die **Tests**. Sie prüfen die Satzerkennung an
frei erfundenen Sätzen, die den vorkommenden Satzbauformen nachgebildet sind —
Wortlaut, Figuren und Orte darin sind erfunden. Wer eine neue Form aufnimmt,
baut sie ebenso nach, statt sie abzuschreiben.

Was das Repository **nennt**, sind Bezeichnungen, ohne die das Modul seine
Arbeit nicht tun kann: die Titel der Seasons und Szenarien, die Namen der
Karten und die Namen der Regelbausteine des Pathfinder-Systems. Dazu kommen
handgemessene Werte zu einzelnen Karten — Kästchengröße, Versatz und die
Koordinaten selbst gezeichneter Wände. Sie beschreiben keine Bildinhalte und
enthalten kein Kartenmaterial.

Das Modul verarbeitet ausschließlich Dateien, die der Anwender selbst besitzt.
Die Verarbeitung läuft vollständig im Browser des Anwenders. Das PDF selbst
wird nie hochgeladen; nur die daraus gewonnenen Bilder legt das Modul im
Datenverzeichnis der **eigenen** Foundry-Instanz ab — an Dritte wird nichts
gesendet.

Pathfinder, Pathfinder Society und die zugehörigen Marken gehören Paizo Inc.
Dieses Projekt steht in keiner Verbindung zu Paizo und ist nicht von Paizo
unterstützt. Verwendung im Rahmen der
[Paizo Community Use Policy](https://paizo.com/community/communityuse).

## pdf.js

Das Modul liefert Teile von [pdf.js](https://github.com/mozilla/pdf.js) mit
(`pdfjs-dist`), Apache-Lizenz 2.0, Copyright Mozilla Foundation.

## Herkunft der Satzerkennung

Die Erkennung von Überschriften, Spalten, Vorlesekästen und Statblöcken stammt
aus `PaizoPFSScenarioTextExtractor` desselben Autors.
