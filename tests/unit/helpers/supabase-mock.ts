import { vi } from "vitest";

type Result = { data?: unknown; error?: { message: string; code?: string; details?: string } | null };
type Call = [method: string, args: unknown[]];

// A stand-in for the Supabase client. Every query-builder call is recorded and
// chainable; awaiting a query resolves to the next result queued for its table
// (the last one repeats). RPCs work the same way, by function name.
export function createSupabaseMock() {
  const queries: { table: string; calls: Call[] }[] = [];
  const rpcResults = new Map<string, Result[]>();
  const tableResults = new Map<string, Result[]>();

  function next(map: Map<string, Result[]>, key: string): Result {
    const queue = map.get(key);
    if (!queue?.length) return { data: null, error: null };
    return queue.length > 1 ? queue.shift()! : queue[0];
  }

  const client = {
    rpc: vi.fn<(fn: string, args?: unknown) => Promise<Result>>(async (fn) => next(rpcResults, fn)),
    from: vi.fn((table: string) => {
      const query = { table, calls: [] as Call[] };
      queries.push(query);
      const builder: object = new Proxy(
        {},
        {
          get(_, prop: string) {
            if (prop === "then") {
              return (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
                Promise.resolve(next(tableResults, table)).then(resolve, reject);
            }
            return (...args: unknown[]) => {
              query.calls.push([prop, args]);
              return builder;
            };
          },
        },
      );
      return builder;
    }),
    auth: {
      getClaims: vi.fn(async () => ({ data: null as unknown })),
      signOut: vi.fn(async () => ({ error: null })),
      exchangeCodeForSession: vi.fn<(code: string) => Promise<{ error: { message: string } | null }>>(async () => ({ error: null })),
    },
  };

  return {
    client,
    onRpc(fn: string, ...results: Result[]) {
      rpcResults.set(fn, results);
    },
    onTable(table: string, ...results: Result[]) {
      tableResults.set(table, results);
    },
    // The calls made on the n-th query against `table`.
    callsOn(table: string, n = 0) {
      return queries.filter((q) => q.table === table)[n]?.calls ?? [];
    },
    // The arguments of the first call of `method` on that query.
    argsOf(table: string, method: string, n = 0) {
      return this.callsOn(table, n).find(([m]) => m === method)?.[1];
    },
    reset() {
      queries.length = 0;
      rpcResults.clear();
      tableResults.clear();
      vi.clearAllMocks();
      // Signed out again, whatever the last test set up.
      client.auth.getClaims.mockResolvedValue({ data: null });
      client.auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    },
  };
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>;

// Signs the mock in as `id` for getCurrentUser().
export function signInAs(sb: SupabaseMock, id: string, email = "user@example.test") {
  sb.client.auth.getClaims.mockResolvedValue({ data: { claims: { sub: id, email } } });
}
