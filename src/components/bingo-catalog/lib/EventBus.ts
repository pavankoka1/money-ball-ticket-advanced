export class EventBus {
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  addEventListener<T extends (...args: unknown[]) => void>(
    event: string,
    listener: T,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as (...args: unknown[]) => void);
    return () => this.removeEventListener(event, listener);
  }

  removeEventListener<T extends (...args: unknown[]) => void>(
    event: string,
    listener: T,
  ): void {
    this.listeners.get(event)?.delete(listener as (...args: unknown[]) => void);
  }

  dispatchEvent(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }

  clear(): void {
    this.listeners.clear();
  }
}
