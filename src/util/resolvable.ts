interface Resolvable<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: any): void;
}

function resolvable<T>(): Resolvable<T> {
  let resolve: (value: T) => void;
  let reject: (reason: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  };
}

export { Resolvable, resolvable };
