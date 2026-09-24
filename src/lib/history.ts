export interface Snapshot<T> {
  state: T;
}

export class History<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(private current: T) {}

  get value(): T {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  commit(next: T): void {
    this.past.push(this.current);
    this.current = next;
    this.future = [];
  }

  commitFrom(base: T, next: T): void {
    this.current = base;
    this.commit(next);
  }

  undo(): T {
    const prev = this.past.pop();
    if (prev === undefined) return this.current;
    this.future.push(this.current);
    this.current = prev;
    return this.current;
  }

  redo(): T {
    const next = this.future.pop();
    if (next === undefined) return this.current;
    this.past.push(this.current);
    this.current = next;
    return this.current;
  }
}
