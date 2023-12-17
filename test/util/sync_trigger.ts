import { SyncTrigger, SyncTriggerTarget } from "../../src/trigger";

class TestSyncTrigger implements SyncTrigger {
  private target!: SyncTriggerTarget;

  start(target: SyncTriggerTarget): void {
    this.target = target;
  }

  trigger(): void {
    this.target.trigger();
  }

  dispose(): void {
    return;
  }
}

export { TestSyncTrigger };
