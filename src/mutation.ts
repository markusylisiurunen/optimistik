import { WriteTx } from "./store";
import { JSONValue } from "./util/json";

type PendingMutation = {
  clientID: string;
  id: number;
  name: string;
  args: JSONValue;
};

interface Mutation<Args extends JSONValue> {
  (args: Args): MutationTx;
}

interface MutationTx {
  (tx: WriteTx): Promise<void>;
}

function createMutation<Args extends JSONValue>(
  name: string,
  fn: (tx: WriteTx, args: Args) => Promise<void>,
): Mutation<Args> {
  function mutation(args: Args): MutationTx {
    return async (tx: WriteTx) => fn(tx, args);
  }
  Object.defineProperty(mutation, "name", { value: name });
  return mutation;
}

export { createMutation, type Mutation, type MutationTx, type PendingMutation };
