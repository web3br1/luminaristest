import type { IUser } from '../../users/models/User.model';
import { DocumentRepository } from '../../documents/repositories/DocumentRepository';
import type { IDocumentRepository } from '../../documents/repositories/IDocumentRepository';

export class StructuredDataPolicy {
  private documentRepository: IDocumentRepository;

  constructor(documentRepository: IDocumentRepository) {
    this.documentRepository = documentRepository;
  }

  /**
   * Verifica se o usuário pode visualizar ou modificar os dados estruturados de um documento.
   * A regra é simples: o usuário deve ser o dono do documento.
   */
  public async canAccess(user: IUser, documentId: string): Promise<boolean> {
    const document = await this.documentRepository.findById(documentId);
    if (!document) {
      return false; // Documento não existe
    }
    return document.userId === user.id;
  }
}
