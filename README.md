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
