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

/**
 * Doing an object wrapper to keep track of which API the object came from.
 * This has been a pain point for developers/customers before, and the error that results from using an incorrect API is not very clear.
 * Ideally, what would be better is the user wouldn't need to reference the API explicitly at all, but that would be pretty ridiculous refactoring.
 */
export type ObjectWrapper = {
  // Annoying that a Table is a "special" kind of widget.
  object: CoreDhType.Table | CoreDhType.Widget;
  type: string;

  // Access to the API that this object came from, in case the user needs to do further operations on it (such as build a filter for a table)
  api: typeof CoreDhType;

  // TODO: Should it also have a reference to the connection/client it came from? Probably useful for some operations...
};

/**
 * Rough draft of an Enterprise API wrapper for creating clients and getting objects.
 * Transparently handles Core+ API loading/connection under the covers when loading an object.
 */
export type EnterpriseClientWrapper = {
  api: DheType;
  client: EnterpriseClient;
  login: EnterpriseClient["login"];
  // Pretty much all methods are the same, minus getObject which handles Core+ transparently
  getObject: (queryName: string, tableName: string) => Promise<ObjectWrapper>;

  // TODO: Tracking queries... do we still want to just have an array of all query objects maintained?
  // Or do we want to explicitly subscribe to it/have a table for it? (Maybe we do need to maintain knowledge of all of them, unsure)

  // TODO: Tracking plugins... how would that work in this model? It's not really part of the JS API at all right now, maybe as a separate package... but then how to load it up seamlessly from the worker?
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
            // TODO: The API, client, and connection instances would all be cached, based on similar logic as our EnterpriseCorePlusManager that we currently have in the deephaven-ent/iris repo.
            // The caching logic would be based on the engine type, so it wouldn't load a new API if the engine is the same as a previous one.
            // We could also potentially leverage service workers to intercept the request and reload the API from a cache _even if the port is different but the engine is recognized as the same_, but that gets a little bit sticky and out of scope for this example (which does not use workers at all).
            // There is an assumption there would be caching on the API from the worker (at least etags).
            // For this example, just load a new one each time.
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
