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
  filterPreparedNodes,
  nodeFilterUrl,
  prepareNodes,
  readNodeFilters,
  sortOptions,
  type NodeFilters,
  type NodeGridRow,
  type NodeListItem,
} from './listFilters';
import styles from '../../components/InstructorGrid/grid.module.css';
import { instructorGridTheme } from '../../components/InstructorGrid/theme';
import { EditorTitle } from '../../components/InstructorGrid/EditorTitle';
import { StatusBadge } from '../../components/InstructorGrid/StatusBadge';
import { UsageFilter, UsageFloatingFilter } from './UsageFilter';
import { currentNodeFilters } from './gridFilterState';
import { updatedLabel, updatedTooltip } from './updatedLabel';

ModuleRegistry.registerModules([AllCommunityModule]);
const emptyFilters = readNodeFilters({});

export function sortState(sort: NodeFilters['sort']): ColumnState[] {
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

export default function NodesGrid({
  nodes,
  lessons,
  initialFilters,
}: {
  nodes: NodeListItem[];
  lessons: { id: string; title: string; isDraft: boolean }[];
  initialFilters: NodeFilters;
}) {
  const [filters, setFilters] = useState(() => currentNodeFilters(initialFilters));
  const [visibleCount, setVisibleCount] = useState(nodes.length);
  const [api, setApi] = useState<GridApi<NodeGridRow> | null>(null);
  const [selectedLessons, setSelectedLessons] = useState<NodeGridRow | null>(null);
  const displayNow = useRef(Date.now());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const syncingSort = useRef(false);
  const prepared = useMemo(() => prepareNodes(nodes).sort((a, b) => a.id.localeCompare(b.id, 'en')), [nodes]);
  const rows = useMemo(
    () =>
      filterPreparedNodes(prepared, {
        q: '',
        tags: [],
        status: filters.draftOnly ? 'draft' : 'all',
        usage: filters.lesson ? 'mine' : 'all',
        lesson: filters.lesson,
        sort: 'default',
      }),
    [prepared, filters.draftOnly, filters.lesson]
  );
  const update = useCallback((patch: Partial<NodeFilters>) => setFilters((current) => ({ ...current, ...patch })), []);

  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const restored = readNodeFilters({ ...Object.fromEntries(params), tag: params.getAll('tag') });
      setFilters(currentNodeFilters(restored));
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  useEffect(() => {
    const url = nodeFilterUrl(filters);
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
    (event: SortChangedEvent<NodeGridRow>) => {
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
      if (sort in sortOptions) update({ sort: sort as NodeFilters['sort'] });
    },
    [update]
  );

  useEffect(() => {
    if (selectedLessons) dialogRef.current?.showModal();
  }, [selectedLessons]);

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

  const columns = useMemo<ColDef<NodeGridRow>[]>(
    () => [
      {
        field: 'title',
        headerName: 'Title',
        minWidth: 240,
        flex: 2,
        tooltipField: 'summary',
        filter: 'agTextColumnFilter',
        cellRenderer: ({ data }: ICellRendererParams<NodeGridRow>) =>
          data ? (
            <EditorTitle
              href={
                data.canEdit === false
                  ? `/instructor/copy?mode=nodes&nodeId=${data.id}`
                  : `/instructor/nodes/${data.id}/edit`
              }
              title={data.title}
              destination={data.canEdit === false ? 'copy workflow' : 'editor'}
            />
          ) : null,
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
      {
        colId: 'tags',
        headerName: 'Tags',
        filter: 'agTextColumnFilter',
        filterParams: { debounceMs: 150, maxNumConditions: 100 },
        minWidth: 210,
        flex: 1,
        valueGetter: ({ data }) => data?.tags.join(', ') ?? '',
        tooltipValueGetter: ({ value }) => value,
      },
      {
        colId: 'usage',
        headerName: 'Used in my lessons',
        headerTooltip: 'Whether this node is used in any of your lessons.',
        filter: UsageFilter,
        floatingFilterComponent: UsageFloatingFilter,
        width: 200,
        valueGetter: ({ data }) => Boolean(data?.lessons.length),
        cellRenderer: ({ data }: ICellRendererParams<NodeGridRow>) =>
          data?.lessons.length ? (
            <button
              type="button"
              className={styles.usageButton}
              onClick={() => setSelectedLessons(data)}
              aria-label={`View lessons using ${data.title}`}
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
  const defaultColDef = useMemo<ColDef<NodeGridRow>>(
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
            <span className={styles.srOnly}>My lesson</span>
            <select
              className={`${selectStyles.control} ${selectStyles.compact}`}
              value={filters.lesson}
              onChange={(event) => update({ lesson: event.target.value })}
            >
              <option value="">All nodes · any lesson</option>
              {filters.lesson && !lessons.some((lesson) => lesson.id === filters.lesson) && (
                <option value={filters.lesson}>Unavailable lesson</option>
              )}
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.title || 'Untitled lesson'}
                  {lesson.isDraft ? ' (Draft)' : ''}
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
          {visibleCount} of {nodes.length} nodes
        </p>
        <p className={styles.sortDescription}>Sort: {sortOptions[filters.sort]}</p>
      </div>
      {!nodes.length ? (
        <p className={styles.empty}>No nodes yet. Create your first one above.</p>
      ) : (
        <div className={styles.grid} aria-label="Nodes table">
          <AgGridReact<NodeGridRow>
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
            overlayNoRowsTemplate="No nodes match these filters."
          />
        </div>
      )}
      <dialog
        ref={dialogRef}
        className={styles.lessonDialog}
        onClose={() => setSelectedLessons(null)}
        aria-labelledby="node-lessons-title"
      >
        <h2 id="node-lessons-title">Lessons using {selectedLessons?.title}</h2>
        <div className={styles.lessonLinks}>
          {selectedLessons?.lessons.map((lesson) => (
            <Link key={lesson.id} href={`/instructor/lessons/${lesson.id}/edit`}>
              {lesson.title || 'Untitled lesson'}
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
