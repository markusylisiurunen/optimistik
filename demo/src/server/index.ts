import { Mutex } from "async-mutex";
import { PatchOperation } from "optimistik";
import { JSONValue } from "../util/json";

type PullRequest = {
  pullVersion: number;
  clientGroupID: string;
  cookie: JSONValue;
};
type PullResponse = {
  cookie: JSONValue;
  lastMutationIDChanges: Record<string, number>;
  patch: PatchOperation[];
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

interface Server {
  pull(req: PullRequest): Promise<PullResponse>;
  push(req: PushRequest): Promise<void>;
}

type Schema = {
  $version: number;
  $clients: Array<{
    clientID: string;
    clientGroupID: string;
    lastMutationID: number;
    lastModifiedVersion: number;
  }>;
  count: {
    $lastModifiedVersion: number;
    value: number;
  };
  slider: {
    $lastModifiedVersion: number;
    value: number;
  };
  colors: Array<{
    $lastModifiedVersion: number;
    $deleted: boolean;
    id: string;
    name: string;
    hex: string;
  }>;
  bubbles: Array<{
    $lastModifiedVersion: number;
    $deleted: boolean;
    id: string;
    colorID: string;
    size: "s" | "m" | "l";
    memo: string;
  }>;
};

function makeServer(): Server {
  const key = "__data";
  const mutex = new Mutex();
  function _getInitialData() {
    const limeId = crypto.randomUUID();
    const yellowId = crypto.randomUUID();
    const pinkId = crypto.randomUUID();
    return {
      colors: [
        { id: limeId, name: "Mojito Minuet", hex: "#44ff00" },
        { id: yellowId, name: "Buttercream Bliss", hex: "#ffffaa" },
        { id: pinkId, name: "Bubblegum Ballet", hex: "#fc3096" },
      ],
      bubbles: [
        {
          id: crypto.randomUUID(),
          colorID: pinkId,
          size: "m" as "s" | "m" | "l",
          memo: "Dancing on a cloud of cotton candy thoughts. 💭",
        },
        {
          id: crypto.randomUUID(),
          colorID: limeId,
          size: "l" as "s" | "m" | "l",
          memo: "Swaying to the rhythm of zesty dreams and minty moods. 🍃",
        },
      ],
    };
  }
  function _getSchema(): Schema {
    const stored = window.localStorage.getItem(key);
    if (stored) return JSON.parse(stored) as Schema;
    const data = _getInitialData();
    const initial = {
      $version: 1,
      $clients: [],
      count: { $lastModifiedVersion: 1, value: 0 },
      slider: { $lastModifiedVersion: 1, value: 0 },
      colors: data.colors.map((c) => ({ ...c, $deleted: false, $lastModifiedVersion: 1 })),
      bubbles: data.bubbles.map((b) => ({ ...b, $deleted: false, $lastModifiedVersion: 1 })),
    };
    _setSchema(initial);
    return initial;
  }
  function _setSchema(schema: Schema) {
    window.localStorage.setItem(key, JSON.stringify(schema));
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type FilterNotStartingWith<T, U extends string> = T extends `${U}${infer _X}` ? never : T;
  function _withoutInternal<T extends Record<string, unknown>>(
    value: T,
  ): Pick<T, FilterNotStartingWith<keyof T, "$">> {
    return Object.entries(value).reduce(
      (acc, [key, value]) => {
        if (key.startsWith("$")) return acc;
        return { ...acc, [key]: value };
      },
      {} as Pick<T, FilterNotStartingWith<keyof T, "$">>,
    );
  }
  return {
    async pull(req) {
      const clientGlobalVersion = typeof req.cookie === "number" ? req.cookie : 0;
      const data = _getSchema();
      const patch: PatchOperation[] = [];
      if (clientGlobalVersion === 0) {
        patch.push({ op: "clear" });
      }
      if (data.count.$lastModifiedVersion > clientGlobalVersion) {
        patch.push({ op: "set", args: { key: "count", value: data.count.value } });
      }
      if (data.slider.$lastModifiedVersion > clientGlobalVersion) {
        patch.push({ op: "set", args: { key: "slider", value: data.slider.value } });
      }
      for (const color of data.colors) {
        if (color.$lastModifiedVersion > clientGlobalVersion) {
          if (color.$deleted) {
            patch.push({ op: "del", args: { key: `colors:${color.id}` } });
          } else {
            patch.push({
              op: "set",
              args: {
                key: `colors:${color.id}`,
                value: _withoutInternal(color),
              },
            });
          }
        }
      }
      for (const bubble of data.bubbles) {
        if (bubble.$lastModifiedVersion > clientGlobalVersion) {
          if (bubble.$deleted) {
            patch.push({ op: "del", args: { key: `bubbles:${bubble.id}` } });
          } else {
            patch.push({
              op: "set",
              args: {
                key: `bubbles:${bubble.id}`,
                value: _withoutInternal(bubble),
              },
            });
          }
        }
      }
      const lastMutationIDChanges: Record<string, number> = data.$clients.reduce((acc, client) => {
        if (client.clientGroupID !== req.clientGroupID) return acc;
        if (client.lastModifiedVersion <= clientGlobalVersion) return acc;
        return { ...acc, [client.clientID]: client.lastMutationID };
      }, {});
      return {
        cookie: data.$version,
        lastMutationIDChanges: lastMutationIDChanges,
        patch: patch,
      };
    },
    async push(batch) {
      await mutex.runExclusive(async () => {
        const data = _getSchema();
        for (const mutation of batch.mutations) {
          // increment the global version
          data.$version += 1;
          // update the client
          const clientExists = data.$clients.some((client) => {
            const isSameClientGroupID = client.clientGroupID === batch.clientGroupID;
            const isSameClientID = client.clientID === mutation.clientID;
            return isSameClientGroupID && isSameClientID;
          });
          if (!clientExists) {
            data.$clients.push({
              clientID: mutation.clientID,
              clientGroupID: batch.clientGroupID,
              lastMutationID: mutation.id,
              lastModifiedVersion: data.$version,
            });
          } else {
            data.$clients = data.$clients.map((client) => {
              if (client.clientGroupID !== batch.clientGroupID) return client;
              if (client.clientID !== mutation.clientID) return client;
              return {
                ...client,
                lastMutationID: mutation.id,
                lastModifiedVersion: data.$version,
              };
            });
          }
          // execute the mutation
          switch (mutation.name) {
            case "IncrementCount": {
              data.count.$lastModifiedVersion = data.$version;
              data.count.value = data.count.value + 1;
              break;
            }
            case "DecrementCount": {
              data.count.$lastModifiedVersion = data.$version;
              data.count.value = Math.max(0, data.count.value - 1);
              break;
            }
            case "SetSlider": {
              const { value } = mutation.args as { value: number };
              data.slider.$lastModifiedVersion = data.$version;
              data.slider.value = Math.max(0, Math.min(100, value));
              break;
            }
            case "AddColor": {
              const id = crypto.randomUUID();
              const { hex, name } = mutation.args as { hex: string; name: string };
              data.colors.push({
                $lastModifiedVersion: data.$version,
                $deleted: false,
                id: id,
                hex: hex,
                name: name,
              });
              break;
            }
            case "UpdateColor": {
              const { id, hex, name } = mutation.args as {
                id: string;
                hex?: string;
                name?: string;
              };
              data.colors = data.colors.map((color) => {
                if (color.id !== id) return color;
                if (color.$deleted) return color;
                return {
                  ...color,
                  $lastModifiedVersion: data.$version,
                  hex: hex ?? color.hex,
                  name: name ?? color.name,
                };
              });
              break;
            }
            case "DeleteColor": {
              const { id } = mutation.args as { id: string };
              data.colors = data.colors.map((color) => {
                if (color.id !== id) return color;
                return { ...color, $lastModifiedVersion: data.$version, $deleted: true };
              });
              break;
            }
            case "AddBubble": {
              const id = crypto.randomUUID();
              const { colorID, size, memo } = mutation.args as {
                colorID: string;
                size: "s" | "m" | "l";
                memo: string;
              };
              data.bubbles.push({
                $lastModifiedVersion: data.$version,
                $deleted: false,
                id: id,
                colorID: colorID,
                size: size,
                memo: memo,
              });
              break;
            }
            case "UpdateBubble": {
              const { id, colorID, size, memo } = mutation.args as {
                id: string;
                colorID?: string;
                size?: "s" | "m" | "l";
                memo?: string;
              };
              data.bubbles = data.bubbles.map((bubble) => {
                if (bubble.id !== id) return bubble;
                if (bubble.$deleted) return bubble;
                return {
                  ...bubble,
                  $lastModifiedVersion: data.$version,
                  colorID: colorID ?? bubble.colorID,
                  size: size ?? bubble.size,
                  memo: memo ?? bubble.memo,
                };
              });
              break;
            }
            case "DeleteBubble": {
              const { id } = mutation.args as { id: string };
              data.bubbles = data.bubbles.map((bubble) => {
                if (bubble.id !== id) return bubble;
                return { ...bubble, $lastModifiedVersion: data.$version, $deleted: true };
              });
              break;
            }
          }
        }
        _setSchema(data);
      });
    },
  };
}

export { makeServer, type Server };
