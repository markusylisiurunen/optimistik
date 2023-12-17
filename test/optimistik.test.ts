import { describe, it } from "@jest/globals";
import { CommandTx } from "../src/mutation";
import { Optimistik } from "../src/optimistik";
import { SyncManager } from "../src/sync_manager";
import { TestSyncTrigger, sleep } from "./util";

function TestCmd(args: {}): CommandTx {
  return async (tx) => {};
}

describe("optimistik", () => {
  it("works as expected", async () => {
    const target = async () => [];
    const trigger = new TestSyncTrigger();
    const manager = new SyncManager(target, trigger);
    const optimistik = new Optimistik(manager);
    await optimistik.send(TestCmd, {});
    trigger.trigger();
    await sleep(0);
  });
});
