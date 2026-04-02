import { useCallback, useEffect, useState } from "react";
import { LoadingOverlay } from "@deephaven/components"; // Use the loading spinner from the Deephaven components package
import { IrisGrid, IrisGridModel } from "@deephaven/iris-grid"; // iris-grid is used to display Deephaven tables
import type {
  EnterpriseClient,
  EnterpriseDhType,
} from "@deephaven-enterprise/jsapi-types";
import dh from "@deephaven/jsapi-shim"; // Import the shim to use the JS API
import "./App.scss"; // Styles for in this app
import {
  clientConnected,
  getGridModelByQueryName,
  getWebsocketUrl,
} from "./Utils";

const API_URL = import.meta.env.VITE_DEEPHAVEN_API_URL ?? "";

const USER = import.meta.env.VITE_DEEPHAVEN_USER ?? "";

const PASSWORD = import.meta.env.VITE_DEEPHAVEN_PASSWORD ?? "";

const enterpriseApi = dh as EnterpriseDhType;

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
  const [client, setClient] = useState<EnterpriseClient>();

  const initApp = useCallback(async () => {
    try {
      // Connect to the Web API server
      const baseUrl = new URL(API_URL ?? "", `${window.location}`);

      const websocketUrl = getWebsocketUrl(baseUrl);

      console.log(`Creating client ${websocketUrl}...`);

      const client = new enterpriseApi.Client(websocketUrl.href);

      setClient(client);

      await clientConnected(client);

      await client.login({ username: USER, token: PASSWORD, type: "password" });

      // Get the table name from the search params `queryName` and `tableName`.
      const searchParams = new URLSearchParams(window.location.search);
      const queryName = searchParams.get("queryName");
      const tableName = searchParams.get("tableName");

      if (!queryName || !tableName) {
        throw new Error(
          "Missing queryName or tableName in URL. Please provide both 'queryName' and 'tableName' query params.",
        );
      }

      const newModel = await getGridModelByQueryName(
        client,
        queryName,
        tableName,
      );

      setModel(newModel);

      console.log("Table successfully loaded!");
    } catch (e) {
      console.error("Unable to load table", e);
      setError(`${e}`);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    initApp();
  }, [initApp]);

  useEffect(() => {
    return () => {
      // On unmount, disconnect the client we created (which cleans up the session)
      client?.disconnect();
    };
  }, [client]);

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
