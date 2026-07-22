import type { UserContext } from '@/types/UserContext';
import type { IDocumentRepository } from '../../documents/repositories/IDocumentRepository';
import type { IStructuredDataPolicy } from './IStructuredDataPolicy';

export class StructuredDataPolicy implements IStructuredDataPolicy {
  private documentRepository: IDocumentRepository;

  constructor(documentRepository: IDocumentRepository) {
    this.documentRepository = documentRepository;
  }

  /**
   * Verifica se o usuário pode visualizar ou modificar os dados estruturados de um documento.
   * A regra é estrita por design: o usuário deve ser o DONO do documento (sem bypass de admin),
   * pois dados estruturados são conteúdo privado de documento do tenant.
   */
  public async canAccess(ctx: UserContext, documentId: string): Promise<boolean> {
    const document = await this.documentRepository.findById(documentId);
    if (!document) {
      return false; // Documento não existe
    }
    return document.userId === ctx.userId;
  }
}
