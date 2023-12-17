import { Mutex } from "async-mutex";
import { enableMapSet, produce } from "immer";
import { PersistentStore, PersistentStoreInterface } from "./persistent_store";
import { JSONValue } from "./util/json";

enableMapSet();

// transactions
// ---

interface ReadTx {
  get<T>(key: string): Promise<T | undefined>;
  has(key: string): Promise<boolean>;
  keys(): Promise<Array<string>>;
  scan<T>(pattern: string): Promise<Array<T>>;
}

interface WriteTx extends ReadTx {
  del(key: string): Promise<boolean>;
  set(key: string, value: JSONValue): Promise<void>;
}

// store definition
// ---

type StoreArgs = {
  clientGroupID: string;
  onKeysChanged?: (keys: Set<string>) => void | Promise<void>;
};

interface StoreConstructor {
  new (args: StoreArgs): StoreInterface;
}

interface StoreInterface {
  init(): Promise<{ cookie: JSONValue } | null>;
  clear(): Promise<void>;
  read<T>(fn: (tx: ReadTx) => Promise<T>): Promise<T>;
  rebase(
    cookie: JSONValue,
    patch: (tx: WriteTx) => Promise<void>,
    fn: (tx: WriteTx) => Promise<void>,
  ): Promise<void>;
  write(fn: (tx: WriteTx) => Promise<void>): Promise<void>;
}

function createStore(ctor: StoreConstructor, args: StoreArgs): StoreInterface {
  return new ctor(args);
}

// in-memory store implementation
// ---

class InMemoryStore implements StoreInterface {
  // mutex for managing access
  private _writeMutex = new Mutex();

  // persistent store
  private _persistentStore: PersistentStoreInterface;
  private _persistentStoreClientGroupID: string;

  // hold two versions of the data: committed (from pull endpoint) and staged (local mutations)
  private _committedData = new Map<string, JSONValue>();
  private _stagedData = new Map<string, JSONValue>();
  private _stagedDataTouchedKeys = new Set<string>();

  private _onKeysChanged?: (keys: Set<string>) => void | Promise<void>;

  constructor(args: StoreArgs) {
    this._persistentStore = new PersistentStore();
    this._persistentStoreClientGroupID = args.clientGroupID;
    this._onKeysChanged = args.onKeysChanged;
  }

  // public methods
  // ---

  async init(): Promise<{ cookie: JSONValue } | null> {
    const fork = await this._persistentStore.fork(this._persistentStoreClientGroupID);
    if (!fork) return null;
    await this._writeMutex.runExclusive(async () => {
      this._committedData = new Map(fork.data);
      this._stagedData = new Map(fork.data);
      this._stagedDataTouchedKeys = new Set();
    });
    setTimeout(() => this._onKeysChanged?.(new Set(fork.data.keys())), 0);
    return { cookie: fork.cookie };
  }

  async clear(): Promise<void> {
    const touchedKeys = new Set<string>([
      ...this._committedData.keys(),
      ...this._stagedData.keys(),
    ]);
    await this._writeMutex.runExclusive(async () => {
      this._committedData = new Map();
      this._stagedData = new Map();
      this._stagedDataTouchedKeys = new Set();
    });
    await this._onKeysChanged?.(touchedKeys);
  }

  async read<T>(fn: (tx: ReadTx) => Promise<T>): Promise<T> {
    const tx = this._readTxStaged();
    return fn(tx);
  }

  async rebase(
    cookie: JSONValue,
    patch: (tx: WriteTx) => Promise<void>,
    fn: (tx: WriteTx) => Promise<void>,
  ): Promise<void> {
    const touchedKeys = new Set<string>();
    await this._writeMutex.runExclusive(async () => {
      // apply the patch to the committed data
      const tx0 = this._writeTxCommitted();
      await patch({
        ...tx0,
        del: async (key) => {
          touchedKeys.add(key);
          return tx0.del(key);
        },
        set: async (key, value) => {
          touchedKeys.add(key);
          return tx0.set(key, value);
        },
      });
      // "re-run" the mutations on top of the committed data
      for (const key of this._stagedDataTouchedKeys) {
        touchedKeys.add(key);
      }
      this._stagedData = new Map(this._committedData);
      this._stagedDataTouchedKeys = new Set();
      const tx1 = this._writeTxStaged();
      await fn({
        ...tx1,
        del: async (key) => {
          touchedKeys.add(key);
          this._stagedDataTouchedKeys.add(key);
          return tx1.del(key);
        },
        set: async (key, value) => {
          touchedKeys.add(key);
          this._stagedDataTouchedKeys.add(key);
          return tx1.set(key, value);
        },
      });
    });
    await this._onKeysChanged?.(touchedKeys);
    await this._persistentStore.checkpoint(
      this._persistentStoreClientGroupID,
      cookie,
      this._committedData,
    );
  }

  async write(fn: (tx: WriteTx) => Promise<void>): Promise<void> {
    const touchedKeys = new Set<string>();
    await this._writeMutex.runExclusive(async () => {
      const tx = this._writeTxStaged();
      await fn({
        ...tx,
        del: async (key) => {
          touchedKeys.add(key);
          this._stagedDataTouchedKeys.add(key);
          return tx.del(key);
        },
        set: async (key, value) => {
          touchedKeys.add(key);
          this._stagedDataTouchedKeys.add(key);
          await tx.set(key, value);
        },
      });
    });
    await this._onKeysChanged?.(touchedKeys);
  }

  // private methods
  // ---

  private _readTxCommitted(): ReadTx {
    return {
      get: async <T>(key: string): Promise<T | undefined> => {
        const value = this._committedData.get(key);
        return value !== undefined ? (value as T) : undefined;
      },
      has: async (key: string): Promise<boolean> => {
        return this._committedData.has(key);
      },
      keys: async (): Promise<Array<string>> => {
        const keys: string[] = [];
        for (const key of this._committedData.keys()) {
          keys.push(key);
        }
        return keys;
      },
      scan: async <T>(pattern: string): Promise<Array<T>> => {
        const regExp = new RegExp(pattern);
        const values: T[] = [];
        for (const key of this._committedData.keys()) {
          if (regExp.test(key)) {
            const value = this._committedData.get(key);
            if (value === undefined) continue;
            values.push(value as T);
          }
        }
        return values;
      },
    };
  }

  private _readTxStaged(): ReadTx {
    return {
      get: async <T>(key: string): Promise<T | undefined> => {
        const value = this._stagedData.get(key);
        return value !== undefined ? (value as T) : undefined;
      },
      has: async (key: string): Promise<boolean> => {
        return this._stagedData.has(key);
      },
      keys: async (): Promise<Array<string>> => {
        const keys: string[] = [];
        for (const key of this._stagedData.keys()) {
          keys.push(key);
        }
        return keys;
      },
      scan: async <T>(pattern: string): Promise<Array<T>> => {
        const regExp = new RegExp(pattern);
        const values: T[] = [];
        for (const key of this._stagedData.keys()) {
          if (regExp.test(key)) {
            const value = this._stagedData.get(key);
            if (value === undefined) continue;
            values.push(value as T);
          }
        }
        return values;
      },
    };
  }

  private _writeTxCommitted(): WriteTx {
    return {
      ...this._readTxCommitted(),
      del: async (key: string): Promise<boolean> => {
        let deleted: boolean;
        this._committedData = produce(this._committedData as Map<string, any>, (draft) => {
          deleted = draft.delete(key);
        });
        return deleted!;
      },
      set: async (key: string, value: JSONValue): Promise<void> => {
        this._committedData = produce(this._committedData as Map<string, any>, (draft) => {
          draft.set(key, value as any);
        });
      },
    };
  }

  private _writeTxStaged(): WriteTx {
    return {
      ...this._readTxStaged(),
      del: async (key: string): Promise<boolean> => {
        let deleted: boolean;
        this._stagedData = produce(this._stagedData as Map<string, any>, (draft) => {
          deleted = draft.delete(key);
        });
        return deleted!;
      },
      set: async (key: string, value: JSONValue): Promise<void> => {
        this._stagedData = produce(this._stagedData as Map<string, any>, (draft) => {
          draft.set(key, value as any);
        });
      },
    };
  }
}

export { InMemoryStore, createStore, type ReadTx, type StoreInterface, type WriteTx };
