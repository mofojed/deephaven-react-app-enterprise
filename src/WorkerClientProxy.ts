/**
 * Main-thread singleton proxy for the SharedWorker.
 *
 * Provides an async interface that mirrors the subset of EnterpriseClient
 * methods needed by App.tsx and IFrameApp.tsx. All calls are forwarded to
 * the SharedWorker over a MessagePort using the RPC protocol.
 */

import type {
  InitMessage,
  RpcMethod,
  RpcRequest,
  SerializableQueryInfo,
  SerializableServerConfigValues,
  WorkerToTabMessage,
} from "./worker-protocol";
import { getWebsocketUrl } from "./Utils";

const API_URL = import.meta.env.VITE_DEEPHAVEN_API_URL ?? "";
const USER = import.meta.env.VITE_DEEPHAVEN_USER ?? "";
const PASSWORD = import.meta.env.VITE_DEEPHAVEN_PASSWORD ?? "";

export class WorkerClientProxy {
  private port: MessagePort;
  private pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (e: Error) => void;
  private eventListeners = new Map<
    string,
    Set<(data: SerializableQueryInfo) => void>
  >();
  private idCounter = 0;

  constructor() {
    const worker = new SharedWorker(
      new URL("./shared-worker.ts", import.meta.url),
      { name: "deephaven-enterprise" },
    );
    this.port = worker.port;

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });

    this.port.onmessage = (event: MessageEvent<WorkerToTabMessage>) => {
      this.handleMessage(event.data);
    };

    this.port.start();

    // Send init with connection details
    const baseUrl = new URL(API_URL ?? "", `${window.location}`);
    const websocketUrl = getWebsocketUrl(baseUrl);

    const initMsg: InitMessage = {
      type: "init",
      apiUrl: API_URL,
      websocketUrl: websocketUrl.href,
      username: USER,
      password: PASSWORD,
    };
    this.port.postMessage(initMsg);
  }

  private handleMessage(msg: WorkerToTabMessage) {
    switch (msg.type) {
      case "status":
        if (msg.status === "ready") {
          this.resolveReady();
        } else if (msg.status === "error") {
          this.rejectReady(new Error(msg.error ?? "SharedWorker init failed"));
        }
        break;

      case "rpc-result": {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          p.resolve(msg.result);
        }
        break;
      }

      case "rpc-error": {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          p.reject(new Error(msg.error));
        }
        break;
      }

      case "event": {
        const listeners = this.eventListeners.get(msg.event);
        if (listeners) {
          for (const cb of listeners) {
            cb(msg.data);
          }
        }
        break;
      }
    }
  }

  private rpc(method: RpcMethod, ...args: unknown[]): Promise<unknown> {
    const id = String(++this.idCounter);
    const req: RpcRequest = { type: "rpc", id, method, args };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.port.postMessage(req);
    });
  }

  waitForReady(): Promise<void> {
    return this.readyPromise;
  }

  async getQuery(name: string): Promise<SerializableQueryInfo> {
    return this.rpc("getQuery", name) as Promise<SerializableQueryInfo>;
  }

  async getServerConfigValues(): Promise<SerializableServerConfigValues> {
    return this.rpc(
      "getServerConfigValues",
    ) as Promise<SerializableServerConfigValues>;
  }

  async createAuthToken(service: string): Promise<string> {
    return this.rpc("createAuthToken", service) as Promise<string>;
  }

  async getKnownConfigs(): Promise<SerializableQueryInfo[]> {
    return this.rpc("getKnownConfigs") as Promise<SerializableQueryInfo[]>;
  }

  addEventListener(
    event: string,
    cb: (data: SerializableQueryInfo) => void,
  ): () => void {
    let set = this.eventListeners.get(event);
    if (!set) {
      set = new Set();
      this.eventListeners.set(event, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
    };
  }
}

// Singleton instance – lazily created on first import
let instance: WorkerClientProxy | null = null;

export function getWorkerClientProxy(): WorkerClientProxy {
  if (!instance) {
    instance = new WorkerClientProxy();
  }
  return instance;
}
