import React, { useCallback, useMemo } from "react";
import type { dh as DhType } from "@deephaven/jsapi-types";
import {
  AgGridView,
  AgGridViewProps,
  getDefaultProps,
} from "@deephaven/js-plugin-ag-grid";
import { ApiContext } from "@deephaven/jsapi-bootstrap";

function DeephavenAgGridComponent({
  api,
  table,
}: {
  api: typeof DhType;
  table: DhType.Table | DhType.coreplus.pivot.PivotTable;
}) {
  const handleSelectionChanged = useCallback((event: unknown) => {
    console.log("Selection changed:", event);
  }, []);
  const agGridProps: AgGridViewProps["agGridProps"] = useMemo(
    () => ({
      ...getDefaultProps(),
      rowSelection: {
        mode: "singleRow",
      },
      onSelectionChanged: handleSelectionChanged,
    }),
    [handleSelectionChanged]
  );
  return (
    <ApiContext.Provider value={api}>
      <AgGridView table={table} agGridProps={agGridProps} />
    </ApiContext.Provider>
  );
}

export default DeephavenAgGridComponent;
