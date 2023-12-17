import { JSONValue } from "./util/json";

type PatchOperation =
  | { op: "clear" }
  | { op: "del"; args: { key: string } }
  | { op: "set"; args: { key: string; value: JSONValue } };

type PullRequest = {
  pullVersion: number;
  clientGroupID: string;
  cookie: JSONValue;
};
type PullResponse = {
  cookie: JSONValue;
  lastMutationIDChanges: Record<string, number>;
  patch: Array<PatchOperation>;
};

type PushRequest = {
  pushVersion: number;
  clientGroupID: string;
  mutations: Array<{
    clientID: string;
    id: number;
    name: string;
    args: JSONValue;
  }>;
};

interface PullSyncServer {
  pull(req: PullRequest): Promise<PullResponse>;
}

interface PushSyncServer {
  push(req: PushRequest): Promise<void>;
}

interface SyncServer extends PullSyncServer, PushSyncServer {}

function makeSyncServer(pull: PullSyncServer, push: PushSyncServer): SyncServer {
  return { ...pull, ...push };
}

function pullSyncServerFromFn(fn: PullSyncServer["pull"]): PullSyncServer {
  return { pull: fn };
}

function pullSyncServerFromUrl(url: string): PullSyncServer {
  return {
    pull: async (req: PullRequest): Promise<PullResponse> => {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!resp.ok) {
        throw new Error(`failed to pull from ${url}: ${resp.status}`);
      }
      return (await resp.json()) as PullResponse;
    },
  };
}

function pushSyncServerFromFn(fn: PushSyncServer["push"]): PushSyncServer {
  return { push: fn };
}

function pushSyncServerFromUrl(url: string): PushSyncServer {
  return {
    push: async (req: PushRequest): Promise<void> => {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!resp.ok) {
        throw new Error(`failed to push to ${url}: ${resp.status}`);
      }
    },
  };
}

export {
  makeSyncServer,
  pullSyncServerFromFn,
  pullSyncServerFromUrl,
  pushSyncServerFromFn,
  pushSyncServerFromUrl,
  type PatchOperation,
  type PullRequest,
  type PullResponse,
  type PullSyncServer,
  type PushRequest,
  type PushSyncServer,
  type SyncServer,
};
