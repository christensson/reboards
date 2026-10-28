# ReBoards

Kanban and scrum sprint boards for YouTrack with first-class grouping of subtasks and relation connectors.
ReBoards is a YouTrack app (Enhanced DX, TypeScript) that adds a **ReBoards** item to the main menu.

## What it does

- Boards work like YouTrack agile boards: a query selects the issues, a state or enum field defines the
  columns (values can be combined into one column or ignored), and an enum, version, user or integer field
  defines the rows (custom drag-sorted, alphabetical or numerical order).
- Optional sprints: pick a version or enum field and the sprint selector lists its values.
- Issues that are subtasks of the same parent are drawn inside an outlined box per row, with a title such as
  `SP-12: Epic · 3 of 5 (1/2)` (children in this box, total subtasks, box index when the parent spans rows).
  Boxes are collapsible to per-column indicators; the parent's column is marked when the parent is on the board.
- Cards show `ID: summary`, tags and a configurable set of fields; a size selector switches between small and
  normal cards. The search box highlights matches while typing, and Enter selects them and scrolls to the first.
- Drag a card to another column or row to update the field (a dialog asks which value to use for columns that
  combine several values). Click selects, double-click opens the issue in a new tab.
- Selected issues show curved connectors to related issues on the board, labelled with the relation name
  (arrowhead at the target, filled diamond at the parent end of subtask links). A toggle shows all connectors.
- Every cell has a discreet "+" that opens the YouTrack new-issue page with the row and column fields preset.
- Boards are shared or personal; shared boards can be changed by their owner or a system administrator.

## Development

Requirements: Node.js 20.18+ and a YouTrack permanent token with app-upload permissions.

```bash
npm install
cp .env.example .env            # then set YOUTRACK_HOST and YOUTRACK_TOKEN
npm run typecheck && npm run lint && npm test
npm run build                   # backend → lint → frontend → manifest validation (output in dist/)
npm run upload-local            # upload dist/ using the .env credentials
npm run watch                   # rebuild and upload on change (refresh the YouTrack page)
```

Useful checks after an upload:

```bash
npx youtrack-app app info --app reboards
npx youtrack-app app requirement-errors --app reboards
npx youtrack-app app logs --app reboards
```

## Project layout

```
src/
  backend/
    boards/            persistence (AppGlobalStorage JSON), permission rules, HTTP helpers
    router/global/     boards GET, boards/save POST, boards/delete POST (typed client via @/api)
  common/
    model/             BoardConfig types, defaults, normalization and validation (shared by both sides)
    youtrack/          REST client, field classification, query composition, URL helpers, host registration
    storage/           per-user preferences (host.storage with a localStorage fallback)
    components/        reusable UI: QueryEditor (Ring UI QueryAssist + search/assist), SortableValueList,
                       FieldSelect, ProjectsSelect, ValuePill
  widgets/reboards/
    model/             pure board logic: issue normalization, field universe, layout, grouping, sorting,
                       connectors, search, drag/drop planning (all unit-tested with vitest)
    data/              hooks that load boards, reference data and issues
    board/             board screen, toolbar, rows, cells, cards, group boxes, connectors overlay
    settings/          board settings screen and editors
```

## Notes for maintainers

- Only the handler function body of a router file is bundled; put helpers and constants in modules under
  `src/backend/<dir>/` and import them.
- Types annotated with `@zod-to-schema` must use the three-line comment form and flat object bodies.
- The YouTrack base URL used for issue links and the new-issue template URL is derived from the widget
  location (path before `/api/`), then from the referrer, then from the origin. Verify it on installations
  that run under a context path.
- The admin check uses the `ADMIN_UPDATE_APP` permission key.
