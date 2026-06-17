import { useState, useCallback } from 'react';
import {
  DndContext, closestCenter, PointerSensor,
  useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable,
  verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './SortableLayout.css';

// ── Hook ─────────────────────────────────────────────────────────
export function useSortableLayout(storageKey, defaultSections) {
  function load() {
    try { const s = localStorage.getItem(storageKey); return s ? JSON.parse(s) : defaultSections; }
    catch { return defaultSections; }
  }
  function persist(val) { localStorage.setItem(storageKey, JSON.stringify(val)); }

  const [sections, setSections] = useState(load);
  const [editMode, setEditMode] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleSectionDragEnd = useCallback(({ active, over }) => {
    setActiveId(null);
    if (active.id !== over?.id) {
      setSections(prev => {
        const next = arrayMove(prev, prev.findIndex(s => s.id === active.id), prev.findIndex(s => s.id === over.id));
        persist(next); return next;
      });
    }
  }, [storageKey]);

  const handleFieldReorder = useCallback((sectionId, newFields) => {
    setSections(prev => {
      const next = prev.map(s => s.id === sectionId ? { ...s, fields: newFields } : s);
      persist(next); return next;
    });
  }, [storageKey]);

  const resetLayout = useCallback(() => {
    setSections(defaultSections); persist(defaultSections);
  }, [storageKey]);

  return { sections, setSections, editMode, setEditMode, activeId, setActiveId, sensors, handleSectionDragEnd, handleFieldReorder, resetLayout };
}

// ── Sortable section wrapper ──────────────────────────────────────
export function SortableSection({ id, title, icon, editMode, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 };
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div ref={setNodeRef} style={style} className="sl-section">
      <div className="sl-section-header" onClick={() => setCollapsed(c => !c)}>
        {editMode && (
          <span className="sl-drag-handle" {...attributes} {...listeners} onClick={e => e.stopPropagation()}>⠿</span>
        )}
        {icon && <span className="sl-section-icon">{icon}</span>}
        <h3 style={{ flex: 1 }}>{title}</h3>
        <span className={`sl-chevron${collapsed ? ' collapsed' : ''}`}>▼</span>
      </div>
      {!collapsed && children}
    </div>
  );
}

// ── Ghost shown in DragOverlay while dragging a section ───────────
export function SectionDragGhost({ title, icon }) {
  return (
    <div className="sl-section drag-ghost">
      <div className="sl-section-header">
        <span className="sl-drag-handle">⠿</span>
        {icon && <span className="sl-section-icon">{icon}</span>}
        <h3>{title}</h3>
      </div>
    </div>
  );
}

// ── Field grid with nested drag for field reordering ─────────────
export function SortableFieldGrid({ sectionId, fields, editMode, onReorder, single, children }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd({ active, over }) {
    if (active.id !== over?.id) {
      const oi = fields.indexOf(active.id);
      const ni = fields.indexOf(over.id);
      onReorder(sectionId, arrayMove(fields, oi, ni));
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={fields} strategy={verticalListSortingStrategy}>
        <div className={single ? 'sl-field-single' : 'sl-field-grid'}>
          {children}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ── Individual sortable field ─────────────────────────────────────
export function SortableField({ id, editMode, dirty, wide, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 };

  return (
    <div ref={setNodeRef} style={style}
      className={`sl-field${wide ? ' wide' : ''}${editMode ? ' layout-edit' : ''}${dirty ? ' dirty' : ''}`}
    >
      {editMode && <span className="sl-field-handle" {...attributes} {...listeners}>⠿</span>}
      {dirty && <span className="sl-dirty-dot" />}
      {children}
    </div>
  );
}

// ── Hint bar ─────────────────────────────────────────────────────
export function LayoutHint({ editMode, fields = true }) {
  if (!editMode) return null;
  return (
    <div className="sl-layout-hint">
      ⠿ Drag section handles to reorder{fields ? ' · Drag field handles to reorder within sections' : ''}
    </div>
  );
}
