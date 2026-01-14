import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { dh as DhType } from "@deephaven/jsapi-types";
import {
  AgGridView,
  AgGridViewProps,
  getDefaultProps,
  isPivotTable,
  TREE_NODE_KEY,
} from "@deephaven/js-plugin-ag-grid";
import { ApiContext } from "@deephaven/jsapi-bootstrap";
import { Grid } from "@deephaven/components";
import { type SelectionChangedEvent } from "ag-grid-community";

function DeephavenAgGridComponent({
  api,
  table,
}: {
  api: typeof DhType;
  table: DhType.Table | DhType.coreplus.pivot.PivotTable;
}) {
  const [tableCopy, setTableCopy] = useState<
    DhType.Table | DhType.coreplus.pivot.PivotTable
  >();
  const handleSelectionChanged = useCallback(
    async (event: SelectionChangedEvent) => {
      console.log("Selection changed:", event);
      const { selectedNodes } = event;
      if (selectedNodes == null || selectedNodes.length === 0) {
        return;
      }

      if (tableCopy == null) {
        console.warn("No table copy available to apply selection filter to");
        return;
      }

      // Now we need to build the appropriate filters to filter the original table to just these selected rows
      const filters = selectedNodes.map((node) => {
        const { data } = node;
        const treeNodeKey = data[TREE_NODE_KEY];
        if (isPivotTable(table)) {
          // If it's a pivot table, we need to look at the row sources to build the filters
          // Only up to the depth of this selection
          const rowSourceFilters = [];
          for (let depth = 0; depth <= treeNodeKey.depth - 2; depth += 1) {
            const rowSource = table.rowSources[depth];
            const key = data[rowSource.name];
            rowSourceFilters.push(
              rowSource.filter().eq(api.FilterValue.ofString(key))
            );
          }

          return rowSourceFilters.reduce((acc, rowSour) => {
            return acc.and(rowSour);
          });
        }

        throw new Error("Other table types not yet supported");
      });

      tableCopy.applyFilter([filters.reduce((acc, filter) => acc.or(filter))]);
    },
    [api, table, tableCopy]
  );
  const agGridProps: AgGridViewProps["agGridProps"] = useMemo(
    () => ({
      ...getDefaultProps(),
      rowSelection: {
        mode: "multiRow",
      },
      onSelectionChanged: handleSelectionChanged,
    }),
    [handleSelectionChanged]
  );

  useEffect(() => {
    async function copyTable() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newTableCopy = await (table as any).copy();
      setTableCopy(newTableCopy);
    }
    copyTable();
  }, [table]);

  return (
    <ApiContext.Provider value={api}>
      <Grid height="100%" width="100%" columns="1fr 1fr" rows="1fr">
        <AgGridView table={table} agGridProps={agGridProps} />
        {tableCopy != null && (
          <AgGridView table={tableCopy} agGridProps={agGridProps} />
        )}
      </Grid>
    </ApiContext.Provider>
  );
}

export default DeephavenAgGridComponent;
