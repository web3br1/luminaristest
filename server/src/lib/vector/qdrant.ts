import { QdrantClient } from '@qdrant/js-client-rest';

// Singleton Qdrant client for vector operations
export const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL!,
  apiKey: process.env.QDRANT_API_KEY!,
});

import { initializeQdrant } from './qdrant-initializer';

// The init logic for creating collection and indexes is now moved to a separate script
// See: my-app/scripts/create-qdrant-resources.ts 

// Garante que a inicialização seja executada apenas uma vez.
let qdrantInitialized = false;

async function runQdrantInitialization() {
  if (!qdrantInitialized) {
    qdrantInitialized = true;
    await initializeQdrant();
  }
}

// Executa a inicialização assim que este módulo for carregado.
runQdrantInitialization();