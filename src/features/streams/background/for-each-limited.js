// Runs fn on every item, a few at a time, so checking many channels doesn't flood a site.

const CONCURRENCY = 3;

export async function forEachLimited(items, fn) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) await fn(item);
    }),
  );
}
