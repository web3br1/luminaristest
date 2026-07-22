import { qdrant } from './qdrant';
import logger from '@/lib/logger';

const COLLECTION_NAME = 'documents';
const VECTOR_SIZE = 1536; // Vector size for text-embedding-3-small
const DISTANCE_METRIC = 'Cosine';

/**
 * Garante que a coleção 'documents' exista no Qdrant com a configuração correta.
 */
async function ensureCollectionExists() {
  try {
    const collections = await qdrant.getCollections();
    const collectionExists = collections.collections.some(c => c.name === COLLECTION_NAME);

    if (collectionExists) {
      logger.debug(`Coleção '${COLLECTION_NAME}' já existe.`);
      return;
    }

    logger.info(`Coleção '${COLLECTION_NAME}' não encontrada. Criando...`);
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: {
        size: VECTOR_SIZE,
        distance: DISTANCE_METRIC,
      },
    });
    logger.info(`Coleção '${COLLECTION_NAME}' criada com sucesso.`);

  } catch (error) {
    logger.error('Falha ao verificar ou criar a coleção no Qdrant.', {
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      collection: COLLECTION_NAME
    });
    // Lançar o erro pode ser uma opção se a aplicação não puder funcionar sem a coleção
    throw error;
  }
}

/**
 * Garante que um índice de payload para 'documentId' exista na coleção.
 */
async function ensurePayloadIndexExists() {
  const fieldName = 'documentId';

  try {
    const collectionInfo = await qdrant.getCollection(COLLECTION_NAME);
    const existingIndexes = collectionInfo.payload_schema || {};

    if (existingIndexes[fieldName]) {
      logger.debug(`Índice de payload para '${fieldName}' já existe.`);
      return;
    }

    logger.info(`Índice de payload para '${fieldName}' não encontrado. Criando...`);
    await qdrant.createPayloadIndex(COLLECTION_NAME, {
      field_name: fieldName,
      field_schema: 'keyword',
      wait: true,
    });
    logger.info(`Índice de payload para '${fieldName}' criado com sucesso.`);

  } catch (error) {
    logger.error(`Falha ao garantir a existência do índice de payload para '${fieldName}'.`, {
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      collection: COLLECTION_NAME
    });
    throw error;
  }
}

/**
 * Função principal de inicialização do Qdrant.
 * Garante que a coleção e os índices necessários existam.
 */
export async function initializeQdrant() {
  logger.info('Iniciando a inicialização do Qdrant...');
  try {
    await ensureCollectionExists();
    await ensurePayloadIndexExists();
    logger.info('Inicialização do Qdrant concluída com sucesso.');
  } catch (error) {
    logger.error('Ocorreu um erro crítico durante a inicialização do Qdrant. A aplicação pode não funcionar corretamente.', {
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
    // Em um ambiente de produção, você pode querer que a aplicação pare se o Qdrant não estiver configurado.
    // process.exit(1);
  }
}
