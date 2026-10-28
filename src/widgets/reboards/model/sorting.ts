import type {RowSortMode} from '@/common/model/board-config';

export type SortableValue = {
  key: string;
  label: string;
  /** Bundle order when known. */
  ordinal?: number;
};

const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});

const byOrdinalThenLabel = (a: SortableValue, b: SortableValue): number => {
  const ao = a.ordinal ?? Number.MAX_SAFE_INTEGER;
  const bo = b.ordinal ?? Number.MAX_SAFE_INTEGER;
  return ao - bo || collator.compare(a.label, b.label);
};

const numericValue = (value: SortableValue): number => parseFloat(value.key);

const byNumber = (a: SortableValue, b: SortableValue): number => {
  const an = numericValue(a);
  const bn = numericValue(b);
  const aNaN = Number.isNaN(an);
  const bNaN = Number.isNaN(bn);
  if (aNaN && bNaN) {
    return collator.compare(a.label, b.label);
  }
  if (aNaN) {
    return 1;
  }
  if (bNaN) {
    return -1;
  }
  return an - bn;
};

/**
 * Orders values for rows. Custom order lists known keys first (in the configured
 * order); unknown keys follow by bundle ordinal, then label.
 */
export const orderValues = <T extends SortableValue>(values: T[], sort: RowSortMode, customOrder: string[]): T[] => {
  const copy = [...values];
  switch (sort) {
    case 'alphabetical':
      return copy.sort((a, b) => collator.compare(a.label, b.label));
    case 'alphabetical-desc':
      return copy.sort((a, b) => collator.compare(b.label, a.label));
    case 'numerical':
      return copy.sort(byNumber);
    case 'numerical-desc':
      return copy.sort((a, b) => byNumber(b, a));
    case 'custom':
    default: {
      const position = new Map(customOrder.map((key, index) => [key, index]));
      const known = copy.filter(v => position.has(v.key)).sort((a, b) => (position.get(a.key) ?? 0) - (position.get(b.key) ?? 0));
      const unknown = copy.filter(v => !position.has(v.key)).sort(byOrdinalThenLabel);
      return [...known, ...unknown];
    }
  }
};
