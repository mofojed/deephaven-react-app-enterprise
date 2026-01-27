import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { dh as DhType } from "@deephaven/jsapi-types";
import {
  AgGridDhTheme,
  AgGridView,
  AgGridViewProps,
  getDefaultProps,
  isPivotTable,
  TREE_NODE_KEY,
} from "@deephaven/js-plugin-ag-grid";
import { ApiContext } from "@deephaven/jsapi-bootstrap";
import { Grid } from "@deephaven/components";
import {
  type FilterModel,
  type GridApi,
  themeQuartz,
  type SelectionChangedEvent,
} from "ag-grid-community";

function DeephavenAgGridComponent({
  api,
  table,
}: {
  api: typeof DhType;
  table: DhType.Table | DhType.coreplus.pivot.PivotTable;
}) {
  const themeParams = useMemo(() => AgGridDhTheme.getThemeParams(), []);

  const theme = useMemo(
    () => themeQuartz.withParams(themeParams),
    [themeParams],
  );

  const [sourceTable, setSourceTable] = useState<DhType.Table>();
  const [gridApi, setGridApi] = useState<GridApi>();
  const handleSelectionChanged = useCallback(
    async (event: SelectionChangedEvent) => {
      const { selectedNodes } = event;
      if (selectedNodes == null || selectedNodes.length === 0) {
        return;
      }

      // Build an AG Grid filter model to filter the source table to just these selected rows
      // We need to collect unique values per column, then build a combined filter model
      const columnValues: Record<string, Set<string>> = {};

      selectedNodes.forEach((node) => {
        const { data } = node;
        const treeNodeKey = data[TREE_NODE_KEY];
        if (isPivotTable(table)) {
          // If it's a pivot table, we need to look at the row sources to build the filters
          // Only up to the depth of this selection
          for (let depth = 0; depth <= treeNodeKey.depth - 2; depth += 1) {
            const rowSource = table.rowSources[depth];
            const key = data[rowSource.name];

            if (!columnValues[rowSource.name]) {
              columnValues[rowSource.name] = new Set();
            }
            columnValues[rowSource.name].add(key);
          }
        } else {
          throw new Error("Other table types not yet supported");
        }
      });

      // Build the filter model using text filters with OR conditions for multiple values
      const filterModel: FilterModel = {};
      Object.entries(columnValues).forEach(([columnName, values]) => {
        const valuesArray = Array.from(values);
        if (valuesArray.length === 1) {
          // Single value: use simple text filter with equals
          filterModel[columnName] = {
            filterType: "text",
            type: "equals",
            filter: valuesArray[0],
          };
        } else {
          // Multiple values: use combined filter with OR operator
          filterModel[columnName] = {
            filterType: "text",
            operator: "OR",
            conditions: valuesArray.map((value) => ({
              filterType: "text",
              type: "equals",
              filter: value,
            })),
          };
        }
      });

      // Apply the filter model via the AG Grid API
      gridApi?.setFilterModel(filterModel);
    },
    [gridApi, table],
  );
  const agGridProps: AgGridViewProps["agGridProps"] = useMemo(
    () => ({
      ...getDefaultProps(),
      rowSelection: {
        mode: "multiRow",
      },
      onSelectionChanged: handleSelectionChanged,
      theme,
    }),
    [handleSelectionChanged, theme],
  );

  const sourceProps: AgGridViewProps["agGridProps"] = useMemo(
    () => ({
      ...getDefaultProps(),
      onModelUpdated: (event) => {
        setGridApi(event.api);
      },
      theme,
    }),
    [theme],
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
