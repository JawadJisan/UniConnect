'use client';

import {
  createColumnHelper,
  createPaginatedRowModel,
  rowPaginationFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
} from '@tanstack/react-table';
import { m } from 'motion/react';
import type { ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { duration } from '@/lib/motion';
import { cn } from '@/lib/utils';

/** Per-column layout: responsive hiding and alignment live with the column, not the markup. */
export interface DataColumnMeta {
  /** Classes for the header and every cell, e.g. `hidden md:table-cell` or `text-right`. */
  className?: string;
}

/**
 * The table features every DataTable uses (TanStack Table v9). Pagination is always on; a table
 * the server pages (the admin list) gets one page of rows and a page size to match.
 */
export const dataTableFeatures = tableFeatures({
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  columnMeta: {} as DataColumnMeta,
});

export type DataTableFeatures = typeof dataTableFeatures;
export type DataColumn<T extends RowData> = ColumnDef<DataTableFeatures, T, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Column helper bound to the DataTable features, so `meta` is typed. */
export function dataColumns<T extends RowData>() {
  return createColumnHelper<DataTableFeatures, T>();
}

export interface DataTableProps<T extends RowData> {
  columns: DataColumn<T>[];
  data: T[];
  /** Screen-reader caption naming the table and its order. */
  caption: string;
  getRowId: (row: T) => string;
  /** Rows per page when the table pages on the client; omit to show every row given. */
  pageSize?: number;
  pageIndex?: number;
  /** Dims the rows while the next page loads (keepPreviousData). */
  stale?: boolean;
  /** Renders under the table, e.g. a Pager. Receives the client-side page count. */
  footer?: (pageCount: number) => ReactNode;
}

/**
 * A dense table (DESIGN.md §7 "Table"): `micro-label` headers, hairline frame, amounts in mono.
 * Rows fade in with a short stagger; reduced motion is handled by MotionConfig.
 */
export function DataTable<T extends RowData>({
  columns,
  data,
  caption,
  getRowId,
  pageSize,
  pageIndex = 0,
  stale,
  footer,
}: DataTableProps<T>) {
  const size = pageSize ?? Math.max(data.length, 1);
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    getRowId,
    state: { pagination: { pageIndex, pageSize: size } },
  });
  const rows = table.getRowModel().rows;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id} className={header.column.columnDef.meta?.className}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className={stale ? 'opacity-60' : undefined}>
            {rows.map((row, i) => (
              <m.tr
                key={row.id}
                data-slot="table-row"
                className="border-b border-border transition-colors hover:bg-surface-1"
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: duration.base, delay: Math.min(i, 10) * 0.02 }}
              >
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className={cn(cell.column.columnDef.meta?.className)}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </m.tr>
            ))}
          </TableBody>
        </Table>
      </div>
      {footer?.(table.getPageCount())}
    </div>
  );
}
