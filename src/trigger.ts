import { Duration } from "./util/duration";

interface Trigger {
  start(): void;
  stop(): void;
}

// a trigger that never triggers
// ---
class NoTrigger implements Trigger {
  start() {}
  stop() {}
}

// a trigger that triggers when it is triggered
// ---
class TriggerableTrigger implements Trigger {
  private _trigger: () => void;
  private _started = false;

  constructor(trigger: () => void) {
    this._trigger = trigger;
  }

  start() {
    this._started = true;
  }

  stop() {
    this._started = false;
  }

  trigger() {
    if (!this._started) return;
    this._trigger();
  }
}

// a trigger that triggers every interval
// ---
class IntervalTrigger implements Trigger {
  private _trigger: () => void;
  private _interval: Duration;
  private _timeout?: ReturnType<typeof setTimeout>;

  constructor(trigger: () => void, opts: { interval: Duration }) {
    this._trigger = trigger;
    this._interval = opts.interval;
  }

  start() {
    this._next();
  }

  stop() {
    if (!this._timeout) return;
    clearTimeout(this._timeout);
  }

  private _next() {
    this._timeout = setTimeout(() => {
      this._trigger();
      this._next();
    }, this._interval);
  }
}

// a trigger that triggers when the document visibility changes
// ---
class VisibilityChangeTrigger implements Trigger {
  private _trigger: () => void;
  private _listener: () => void;

  constructor(trigger: () => void, opts: { visibilityStates: DocumentVisibilityState[] }) {
    this._trigger = trigger;
    this._listener = this._onVisibilityChange.bind(this, opts.visibilityStates);
  }

  start() {
    window.addEventListener("visibilitychange", this._listener);
  }

  stop() {
    window.removeEventListener("visibilitychange", this._listener);
  }

  private _onVisibilityChange(states: DocumentVisibilityState[]) {
    if (!states.includes(document.visibilityState)) return;
    this._trigger();
  }
}

// a trigger that triggers when any of the triggers it aggregates triggers
// ---
class AggregateTrigger implements Trigger {
  private _trigger: () => void;
  private _triggers: Trigger[];

  constructor(trigger: () => void, opts: { triggers: ((trigger: () => void) => Trigger)[] }) {
    this._trigger = trigger;
    this._triggers = opts.triggers.map((trigger) => trigger(this._trigger));
  }

  start() {
    this._triggers.forEach((trigger) => trigger.start());
  }

  stop() {
    this._triggers.forEach((trigger) => trigger.stop());
  }
}

export {
  AggregateTrigger,
  IntervalTrigger,
  NoTrigger,
  TriggerableTrigger,
  VisibilityChangeTrigger,
  type Trigger,
};
