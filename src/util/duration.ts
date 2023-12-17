declare const brand: unique symbol;
type Duration = number & { [brand]: "duration" };

function milliseconds(n: number): Duration {
  return n as Duration;
}

function seconds(n: number): Duration {
  return milliseconds(n * 1000);
}

export { milliseconds, seconds, type Duration };
