import { useCallback, useEffect, useState } from "react";
import { LoadingOverlay } from "@deephaven/components"; // Use the loading spinner from the Deephaven components package
import {
  IrisGrid,
  IrisGridModel,
  IrisGridModelFactory,
} from "@deephaven/iris-grid"; // iris-grid is used to display Deephaven tables
import dh from "@deephaven/jsapi-shim"; // Import the shim to use the JS API
import type {
  ConsoleConfig,
  EnterpriseClient,
  Ide,
  EnterpriseDhType,
} from "@deephaven-enterprise/jsapi-types";
import type { dh as DhType } from "@deephaven/jsapi-types";
import "./App.scss"; // Styles for in this app
import {
  clientConnected,
  getCorePlusApi,
  getTableByQueryName,
  getWebsocketUrl,
  isCorePlusWorkerKind,
} from "./Utils";
import DeephavenAgGridComponent from "./DeephavenAgGridComponent";

const API_URL = import.meta.env.VITE_DEEPHAVEN_API_URL ?? "";

const USER = import.meta.env.VITE_DEEPHAVEN_USER ?? "";

const PASSWORD = import.meta.env.VITE_DEEPHAVEN_PASSWORD ?? "";

const enterpriseApi = dh as EnterpriseDhType;

/**
 * Create a new Deephaven table with the session provided.
 * Creates a table that will tick once every second, with two columns:
 * - Timestamp: The timestamp of the tick
 * - A: The row number
 * @param client The Deephaven client object
 * @returns Deephaven table
 */
async function createGridModel(
  client: EnterpriseClient,
): Promise<[DhType.Table, typeof DhType]> {
  // Create a new session... API is currently undocumented and subject to change in future revisions
  const ide: Ide = new enterpriseApi.Ide(client);

  // Get the server configuration values, to see what engine types are available
  const serverConfigValues = await client.getServerConfigValues();

  // Create a default config
  const config: ConsoleConfig = new enterpriseApi.ConsoleConfig();

  // Set configuration parameters here if you don't want the default
  // Some of them are wired up to query parameters for easy testing
  // Go to URL ?workerKind=DeephavenCommunity&jvmArgs=-Dhttp.websockets=true to open a Core+ worker
  // Need to enable websockets to open from localhost
  const searchParams = new URLSearchParams(window.location.search);
  const workerKind = searchParams.get("workerKind");
  if (workerKind != null) {
    config.workerKind = workerKind;
  }
  if (searchParams.has("jvmArgs")) {
    config.jvmArgs = searchParams.getAll("jvmArgs");
  }
  // config.maxHeapMb = 2048;
  // config.jvmProfile = ...;
  // config.jvmArgs = ...;
  // config.envVars = ...;
  // config.classpath = ...;
  // config.dispatcherHost = ...;
  // config.dispatcherPort = ...;

  console.log("Creating console with config ", config);

  const isCoreWorker =
    workerKind != null &&
    isCorePlusWorkerKind(workerKind, serverConfigValues.workerKinds);
  if (isCoreWorker) {
    console.log("Creating Core+ worker...");
    config.workerCreationJson = JSON.stringify({ script_language: "python" });

    // Start up the Core+ worker
    const worker = await ide.startWorker(config);

    console.log("Started worker", worker, ", loading API");

    // Load the Core+ API from the worker
    const { grpcUrl, envoyPrefix, jsApiUrl } = worker;
    const coreApi = await getCorePlusApi(jsApiUrl);

    const clientOptions =
      envoyPrefix != null
        ? { headers: { "envoy-prefix": envoyPrefix } }
        : undefined;
    const coreClient: DhType.CoreClient = new coreApi.CoreClient(
      grpcUrl,
      clientOptions,
    );

    // Generate an auth token from the enterprise client to connect
    const token = await client.createAuthToken("RemoteQueryProcessor");
    const loginOptions = {
      type: "io.deephaven.proto.auth.Token",
      token,
    };

    console.log("Logging in to Core+ worker...");

    await coreClient.login(loginOptions);

    console.log("Creating session...");

    const connection = await coreClient.getAsIdeConnection();

    const session = await connection.startSession("python");

    // Run the code you want to run. This example just creates a time_table
    await session.runCode("from deephaven import time_table");
    const result = await session.runCode(
      't = time_table("PT1s").update("A=i")',
    );

    // Get the new table definition from the results
    // Results also includes modified/removed objects, which doesn't apply in this case
    const definition = result.changes.created[0];

    console.log(`Fetching table ${definition.name}...`);

    const table = await session.getObject(definition);

    return [table, coreApi];
    // return IrisGridModelFactory.makeModel(coreApi, table);
  }

  const dhConsole = await ide.createConsole(config);

  console.log("Creating session...");

  // Specify the language, 'python' or 'groovy'
  const session = await dhConsole.startSession("python");

  // Run the code in the session to open a table

  console.log(`Creating table...`);

  // Run the code you want to run. This example just creates a timeTable
  await session.runCode("from deephaven.TableTools import timeTable");
  const result = await session.runCode(
    't = timeTable("00:00:01").update("A=i")',
  );

  // Get the new table definition from the results
  // Results also includes modified/removed objects, which doesn't apply in this case
  const definition = result.changes.created[0];

  console.log(`Fetching table ${definition.name}...`);

  const table = await session.getObject(definition);

  return [table, dh];
  // return IrisGridModelFactory.makeModel(enterpriseApi, table);
}

/**
 * A functional React component that displays a Deephaven table in an IrisGrid using the @deephaven/iris-grid package.
 * If the query param `tableName` is provided, it will attempt to open and display that table, expecting it to be present on the server.
 * E.g. http://localhost:3000/?tableName=myTable will attempt to open a table `myTable`
 * If no query param is provided, it will attempt to open a new session and create a basic time table and display that.
 * By default, tries to connect to the server defined in the REACT_APP_CORE_API_URL variable, which is set to http://localhost:8123/irisapi
 * See create-react-app docs for how to update these env vars: https://create-react-app.dev/docs/adding-custom-environment-variables/
 */
function App() {
  const [table, setTable] = useState<DhType.Table>();
  const [api, setApi] = useState<typeof DhType>();
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

      // If a table name was specified, load that table. Otherwise, create a new table.
      const [newTable, newApi] = await (queryName && tableName
        ? getTableByQueryName(client, queryName, tableName)
        : createGridModel(client));

      setTable(newTable);
      setApi(newApi);

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

  const isLoaded = table != null && api != null;

  return (
    <div className="App">
      {isLoaded && <DeephavenAgGridComponent api={api} table={table} />}
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
