import React from "react";
import type { dh as DhType } from "@deephaven/jsapi-types";
import { AgGridView } from "@deephaven/js-plugin-ag-grid";
import { ApiContext } from "@deephaven/jsapi-bootstrap";

function DeephavenAgGridComponent({
  api,
  table,
}: {
  api: typeof DhType;
  table: DhType.Table;
}) {
  return (
    <ApiContext.Provider value={api}>
      <AgGridView table={table} />
    </ApiContext.Provider>
  );
}

export default DeephavenAgGridComponent;
