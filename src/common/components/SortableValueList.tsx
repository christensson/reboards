import React, {type ReactNode, useCallback} from 'react';
import {DndContext, type DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors} from '@dnd-kit/core';
import {SortableContext, arrayMove, useSortable, verticalListSortingStrategy} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import dragIcon from '@jetbrains/icons/drag';
import closeIcon from '@jetbrains/icons/close';
import './sortable-value-list.css';

export type SortableItem = {
  id: string;
  label: ReactNode;
};

export type SortableValueListProps<T extends SortableItem> = {
  items: T[];
  onReorder: (ids: string[]) => void;
  onRemove?: (id: string) => void;
  /** Custom row content; defaults to the label. */
  renderItem?: (item: T) => ReactNode;
  disabled?: boolean;
  emptyMessage?: ReactNode;
  className?: string;
};

type RowProps<T extends SortableItem> = {
  item: T;
  disabled: boolean;
  onRemove?: (id: string) => void;
  renderItem?: (item: T) => ReactNode;
};

const ACTIVATION_DISTANCE = 4;

function SortableRow<T extends SortableItem>({item, disabled, onRemove, renderItem}: RowProps<T>): React.JSX.Element {
  const {attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging} = useSortable({
    id: item.id,
    disabled
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined
  };
  return (
    <li ref={setNodeRef} style={style} className={`sortable-value-list__row${isDragging ? ' sortable-value-list__row_dragging' : ''}`}>
      <span
        ref={setActivatorNodeRef}
        className={`sortable-value-list__handle${disabled ? ' sortable-value-list__handle_disabled' : ''}`}
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <Icon glyph={dragIcon}/>
      </span>
      <span className="sortable-value-list__content">{renderItem ? renderItem(item) : item.label}</span>
      {onRemove && !disabled && (
        <Button className="sortable-value-list__remove" icon={closeIcon} title="Remove" onClick={() => onRemove(item.id)}/>
      )}
    </li>
  );
}

/** Vertical list whose rows can be reordered by dragging their handle. */
export function SortableValueList<T extends SortableItem>({
  items,
  onReorder,
  onRemove,
  renderItem,
  disabled = false,
  emptyMessage,
  className
}: SortableValueListProps<T>): React.JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: ACTIVATION_DISTANCE}}));
  const ids = items.map(i => i.id);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const {active, over} = event;
      if (!over || active.id === over.id) {
        return;
      }
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from !== -1 && to !== -1) {
        onReorder(arrayMove(ids, from, to));
      }
    },
    [ids, onReorder]
  );

  if (items.length === 0) {
    return <div className="sortable-value-list__empty">{emptyMessage ?? 'Nothing here yet'}</div>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className={`sortable-value-list${className ? ` ${className}` : ''}`}>
          {items.map(item => (
            <SortableRow key={item.id} item={item} disabled={disabled} onRemove={onRemove} renderItem={renderItem}/>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
