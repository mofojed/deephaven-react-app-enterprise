import { useCallback, useEffect, useState } from "react";
import { LoadingOverlay } from "@deephaven/components"; // Use the loading spinner from the Deephaven components package
import { IrisGrid, IrisGridModel } from "@deephaven/iris-grid"; // iris-grid is used to display Deephaven tables
import "./App.scss"; // Styles for in this app
import { getGridModelFromWorker } from "./Utils";
import { getWorkerClientProxy } from "./WorkerClientProxy";

/**
 * A functional React component that displays a Deephaven table in an IrisGrid using the @deephaven/iris-grid package.
 * If the query param `tableName` is provided, it will attempt to open and display that table, expecting it to be present on the server.
 * E.g. http://localhost:3000/?tableName=myTable will attempt to open a table `myTable`
 * If no query param is provided, it will attempt to open a new session and create a basic time table and display that.
 * By default, tries to connect to the server defined in the REACT_APP_CORE_API_URL variable, which is set to http://localhost:8123/irisapi
 * See create-react-app docs for how to update these env vars: https://create-react-app.dev/docs/adding-custom-environment-variables/
 */
function App() {
  const [model, setModel] = useState<IrisGridModel>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);

  const initApp = useCallback(async () => {
    const t0 = performance.now();
    try {
      const proxy = getWorkerClientProxy();
      await proxy.waitForReady();

      const tWorkerReady = performance.now();
      console.log(
        `[App] SharedWorker ready in ${(tWorkerReady - t0).toFixed(0)}ms`,
      );

      // Get the table name from the search params `queryName` and `tableName`.
      const searchParams = new URLSearchParams(window.location.search);
      const queryName = searchParams.get("queryName");
      const tableName = searchParams.get("tableName");

      if (!queryName || !tableName) {
        throw new Error(
          "Missing queryName or tableName in URL. Please provide both 'queryName' and 'tableName' query params.",
        );
      }

      const newModel = await getGridModelFromWorker(
        proxy,
        queryName,
        tableName,
      );

      setModel(newModel);

      const tTotal = performance.now();
      console.log(
        `[App] Table loaded in ${(tTotal - tWorkerReady).toFixed(0)}ms (total: ${(tTotal - t0).toFixed(0)}ms)`,
      );
    } catch (e) {
      console.error("Unable to load table", e);
      setError(`${e}`);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    initApp();
  }, [initApp]);

  const isLoaded = model != null;

  return (
    <div className="App">
      {isLoaded && <IrisGrid model={model} sorts={[]} customColumns={[]} />}
      {!isLoaded && (
        <LoadingOverlay
          isLoaded={isLoaded}
          isLoading={isLoading}
          errorMessage={error ? error : null}
        />
      )}
    </div>
  );
}

export default App;
