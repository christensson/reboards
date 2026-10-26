import React, {useCallback} from 'react';
import QueryAssist, {
  type QueryAssistChange,
  type QueryAssistRequestParams,
  type QueryAssistResponse
} from '@jetbrains/ring-ui-built/components/query-assist/query-assist';
import type {QueryAssistSuggestion} from '@jetbrains/ring-ui-built/components/query-assist/query-assist-suggestions';
import {Size} from '@jetbrains/ring-ui-built/components/input/input';
import type {YtSearchAssist, YtSuggestion} from '@/common/youtrack/types';

export type QueryEditorProps = {
  value: string;
  onChange: (query: string) => void;
  /** Called when the user presses Enter or clicks the search glass. */
  onApply?: (query: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Data source: usually `client.searchAssist` from the YouTrack client. */
  searchAssist: (query: string, caret: number) => Promise<YtSearchAssist>;
  size?: Size;
};

const toSuggestion = (s: YtSuggestion): QueryAssistSuggestion => ({
  option: s.option,
  description: s.description ?? '',
  group: s.group ?? '',
  prefix: s.prefix ?? undefined,
  suffix: s.suffix ?? undefined,
  icon: s.icon ?? undefined,
  matchingStart: s.matchingStart,
  matchingEnd: s.matchingEnd,
  caret: s.caret,
  completionStart: s.completionStart,
  completionEnd: s.completionEnd
});

const noop = (): void => undefined;

/**
 * Reusable YouTrack search query editor with completion and syntax highlighting,
 * backed by Ring UI's QueryAssist and the YouTrack `search/assist` endpoint.
 */
export const QueryEditor: React.FC<QueryEditorProps> = ({
  value,
  onChange,
  onApply,
  placeholder,
  disabled,
  className,
  searchAssist,
  size = Size.FULL
}) => {
  const dataSource = useCallback(
    async ({query, caret, omitSuggestions}: QueryAssistRequestParams): Promise<QueryAssistResponse> => {
      const response = await searchAssist(query, caret);
      return {
        query: response.query,
        caret: response.caret,
        styleRanges: response.styleRanges ?? [],
        suggestions: omitSuggestions ? [] : (response.suggestions ?? []).map(toSuggestion)
      };
    },
    [searchAssist]
  );

  const handleChange = useCallback((change: QueryAssistChange) => onChange(change.query), [onChange]);
  const handleApply = useCallback((change: QueryAssistChange) => onApply?.(change.query), [onApply]);

  return (
    <QueryAssist
      className={className ?? undefined}
      query={value}
      placeholder={placeholder ?? 'Search issues'}
      disabled={disabled}
      dataSource={dataSource}
      onChange={handleChange}
      onApply={handleApply}
      onApplySuggestion={noop}
      onClear={() => onChange('')}
      onFocusChange={noop}
      glass
      clear
      size={size}
    />
  );
};
