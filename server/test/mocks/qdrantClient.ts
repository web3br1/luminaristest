// Jest stand-in for '@qdrant/js-client-rest' (mapped via moduleNameMapper).
// Integration tests exercise the SQL/HTTP layers; vector operations are environment-dependent
// side effects (real Qdrant server), so every client method resolves to a benign empty shape.
/* eslint-disable @typescript-eslint/no-explicit-any */
function benign(): any {
  return {
    collections: [],
    points: [],
    result: { points: [], collections: [] },
    status: 'ok',
  };
}

export class QdrantClient {
  constructor(_opts?: unknown) {
    return new Proxy(this, {
      get(_target, prop) {
        if (prop === 'then') return undefined; // never look thenable
        return (..._args: unknown[]) => Promise.resolve(benign());
      },
    });
  }
}

export default { QdrantClient };
