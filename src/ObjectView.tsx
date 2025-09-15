import IrisGrid, {
  IrisGridModel,
  IrisGridModelFactory,
} from "@deephaven/iris-grid";
import { dh as CoreDhType } from "@deephaven/jsapi-types";
import { ObjectWrapper } from "./EnterpriseApi";
import { useEffect, useState } from "react";

export function ObjectView({ object }: { object: ObjectWrapper }) {
  // For now, only support grid view because we're not dealing with plugins
  // But in theory, we could load the plugins from the API provided in the object wrapper
  const [model, setModel] = useState<IrisGridModel>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    async function initModel() {
      const newModel = await IrisGridModelFactory.makeModel(
        object.api,
        object.object as CoreDhType.Table
      );
      setModel(newModel);
    }
    initModel().catch((e) => setError(`${e}`));
  }, [object]);

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (model == null) {
    return <div>Loading...</div>;
  }

  return <IrisGrid model={model} />;
}

export default ObjectView;
