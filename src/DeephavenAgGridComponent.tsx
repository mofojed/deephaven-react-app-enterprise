import React, { useMemo } from "react";
import type { dh as DhType } from "@deephaven/jsapi-types";
import { AgGridView, getDefaultProps } from "@deephaven/js-plugin-ag-grid";
import { ApiContext } from "@deephaven/jsapi-bootstrap";

function DeephavenAgGridComponent({
  api,
  table,
}: {
  api: typeof DhType;
  table: DhType.Table;
}) {
  const agGridProps = useMemo(() => getDefaultProps(), []);
  return (
    <ApiContext.Provider value={api}>
      <AgGridView table={table} agGridProps={agGridProps} />
    </ApiContext.Provider>
  );
}

export default DeephavenAgGridComponent;
