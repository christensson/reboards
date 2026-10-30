import {type SprintChoice, type ToolContext, boardIssues, findBoard, pageArgument, sprintsOf} from '@/backend/boards/tools';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type Args = {boardId: string; sprint?: string; page?: string; limit?: number; skip?: number};

/**
 * The sprint to list: "current" is the board's current sprint, "unscheduled" its issues without one.
 * A sprint board needs one, except when linked to an agile board, where none means every issue on it.
 */
const sprintArgument = (args: Args, sprints: ReturnType<typeof sprintsOf>, linked: boolean): SprintChoice => {
  const wanted = args.sprint?.trim();
  if (!sprints) {
    return {kind: 'all'};
  }
  if (!wanted) {
    if (linked) {
      return {kind: 'all'};
    }
    throw new Error(`This board uses sprints; pass sprint ("current", "unscheduled" or one of: ${sprints.sprints.map(s => s.name).join(', ')}).`);
  }
  if (wanted.toLowerCase() === 'current') {
    if (!sprints.current) {
      throw new Error(`No sprint is current; pass one of: ${sprints.sprints.map(s => s.name).join(', ')}.`);
    }
    return {kind: 'sprint', name: sprints.current};
  }
  if (wanted.toLowerCase() === 'unscheduled') {
    return {kind: 'unscheduled'};
  }
  const match = sprints.sprints.find(s => s.name.toLowerCase() === wanted.toLowerCase());
  if (!match) {
    throw new Error(`Unknown sprint "${wanted}"; pass one of: ${sprints.sprints.map(s => s.name).join(', ')}.`);
  }
  return {kind: 'sprint', name: match.name};
};

const choiceLabel = (choice: SprintChoice): string => (choice.kind === 'sprint' ? choice.name : choice.kind);

exports.aiTool = {
  name: 'list_board_issues',
  description:
    'Lists the issues of a ReBoards board, as the board shows them, with the column and swimlane each issue is in, its ' +
    'parent, and the values of the fields that place it (column, swimlane, sprint and time fields). On a sprint board pass ' +
    'sprint: "current", "unscheduled" or a sprint name (see reboards_get_board). On a board with pages pass page to list one page ' +
    '(without it, all of the board\'s issues). Only issues the current user can read are returned.',
  inputSchema: {
    type: 'object',
    properties: {
      boardId: {type: 'string', description: 'Board id or exact board name, from reboards_list_boards'},
      sprint: {type: 'string', description: 'Sprint name, "current" or "unscheduled"; required on boards that use sprints'},
      page: {type: 'string', description: 'Page of the page selector (see reboards_get_board): a query page\'s name, or for field pages "all", "none" or a value name (login for users)'},
      limit: {type: 'number', description: `Most issues to return (default ${DEFAULT_LIMIT}, at most ${MAX_LIMIT})`},
      skip: {type: 'number', description: 'Issues to skip, for paging'}
    },
    required: ['boardId']
  },
  annotations: {title: 'List issues of a ReBoards board', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
  execute: (ctx: ToolContext<Args>) => {
    const board = findBoard(ctx, ctx.arguments.boardId);
    const sprints = sprintsOf(board);
    const choice = sprintArgument(ctx.arguments, sprints, Boolean(board.agileSource));
    const pageKey = pageArgument(board, ctx.arguments.page);
    const issues = boardIssues(ctx, board, choice, pageKey);
    const limit = Math.min(Math.max(Math.floor(ctx.arguments.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
    const skip = Math.max(Math.floor(ctx.arguments.skip ?? 0), 0);
    const page = issues.slice(skip, skip + limit);
    return {
      board: board.name,
      sprint: sprints ? choiceLabel(choice) : null,
      page: board.pages.mode === 'none' ? null : ctx.arguments.page?.trim() || 'all',
      total: issues.length,
      returned: page.length,
      truncated: skip + page.length < issues.length,
      issues: page
    };
  }
};
