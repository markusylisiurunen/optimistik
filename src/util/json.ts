type JSONValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<JSONValue>
  | { [key: string]: JSONValue | undefined };

export type { JSONValue };
