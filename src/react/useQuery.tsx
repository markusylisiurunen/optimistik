import _isEqual from "lodash.isequal";
import { useEffect, useState } from "react";
import { Optimistik } from "../optimistik";
import { ReadTx } from "../store";
import { JSONValue } from "../util/json";

type UseQueryOptions = {
  isEqual?: (a: JSONValue, b: JSONValue) => boolean;
};
function useQuery<T extends JSONValue>(
  optimistik: Optimistik,
  query: (tx: ReadTx) => Promise<T>,
  opts?: UseQueryOptions,
): { loading: boolean; data: T | undefined } {
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [value, setValue] = useState<T>();
  useEffect(() => {
    let current = value;
    const { stream, unsubscribe } = optimistik.subscribe(query);
    (async () => {
      for await (const next of stream) {
        const isEqual = opts?.isEqual ?? _isEqual;
        if (status !== "loading" && isEqual(current, next)) continue;
        current = next;
        setValue(next);
        setStatus("ready");
      }
    })();
    return () => unsubscribe();
  }, []);
  return { loading: status === "loading", data: value };
}

export { useQuery };
