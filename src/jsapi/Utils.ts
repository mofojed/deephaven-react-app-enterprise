/**
 * Utility methods for working with queries in the Deephaven JS API.
 * From the JS API examples: https://deephaven.io/enterprise/docs/development/javascript/
 */
import dh from "@deephaven/jsapi-shim"; // Import the shim to use the JS API
import type {
  EnterpriseClient,
  QueryInfo,
  EnterpriseDhType,
  WorkerKind,
} from "@deephaven-enterprise/jsapi-types";
import { dh as CoreDhType } from "@deephaven/jsapi-types";
import { IrisGridModel, IrisGridModelFactory } from "@deephaven/iris-grid";

export const CLIENT_TIMEOUT = 60_000;

export const QUERY_TIMEOUT = 10_000;

const enterpriseApi = dh as EnterpriseDhType;

/**
 * Get the WebSocket URL for connecting to the JS API
 * @param baseUrl Base URL to get the websocket URL for
 * @returns URL for the websocket
 */
export function getWebsocketUrl(baseUrl: URL): URL {
  const websocketUrl = new URL("/socket", baseUrl);
  if (websocketUrl.protocol === "http:") {
    websocketUrl.protocol = "ws:";
  } else {
    websocketUrl.protocol = "wss:";
  }
  return websocketUrl;
}

export function isCorePlusWorkerKind(
  workerKindName: string,
  workerKinds: WorkerKind[]
): boolean {
  const workerKind = workerKinds.find(({ name }) => name === workerKindName);
  return workerKind?.protocols?.includes("Community") ?? false;
}

/**
 * Check if the query is a Core+ query
 * @param queryInfo QueryInfo object to check
 * @param workerKinds WorkerKinds returned from the servers config values
 * @returns
 */
export function isCorePlusQuery(
  queryInfo: QueryInfo,
  workerKinds: WorkerKind[]
) {
  return isCorePlusWorkerKind(queryInfo.workerKind, workerKinds);
}

/**
 * Retrieve the JS API from the URL provided
 * @param jsApiUrl URL for the jS API
 * @returns Core+ API from that URL
 */
export async function getCorePlusApi(
  jsApiUrl: string
): Promise<typeof CoreDhType> {
  // Dynamically load the API instance from the given URL
  console.log("Import API", jsApiUrl);
  try {
    const api = (await import(/* @vite-ignore */ jsApiUrl)).default;
    console.log("API bootstrapped from", jsApiUrl);
    return api;
  } catch (e) {
    console.error("Unable to bootstrap API", e);
    throw new Error("Unable to bootstrap API");
  }
}

/**
 * Retrieve the Core+ client and logs in for the given API, token, and URL
 * @param api JS API of the Core+ worker to get the client for
 * @param token Authentication token for the Core+ worker
 * @param grpcUrl URL to connect to the Core+ worker
 * @param envoyPrefix Envoy prefix if specified for the worker
 * @returns Core+ client
 */
export async function getCorePlusClient(
  api: typeof CoreDhType,
  token: string,
  grpcUrl: string,
  envoyPrefix?: string | null
): Promise<CoreDhType.CoreClient> {
  // Create a Core+ client instance and authenticate
  const clientOptions = envoyPrefix
    ? {
        headers: { "envoy-prefix": envoyPrefix },
      }
    : undefined;
  console.log("Init Core+ client", grpcUrl);
  const corePlusClient = new api.CoreClient(grpcUrl, clientOptions);
  console.log("Core+ client", corePlusClient);
  const loginOptions = {
    type: "io.deephaven.proto.auth.Token",
    token,
  };
  console.log("Log in with", loginOptions);
  await corePlusClient.login(loginOptions);
  console.log("Log in success");
  return corePlusClient;
}

/**
 * Retrieve the Core+ connection for the given API, token, and query info
 * @param api JS API of the Core+ worker to get the connection for
 * @param token Authentication token for the Core+ worker
 * @param queryInfo QueryInfo object for the Core+ worker
 * @returns Core+ connection
 */
export async function getCorePlusConnection(
  api: typeof CoreDhType,
  token: string,
  queryInfo: QueryInfo
) {
  const { serial, grpcUrl, envoyPrefix } = queryInfo;
  console.log("Get Core+ Client for query", serial);
  const corePlusClient = await getCorePlusClient(
    api,
    token,
    grpcUrl,
    envoyPrefix
  );
  return corePlusClient.getAsIdeConnection();
}

/**
 * Retrieve a table from the given EnterpriseClient and QueryInfo
 * @param legacyClient EnterpriseClient to use
 * @param queryInfo QueryInfo object to get the table from
 * @param name Name of the table to get
 * @returns Table object
 */
export async function getGridModel(
  legacyClient: EnterpriseClient,
  queryInfo: QueryInfo,
  name: string
): Promise<IrisGridModel> {
  const { workerKinds } = await legacyClient.getServerConfigValues();
  if (isCorePlusQuery(queryInfo, workerKinds)) {
    // Getting the table from the Core+ query requires a Core+ API instance
    // and an authenticated Core+ connection
    const api = await getCorePlusApi(queryInfo.jsApiUrl);
    const token = await legacyClient.createAuthToken("RemoteQueryProcessor");
    const connection = await getCorePlusConnection(api, token, queryInfo);
    const objectDefinition = {
      name,
      type: "Table",
    };
    const table = await connection.getObject(objectDefinition);
    return IrisGridModelFactory.makeModel(api, table);
  }
  // Get the table from the legacy query
  const table = await queryInfo.getTable(name);
  return IrisGridModelFactory.makeModel(enterpriseApi, table);
}

/**
 * Retrieve a query by name.
 * @param client Enterprise client to get the query from
 * @param queryName Query name to retrieve
 */
export async function getQuery(
  client: EnterpriseClient,
  queryName: string
): Promise<QueryInfo> {
  console.log("Fetching query", queryName);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Query not found, ${queryName}`));
      removeListener();
    }, QUERY_TIMEOUT);

    function resolveIfQueryFound(queries: QueryInfo[]) {
      const matchingQuery = queries.find((query) => query.name === queryName);

      if (matchingQuery) {
        resolve(matchingQuery);
        clearTimeout(timeout);
        removeListener();
      }
    }

    function listener(event: CustomEvent<QueryInfo>) {
      const addedQueries = [event.detail];
      resolveIfQueryFound(addedQueries);
    }

    const removeListener = client.addEventListener(
      enterpriseApi.Client.EVENT_CONFIG_ADDED,
      listener
    );
    const initialQueries = client.getKnownConfigs();
    resolveIfQueryFound(initialQueries);
  });
}

/**
 * Load an existing Deephaven table with the client and query name provided
 * Needs to listen for when queries are added to the list as they are not known immediately after connecting.
 * @param client The Deephaven client object
 * @param queryName Name of the query to load
 * @param tableName Name of the table to load
 * @returns Deephaven table
 */
export async function getGridModelByQueryName(
  legacyClient: EnterpriseClient,
  queryName: string,
  tableName: string
): Promise<IrisGridModel> {
  const query = await getQuery(legacyClient, queryName);
  return getGridModel(legacyClient, query, tableName);
}

/**
 * Wait for Deephaven client to be connected
 * @param client Deephaven client object
 * @returns When the client is connected, rejects on timeout
 */
export async function clientConnected(client: EnterpriseClient): Promise<void> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((client as any).isConnected) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      reject(new Error("Timeout waiting for connect"));
    }, CLIENT_TIMEOUT);

    client.addEventListener(enterpriseApi.Client.EVENT_CONNECT, () => {
      resolve();
      clearTimeout(timer);
    });
  });
}
