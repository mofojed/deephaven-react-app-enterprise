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
import { GridApi, type SelectionChangedEvent } from "ag-grid-community";

function DeephavenAgGridComponent({
  api,
  table,
}: {
  api: typeof DhType;
  table: DhType.Table | DhType.coreplus.pivot.PivotTable;
}) {
  const [sourceTable, setSourceTable] = useState<DhType.Table>();
  const [gridApi, setGridApi] = useState<GridApi>();
  const handleSelectionChanged = useCallback(
    async (event: SelectionChangedEvent) => {
      console.log("Selection changed:", event);
      const { selectedNodes } = event;
      if (selectedNodes == null || selectedNodes.length === 0) {
        return;
      }

      if (sourceTable == null) {
        console.warn("No table copy available to apply selection filter to");
        return;
      }

      // TODO: We need to pass these into AG Grid so that it gets applied correctly, as these are applying to the table and could get reset...
      // Instead of building a Deephaven filter and applying to the source table, we should be building an AG Grid filter model and applying that via the grid API
      // e.g. gridApi?.setColumnFilterModel(filterModel)

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
              rowSource.filter().eq(api.FilterValue.ofString(key)),
            );
          }

          return rowSourceFilters.reduce((acc, rowSour) => {
            return acc.and(rowSour);
          });
        }

        throw new Error("Other table types not yet supported");
      });

      sourceTable.applyFilter([
        filters.reduce((acc, filter) => acc.or(filter)),
      ]);
    },
    [api, gridApi, table, sourceTable],
  );
  const agGridProps: AgGridViewProps["agGridProps"] = useMemo(
    () => ({
      ...getDefaultProps(),
      rowSelection: {
        mode: "multiRow",
      },
      onSelectionChanged: handleSelectionChanged,
    }),
    [handleSelectionChanged],
  );

  const sourceProps: AgGridViewProps["agGridProps"] = useMemo(
    () => ({
      ...getDefaultProps(),
      onModelUpdated: (event) => {
        setGridApi(event.api);
      },
    }),
    [],
  );

  useEffect(() => {
    async function getSourceTable() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newSourceTable = await (table as any).getSourceTable();
      setSourceTable(newSourceTable);
    }
    getSourceTable();
  }, [table]);

  return (
    <ApiContext.Provider value={api}>
      <Grid height="100%" width="100%" columns="1fr 1fr" rows="1fr">
        <AgGridView table={table} agGridProps={agGridProps} />
        {sourceTable != null && (
          <AgGridView table={sourceTable} agGridProps={sourceProps} />
        )}
      </Grid>
    </ApiContext.Provider>
  );
}

export default DeephavenAgGridComponent;
