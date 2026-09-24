export interface Snapshot<T, S> {
  document: T;
  selection: S;
}

export class HistoryStack<T, S> {
  private undoStack: Snapshot<T, S>[] = [];
  private redoStack: Snapshot<T, S>[] = [];

  constructor(private current: Snapshot<T, S>) {}

  get value(): Snapshot<T, S> {
    return this.current;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  commit(next: Snapshot<T, S>): void {
    this.undoStack.push(this.current);
    this.current = next;
    this.redoStack = [];
  }

  undo(): Snapshot<T, S> {
    const previous = this.undoStack.pop();
    if (previous) {
      this.redoStack.push(this.current);
      this.current = previous;
    }
    return this.current;
  }

  redo(): Snapshot<T, S> {
    const next = this.redoStack.pop();
    if (next) {
      this.undoStack.push(this.current);
      this.current = next;
    }
    return this.current;
  }
}
