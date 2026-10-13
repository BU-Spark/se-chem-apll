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
  courseFilterUrl,
  prepareCourses,
  readCourseFilters,
  sortOptions,
  type CourseFilters,
  type CourseGridRow,
  type CourseListItem,
} from './listFilters';
import styles from '../../components/InstructorGrid/grid.module.css';
import { instructorGridTheme } from '../../components/InstructorGrid/theme';
import { EditorTitle } from '../../components/InstructorGrid/EditorTitle';
import { updatedLabel, updatedTooltip } from '../../components/InstructorGrid/updatedLabel';

ModuleRegistry.registerModules([AllCommunityModule]);
const emptyFilters = readCourseFilters({});

export function sortState(sort: CourseFilters['sort']): ColumnState[] {
  if (sort === 'default') return [{ colId: 'updatedAt', sort: 'desc' }];
  if (sort === 'az' || sort === 'za') return [{ colId: 'title', sort: sort === 'az' ? 'asc' : 'desc' }];
  if (sort === 'updated' || sort === 'created')
    return [{ colId: sort === 'updated' ? 'updatedAt' : 'createdAt', sort: 'desc' }];
  const [colId, direction] = sort.split(':');
  return [{ colId, sort: direction === 'asc' ? 'asc' : 'desc' }];
}

export default function CoursesGrid({
  courses,
  initialFilters,
}: {
  courses: CourseListItem[];
  initialFilters: CourseFilters;
}) {
  const [filters, setFilters] = useState(() => initialFilters);
  const [visibleCount, setVisibleCount] = useState(courses.length);
  const [api, setApi] = useState<GridApi<CourseGridRow> | null>(null);
  const displayNow = useRef(Date.now());
  const syncingSort = useRef(false);
  const rows = useMemo(() => prepareCourses(courses).sort((a, b) => a.id.localeCompare(b.id, 'en')), [courses]);
  const update = useCallback(
    (patch: Partial<CourseFilters>) => setFilters((current) => ({ ...current, ...patch })),
    []
  );

  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const restored = readCourseFilters(Object.fromEntries(params));
      setFilters(restored);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  useEffect(() => {
    const url = courseFilterUrl(filters);
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
    (event: SortChangedEvent<CourseGridRow>) => {
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
      if (sort in sortOptions) update({ sort: sort as CourseFilters['sort'] });
    },
    [update]
  );

  useEffect(() => {
    if (!api) return;
    const refresh = () => {
      displayNow.current = Date.now();
      api.refreshCells({ columns: ['updatedAt'], force: true });
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [api]);

  const columns = useMemo<ColDef<CourseGridRow>[]>(
    () => [
      {
        field: 'title',
        headerName: 'Title',
        minWidth: 240,
        flex: 2,
        tooltipField: 'description',
        filter: 'agTextColumnFilter',
        cellRenderer: ({ data }: ICellRendererParams<CourseGridRow>) =>
          data ? <EditorTitle href={`/instructor/courses/${data.id}/edit`} title={data.title} /> : null,
      },
      { field: 'code', headerName: 'Course code', filter: 'agTextColumnFilter', width: 175 },
      { field: 'section', headerName: 'Section', filter: 'agTextColumnFilter', width: 130 },
      { field: 'lessonCount', headerName: 'Lessons', filter: 'agNumberColumnFilter', width: 120 },
      {
        field: 'studentCount',
        headerName: 'Students',
        filter: 'agNumberColumnFilter',
        width: 130,
        cellRenderer: ({ data }: ICellRendererParams<CourseGridRow>) =>
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
        colId: 'updatedAt',
        headerName: 'Last updated',
        headerTooltip: 'Filter by calendar date in UTC.',
        filter: 'agDateColumnFilter',
        filterParams: {
          comparator: (date: Date, timestamp: number) => {
            const actual = new Date(timestamp);
            const day = Date.UTC(actual.getUTCFullYear(), actual.getUTCMonth(), actual.getUTCDate());
            const selected = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
            return Math.sign(day - selected);
          },
        },
        field: 'updatedTimestamp',
        width: 195,
        valueFormatter: ({ value }) => updatedLabel(value, displayNow.current),
        tooltipValueGetter: ({ value }) => updatedTooltip(value),
      },
      { colId: 'createdAt', field: 'createdTimestamp', hide: true },
    ],
    []
  );
  const defaultColDef = useMemo<ColDef<CourseGridRow>>(
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
        <p className={styles.empty}>No courses yet. Create your first one above.</p>
      ) : (
        <div className={styles.grid} aria-label="Courses table">
          <AgGridReact<CourseGridRow>
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
