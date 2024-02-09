import { Mutex } from "async-mutex";
import mitt, { Emitter } from "mitt";
import { Mutation, MutationTx, PendingMutation } from "./mutation";
import { InMemoryStore, ReadTx, StoreInterface } from "./store";
import {
  SyncServer,
  makeSyncServer,
  pullSyncServerFromFn,
  pullSyncServerFromUrl,
  pushSyncServerFromFn,
  pushSyncServerFromUrl,
} from "./sync_server";
import {
  AggregateTrigger,
  IntervalTrigger,
  NoTrigger,
  Trigger,
  TriggerableTrigger,
  VisibilityChangeTrigger,
} from "./trigger";
import { milliseconds, seconds } from "./util/duration";
import { JSONValue } from "./util/json";
import { Logger } from "./util/logger";
import { Resolvable, resolvable } from "./util/resolvable";

type OptimistikState = "initializing" | "ready" | "closed";

type OptimistikCommonOptions = {
  name: string;
  schemaVersion?: string;
  pullInterval?: number | null;
  pushInterval?: number | null;
};
type OptimistikPullOptions =
  | { pullURL?: string; pullFn?: never }
  | { pullURL?: never; pullFn?: SyncServer["pull"] };
type OptimistikPushOptions =
  | { pushURL?: string; pushFn?: never }
  | { pushURL?: never; pushFn?: SyncServer["push"] };
type OptimistikOptions = OptimistikCommonOptions & OptimistikPullOptions & OptimistikPushOptions;

class Optimistik {
  private _logger = new Logger({ enabled: true, level: "debug" });

  // instance-related properties
  private _name: string;
  private _schemaVersion: string;
  private _libraryVersion: string = "1";
  private _state: OptimistikState = "initializing";
  private _closed = false;
  private _clientID = crypto.randomUUID();
  private _clientGroupID!: string;

  // store-related properties
  private _store!: StoreInterface;
  private _storeEvents: Emitter<{ keysChanged: Set<string> }>;

  // sync server -related properties
  private _syncServer: SyncServer;
  private _syncServerPullTrigger: Trigger;
  private _syncServerPushTrigger: Trigger;
  private _syncServerPushTriggerer?: TriggerableTrigger;

  // sync state -related properties
  private _syncStateCookie: JSONValue;
  private _syncStateLastLocalMutationID = 0;
  private _syncStateLastRemoteMutationID = 0;

  // pending mutations
  private _pendingMutations: PendingMutation[] = [];
  private _pendingMutationTransactions: Map<number, MutationTx> = new Map();
  private _pendingMutationResolvables: Map<
    number,
    { sent: Resolvable<void>; committed: Resolvable<void> }
  > = new Map();

  constructor(opts: OptimistikOptions) {
    this._name = opts.name;
    this._schemaVersion = opts.schemaVersion ?? "";
    // init the store
    this._storeEvents = mitt();
    // init the sync server
    this._syncServer = makeSyncServer(
      opts?.pullFn
        ? pullSyncServerFromFn(opts.pullFn)
        : pullSyncServerFromUrl(opts?.pullURL ?? "/pull"),
      opts?.pushFn
        ? pushSyncServerFromFn(opts.pushFn)
        : pushSyncServerFromUrl(opts?.pushURL ?? "/push"),
    );
    this._syncServerPullTrigger = new NoTrigger();
    if (opts?.pullInterval !== null) {
      const interval = opts?.pullInterval ? milliseconds(opts.pullInterval) : seconds(60);
      const visibilityStates: DocumentVisibilityState[] = ["visible"];
      this._syncServerPullTrigger = new AggregateTrigger(() => this._pull(), {
        triggers: [
          (trigger) => new IntervalTrigger(trigger, { interval }),
          (trigger) => new VisibilityChangeTrigger(trigger, { visibilityStates }),
        ],
      });
    }
    this._syncServerPushTrigger = new NoTrigger();
    if (opts?.pushInterval !== null) {
      const interval = opts?.pushInterval ? milliseconds(opts.pushInterval) : seconds(10);
      const visibilityStates: DocumentVisibilityState[] = ["visible"];
      this._syncServerPushTrigger = new AggregateTrigger(() => this._push(), {
        triggers: [
          (trigger) => new IntervalTrigger(trigger, { interval }),
          (trigger) => new VisibilityChangeTrigger(trigger, { visibilityStates }),
          (trigger) => {
            this._syncServerPushTriggerer = new TriggerableTrigger(trigger);
            return this._syncServerPushTriggerer;
          },
        ],
      });
    }
    // trigger the init
    void this._init();
  }

  private async _init(): Promise<void> {
    // compute the client group ID
    this._clientGroupID = await this._generateClientGroupID();
    this._logger.debug({ clientGroupID: this._clientGroupID }, "client group ID generated");
    // init the store from a checkpoint if available
    this._store = new InMemoryStore({
      clientGroupID: this._clientGroupID,
      onKeysChanged: (keys) => this._storeEvents.emit("keysChanged", keys),
    });
    const storeInitResult = await this._store.init();
    if (storeInitResult) {
      this._syncStateCookie = storeInitResult.cookie;
    }
    // start the triggers
    this._syncServerPullTrigger.start();
    this._syncServerPushTrigger.start();
    // short-circuit if the instance was closed during init
    if (this._closed) {
      // update the state
      this._state = "closed";
      // stop the triggers
      this._syncServerPullTrigger.stop();
      this._syncServerPushTrigger.stop();
    }
    // otherwise, mark the instance as ready
    if (!this._closed) this._state = "ready";
  }

  // public methods
  // ---

  get state(): OptimistikState {
    return this._state;
  }

  async close(): Promise<void> {
    this._closed = true;
    if (!this._isOperational) {
      // NOTE: this will be handled after init has finished
      return;
    }
    this._logger.debug("close was called");
    // update the state
    this._state = "closed";
    // stop the triggers
    this._syncServerPullTrigger.stop();
    this._syncServerPushTrigger.stop();
  }

  async pull(): Promise<void> {
    this._assertOperational();
    this._logger.debug("pull was requested");
    await this._pull();
  }

  async push(): Promise<void> {
    this._assertOperational();
    this._logger.debug("push was requested");
    await this._push();
  }

  async query<T>(fn: (tx: ReadTx) => Promise<T>): Promise<T> {
    this._assertOperational();
    this._logger.debug("query was called");
    return this._store.read(fn);
  }

  subscribe<T>(fn: (tx: ReadTx) => Promise<T>): {
    stream: AsyncIterable<T>;
    unsubscribe: () => void;
  } {
    this._assertOperational();
    this._logger.debug("subscribe was called");
    const _store = this._store;
    const _storeEvents = this._storeEvents;
    // track the subscription status
    let unsubscribed = false;
    // create the stream
    const stream = (async function* () {
      while (true) {
        if (unsubscribed) break;
        const touchedKeys = new Set<string>();
        const touchedPatterns = new Set<string>();
        yield await _store.read((tx) =>
          fn({
            ...tx,
            get: async (key) => {
              touchedKeys.add(key);
              return tx.get(key);
            },
            has: async (key) => {
              touchedKeys.add(key);
              return tx.has(key);
            },
            keys: async () => {
              const keys = await tx.keys();
              keys.forEach((key) => touchedKeys.add(key));
              return keys;
            },
            scan: async (pattern) => {
              touchedPatterns.add(pattern);
              return tx.scan(pattern);
            },
          }),
        );
        if (unsubscribed) break;
        await new Promise<void>((resolve) => {
          function onKeysChanged(keys: Set<string>) {
            for (const key of keys) {
              const isExactMatch = touchedKeys.has(key);
              let isPatternMatch = false;
              for (const pattern of touchedPatterns) {
                if (new RegExp(pattern).test(key)) {
                  isPatternMatch = true;
                  break;
                }
              }
              if (isExactMatch || isPatternMatch) {
                _storeEvents.off("keysChanged", onKeysChanged);
                resolve();
              }
            }
          }
          _storeEvents.on("keysChanged", onKeysChanged);
        });
      }
    })();
    return { stream, unsubscribe: () => (unsubscribed = true) };
  }

  send(mutation: Mutation<undefined>): Promise<{ sent: Promise<void>; committed: Promise<void> }>;
  send<Args extends JSONValue>(
    mutation: Mutation<Args>,
    args: Args,
  ): Promise<{ sent: Promise<void>; committed: Promise<void> }>;
  async send<Args extends JSONValue>(
    mutation: Mutation<undefined> | Mutation<Args>,
    args?: Args,
  ): Promise<{ sent: Promise<void>; committed: Promise<void> }> {
    this._assertOperational();
    this._logger.debug({ name: mutation.name, args: args ?? {} }, "send was called");
    const tx = (mutation as Mutation<any>)(args);
    // get the next mutation ID
    this._syncStateLastLocalMutationID += 1;
    const id = this._syncStateLastLocalMutationID;
    // queue the mutation
    this._pendingMutations.push({ clientID: this._clientID, id, name: mutation.name, args });
    this._pendingMutationTransactions.set(id, tx);
    const _sentResolvable = resolvable<void>();
    const _committedResolvable = resolvable<void>();
    this._pendingMutationResolvables.set(id, {
      sent: _sentResolvable,
      committed: _committedResolvable,
    });
    // apply the mutation locally
    await this._store.write(tx);
    // trigger a push
    this._syncServerPushTriggerer?.trigger();
    return { sent: _sentResolvable.promise, committed: _committedResolvable.promise };
  }

  // private methods
  // ---

  private get _isOperational() {
    const operationalStates: OptimistikState[] = ["ready"];
    return operationalStates.includes(this._state);
  }

  private _assertOperational() {
    if (this._isOperational) return;
    this._logger.error("an operation was requested but the instance is not operational");
    throw new Error("instance is not in an operational state");
  }

  // generate the client group ID
  // TODO: this should probably take at least the "set of known mutations" into account even though the schema version is roughly the same but it might be forgotten to be updated
  private async _generateClientGroupID(): Promise<string> {
    // construct the base string
    const clientGroupIDString = [this._libraryVersion, this._name, this._schemaVersion].join(":");
    // convert the base string to an array buffer
    const clientGroupIDBuffer = new ArrayBuffer(clientGroupIDString.length);
    const clientGroupIDBufferView = new Uint8Array(clientGroupIDBuffer);
    for (let i = 0; i < clientGroupIDString.length; i += 1) {
      clientGroupIDBufferView[i] = clientGroupIDString.charCodeAt(i);
    }
    // compute the hash from the array buffer
    const hashBytes = await crypto.subtle.digest("SHA-1", clientGroupIDBuffer);
    const hashString = [...new Uint8Array(hashBytes)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hashString;
  }

  // pull an update from the sync server
  private _pullMutex = new Mutex();
  private async _pull(): Promise<void> {
    if (this._pullMutex.isLocked()) return;
    await this._pullMutex.runExclusive(async () => {
      // call the sync server's pull endpoint
      const resp = await this._syncServer.pull({
        pullVersion: 1,
        cookie: this._syncStateCookie ?? null,
        clientGroupID: this._clientGroupID,
      });
      // store the cookie for the next pull
      this._syncStateCookie = resp.cookie;
      // update the tracked mutation IDs
      const lastRemoteMutationID = resp.lastMutationIDChanges[this._clientID];
      if (lastRemoteMutationID) {
        this._syncStateLastRemoteMutationID = lastRemoteMutationID;
      }
      this._syncStateLastLocalMutationID = Math.max(
        this._syncStateLastLocalMutationID,
        this._syncStateLastRemoteMutationID,
      );
      // drop the pending mutations that have been applied on the server
      this._pendingMutations = this._pendingMutations.filter(
        (mutation) => mutation.id > this._syncStateLastRemoteMutationID,
      );
      for (const id of this._pendingMutationTransactions.keys()) {
        if (id <= this._syncStateLastRemoteMutationID) {
          this._pendingMutationTransactions.delete(id);
        }
      }
      // rebase the local store
      await this._store.rebase(
        this._syncStateCookie,
        // this applies the patch from the server on top of the committed state
        async (tx) => {
          for (const i of resp.patch) {
            if (i.op === "clear") {
              for (const key of await tx.keys()) {
                await tx.del(key);
              }
            }
            if (i.op === "set") {
              await tx.set(i.args.key, i.args.value);
            }
            if (i.op === "del") {
              await tx.del(i.args.key);
            }
          }
        },
        // this re-applies the local pending mutations on top of the rebased state
        async (tx) => {
          for (const mutation of this._pendingMutations) {
            await this._pendingMutationTransactions.get(mutation.id)!(tx);
          }
        },
      );
      // resolve the committed resolvables
      for (const id of this._pendingMutationResolvables.keys()) {
        if (id > this._syncStateLastRemoteMutationID) continue;
        this._pendingMutationResolvables.get(id)?.committed.resolve();
        // FIXME: is it safe to delete the resolvable here?
        this._pendingMutationResolvables.delete(id);
      }
    });
  }

  // push a batch of pending mutations to the sync server
  private _pushMutex = new Mutex();
  private async _push(): Promise<void> {
    if (this._pushMutex.isLocked()) return;
    await this._pushMutex.runExclusive(async () => {
      if (this._pendingMutations.length === 0) return;
      const batch: PendingMutation[] = this._pendingMutations.slice(0, 8);
      await this._syncServer.push({
        pushVersion: 1,
        clientGroupID: this._clientGroupID,
        mutations: batch,
      });
      this._pendingMutations = this._pendingMutations.slice(batch.length);
      batch.forEach((mutation) => {
        const resolvables = this._pendingMutationResolvables.get(mutation.id);
        if (!resolvables) return;
        resolvables.sent.resolve();
      });
    });
  }
}

export { Optimistik };
