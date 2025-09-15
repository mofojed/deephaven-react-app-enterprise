import {
  EnterpriseDhType as DheType,
  EnterpriseClient,
  QueryInfo,
} from "@deephaven-enterprise/jsapi-types";
import { dh as CoreDhType } from "@deephaven/jsapi-types";
import {
  getCorePlusApi,
  getCorePlusConnection,
  getWebsocketUrl,
  isCorePlusQuery,
} from "./Utils";

export type ObjectWrapper = {
  object: CoreDhType.Table | CoreDhType.Widget;
  type: string;
  api: typeof CoreDhType;
};

export type EnterpriseClientWrapper = {
  api: DheType;
  client: EnterpriseClient;
  login: EnterpriseClient["login"];
  getObject: (queryName: string, tableName: string) => Promise<ObjectWrapper>;
};

export type EnterpriseApiWrapper = {
  api: DheType;
  // How would JS plugins fit in? They're mainly a UI thing...
  createClient: () => Promise<EnterpriseClientWrapper>;
};

const CLIENT_TIMEOUT = 60_000;
/**
 * Wait for Deephaven client to be connected
 * @param client Deephaven client object
 * @returns When the client is connected, rejects on timeout
 */
async function clientConnected(client: EnterpriseClientWrapper): Promise<void> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((client as any).isConnected) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      reject(new Error("Timeout waiting for connect"));
    }, CLIENT_TIMEOUT);

    client.client.addEventListener(client.api.Client.EVENT_CONNECT, () => {
      resolve();
      clearTimeout(timer);
    });
  });
}

/**
 * Retrieve a query by name.
 * @param client Enterprise client to get the query from
 * @param queryName Query name to retrieve
 */
async function getQuery(
  client: EnterpriseClientWrapper,
  queryName: string
): Promise<QueryInfo> {
  console.log("Fetching query", queryName);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Query not found, ${queryName}`));
      removeListener();
    }, 10_000);

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

    const removeListener = client.client.addEventListener(
      client.api.Client.EVENT_CONFIG_ADDED,
      listener
    );
    const initialQueries = client.client.getKnownConfigs();
    resolveIfQueryFound(initialQueries);
  });
}

/**
 *
 * @param apiUrl The base URL of the Deephaven API, e.g. http://localhost:8123/irisapi
 * @returns The imported Deephaven Enterprise API module
 */
export async function loadEnterpriseApi(
  apiUrl: string
): Promise<EnterpriseApiWrapper> {
  if (window.dh != null) {
    throw new Error(
      "window.dh is already defined. Cannot import multiple versions of the Deephaven Enterprise API."
    );
  }

  await import(`${apiUrl}/irisapi.nocache.js`);
  const api = window.dh as DheType;
  console.log("Loaded Enterprise API:", api);
  return {
    api,
    createClient: async () => {
      const baseUrl = new URL(apiUrl ?? "", `${window.location}`);
      const websocketUrl = getWebsocketUrl(baseUrl);
      const client = new api.Client(websocketUrl.href);
      const wrappedClient: EnterpriseClientWrapper = {
        api,
        client,
        login: client.login.bind(client),
        getObject: async (queryName, tableName) => {
          const query = await getQuery(wrappedClient, queryName);
          const { workerKinds } = await client.getServerConfigValues();
          if (isCorePlusQuery(query, workerKinds)) {
            // Getting the table from the Core+ query requires a Core+ API instance
            // and an authenticated Core+ connection
            const coreApi = await getCorePlusApi(
              query.designated?.jsApiUrl ?? ""
            );
            const token = await client.createAuthToken("RemoteQueryProcessor");
            const connection = await getCorePlusConnection(
              coreApi,
              token,
              query
            );
            const type = "Table";
            const objectDefinition = {
              name: tableName,
              type,
            };
            const table = await connection.getObject(objectDefinition);
            return {
              object: table,
              type,
              api: coreApi,
            };
          }
          throw new Error("Legacy queries are not supported in this example.");
        },
      };
      await clientConnected(wrappedClient);
      return wrappedClient;
    },
  };
}
