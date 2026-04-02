/**
 * SharedWorker that holds a single EnterpriseClient connection.
 *
 * - First connecting tab sends an "init" message with the API URL and credentials.
 * - Subsequent tabs immediately receive the current status ("ready" / "connecting" / "error").
 * - Tabs communicate via a lightweight RPC protocol defined in worker-protocol.ts.
 *
 * This file is compiled by Vite as a classic SharedWorker (not a module),
 * so `importScripts` is available for loading the GWT-compiled JS API.
 */

/* eslint-disable no-restricted-globals */

import type {
  InitMessage,
  RpcRequest,
  SerializableQueryInfo,
  SerializableServerConfigValues,
  StatusMessage,
  TabToWorkerMessage,
  WorkerToTabMessage,
} from "./worker-protocol";

// ── Types we can't import at runtime (GWT API is loaded dynamically) ────────

// We type the API and client loosely here because the actual types come from
// the GWT script loaded via importScripts at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DhApi = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DhClient = any;

// ── State ───────────────────────────────────────────────────────────────────

const ports = new Set<MessagePort>();
let status: StatusMessage["status"] = "connecting";
let statusError: string | undefined;
let dhApi: DhApi = null;
let client: DhClient = null;

// ── Helpers ─────────────────────────────────────────────────────────────────

function broadcast(msg: WorkerToTabMessage) {
  for (const port of ports) {
    port.postMessage(msg);
  }
}

function sendStatus(port: MessagePort) {
  const msg: StatusMessage = { type: "status", status, error: statusError };
  port.postMessage(msg);
}

function serializeQuery(q: DhClient): SerializableQueryInfo {
  return {
    name: q.name,
    serial: q.serial,
    status: q.status,
    workerKind: q.workerKind,
    grpcUrl: q.grpcUrl,
    jsApiUrl: q.jsApiUrl,
    ideUrl: q.ideUrl,
    envoyPrefix: q.envoyPrefix,
  };
}

// ── Initialisation (called once by the first tab) ───────────────────────────

async function init(msg: InitMessage) {
  if (dhApi != null) return; // already initialised

  const t0 = performance.now();

  try {
    // Polyfill `window` for GWT-compiled code that may reference it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any).window = self;

    // Load the Deephaven Enterprise JS API
    importScripts(`${msg.apiUrl}/irisapi.nocache.js`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dhApi = (self as any).dh;

    if (!dhApi) {
      throw new Error(
        "Failed to load Deephaven API – globalThis.dh is undefined after importScripts",
      );
    }

    const tApiLoaded = performance.now();
    console.log(
      `[SharedWorker] API loaded in ${(tApiLoaded - t0).toFixed(0)}ms, creating client…`,
    );
    client = new dhApi.Client(msg.websocketUrl);

    // Wait for the WebSocket to connect
    await new Promise<void>((resolve, reject) => {
      if (client.isConnected) {
        resolve();
        return;
      }
      const timer = setTimeout(
        () => reject(new Error("Timeout waiting for connect")),
        60_000,
      );
      client.addEventListener(dhApi.Client.EVENT_CONNECT, () => {
        clearTimeout(timer);
        resolve();
      });
    });

    const tConnected = performance.now();
    console.log(
      `[SharedWorker] Connected in ${(tConnected - tApiLoaded).toFixed(0)}ms, logging in…`,
    );
    await client.login({
      username: msg.username,
      token: msg.password,
      type: "password",
    });

    const tLoggedIn = performance.now();
    console.log(
      `[SharedWorker] Logged in in ${(tLoggedIn - tConnected).toFixed(0)}ms (total init: ${(tLoggedIn - t0).toFixed(0)}ms)`,
    );
    status = "ready";
    broadcast({ type: "status", status: "ready" });

    // Forward query config events to all tabs
    for (const eventName of [
      dhApi.Client.EVENT_CONFIG_ADDED,
      dhApi.Client.EVENT_CONFIG_REMOVED,
      dhApi.Client.EVENT_CONFIG_UPDATED,
    ] as string[]) {
      client.addEventListener(eventName, (event: CustomEvent) => {
        broadcast({
          type: "event",
          event: eventName,
          data: serializeQuery(event.detail),
        });
      });
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error("[SharedWorker] Init failed:", errorMsg);
    status = "error";
    statusError = errorMsg;
    broadcast({ type: "status", status: "error", error: errorMsg });
  }
}

// ── RPC handlers ────────────────────────────────────────────────────────────

const QUERY_TIMEOUT = 10_000;

async function handleRpc(req: RpcRequest, port: MessagePort) {
  try {
    let result: unknown;

    switch (req.method) {
      case "getQuery": {
        const [queryName] = req.args as [string];
        result = await findQuery(queryName);
        break;
      }
      case "getServerConfigValues": {
        const configValues = await client.getServerConfigValues();
        const serializable: SerializableServerConfigValues = {
          workerKinds: configValues.workerKinds.map(
            (wk: { name: string; protocols: string[] }) => ({
              name: wk.name,
              protocols: [...wk.protocols],
            }),
          ),
        };
        result = serializable;
        break;
      }
      case "createAuthToken": {
        const [service] = req.args as [string];
        result = await client.createAuthToken(service);
        break;
      }
      case "getKnownConfigs": {
        const configs = client.getKnownConfigs();
        result = configs.map(serializeQuery);
        break;
      }
      default:
        throw new Error(`Unknown RPC method: ${req.method}`);
    }

    port.postMessage({
      type: "rpc-result",
      id: req.id,
      result,
    } as WorkerToTabMessage);
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    port.postMessage({
      type: "rpc-error",
      id: req.id,
      error: errorMsg,
    } as WorkerToTabMessage);
  }
}

async function findQuery(queryName: string): Promise<SerializableQueryInfo> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Query not found: ${queryName}`));
      removeListener();
    }, QUERY_TIMEOUT);

    function check(queries: DhClient[]) {
      const match = queries.find((q: DhClient) => q.name === queryName);
      if (match) {
        resolve(serializeQuery(match));
        clearTimeout(timeout);
        removeListener();
      }
    }

    function listener(event: CustomEvent) {
      check([event.detail]);
    }

    const removeListener = client.addEventListener(
      dhApi.Client.EVENT_CONFIG_ADDED,
      listener,
    );
    check(client.getKnownConfigs());
  });
}

// ── Port management ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(self as any).onconnect = (e: MessageEvent) => {
  const port: MessagePort = e.ports[0];
  ports.add(port);

  port.onmessage = (event: MessageEvent<TabToWorkerMessage>) => {
    const msg = event.data;
    if (msg.type === "init") {
      init(msg);
    } else if (msg.type === "rpc") {
      handleRpc(msg, port);
    }
  };

  // If already initialised, immediately tell the new tab the current status
  sendStatus(port);

  port.start();
};
