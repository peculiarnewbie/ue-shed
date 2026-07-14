# Idea catalog: corpus tools and analytical surfaces

> Status: ranked brainstorm catalog; promising entries graduate to their own vision documents

The four long-horizon directions observe and drive a **running** world. This catalog collects a
different family: tools over what the team has **authored**. They share one pattern:

> Take something the team authors as scattered fragments — text, placements, parameters, notifies,
> table values — and assemble it into one corpus with query, charts, history, and shareable views.

## Why this family is worth a catalog

- **The editor authors data but has no surface for understanding it.** Tables without charts,
  assets without queries, text without search-all, space without measurement. The web is strictly
  better at query, visualization, history, and iteration speed.
- **Three structural gaps of the editor** cannot be fixed in-process: it is amnesiac (no memory
  across sessions — every "compared to when?" question is unanswerable), single-user (no review,
  annotation, or shared views), and query-less.
- **The saved-package spine is the moat.** Most popular marketplace utilities and in-house
  Editor Utility Widget folders are read → analyze → report tools that live in-process only because
  that is where asset data access was. They pay with engine-version lock, project diff pollution,
  cook-contamination risk, and forcing the tool on every seat. UE Shed already paid the parser cost;
  each corpus tool is expensive as anyone's first project and nearly free as our Nth.
- **Ambition compounds by crossing corpora**: text × audio, data × git history, placements × map
  projection, tables × simulation.

Filters applied to every entry: project-agnostic; relatively self-contained; valuable beyond
correctness (designers, writers, artists, producers — not only engineers); zero or minimal new
engine-side surface.

## Ranking

Ranked by a blend of **potential** (size of the unlock), **alignment** (external premise,
project-agnostic, designer value), and **readiness** (reuse of the existing saved-package reader,
authoring session model, git, and capture spines).

| Rank | Idea                                                                                    | One-line promise                                                 | Spine                     |
| ---- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------- |
| 1    | [Game text workbench](#1-game-text-workbench)                                           | All player-facing text as one searchable, editable corpus        | packages + sessions       |
| 2    | [Balance analytics](#2-balance-analytics)                                               | Charts and pivots folded over the live draft, not just the save  | authoring sessions        |
| 3    | [Queryable world](#3-queryable-world)                                                   | Placed actors as a database with spatial queries and charts      | packages (OFPA)           |
| 4    | [Project cartography](#4-project-cartography)                                           | Whole-project dependency, size, and reference atlas              | asset registry            |
| 5    | [Content time machine](#5-content-time-machine)                                         | Chart any authored value across the project's git lifetime       | packages × git            |
| 6    | [Narrative studio](#6-narrative-studio)                                                 | Script view, scratch VO, and a VO pipeline board over the corpus | text corpus × audio       |
| 7    | [Map atlas and spatial annotation](#7-map-atlas-and-spatial-annotation)                 | A measurable 2D world canvas with comments pinned to space       | capture + packages        |
| 8    | [Save-game forensics and corpus analytics](#8-save-game-forensics-and-corpus-analytics) | Saves as inspectable repro documents and a queryable corpus      | save decoding             |
| 9    | [The wind tunnel](#9-the-wind-tunnel)                                                   | Monte Carlo simulation over authored data with live draft charts | authoring sessions        |
| 10   | [Animation corpus](#10-animation-corpus)                                                | Sequence stats plus a searchable notify index                    | packages                  |
| 11   | [Asset lookbook](#11-asset-lookbook)                                                    | Visual browsing and curation boards from embedded thumbnails     | packages                  |
| 12   | [Audio audit](#12-audio-audit)                                                          | Wave settings plus real loudness analysis per sound class        | packages + source audio   |
| 13   | [Project janitor](#13-project-janitor)                                                  | Unused assets, redirectors, and content-hash duplicates          | asset registry + packages |
| 14   | [Import conformance and texture audit](#14-import-conformance-and-texture-audit)        | Every texture setting as one queryable, charted sheet            | packages                  |
| 15   | [Validation without the validator](#15-validation-without-the-validator)                | Declarative rule packs over packages, no project code            | packages                  |
| 16   | [Input atlas](#16-input-atlas)                                                          | Every binding across contexts, conflicts, generated control docs | packages                  |
| 17   | [Gameplay tag atlas](#17-gameplay-tag-atlas)                                            | Tag taxonomy with usage counts and rename blast radius           | config + packages         |
| 18   | [Content growth observatory](#18-content-growth-observatory)                            | Repo and LFS growth attributed by folder and discipline          | git                       |
| 19   | [Settings drift and config archaeology](#19-settings-drift-and-config-archaeology)      | Resolved config values with provenance and diff vs defaults      | config files              |
| 20   | [Codex export](#20-codex-export)                                                        | A generated, un-rottable design bible derived from authored data | packages                  |

## Entries

### 1. Game text workbench

All player-facing text — string tables, loc archives, FText properties surfaced by the package
reader — as one corpus. Full-text search across the game, in-context editing through the authoring
session model, character and length budgets with overflow flags, terminology consistency checks,
untranslated-percentage charts per language. The loc pipeline is standard Unreal, the data is
file-readable, and text is the safest possible mutation domain: no transforms, no references.
`Audience: writers, narrative, loc · Engine-side: none new`

### 2. Balance analytics

Computed columns, pivots, and charts over any set of DataTables and curve assets, with user-authored
formulas so UE Shed ships the derivation layer, not game knowledge. The killer detail: charts fold
the **draft command log**, so a designer drags a value and watches the curve move before Apply.
Fingerprinted snapshots make "this table as of last Tuesday vs. my draft" a balance diff for free.
Converts data authoring from parity-with-editor into strictly-better-than-editor.
`Audience: systems designers · Engine-side: none new`

### 3. Queryable world

Placed actors are data — class, transform, properties — serialized in map packages, and One File
Per Actor makes them individually file-readable. The World Outliner is one live map at a time,
filter-not-query, no aggregation. Decode placements into a database: "every pickup within 50m of a
spawn point," "light count per region across all maps," density charts, class censuses, results
plotted on the map atlas. The content already is a database; Unreal never gave it a query surface.
`Audience: level designers, tech art · Engine-side: none`

### 4. Project cartography

The in-editor Reference Viewer and Size Map are asset-rooted and session-bound; Asset Audit is a
flat table. Build the whole-project graph from the asset registry: references, sizes, chunks, cook
footprint, path-to-root queries ("what chain pulls this 400 MB texture into the build"), broken
soft references, and history — when did this edge appear, which commit grew this chunk. The most
obvious drop-in in the catalog.
`Audience: everyone; producers for size · Engine-side: none`

### 5. Content time machine

Cross the package reader with git history: decode any historical version of a table, curve, or
string table straight from git objects and chart authored values across the project's lifetime.
"This weapon's damage over eighteen months, annotated with commits." "When did this row appear, who
touched it last." Binary-file archaeology that teams currently simply do not do. Quietly supersedes
half of asset diff review: a diff is the two-point case of a value's full history.
`Audience: designers, producers · Engine-side: none`

### 6. Narrative studio

Three escalations over the text corpus. **Script view:** with declared roles (speaker column,
sequence order), render game text as a readable screenplay. **Scratch VO:** pipe lines through TTS
so playtests have placeholder audio that regenerates when text changes. **VO pipeline board:**
cross text with the audio asset corpus — which lines have audio, which audio is orphaned or
length-mismatched, exportable recording scripts. Narrative teams run all of this in spreadsheets.
`Audience: writers, narrative, audio · Engine-side: none new`

### 7. Map atlas and spatial annotation

Orthographic projections of maps as a navigable canvas with a real mapping back to world space:
measurement, named places, pins, region outlines — layout math designers currently do by flying the
viewport. On top, the social layer: comments anchored to world coordinates and subject identity,
with captures attached. Figma comments where the canvas is the game world. The atlas is also the
display substrate the queryable world and observatory trails land on.
`Audience: level designers, whole team for review · Engine-side: one capture path, already built`

### 8. Save-game forensics and corpus analytics

Decode, inspect, diff, and edit save games as documents: QA attaches a save to a bug, a developer
opens it in the browser, tweaks a flag, hands back a repro state. Then point it at a folder of
saves and get distributions — "how much currency do players hold entering chapter 3?" Every save
file is a telemetry data point the studio already owns; charts over a save corpus is the cheapest
real player-data product that can exist.
`Audience: QA, designers · Engine-side: none for stock SaveGame serialization`

### 9. The wind tunnel

Balance analytics answers "what are the values"; this answers "what do the values do." Monte Carlo
over authored data: ten thousand loot rolls charted against the pity curve, time-to-kill matrices
from weapon and enemy tables, economy sources and sinks projected over forty hours. Models are
user-authored — or agent-authored against the typed schema — and fold the draft command log like
everything else: move a slider, watch the distribution recompute.
`Audience: systems designers · Engine-side: none`

### 10. Animation corpus

Every sequence and montage: length, frame rate, compression, curves — and a **notify index**.
Notifies are how animation triggers gameplay (footsteps, hit frames, VFX), scattered across
thousands of sequences with no way to ask "everywhere this notify fires" without opening assets one
by one. The text-workbench move applied to animation.
`Audience: animators, tech animators · Engine-side: none`

### 11. Asset lookbook

Saved packages embed cached thumbnails, so a visual content browser — search, filter, thumbnail
grids — works entirely from files. On top: curation boards ("props for the fishing village"),
annotated picks, entries linked to live asset identity. Replaces the screenshot-the-Content-Browser-
into-Miro workflow with references that stay live.
`Audience: art directors, artists, designers · Engine-side: none`

### 12. Audio audit

Sample rates, channel counts, compression quality, and sound class assignment across all waves —
plus real loudness analysis on source audio in the host process, charting LUFS distributions per
class and catching the one explosion that is 12 dB hot. No engine plugin can casually pull in an
audio-analysis library the way the host can. Audio is chronically the most undertooled discipline.
`Audience: audio designers · Engine-side: none`

### 13. Project janitor

Unused assets, redirectors, empty folders, and duplicate detection by content hash — the
copy-pasted 4K texture living in three folders. Displaces one of the most-installed free plugins
with zero project footprint, and adds the history the editor cannot: orphan count over time.
Reporting is pure file-read; deletion goes out as an explicit reviewed plan, never a silent sweep.
`Audience: tech art, producers · Engine-side: none for reporting`

### 14. Import conformance and texture audit

Every texture's dimensions, compression, sRGB flag, mip settings, group, and naming as one
queryable sheet: memory by texture group, largest offenders, non-power-of-two strays, settings
drifted from folder convention. Replaces naming-check plugins and the in-house audit commandlet,
with charts instead of a log dump.
`Audience: tech art · Engine-side: none`

### 15. Validation without the validator

Unreal's DataValidation framework means writing `UEditorValidator` subclasses — code in the
project, per rule. Externalize it: declarative rule packs evaluated over package data, results as a
dashboard with history and ownership instead of a map-check log that scrolls away. Rules over
generic package data are project-agnostic by construction, so packs are shareable between studios.
`Audience: whole team · Engine-side: none`

### 16. Input atlas

Enhanced Input mapping contexts are assets. One sheet of every binding across every context:
conflict detection across overlapping contexts, per-platform comparison, gamepad coverage gaps, and
controls documentation generated from truth rather than a stale screenshot. Composes with the
scenario product later through shared action identities.
`Audience: designers, UX · Engine-side: none`

### 17. Gameplay tag atlas

The editor gives tags a picker, not a governance surface. Tree editing over the taxonomy, per-tag
usage counts computed from the package reader ("referenced by 340 assets, 12 tables, 3 configs"),
orphan detection, and rename with a visible blast radius.
`Audience: designers, gameplay engineers · Engine-side: none for reporting`

### 18. Content growth observatory

The repo itself as a corpus: LFS size by folder over time, growth attribution by discipline, "this
month's 2 GB came from these 14 files." Producers get this today by asking an engineer for a
one-off script. Shares the git spine with the time machine.
`Audience: producers · Engine-side: none`

### 19. Settings drift and config archaeology

Config resolution is deterministic and file-based. A resolver with provenance per key — "what is
this setting on Android Shipping and which of the nine ini layers set it" — plus the one-page diff
against engine defaults that every engineer inheriting a project reconstructs by hand.
`Audience: engineers, tech art · Engine-side: none`

### 20. Codex export

The safe form of living documents: a generated static site — items, abilities, stats, text, icons
from embedded thumbnails — rebuilt from authored data on demand. No user management, no storage
platform to prescribe; it is an export, like rendering a report, and it cannot rot because it is
derived. Ranked last only because it compounds off corpora built by higher entries.
`Audience: whole team, QA, onboarding · Engine-side: none`

## Sequencing observations

- Ranks 3–5 and 10–20 are read-only over files: no companion, no session model, no live editor.
  They are shippable in parallel with authoring work, and each is a small, demoable,
  "install nothing" proof of the UE Shed premise.
- Ranks 1, 2, 6, and 9 ride the authoring session model and multiply the current data-authoring
  investment rather than opening a new front.
- The endgame of the self-contained entries is the in-house Editor Utility Widget folder: studio
  tools built outside the project against typed, capability-scoped contracts, versioned
  independently, with the trusted host keeping mutation authority.

## Anti-goals for the whole family

- Requiring a plugin, project code, or a running editor for any read-only analysis.
- Prescribing project-specific schemas instead of user-authored formulas, roles, and rule packs.
- A hosted platform with its own user management; UE Shed ships tools and exports, not a SaaS org.
- Silent mutation: every write path goes through the reviewed session model with explicit Apply.
- Charts computed from a different decoding path than the one inspection and diffing use.
