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

**Persistent server-side storage: extension properties.** `src/entity-extensions.json` declares string
properties that each hold the same JSON document, `{version: 1, boards: StoredBoard[], deleted: Tombstone[]}`:

- `AppGlobalStorage.boards00` … `boards31`: 32 **slots**. Every shared board is stored in two of them (its
  **replicas**), chosen from a hash of its id (`slotsOf` in `src/backend/boards/storage.ts`). Private boards
  that someone other than their owner placed (the migration, a transfer, an admin unsharing) also wait here
  until the owner's next write takes them in.
- `User.boards`: the user's **private boards**. Only that user's own requests read or write it.
- `AppGlobalStorage.boards`: the single document used before 1.3.0. The first write after the upgrade copies
  its boards into the slots, creates every slot and marks it `migratedAt`; it is then only a backup.

A stored board (`BoardConfig`) holds:

- identity and access: id, name, owner login and stable owner id (Hub id), shared flag, projects;
- issue selection: query, linked agile board, sprint field and options;
- layout: column field, columns, combined and ignored values, one or two swimlane levels with their sort
  order (including the custom drag-sorted order), time layout and default row mode;
- card fields, card color field, connector link types and related boards;
- `createdAt`, `updatedAt` and a `version` that the server raises on every write;
- `movedAt` only on the copy a move leaves at its source (see below). A tombstone (`id`, `version`, `at`)
  records a deletion for 30 days.

Only the backend routes under `src/backend/router/global/boards/` read or write boards, and they check access
first (`store.ts` and `access.ts`). Each owner may have at most 100 boards, and each property may hold at most
250,000 characters. The ids keep their original format: the creation time and six random characters in
base 36 (`generateId` in `board-config.ts`), set by the server when a board is created and never changed.

**Access.** "Board admins" are system admins (`ADMIN_UPDATE_APP`) and admins (`UPDATE_PROJECT`) of every
one of a board's projects.

| Action | Private board | Shared board |
|---|---|---|
| See | owner | owner, and anyone with `READ_ISSUE` in all of its projects |
| Edit, delete, transfer | owner | owner, board admins |
| Share | owner, with `UPDATE_ISSUE` in all of its projects (board admins need only be the owner) | — |
| Unshare | — | owner, board admins |

Unsharing hands a board back to its owner: an admin who unshares someone else's board can no longer see it.
Sharing is only checked when a board becomes shared, so a shared board stays shared whoever edits it.

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

### Simultaneous writes

**The problem.** YouTrack runs every backend request in its own transaction on a snapshot. When two
transactions write the *same* extension property, the later commit wins and neither sees an error. Before
1.3.0 every board lived in one such property, so a save, delete or
ownership change of one board could silently undo a simultaneous change of another, drop a just-created board
or bring a deleted one back. Setting a still *empty* property from several transactions at once can also fail
with 400 "PluggedStringAttribute is not unique".

**Why many properties.** Conflicts are per property: simultaneous writes to *different* properties of one
entity do not affect each other. So boards are spread out. Private boards live on their owner's
`User.boards`, so two users never collide, and a request never writes another user's property. Shared boards
hash into 32 slots, so two of them only collide when they share a slot. Every slot is created by the first
write after the upgrade, so the "not unique" error can only happen then, or on a user's very first private
board saved from two tabs at once.

**Why replicas.** Two shared boards can still share a slot, and a stale write to that slot reverts the other
board. Every shared board is therefore written to two slots, and readers take the highest version of each
board across all copies, so one overwritten replica loses nothing. Each write rebuilds the properties it
touches from the winning copies (read-repair), which heals a stale replica. For two simultaneous writes:

| Replicas | Share at least one slot | Lose data (all replicas overwritten) | Storage |
|---|---|---|---|
| 1 | 3.1 % | 3.1 % | 1× |
| **2** (used) | 12.3 % | 0.2 % | 2× |
| 3 | 26.3 % | 0.02 % | 3× |

The figures are calculated, not measured. They assume exactly two simultaneous writes, each touching *k*
hash-chosen slots out of 32. The second column is 1 − C(32−*k*, *k*) / C(32, *k*). The third column is
1 / C(32, *k*), the chance that the other write touches all *k* slots of ours. That column is an upper bound,
because an overlap only loses data when the other write read before ours committed and committed after it.
With more simultaneous writers the risk is higher, since different writers can overwrite different replicas.
Private boards in `User.boards` have a single copy and are not covered by the table.

A third replica would touch more slots per write and triple the storage for a risk the widget's read-back
(below) already covers.

**Why move copies and tombstones.** A move (sharing, unsharing, a transfer, an owner taking in a board) writes
two properties, and a stale write can revert either. The source therefore keeps the moved board, at the same
version, marked `movedAt`. It only counts when the destination lost the write, stops counting after 24 hours,
and the owner's next write redoes the move. A deletion leaves a tombstone, so neither such a copy nor a
reverted replica brings the board back.

**What can't be done on the server.** A handler can't detect or merge a lost write: a re-read inside its own
transaction sees its own snapshot, and the overwriting commit happens after it answered. Detection has to come
after the commit, from the widget.

**One save, step by step:**

1. **Widget: edit.** The settings screen (`SettingsScreen.tsx`) edits a draft and remembers the board's
   `version` it started from (the *base*).
2. **Server: version check.** `save/POST.ts` compares the sent `baseVersion` with the stored version. On a
   mismatch it answers 409 with the current board instead of writing: someone else saved while the user was
   editing.
3. **Widget: three-way merge.** On 409, `mergeBoards` (`src/common/model/board-merge.ts`) merges the *base*,
   *mine* (the draft) and *theirs* (the board from the 409) group by group (name, projects, columns,
   swimlanes …). A group changed on one side only takes that side; a group changed on both sides goes to the
   merge dialog (`MergeDialog.tsx`), where the user picks. The merged board is saved again with *theirs* as
   the new base. The merge runs in the widget because only it has the *base* and *mine*; the server only
   knows the stored board. Without it, the second editor would either redo their work or overwrite the
   first editor's changes.
4. **Server: write.** The board goes to its home (both replica slots, or the owner's `User.boards`), with a
   move copy when the home changed, and every property written is read-repaired and pruned.
5. **Widget: read-back.** 300 ms later `useBoards.ts` reads the list again. It is the only check after the
   commit:
   - same version but another `updatedAt`: a simultaneous save of the same board won, so back to step 3;
   - the board is older or missing (two tabs of one user, or both replicas overwritten): the save is redone
     once on top of what is stored now;
   - a deletion that came back, or an ownership change that was undone, is sent again.
6. **Widget: retry.** A 400 "not unique" is retried once.

What remains is both replicas being overwritten, which needs many simultaneous writes, plus the tab closing
before the read-back.

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
    boards/            storage in hashed AppGlobalStorage slots and per-user properties, permission rules,
                       HTTP helpers
    router/global/     boards (GET, save, delete, owner), projects/permissions (typed client via @/api)
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

- Top-level constants in a router file are not available when its handler runs (function declarations are);
  put helpers and constants in modules under `src/backend/<dir>/` and import them.
- Types annotated with `@zod-to-schema` must use the three-line comment form and flat object bodies.
- The YouTrack base URL used for issue links and the new-issue template URL is derived from the widget
  location (path before `/api/`), then from the referrer, then from the origin. Verify it on installations
  that run under a context path.
- Permission keys: `ADMIN_UPDATE_APP` (system admin), `UPDATE_PROJECT` (project admin, for board admins),
  `UPDATE_ISSUE` (needed in every project to share a board) and `READ_ISSUE` (to see a shared board).
- Never change `SLOT_COUNT`, `fnv1a` or `slotsOf` in `storage.ts`: every stored board would sit in the wrong
  slots.
