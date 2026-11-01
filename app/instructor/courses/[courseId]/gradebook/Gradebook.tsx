'use client';
import { useMemo, useRef, useEffect, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type GridApi,
  type ICellRendererParams,
} from 'ag-grid-community';
import { instructorGridTheme } from '@/app/components/InstructorGrid/theme';
import shared from '@/app/components/InstructorGrid/grid.module.css';
import styles from './page.module.css';
import { gradeLabel, type GradeRow, type GradeLesson } from './types';
import ResultDetails from './ResultDetails';
ModuleRegistry.registerModules([AllCommunityModule]);

export default function Gradebook({
  courseId,
  rows,
  lessons,
}: {
  courseId: string;
  rows: GradeRow[];
  lessons: GradeLesson[];
}) {
  const [api, setApi] = useState<GridApi<GradeRow> | null>(null);
  const [count, setCount] = useState(rows.length);
  const [selected, setSelected] = useState<{ student: GradeRow; lesson: GradeLesson } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
  }, [selected]);
  const columns = useMemo<ColDef<GradeRow>[]>(
    () => [
      { field: 'name', headerName: 'Student', pinned: 'left', width: 200, minWidth: 130, sort: 'asc' },
      { field: 'email', headerName: 'Email', pinned: 'left', width: 240, minWidth: 160 },
      ...lessons.map<ColDef<GradeRow>>((lesson) => ({
        colId: lesson.id,
        headerName: lesson.title,
        headerTooltip: lesson.title,
        width: 205,
        valueGetter: ({ data }) => gradeLabel(data?.grades[lesson.id]),
        comparator: (a, b, left, right) => {
          const x = left.data?.grades[lesson.id]?.best?.finalPercent;
          const y = right.data?.grades[lesson.id]?.best?.finalPercent;
          if (x != null && y != null) return x - y;
          if (x != null) return -1;
          if (y != null) return 1;
          return String(a).localeCompare(String(b));
        },
        cellRenderer: ({ data }: ICellRendererParams<GradeRow>) =>
          data ? (
            <button
              className={styles.gradeButton}
              type="button"
              onClick={() => setSelected({ student: data, lesson })}
              aria-label={`${data.name}, ${lesson.title}: ${gradeLabel(data.grades[lesson.id])}. View results`}
            >
              {gradeLabel(data.grades[lesson.id])}
            </button>
          ) : null,
      })),
    ],
    [lessons]
  );
  const defaults = useMemo<ColDef<GradeRow>>(
    () => ({
      sortable: true,
      resizable: true,
      filter: 'agTextColumnFilter',
      floatingFilter: true,
      cellDataType: false,
      filterParams: { debounceMs: 150 },
      sortingOrder: ['asc', 'desc'],
    }),
    []
  );
  return (
    <>
      <div className={shared.filters}>
        <p className={shared.resultCount} role="status">
          {count} of {rows.length} students · {lessons.length} lessons
        </p>
        <div className={shared.filterActions}>
          <button type="button" onClick={() => api?.setFilterModel(null)}>
            Clear filters
          </button>
          <button
            type="button"
            onClick={() =>
              api?.applyColumnState({ state: [{ colId: 'name', sort: 'asc' }], defaultState: { sort: null } })
            }
          >
            Reset sorting
          </button>
        </div>
      </div>
      {!rows.length && <p>No students enrolled. Add students from the Students tab.</p>}
      {!lessons.length && <p>No lessons assigned. Add lessons from the Details tab.</p>}
      {!!rows.length && !!lessons.length && (
        <div className={shared.grid} aria-label="Course gradebook">
          <AgGridReact<GradeRow>
            theme={instructorGridTheme}
            rowData={rows}
            columnDefs={columns}
            defaultColDef={defaults}
            getRowId={({ data }) => data.id}
            onGridReady={({ api }) => setApi(api)}
            onModelUpdated={({ api }) => setCount(api.getDisplayedRowCount())}
            onFilterChanged={({ api }) => setCount(api.getDisplayedRowCount())}
            suppressMultiSort
            animateRows={false}
            rowHeight={44}
            overlayNoRowsTemplate="No students match these filters."
          />
        </div>
      )}
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="grade-detail-title"
        onClose={() => setSelected(null)}
      >
        <button
          type="button"
          className={styles.close}
          onClick={() => {
            dialog.current?.close();
            setSelected(null);
          }}
        >
          Close
        </button>
        {selected && (
          <>
            <h2 id="grade-detail-title">
              {selected.student.name} · {selected.lesson.title}
            </h2>
            <p>{selected.student.email}</p>
            <ResultDetails
              key={`${selected.student.id}:${selected.lesson.id}`}
              courseId={courseId}
              studentId={selected.student.id}
              lessonId={selected.lesson.id}
            />
          </>
        )}
      </dialog>
    </>
  );
}
