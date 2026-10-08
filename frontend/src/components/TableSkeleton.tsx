"use client";
// Placeholder rows shown while a table refreshes, like the console: the column headers stay and every
// cell becomes a grey bar. Cloudscape's Table has no skeleton mode, so the rows are fake items whose
// cells all render a bar; the real columns, sorting and widths are kept.
import type { TableProps } from "@cloudscape-design/components/table";

export function SkeletonBar() {
  return <span className="skeleton-bar" aria-hidden="true" />;
}

/** `count` fake rows, typed as the table's items (only their `id` is read, by trackBy). */
export function skeletonItems<T>(count: number): T[] {
  return Array.from({ length: Math.min(Math.max(count, 3), 10) }, (_, i) => ({ id: `skeleton-${i}` }) as unknown as T);
}

/** The same columns with every cell drawn as a bar. */
export function skeletonColumns<T>(columns: TableProps.ColumnDefinition<T>[]): TableProps.ColumnDefinition<T>[] {
  return columns.map((c) => ({ ...c, cell: () => <SkeletonBar /> }));
}

/** Announces the refresh to screen readers, since the bars themselves are hidden from them. */
export function RefreshStatus({ refreshing, text }: { refreshing: boolean; text: string }) {
  return (
    <span className="visually-hidden" role="status">
      {refreshing ? text : ""}
    </span>
  );
}
