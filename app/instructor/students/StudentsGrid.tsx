'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type ColumnState,
  type GridApi,
  type ICellRendererParams,
  type SortChangedEvent,
} from 'ag-grid-community';
import {
  studentFilterUrl,
  prepareCourses,
  readStudentFilters,
  sortOptions,
  type StudentFilters,
  type StudentGridRow,
  type StudentCourseItem,
} from './listFilters';
import styles from '../../components/InstructorGrid/grid.module.css';
import { instructorGridTheme } from '../../components/InstructorGrid/theme';
import { EditorTitle } from '../../components/InstructorGrid/EditorTitle';

ModuleRegistry.registerModules([AllCommunityModule]);
const emptyFilters = readStudentFilters({});

export function sortState(sort: StudentFilters['sort']): ColumnState[] {
  if (sort === 'default') return [{ colId: 'title', sort: 'asc' }];
  if (sort === 'az' || sort === 'za') return [{ colId: 'title', sort: sort === 'az' ? 'asc' : 'desc' }];
  const [colId, direction] = sort.split(':');
  return [{ colId, sort: direction === 'asc' ? 'asc' : 'desc' }];
}

export default function StudentsGrid({
  courses,
  initialFilters,
}: {
  courses: StudentCourseItem[];
  initialFilters: StudentFilters;
}) {
  const [filters, setFilters] = useState(() => initialFilters);
  const [visibleCount, setVisibleCount] = useState(courses.length);
  const [api, setApi] = useState<GridApi<StudentGridRow> | null>(null);
  const syncingSort = useRef(false);
  const rows = useMemo(() => prepareCourses(courses).sort((a, b) => a.id.localeCompare(b.id, 'en')), [courses]);
  const update = useCallback(
    (patch: Partial<StudentFilters>) => setFilters((current) => ({ ...current, ...patch })),
    []
  );

  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const restored = readStudentFilters(Object.fromEntries(params));
      setFilters(restored);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  useEffect(() => {
    const url = studentFilterUrl(filters);
    if (`${window.location.pathname}${window.location.search}` !== url)
      window.history.replaceState(window.history.state, '', url);
  }, [filters]);

  useEffect(() => {
    if (!api) return;
    syncingSort.current = true;
    api.applyColumnState({ state: sortState(filters.sort), defaultState: { sort: null } });
    syncingSort.current = false;
  }, [api, filters.sort]);

  useEffect(() => {
    if (api && JSON.stringify(api.getFilterModel()) !== JSON.stringify(filters.gridFilters ?? {})) {
      api.setFilterModel(filters.gridFilters ?? {});
    }
  }, [api, filters.gridFilters]);

  const onSortChanged = useCallback(
    (event: SortChangedEvent<StudentGridRow>) => {
      if (syncingSort.current || event.source === 'api') return;
      const sorted = event.api
        .getColumnState()
        .filter((column) => column.sort)
        .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
      const first = sorted[0];
      const sort = !first
        ? 'default'
        : first.colId === 'title'
          ? first.sort === 'asc'
            ? 'az'
            : 'za'
          : `${first.colId}:${first.sort}`;
      if (sort in sortOptions) update({ sort: sort as StudentFilters['sort'] });
    },
    [update]
  );

  const columns = useMemo<ColDef<StudentGridRow>[]>(
    () => [
      {
        field: 'title',
        headerName: 'Course',
        minWidth: 240,
        flex: 2,
        filter: 'agTextColumnFilter',
        cellRenderer: ({ data }: ICellRendererParams<StudentGridRow>) =>
          data ? (
            <EditorTitle
              href={`/instructor/courses/${data.id}/students`}
              title={data.title}
              destination="student management"
            />
          ) : null,
      },
      { field: 'code', headerName: 'Course code', filter: 'agTextColumnFilter', width: 175 },
      { field: 'section', headerName: 'Section', filter: 'agTextColumnFilter', width: 130 },
      {
        field: 'studentCount',
        headerName: 'Students',
        filter: 'agNumberColumnFilter',
        width: 130,
        cellRenderer: ({ data }: ICellRendererParams<StudentGridRow>) =>
          data ? (
            <Link
              className={styles.titleLink}
              href={`/instructor/courses/${data.id}/students`}
              aria-label={`Manage students for ${data.title} (${data.studentCount})`}
            >
              {data.studentCount}
            </Link>
          ) : null,
      },
      {
        field: 'rosterSearch',
        headerName: 'Enrolled students',
        minWidth: 260,
        flex: 2,
        filter: 'agTextColumnFilter',
        headerTooltip: 'Search the full roster by student name or email.',
        valueFormatter: ({ data }) => data?.rosterPreview ?? '',
      },
    ],
    []
  );
  const defaultColDef = useMemo<ColDef<StudentGridRow>>(
    () => ({
      sortable: true,
      resizable: true,
      cellDataType: false,
      floatingFilter: true,
      filterParams: { debounceMs: 150 },
      sortingOrder: ['asc', 'desc'],
    }),
    []
  );

  return (
    <>
      <div className={styles.filters}>
        <div className={styles.filterActions}>
          <button type="button" onClick={() => setFilters({ ...emptyFilters, sort: filters.sort, gridFilters: {} })}>
            Clear filters
          </button>
          <button type="button" onClick={() => update({ sort: 'default' })}>
            Reset sorting
          </button>
        </div>
      </div>
      <div className={styles.gridMeta}>
        <p className={styles.resultCount} role="status">
          {visibleCount} of {courses.length} courses
        </p>
        <p className={styles.sortDescription}>Sort: {sortOptions[filters.sort]}</p>
      </div>
      {!courses.length ? (
        <p className={styles.empty}>
          No courses yet. <Link href="/instructor/courses/new">Create a course</Link> first, then enroll students.
        </p>
      ) : (
        <div className={styles.grid} aria-label="Student enrollments by course">
          <AgGridReact<StudentGridRow>
            theme={instructorGridTheme}
            rowData={rows}
            columnDefs={columns}
            defaultColDef={defaultColDef}
            getRowId={({ data }) => data.id}
            onGridReady={({ api: gridApi }) => setApi(gridApi)}
            onSortChanged={onSortChanged}
            onFilterChanged={(event) => {
              const model = event.api.getFilterModel();
              setVisibleCount(event.api.getDisplayedRowCount());
              setFilters((current) =>
                JSON.stringify(current.gridFilters ?? {}) === JSON.stringify(model)
                  ? current
                  : { ...current, gridFilters: model }
              );
            }}
            onModelUpdated={(event) => setVisibleCount(event.api.getDisplayedRowCount())}
            suppressMultiSort
            animateRows={false}
            rowHeight={44}
            overlayNoRowsTemplate="No courses match these filters."
          />
        </div>
      )}
    </>
  );
}
