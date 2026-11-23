'use client';
import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type ColDef, type ICellRendererParams } from 'ag-grid-community';
import { instructorGridTheme } from '@/app/components/InstructorGrid/theme';
import { EditorTitle } from '@/app/components/InstructorGrid/EditorTitle';
import { updatedLabel, updatedTooltip } from '@/app/components/InstructorGrid/updatedLabel';
import styles from '@/app/components/InstructorGrid/grid.module.css';
ModuleRegistry.registerModules([AllCommunityModule]);
export type WorkspaceRow = {
  id: string;
  name: string;
  role: string;
  nodeCount: number;
  lessonCount: number;
  updatedAt: Date;
};
export default function WorkspacesGrid({ workspaces }: { workspaces: WorkspaceRow[] }) {
  const rows = useMemo(
    () => workspaces.map((w) => ({ ...w, updatedTimestamp: new Date(w.updatedAt).getTime() })),
    [workspaces]
  );
  type Row = (typeof rows)[number];
  const columns = useMemo<ColDef<Row>[]>(
    () => [
      {
        field: 'name',
        headerName: 'Name',
        flex: 2,
        minWidth: 240,
        filter: 'agTextColumnFilter',
        sort: 'asc',
        cellRenderer: ({ data }: ICellRendererParams<Row>) =>
          data ? <EditorTitle href={`/workspaces/${data.id}`} title={data.name} destination="workspace" /> : null,
      },
      { field: 'role', headerName: 'Your role', width: 145, filter: 'agTextColumnFilter' },
      { field: 'nodeCount', headerName: 'Nodes', width: 120, filter: 'agNumberColumnFilter' },
      { field: 'lessonCount', headerName: 'Lessons', width: 120, filter: 'agNumberColumnFilter' },
      {
        field: 'updatedTimestamp',
        headerName: 'Last updated',
        minWidth: 190,
        flex: 1,
        filter: 'agDateColumnFilter',
        valueFormatter: ({ value }) => updatedLabel(value, Date.now()),
        tooltipValueGetter: ({ value }) => updatedTooltip(value),
        filterParams: {
          comparator: (date: Date, timestamp: number) => {
            const actual = new Date(timestamp);
            return Math.sign(
              Date.UTC(actual.getUTCFullYear(), actual.getUTCMonth(), actual.getUTCDate()) -
                Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
            );
          },
        },
      },
    ],
    []
  );
  const defaultColDef = useMemo<ColDef<Row>>(
    () => ({
      sortable: true,
      resizable: true,
      floatingFilter: true,
      cellDataType: false,
      filterParams: { debounceMs: 150 },
    }),
    []
  );
  if (!rows.length)
    return <p className={styles.empty}>No workspaces yet. Create one or accept an invitation from your team.</p>;
  return (
    <div className={styles.grid} aria-label="Workspaces table">
      <AgGridReact<Row>
        theme={instructorGridTheme}
        rowData={rows}
        columnDefs={columns}
        defaultColDef={defaultColDef}
        getRowId={({ data }) => data.id}
        rowHeight={44}
        animateRows={false}
        overlayNoRowsTemplate="No workspaces match these filters."
      />
    </div>
  );
}
