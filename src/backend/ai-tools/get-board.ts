import {type ToolContext, fieldInfo, findBoard, lanesFromValues, layoutsOf, pagesOf, sprintsOf} from '@/backend/boards/tools';
import {type BoardConfig, type RowConfig, columnLabel, isTimeConfigured, ownSprintField, placingFieldNames, rowsByName} from '@/common/model/board-config';

const columnsOf = (board: BoardConfig) => {
  const field = board.columnField;
  if (!field) {
    return {field: null, kind: 'none', columns: [{name: 'All issues', values: []}]};
  }
  if (lanesFromValues(field, board.columnOptions)) {
    return {field: fieldInfo(board, field), kind: 'values', sort: board.columnOptions.sort, note: 'Each value of the field is a column; issues without a value are in "No <field>".'};
  }
  return {
    field: fieldInfo(board, field),
    kind: 'configured',
    columns: board.columns.map(column => ({name: columnLabel(column), values: column.values})),
    ignoredValues: board.ignoredValues
  };
};

const laneOf = (board: BoardConfig, row: RowConfig | null) => {
  const field = row?.field;
  if (!row || !field) {
    return null;
  }
  // Every swimlane is a value of the field; a configured order is passed on when there is one.
  const ordered = !lanesFromValues(field, row.dynamic) && row.sort === 'custom' && row.customOrder.length > 0;
  return {field: fieldInfo(board, field), ...(ordered ? {order: row.customOrder} : {})};
};

const sprintPart = (board: BoardConfig) => {
  const sprints = sprintsOf(board);
  if (!sprints) {
    return null;
  }
  const field = ownSprintField(board);
  return {
    ...sprints,
    ...(field ? {field: fieldInfo(board, field)} : {}),
    ...(board.agileSource ? {agileBoard: board.agileSource.name} : {})
  };
};

/** A short guide for the agent: which field to set to move an issue on this board. */
const howToMove = (board: BoardConfig): string[] => {
  const steps: string[] = [];
  if (board.columnField) {
    steps.push(`To move an issue to another column, set its ${board.columnField.name} field to one of the column's values.`);
  }
  if (board.row.field) {
    steps.push(`To move it to another swimlane, set ${board.row.field.name}${board.innerRow?.field ? ` (and ${board.innerRow.field.name} for the second level)` : ''} to the swimlane's value; an empty value is the "Uncategorized"/"No <field>" lane.`);
  }
  steps.push('For a multi-value field, add the new value and remove the one the issue leaves, keeping the others.');
  const sprintField = ownSprintField(board);
  if (sprintField) {
    steps.push(`To change the sprint, set ${sprintField.name} to the sprint's name.`);
  } else if (board.agileSource) {
    steps.push(`Sprints come from the agile board ${board.agileSource.name}; change an issue's sprint with the YouTrack command "Board ${board.agileSource.name} <sprint name>".`);
  }
  const placing = placingFieldNames(board);
  if (placing.length > 0) {
    steps.push(`In the time layout, rows follow ${rowsByName(board)} (${placing.join(', ')}); set its ${board.timeline.position} to move an issue to another time row.`);
  }
  return steps;
};

/** The Gantt layout: planning levels from high-level to detailed, due date and estimate. */
const ganttOf = (board: BoardConfig) => {
  const {levels, dueField, estimationField, estimationUnit, estimationMeaning} = board.gantt;
  if (!isTimeConfigured(board)) {
    return null;
  }
  return {
    planningLevels: levels.map(level => ({
      name: level.name,
      source: level.source,
      fields: [level.field?.name, level.endField?.name, level.periodField?.name].filter(Boolean),
      ...(level.source === 'date-period' ? {dateIs: level.dateRole} : {})
    })),
    dueField: dueField?.name ?? null,
    estimationField: estimationField?.name ?? null,
    ...(estimationField && estimationField.kind !== 'period' ? {estimationUnit} : {}),
    estimateIs: estimationField ? estimationMeaning : null,
    note: 'Planning levels go from high-level to detailed. Periods count 8 hour days and 5 day weeks.'
  };
};

exports.aiTool = {
  name: 'get_board',
  description:
    'Describes a ReBoards board so issues can be moved on it: the column field and its columns (with the field values each ' +
    'column holds), the swimlane fields, the time layout, the Gantt layout (planning levels, due date and estimate fields), the sprints with the current sprint, the pages of its page selector, and which field to set with ' +
    'update_issue to move an issue to another column, swimlane or sprint. Takes a board id or name from reboards_list_boards.',
  inputSchema: {
    type: 'object',
    properties: {boardId: {type: 'string', description: 'Board id or exact board name, from reboards_list_boards'}},
    required: ['boardId']
  },
  annotations: {title: 'Get a ReBoards board', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
  execute: (ctx: ToolContext<{boardId: string}>) => {
    const board = findBoard(ctx, ctx.arguments.boardId);
    return {
      id: board.id,
      name: board.name,
      projects: board.projects.map(p => p.shortName),
      query: board.query || null,
      linkedAgileBoard: board.agileSource?.name ?? null,
      columns: columnsOf(board),
      swimlanes: board.row.field ? [laneOf(board, board.row), laneOf(board, board.innerRow)].filter(Boolean) : [],
      layouts: layoutsOf(board),
      time: isTimeConfigured(board)
        ? {
          rowsBy: rowsByName(board),
          fields: placingFieldNames(board),
          placeAt: board.timeline.position,
          rowSize: board.timeline.bucket,
          sort: board.timeline.sort
        }
        : null,
      gantt: ganttOf(board),
      sprints: sprintPart(board),
      pages: pagesOf(board),
      howToMove: howToMove(board)
    };
  }
};
