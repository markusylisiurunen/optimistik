import { JSONValue } from "./json";

type LogLevel = "debug" | "info" | "error";

type LogMeta = { [key: string]: JSONValue };

interface LogSink {
  log(level: LogLevel, meta: LogMeta, msg: string): void;
  flush(): Promise<void>;
}

type LoggerOptions = {
  enabled?: boolean;
  level?: LogLevel;
  logFn?: (level: LogLevel, meta: LogMeta, msg: string) => void;
  sinks?: LogSink[];
};

class Logger {
  private _enabled: boolean;
  private _level: LogLevel;
  private _sinks: LogSink[] = [];
  private _logFn: (level: LogLevel, meta: LogMeta, msg: string) => void;

  constructor(opts?: LoggerOptions) {
    this._enabled = opts?.enabled ?? true;
    this._level = opts?.level ?? "info";
    this._sinks = opts?.sinks ?? [];
    this._logFn =
      opts?.logFn ??
      ((level, meta, msg) => console.log(`[${new Date().toISOString()}] ${level}: ${msg}`, meta));
  }

  private _log(level: LogLevel, meta: LogMeta, msg: string): void {
    if (!this._enabled) return;
    const entryLevel = { debug: 0, info: 1, error: 2 }[level];
    const loggerLevel = { debug: 0, info: 1, error: 2 }[this._level];
    if (entryLevel < loggerLevel) return;
    this._logFn(level, meta, msg);
    this._sinks.forEach((sink) => sink.log(level, meta, msg));
  }

  debug(msg: string): void;
  debug(meta: LogMeta, msg: string): void;
  debug(meta: LogMeta | string, msg?: string): void {
    if (typeof meta === "string") this._log("debug", {}, meta);
    else this._log("debug", meta, msg ?? "");
  }

  info(msg: string): void;
  info(meta: LogMeta, msg: string): void;
  info(meta: LogMeta | string, msg?: string): void {
    if (typeof meta === "string") this._log("info", {}, meta);
    else this._log("info", meta, msg ?? "");
  }

  error(msg: string): void;
  error(meta: LogMeta, msg: string): void;
  error(meta: LogMeta | string, msg?: string): void {
    if (typeof meta === "string") this._log("error", {}, meta);
    else this._log("error", meta, msg ?? "");
  }
}

export { Logger, type LogLevel, type LogMeta, type LogSink };
