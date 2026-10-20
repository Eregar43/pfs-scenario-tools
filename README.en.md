# PFS Scenario Tools

[Deutsch](README.md) · **English**

A Foundry VTT module (v14, **pf2e** system). It reads the PDF of a Pathfinder
Society scenario in your browser and creates everything you need at the table
directly in the world: the journal, the images, the scenes, the creatures and
the NPCs.

Currently supported are the eight scenarios of **Season 8** (Year of Clockwork
Mystery): **8-01 through 8-08**. Everything is measured against them, and only
their maps come with grid values and walls. Other scenarios can be read as
well, but the result is untested; older seasons run through but are not the
target (see [Seasons](#seasons)).

## Installation

In Foundry under **Add-on Modules → Install Module**, enter this manifest URL:

```
https://github.com/Eregar43/pfs-scenario-tools/releases/latest/download/module.json
```

Requirements: Foundry VTT v14, Pathfinder Second Edition system. Compendium
links and the creature import need the PF2e compendia available in your
instance (Monster Core, NPC Core and so on, depending on what the scenario
refers to). If a stat block refers to a **Starfinder** book (in season 8 the
Mining Robot of 8-06, a variant from *Starfinder Alien Core*), you also need
the module **Starfinder Anachronism** (`sf2e-anachronism`); without it the
preview names the creature and does not create it.

## Usage

At the bottom of the **journal tab** in the sidebar there is a button (game
masters only): **PFS Scenarios**. It opens the management window, and that
window holds everything:

- the list of imported scenarios, each row with a **completeness check** —
  `Journal pages 15/15`, `Scenes 1/2`, `Actors 0/7`, `Images 13/13`. A green
  check means complete, a yellow triangle "something is missing", a red cross
  "gone entirely". If it says "target unknown", the scenario was imported with
  an older version, which did not yet record its counts;
- a note when an older module version did the import — a fresh import is
  usually worth it then;
- at the bottom the buttons **Import PFS scenarios**, **Remove selected**,
  **First steps** and **Close**.

The window stays open while you work and refreshes after every action.

On the first start in a world, **First steps** appears by itself: a window
showing the way to the import and the note about the image folder. It does not
come back afterwards — the button of the same name brings it up again.

All three windows are also available from the console:
`game.pfsScenarioTools.importieren()`, `game.pfsScenarioTools.uebersicht()`
and `game.pfsScenarioTools.willkommen()`.

### The import, step by step

1. **Pick a PDF** — several at once is fine. The files are read in the browser
   only and are never uploaded anywhere, not even into Foundry's data tree.
   That is deliberate: Paizo PDFs are personalised and carry the buyer's name
   in the watermark.
2. **Write to the world.** The image pass runs first, then a **preview** shows
   what would happen: folders, journal, pages, links, images, scenes,
   creatures, hazards, game aids, handouts — and where a stat block differs
   from its compendium template. Only the click on **Create**/**Update**
   changes anything.

With **several files**, they are handled one after another: read, preview,
decide, write, next. That way only one scenario is ever in memory. The window
title counts along ("2 of 4"), and there is a third button: **Cancel** skips
only this scenario, **Cancel all** ends the run. A summary message closes it
out.

### The reading report

Identifier, pages, blocks, fonts and the block roles are written to the
browser console (F12) after **every** read, collapsed. Take warnings there
seriously — unknown fonts mean the structure suffers.

As a **window**, the report only appears when the setting "Show reading report
after import" is on (off by default). That window also holds the **Download
journal.json** button; enable it if you need the file.

### What gets created

Everything sits in a folder tree following the scheme
`Season 8 - Year of …` › `8-01 Title`, once per document type (journals,
scenes, actors), in the colour of the season. The scheme is aligned with
`showstopping_tools`, whose "Build PFS Adventures" macro collects the
contents.

- **Journal** with one page per section, read-aloud boxes, stat block strips
  and links to checks, items, spells, conditions and creatures. Damage
  expressions in the body text are rollable (`4d10 piercing damage`), and a
  list of skills gets one check per skill.
- **Game aids journal** ("Game Aids"): one image page per appendix image — for
  showing at the table.
- **Handout journal** ("Handouts"): one text page per handout in the scenario —
  letters and notes for the players — with the wording, ready to share with
  the players. Only if the scenario has any.

  Both journals are set to "Observer", their pages to "None": players see the
  journal but no page until the GM reveals pages one by one. The main journal
  stays with the GM.
- **Images** as WebP below the chosen image folder
  (`<image folder>/pfs_s08_01/…`). Figures with a caption also appear in the
  journal text, the Golarion overview map inside its sidebar. The room label
  icons sit next to them in `marker/` (`a1.webp`, `a2.webp` …). All file names
  are lower case.
- **Scenes** — one per battle map, with a black border and Foundry's grid
  hidden (the grid is printed on the map already). For measured maps, grid
  size and offset sit right immediately, and **walls including doors** are
  already in place (see below). What the booklet prints on the map comes
  along: **room labels** (A1, A2 …) as notes that open the room's journal
  page, and **trap areas, starting positions and labels** as drawings only
  the GM can see.
- **Creatures** as world actors, copied from the compendia: direct matches,
  elite and weak versions via the PF2e system's adjustment, and **variants**
  via the stat block's source line ("Variant pirate …") — the actor is then
  named as the scenario names it, token included.

  The copy is **adjusted to the printed stat block**: traits, senses,
  languages, speed, values, skills and attacks. The rigger really does become
  the `Dwarf Rigger` with darkvision, Dwarven, Speed 25 and a clan dagger. The
  preview lists every point separately, with the scenario's wording and the
  template's side by side.

  Whatever cannot be applied is **reported instead of guessed** — a trait the
  PF2e system does not know, say, or a typesetting error in the scenario.

  If an image of a person in the scenario carries the same name as the stat
  block, it becomes the **actor's image** — and the **token** as well, with a
  dynamic ring around it. The ring crops the portrait to a circle. An
  unsuitable token from the template is replaced; actors without an image in
  the scenario are left alone.
- **NPC actors** for people the scenario shows in the game aids appendix but
  does not stat out, such as `Tolla` and `Emrick` in 8-04. They get a lean
  actor: level 1, 10 hit points, the system's slim NPC sheet, the image from
  the scenario, alliance **neutral** and a link back to their image page in
  the GM notes. The official season modules are the model.
- **Effects** for the promises the scenario makes: sentences such as "all PCs
  gain +1 to initiative against the captain" become effect items with a
  matching rule element, linked at the place they were found in the journal.
  The game master drags them onto the characters for the encounter. **Players
  do not see them** — they are missing from their sidebar and masked on the
  sheet. If the target cannot be assigned safely, the effect is created
  without a rule element, carrying only the sentence.

  If the scenario names a page ("in the chase on page 7"), the bonus is
  limited to **that encounter**: the checks on that page carry a roll option
  and the effect tests for it. It may then stay on the character the whole
  time.
- **Diseases** of the scenario (stat block "… Disease N" in the appendix) as
  a text page of their own in the game aids journal, with the stat block as
  printed: saving throw, onset, every stage. The main text links to it at the
  first mention. Not an item: the system's affliction type is locked in
  released builds.
- **Hazards** as world actors. If they have a compendium template they are
  copied; scenario-specific ones are **built** from the printed stat block —
  stealth, description, disable, routine, reset, AC, hardness, hit points,
  saves, immunities and weaknesses, plus one entry for every attack and every
  named ability.
- **Creatures without a template** are **built** the same way when their
  stat block has no source line — they exist only in the scenario. Taken
  over: level, traits, size, perception and senses, languages, skills and
  lore, attributes, AC, saves, hit points, immunities, weaknesses and
  resistances, speed, attacks and abilities. Items and spells stay as text;
  the preview names whatever could not be placed.

### Importing again

A second run **updates instead of duplicating**: journal pages, image pages
and scenes are recognised by stable identifiers, links and bookmarks stay
valid. Whatever the game master set up is left untouched — a scene's lighting
and tokens as much as adjusted actors. Anything that fell away is reported but
**never deleted**.

The same holds for creatures and hazards: an existing actor is **never
refreshed**, because handwork may be attached to it. If you want to see an
improvement of the module on an already imported creature, remove it via **PFS
Scenarios** first and import it again.

Two things the import does set on every run, because they ship with the
module: the measured grid values and a map's walls. If they differ, the
preview shows the scene as changed. Maps without shipped values stay entirely
in the game master's hands.

### Removing

Via **PFS Scenarios** → tick scenarios → **Remove selected**; several at once
is fine. The confirmation lists exactly what falls: journal, game aids,
scenes, creatures, effects and the scenario folders.

The **season folder above them falls with them** as soon as nothing is left
inside — the confirmation names it then. If a second scenario still lives
there, or something of your own, it is left untouched.

The **image files stay**: Foundry modules cannot delete files; the dialog
names the folder so you can reach for the file browser.

## Settings

| Setting | Meaning |
|---|---|
| **Image folder** (own window with a directory picker) | Root below which the images live. Without a choice, the import runs without images — the preview says so. |
| **Journal name** | `8-01 Title` (like the folder) or `PFS #08-01 - Title` (like the adventures). |
| **Create compendium links** | Turns enrichment off — which also means no creature actors, since those need the index. |
| **Creature links in the journal** | Whether stat block links point at the **compendia** or at the **world actors** the import creates itself. The world mode also knows variants that nobody will find in a compendium. |
| **Use the module's journal design** | Assigns the "PFS Scenario Journal" sheet to new journals (see below). On by default. |
| **Create effects from the scenario** | Creates an effect item for every promise the scenario makes. Invisible to players, masked on the character sheet. On by default. |
| **Use dynamic token rings** | Gives actors with an image from the scenario a dynamic ring around the token. The portrait becomes the token even without a ring. Hazards never get one. On by default, applies to newly created actors only. |
| **Create NPC actors without values** | Creates a lean NPC for every person in the game aids appendix without a stat block. Off, they remain just an image in the journal. On by default, applies to newly created actors only. |
| **Adjust stat blocks to the scenario** | Transfers the scenario's deviations onto the compendium copy. Off, the copy stays as the compendium keeps it; the preview names the deviations either way. On by default, applies to newly created creatures only. |
| **Import map markings** | Room labels on the map (A1, A2 …) become notes that open the room's journal page; trap areas, starting positions, lines and labels become drawings only the GM can see. On by default, takes effect on the next import. |
| **Room marker size** | Edge length of an icon in map squares, 0.5 to 2. 1 by default. |
| **Room marker background colour** | Fill colour behind the label. White by default. |
| **Room marker text colour** | Colour of the label and its border. Black by default. The browser shows new colours only after a hard reload (Ctrl+Shift+R). |
| **Show reading report after import** | Shows the window with key figures and the button to download `journal.json`. The report always goes to the console. **Off** by default, applies to the whole world. |
| **Verbose logging** | For troubleshooting only. |

## Journal design

The module brings its own journal sheet: **PFS Scenario Journal**. It behaves
like Foundry's standard sheet and only changes the look. The design is called
"scenario page", meaning a printed scenario in a window: parchment ground,
gold rules, page titles centred above a short double line, tinted read-aloud
and sidebar boxes, trait tags as in the rulebook. The fonts (Eczar for
headings, Vollkorn for body text) come with the PF2e system; the module ships
none of its own.

The accent colour is the season's house colour, the same one the season folder
carries in the sidebar, and for Season 7 therefore the same one the official
season module uses. The journal's table of contents takes that colour too. For
dark themes it is lightened without losing its hue.

Light and dark follow Foundry's theme setting, so the journal switches along.

The import assigns the sheet as long as the setting is on **and** no sheet has
been chosen on the journal yet. You can switch at any time by hand: via the
menu in the journal's title bar → *Sheet Configuration* → **This Sheet**; a
choice made there is never overwritten by a later import.

Without the sheet — and without this module — the journals stay fully
readable: read-aloud boxes and stat block strips carry their basic styling
inline on the element.

## Measured maps

For every measured map the module carries **one file**:
`daten/karten/<scenario>/<file>.json`, for example
`daten/karten/08-03/the-solstice-theater.json`. The module picks the files up
on its own at build time; a new map needs no code change. All eleven Season 8
maps are measured and have walls.

A map file can carry:

- the canvas **scale** (image size times factor),
- the **scene settings**: grid, shift, padding, token vision, fog of war,
  environment and global light, weather, scene transition,
- the **level**: elevation, background colour and tint, image placement,
- the **walls**, **lights**, **regions**, **notes** and **drawings**.

Image paths stay out (the background image is created anew from the PDF in
every world), as do the initial view and everything that only applies to one
world. Notes point to the scenario's journal by its kind (main journal, Game
Aids, Handouts), not by its ID — that is different in every world. A room
icon is stored as its label (`"marke": "A1"`); the import creates the image
in each world's image folder.

If the file carries no notes or drawings, the import places those from the
booklet (see "Import map markings").

If the file names a part, **the repository is the source**: on a mismatch the
import replaces it. If you touch things up at the table, export the new state
instead of losing it on the next run. What the file does not name belongs to
the GM; the import does not touch it. Unmeasured maps get Foundry's defaults.

### Export map

The management window has an **Export map** button for this. It opens a
window with two dropdowns, scenario and scene. The window reads everything
that belongs in a map file from the selected scene and offers the file for
download.

The scale is not stored in the scene. It is computed from canvas and image
width and can be overridden in the window.

If the module already carries a file for this map, the window says whether
the state in the scene matches it, and otherwise names the parts that differ.
That is how you notice when you drew against an older version by accident.

The export deliberately leaves three things out and reports them: region
behaviors that run a script or macro; image paths on notes and drawings that
do not belong to Foundry itself; and note links to journals that do not come
from this module. The module's own room icons are not lost: they become their
label.

The downloaded file is exactly the content of a pull request for that map.
Carrying it into the repository stays manual work: the module runs in the
browser and knows nothing about Git.

## Seasons

The target is **Season 8 and up**. Older seasons run through but fall apart
into too many journal pages — the module warns about it and does not heal it.

Every new season brings a new house font, and heading detection hangs on
exactly that. It therefore needs one entry each in `src/pdf/season.ts`
(`SEASON_NAMES`) and `src/pdf/roles.ts` (`DISPLAY_FONTS`). Without them, all
headings fall back to body text silently. The module reports unknown fonts
after every run; a new season needs no more care than that.

## License

MIT, see [LICENSE](LICENSE). Notes on Paizo content in [NOTICE.md](NOTICE.md).
