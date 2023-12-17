import mitt, { Emitter } from "mitt";
import { Duration } from "./util/duration";

interface Trigger {
  dispose(): void;
  start(): void;
  on(fn: () => void): () => void;
}

class NoTrigger implements Trigger {
  dispose() {
    return;
  }

  start() {
    return;
  }

  on() {
    return () => {};
  }
}

class IntervalTrigger implements Trigger {
  private _events: Emitter<{ trigger: unknown }>;
  private _interval: Duration;
  private _timeout?: ReturnType<typeof setTimeout>;

  constructor(interval: Duration) {
    this._events = mitt();
    this._interval = interval;
  }

  dispose() {
    this._events.all.clear();
    if (this._timeout) clearTimeout(this._timeout);
  }

  start() {
    this._next();
  }

  on(fn: () => void) {
    this._events.on("trigger", fn);
    return () => this._events.off("trigger", fn);
  }

  private _next(): void {
    this._timeout = setTimeout(() => {
      this._events.emit("trigger");
      this._next();
    }, this._interval);
  }
}

class VisibilityChangeTrigger implements Trigger {
  private _events: Emitter<{ trigger: unknown }>;
  private _started: boolean = false;

  constructor(visibilityStates: DocumentVisibilityState[]) {
    this._events = mitt();
    window.addEventListener("visibilitychange", () => {
      if (this._started && visibilityStates.includes(document.visibilityState)) {
        this._events.emit("trigger");
      }
    });
  }

  dispose() {
    this._events.all.clear();
    this._started = false;
  }

  start() {
    this._started = true;
  }

  on(fn: () => void) {
    this._events.on("trigger", fn);
    return () => this._events.off("trigger", fn);
  }
}

class AggregateTrigger implements Trigger {
  private _events: Emitter<{ trigger: unknown }>;
  private _triggers: Trigger[];

  constructor(triggers: Trigger[]) {
    this._events = mitt();
    this._triggers = triggers;
    for (const trigger of this._triggers) {
      trigger.on(() => this._events.emit("trigger"));
    }
  }

  dispose() {
    this._triggers.forEach((trigger) => trigger.dispose());
    this._events.all.clear();
  }

  start() {
    this._triggers.forEach((trigger) => trigger.start());
  }

  on(fn: () => void) {
    this._events.on("trigger", fn);
    return () => this._events.off("trigger", fn);
  }
}

export { AggregateTrigger, IntervalTrigger, NoTrigger, VisibilityChangeTrigger, type Trigger };
