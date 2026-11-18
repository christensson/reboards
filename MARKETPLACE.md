# ReBoards — revamped boards: relations, hierarchy, swimlanes and time

ReBoards revamps the YouTrack agile board in four ways. **Relations**: see and create links on the board.
**Hierarchy**: subtasks grouped under their parent, with their progress. **Swimlanes**: one or two levels.
**Time**: time rows and a Gantt chart that follow your plans, due dates and estimates, with overdue and late
work highlighted. Same columns, same issues, far more insight.

**See the structure**
- **Subtasks grouped by parent**: outlined boxes such as `SP-12: Checkout redesign · 3 of 5` show an epic's progress at a glance. Boxes can be collapsed.
- **Relation connectors**: labelled curves to related issues, for the selected issues or for all.
- **Two swimlane levels**, such as Team → Assignee, swapped with one click.

**Plan in time**
- **One setup, three layouts**: define up to three planning levels (from a roadmap down to sprints), a due date and an estimate, then switch between **Swimlanes**, **Time** and **Gantt** on the same board. Plans come from start and end dates, a date and a period, a single date, or a version or build field.
- **Time rows** per sprint, day, week, month or quarter. Each row shows its issue count, estimated work and the persons needed. Cards show their due date, and a **Today** line shows where now falls. Drop a card on another row to reschedule it; subtask groups move with their parent.
- **Timing highlights**: card icons and filters for *overdue*, *overdue unassigned*, *late start*, and subtasks starting before or ending after their parent's plan.
- **Gantt chart**: coarser plans frame the detailed bar, and due dates are diamonds that turn red when work is overdue or planned past the deadline. The estimate becomes the **persons needed** to finish in time (8 hour days, 5 day weeks). Subtasks form a collapsible tree, and relations are drawn as arrows. Zoom from days to years with Ctrl+scroll, a pinch or the floating controls, which also **Fit** everything and bring the selected issue, or today, into view. Chips in the header show or hide planning levels.
- **Reschedule in the Gantt chart**: drag a bar, its start or end, or a due diamond. Draw on an unscheduled issue's row, or click it to plan from its estimate, and use the **+** after a bar to add a missing planning level. Sprint plans snap to sprints, and every change is confirmed before it is saved.

**Edit by dragging**
- Drag a card to change its column or row field. **Ctrl-drag** a card onto another to make it the parent; **Ctrl+Shift-drag** to add any other link.
- A **+** in every cell creates an issue with that cell's values already set.

**Work from the keyboard**
- **Arrow keys** move the selection to the next card; **Enter** opens it, **P** jumps to its parent and **Shift+P** back down, to the subtask you came from or the first one. Either starts subtask navigation, where the arrow keys move up, down and between sibling subtasks until **Esc**. **S** and **Shift+S** jump a whole swimlane down or up, and ↑/↓ keep going.
- **Ctrl+arrows** move the selected card to the next column or swimlane, with a preview of the change; **Enter** applies it.
- **/** finds issues as you type, **R** shows or hides relations, **C** and **Shift+C** collapse or expand one level of subtasks, and **?** lists every shortcut. In the Gantt chart the arrow keys walk the issue tree and **+**/**−** zoom.

**Columns, sprints and search**
- **Link an existing agile board**: show its issues and sprints, and its backlog as "Unscheduled", without copying its query. An extra filter narrows them further.
- Combine or hide column values, or build columns from the values in use.
- Sprints from any version or enum field, with dates, the current sprint and an "Unscheduled" view.
- Highlights for cards with a missing field; choosing one selects the first match, and ↑/↓ step through the rest.

**Works with AI assistants (MCP)**
- Three read-only tools for YouTrack's MCP server: **`reboards_list_boards`** lists your boards with their sprints, **`reboards_get_board`** describes a board's columns, swimlanes, time and Gantt setup and sprints, and which field to change to move an issue, and **`reboards_list_board_issues`** lists a board's issues with the column and swimlane each one is in.
- An assistant can then move issues with YouTrack's own `update_issue` tool, for example "move ST-8 to In Progress".
- Enable them by adding `?customToolPackages=reboards` to the MCP address, for example `https://<your-youtrack>/mcp?customToolPackages=reboards`. The tools see only what the connected user can see.

**Built for teams**
- Personal or shared boards: share your own boards when you can update issues in all of their projects. Project and system admins can edit, unshare and delete shared boards. Ownership is transferable.
- Related boards for one-click switching. Conflicting edits are merged instead of overwritten, and simultaneous saves of different boards don't overwrite each other.
- Shareable links that open the exact view.

Requires YouTrack 2026.2 or later. Changes are made with each user's own YouTrack permissions.
