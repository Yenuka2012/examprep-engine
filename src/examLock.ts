/**
 * Cross-tab exclusive ownership for exams.
 *
 * Web Locks offers origin-wide mutual exclusion and releases automatically when
 * the owning document closes. We deliberately fail closed where unavailable.
 * No localStorage time-based lease: such leases can permit simultaneous writers.
 */
export class ExamLock {
  private releaseGate: (() => void) | undefined;
  private requestFinished: Promise<void> | undefined;
  private owns = false;
  private pending = false;

  get supported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.locks?.request;
  }
  get owned(): boolean { return this.owns; }

  async acquire(): Promise<boolean> {
    if (this.owns) return true;
    if (this.pending || !this.supported) return false;
    this.pending = true;
    let acknowledge: (value: boolean) => void = () => {};
    const acquired = new Promise<boolean>(resolve => { acknowledge = resolve; });
    try {
      this.requestFinished = navigator.locks.request('examprep-active-exam-v1', {
        mode: 'exclusive', ifAvailable: true
      }, async lock => {
        if (!lock) { acknowledge(false); return; }
        this.owns = true;
        await new Promise<void>(resolve => {
          this.releaseGate = resolve;
          acknowledge(true);
        });
        this.owns = false;
        this.releaseGate = undefined;
      });
      void this.requestFinished.catch(() => {this.owns = false; acknowledge(false);});
      return await acquired;
    } catch {
      this.owns = false;
      return false;
    } finally {
      this.pending = false;
    }
  }

  async release(): Promise<void> {
    this.releaseGate?.();
    try { await this.requestFinished; } finally {
      this.releaseGate = undefined;
      this.requestFinished = undefined;
      this.owns = false;
    }
  }
}
