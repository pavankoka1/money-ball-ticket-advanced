/** Yield one compositor frame — splits long paint → pool → overlay chains. */
export function yieldFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
