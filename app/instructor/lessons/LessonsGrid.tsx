'use client';

import selectStyles from '@/app/components/Select/Select.module.css';
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
  lessonFilterUrl,
  prepareLessons,
  readLessonFilters,
  sortOptions,
  type LessonFilters,
  type LessonGridRow,
  type LessonListItem,
} from './listFilters';
import styles from '../../components/InstructorGrid/grid.module.css';
import { instructorGridTheme } from '../../components/InstructorGrid/theme';
import { EditorTitle } from '../../components/InstructorGrid/EditorTitle';
import { StatusBadge } from '../../components/InstructorGrid/StatusBadge';
import { UsageFilter, UsageFloatingFilter } from '../../components/InstructorGrid/UsageFilter';
import { updatedLabel, updatedTooltip } from '../../components/InstructorGrid/updatedLabel';

ModuleRegistry.registerModules([AllCommunityModule]);
const emptyFilters = readLessonFilters({});

export function sortState(sort: LessonFilters['sort']): ColumnState[] {
  if (sort === 'default')
    return [
      { colId: 'isDraft', sort: 'desc', sortIndex: 0 },
      { colId: 'updatedAt', sort: 'desc', sortIndex: 1 },
    ];
  if (sort === 'az' || sort === 'za') return [{ colId: 'title', sort: sort === 'az' ? 'asc' : 'desc' }];
  if (sort === 'updated' || sort === 'created')
    return [{ colId: sort === 'updated' ? 'updatedAt' : 'createdAt', sort: 'desc' }];
  const [colId, direction] = sort.split(':');
  return [{ colId, sort: direction === 'asc' ? 'asc' : 'desc' }];
}

export default function LessonsGrid({
  lessons,
  courses,
  initialFilters,
}: {
  lessons: LessonListItem[];
  courses: { id: string; title: string }[];
  initialFilters: LessonFilters;
}) {
  const [filters, setFilters] = useState(() => initialFilters);
  const [visibleCount, setVisibleCount] = useState(lessons.length);
  const [api, setApi] = useState<GridApi<LessonGridRow> | null>(null);
  const [selectedCourses, setSelectedCourses] = useState<LessonGridRow | null>(null);
  const displayNow = useRef(Date.now());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const syncingSort = useRef(false);
  const prepared = useMemo(() => prepareLessons(lessons).sort((a, b) => a.id.localeCompare(b.id, 'en')), [lessons]);
  const rows = useMemo(
    () =>
      prepared.filter(
        (row) => (!filters.draftOnly || row.isDraft) && (!filters.course || row.courseIds.has(filters.course))
      ),
    [prepared, filters.draftOnly, filters.course]
  );
  const update = useCallback(
    (patch: Partial<LessonFilters>) => setFilters((current) => ({ ...current, ...patch })),
    []
  );

  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const restored = readLessonFilters(Object.fromEntries(params));
      setFilters(restored);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  useEffect(() => {
    const url = lessonFilterUrl(filters);
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
    (event: SortChangedEvent<LessonGridRow>) => {
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
      if (sort in sortOptions) update({ sort: sort as LessonFilters['sort'] });
    },
    [update]
  );

  useEffect(() => {
    if (selectedCourses) dialogRef.current?.showModal();
  }, [selectedCourses]);

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

  const columns = useMemo<ColDef<LessonGridRow>[]>(
    () => [
      {
        field: 'title',
        headerName: 'Title',
        minWidth: 240,
        flex: 2,
        tooltipField: 'summary',
        filter: 'agTextColumnFilter',
        cellRenderer: ({ data }: ICellRendererParams<LessonGridRow>) =>
          data ? <EditorTitle href={`/instructor/lessons/${data.id}/edit`} title={data.title} /> : null,
      },
      {
        field: 'isDraft',
        headerName: 'Status',
        width: 125,
        cellDataType: false,
        filter: false,
        floatingFilter: false,
        valueFormatter: ({ value }) => (value ? 'Draft' : 'Published'),
        cellRenderer: StatusBadge,
      },
      { field: 'nodeCount', headerName: 'Nodes', filter: 'agNumberColumnFilter', width: 120 },
      {
        colId: 'usage',
        headerName: 'Used in my courses',
        headerTooltip: 'Whether this lesson is used in any of your courses.',
        filter: UsageFilter,
        floatingFilterComponent: UsageFloatingFilter,
        width: 200,
        valueGetter: ({ data }) => Boolean(data?.courses.length),
        cellRenderer: ({ data }: ICellRendererParams<LessonGridRow>) =>
          data?.courses.length ? (
            <button
              type="button"
              className={styles.usageButton}
              onClick={() => setSelectedCourses(data)}
              aria-label={`View courses using ${data.title}`}
            >
              Yes
            </button>
          ) : (
            'No'
          ),
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
  const defaultColDef = useMemo<ColDef<LessonGridRow>>(
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
        <div className={styles.filterRow}>
          <label className={styles.draftToggle}>
            <input
              type="checkbox"
              role="switch"
              checked={Boolean(filters.draftOnly)}
              onChange={(event) => update({ draftOnly: event.target.checked })}
            />
            Drafts only
          </label>
          <label className={styles.filterField}>
            <span className={styles.srOnly}>My course</span>
            <select
              className={`${selectStyles.control} ${selectStyles.compact}`}
              value={filters.course}
              onChange={(event) => update({ course: event.target.value })}
            >
              <option value="">All lessons · any course</option>
              {filters.course && !courses.some((course) => course.id === filters.course) && (
                <option value={filters.course}>Unavailable course</option>
              )}
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title || 'Untitled course'}
                </option>
              ))}
            </select>
          </label>
        </div>
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
          {visibleCount} of {lessons.length} lessons
        </p>
        <p className={styles.sortDescription}>Sort: {sortOptions[filters.sort]}</p>
      </div>
      {!lessons.length ? (
        <p className={styles.empty}>No lessons yet. Create your first one above.</p>
      ) : (
        <div className={styles.grid} aria-label="Lessons table">
          <AgGridReact<LessonGridRow>
            theme={instructorGridTheme}
            context={{ usageLabel: 'Filter course usage' }}
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
            overlayNoRowsTemplate="No lessons match these filters."
          />
        </div>
      )}
      <dialog
        ref={dialogRef}
        className={styles.lessonDialog}
        onClose={() => setSelectedCourses(null)}
        aria-labelledby="lesson-courses-title"
      >
        <h2 id="lesson-courses-title">Courses using {selectedCourses?.title}</h2>
        <div className={styles.lessonLinks}>
          {selectedCourses?.courses.map((course) => (
            <Link key={course.id} href={`/instructor/courses/${course.id}/edit`}>
              {course.title || 'Untitled course'}
            </Link>
          ))}
        </div>
        <button type="button" onClick={() => dialogRef.current?.close()}>
          Close
        </button>
      </dialog>
    </>
  );
}
