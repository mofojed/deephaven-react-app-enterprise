/**
 * Types for the SharedWorker ↔ main-thread RPC protocol.
 *
 * The worker holds a single EnterpriseClient (WebSocket + login).
 * Tabs send RPC requests and receive responses or events over MessagePort.
 */

// ── Serializable subset of QueryInfo (no methods / class instances) ─────────

export interface SerializableQueryInfo {
  name: string;
  serial: string;
  status: string;
  workerKind: string;
  grpcUrl: string;
  jsApiUrl: string;
  ideUrl: string;
  envoyPrefix: string | null;
}

export interface SerializableServerConfigValues {
  workerKinds: { name: string; protocols: string[] }[];
}

// ── Messages: tab → worker ──────────────────────────────────────────────────

export interface InitMessage {
  type: "init";
  apiUrl: string;
  websocketUrl: string;
  username: string;
  password: string;
}

export interface RpcRequest {
  type: "rpc";
  id: string;
  method: RpcMethod;
  args: unknown[];
}

export type RpcMethod =
  | "getQuery"
  | "getServerConfigValues"
  | "createAuthToken"
  | "getKnownConfigs";

export type TabToWorkerMessage = InitMessage | RpcRequest;

// ── Messages: worker → tab ─────────────────────────────────────────────────

export interface StatusMessage {
  type: "status";
  status: "connecting" | "ready" | "error";
  error?: string;
}

export interface RpcResponse {
  type: "rpc-result";
  id: string;
  result: unknown;
}

export interface RpcError {
  type: "rpc-error";
  id: string;
  error: string;
}

export interface WorkerEvent {
  type: "event";
  event: string;
  data: SerializableQueryInfo;
}

export type WorkerToTabMessage =
  | StatusMessage
  | RpcResponse
  | RpcError
  | WorkerEvent;
