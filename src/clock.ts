// Injectable clock — the single seam for all time-based decisions.
// Override `now` in tests to drive schedules deterministically.

export type ClockFn = () => Date;

let clockFn: ClockFn = () => new Date();

export function now(): Date {
  return clockFn();
}

export function setClock(fn: ClockFn): void {
  clockFn = fn;
}

export function resetClock(): void {
  clockFn = () => new Date();
}
