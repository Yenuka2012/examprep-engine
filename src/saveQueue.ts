/**
 * Serialize IndexedDB autosaves. One failed write must not poison later
 * attempts, while every caller still observes its own failure.
 */
export class SessionSaveQueue<T> {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly write: (snapshot: T) => Promise<void>) {}

  enqueue(snapshot: T): Promise<void> {
    // Recover the scheduling chain, not the result seen by the original caller.
    const next = this.tail.catch(() => undefined).then(() => this.write(snapshot));
    this.tail = next;
    return next;
  }

  /** Barrier: drain earlier writes then persist the final submitted snapshot. */
  flush(snapshot: T): Promise<void> {
    return this.enqueue(snapshot);
  }
}
