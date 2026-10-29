import {type ToolContext, boardsFor, canEditBoard, layoutsOf, sprintsOf} from '@/backend/boards/tools';
import {type BoardConfig, ownSprintField} from '@/common/model/board-config';

/** Where a board's sprints come from: a linked agile board, its own sprint field, or nowhere. */
const sprintSource = (board: BoardConfig): 'agile' | 'field' | 'none' => {
  if (board.agileSource) {
    return 'agile';
  }
  return ownSprintField(board) ? 'field' : 'none';
};

const describeBoard = (ctx: ToolContext<unknown>, board: BoardConfig) => {
  const sprints = sprintsOf(board);
  const sprintField = ownSprintField(board);
  return {
    id: board.id,
    name: board.name,
    owner: board.owner,
    shared: board.shared,
    projects: board.projects.map(p => p.shortName),
    usesSprints: Boolean(sprints),
    sprintSource: sprintSource(board),
    ...(sprintField ? {sprintField: sprintField.name} : {}),
    ...(board.agileSource ? {linkedAgileBoard: board.agileSource.name} : {}),
    ...(sprints?.current ? {currentSprint: sprints.current} : {}),
    columnField: board.columnField?.name ?? null,
    layouts: layoutsOf(board),
    editable: canEditBoard(ctx, board)
  };
};

exports.aiTool = {
  name: 'list_boards',
  description:
    'Lists the ReBoards boards the current user can open: name, id, owner, whether the board is shared, its projects, ' +
    'whether it uses sprints (from a field or a linked YouTrack agile board) and the current sprint, its column field and ' +
    'row layouts (swimlanes, time). Use the id with reboards_get_board and reboards_list_board_issues.',
  inputSchema: {type: 'object', properties: {}},
  annotations: {title: 'List ReBoards boards', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
  execute: (ctx: ToolContext<Record<string, never>>) => ({boards: boardsFor(ctx).map(board => describeBoard(ctx, board))})
};
