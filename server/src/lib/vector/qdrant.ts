import { QdrantClient } from '@qdrant/js-client-rest';

// Singleton Qdrant client for vector operations
export const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL!,
  apiKey: process.env.QDRANT_API_KEY!,
  // Skip the constructor's async server-version probe: it fires a network call on import that
  // resolves after the Jest teardown ("Cannot log after tests are done"). Harmless to disable.
  checkCompatibility: false,
  // Per-request timeout (ms) so a hung Qdrant fails cleanly instead of blocking forever.
  timeout: 30_000,
});

import { initializeQdrant } from './qdrant-initializer';

// The init logic for creating collection and indexes is now moved to a separate script
// See: my-app/scripts/create-qdrant-resources.ts 

// Garante que a inicialização seja executada apenas uma vez.
let qdrantInitialized = false;

/**
 * Cria a coleção/índices do Qdrant (idempotente). DEVE ser chamada no bootstrap (server.ts),
 * NÃO no carregamento do módulo: importar o módulo (rotas → factory → repos de vetor) não pode
 * abrir conexão externa por efeito colateral — isso quebrava testes e acoplava o import à infra.
 */
export async function runQdrantInitialization(): Promise<void> {
  if (!qdrantInitialized) {
    qdrantInitialized = true;
    await initializeQdrant();
  }
}