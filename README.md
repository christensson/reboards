# ReBoards

Revamped agile boards for YouTrack: relations, hierarchy, swimlanes and time.
ReBoards is a YouTrack app (Enhanced DX, TypeScript) that adds a **ReBoards** item to the main menu.
It requires YouTrack 2026.2 or later.

## What it does

- **Relations**: labelled connectors to related issues, and links created by dragging.
- **Hierarchy**: subtasks grouped in collapsible boxes under their parent, with progress.
- **Swimlanes**: one or two levels, such as Team → Assignee.
- **Time**: rows by date, version or build, with overdue and late work highlighted.
- Keyboard navigation and moves, linked agile boards and sprints, personal or shared boards, and read-only
  MCP tools for AI assistants.

See [MARKETPLACE.md](MARKETPLACE.md) for the full feature description.

## Design

### State stored in YouTrack

ReBoards adds no custom fields, workflows or project settings (`requirements.ts` is empty). The app's state
lives in two places, and the board itself changes ordinary issue data.

**Persistent server-side storage: `AppGlobalStorage`.** The only entity extension (`src/entity-extensions.json`)
is one string property, `boards`, on the app's global storage. It holds a single JSON document
(`{version: 1, boards: BoardConfig[]}`) with the configuration of every board, personal and shared:

- identity and access: id, name, owner login and stable owner id (Hub id), shared flag, projects;
- issue selection: query, linked agile board, sprint field and options;
- layout: column field, columns, combined and ignored values, one or two swimlane levels with their sort
  order (including the custom drag-sorted order), time layout and default row mode;
- card fields, card color field, connector link types and related boards;
- `createdAt`, `updatedAt` and a `version` that the server raises on every write.

Only the backend routes under `src/backend/router/global/boards/` read or write the document, and they check
access first (see `src/backend/boards/store.ts` and `access.ts`). A save must name the version it started from,
so the client can three-way merge concurrent edits (`board-merge.ts`) instead of overwriting them. Each owner
may have at most 100 boards, and the document may be at most 4,000,000 characters.

**Browser-local storage: per-user preferences.** View state is personal and lives in the user's browser
under the key `reboards.prefs.v1`. It goes in the host's `host.storage` app storage when YouTrack provides it,
and in `window.localStorage` otherwise (`src/common/storage/prefs.ts`). It holds the last board, the chosen
sprint per board, view settings per board (card size, connector mode, "+" links, grouping by parent),
starred boards, collapsed rows, columns, swimlanes and subtask groups, swapped swimlane levels, the columns
picked for dynamic column fields, and the chosen swimlanes or time layout. Nothing here is shared, and it does
not follow the user to another browser.

**Issues.** Dragging a card, moving it with the keyboard or creating a link changes the issue itself through
the YouTrack REST API: custom field values, and subtask or other issue links. These requests run with the
user's own permissions. The "+" in a cell opens YouTrack's new-issue page with the cell's values set, so
YouTrack creates the issue. ReBoards keeps no other copy of issue data.

The board, settings page and sprint are also in the page URL (`/boards/<id>?sprint=<sprint>`), so links open
the same view. Nothing is stored for that.

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
    ai-tools/          MCP tools: reboards_list_boards, reboards_get_board, reboards_list_board_issues
    boards/            persistence (AppGlobalStorage JSON), permission rules, HTTP helpers
    router/global/     boards (GET, save, delete, owner), context, projects/permissions (typed client via @/api)
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
    hooks/             UI hooks such as per-user preferences
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
