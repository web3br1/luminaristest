import { CreateStructuredDataInput, UpdateStructuredDataInput } from '../dtos/StructuredDataDto';
import { IStructuredData } from '../models/StructuredData.model';

/**
 * Interface defining the data access operations for StructuredData entities.
 */
export interface IStructuredDataRepository {
  /**
   * Creates a new structured data entry
   */
  create(data: CreateStructuredDataInput): Promise<IStructuredData>;

  /**
   * Finds structured data by document ID
   */
  findByDocumentId(documentId: string): Promise<IStructuredData | null>;

  /**
   * Updates existing structured data
   */
  update(id: string, data: UpdateStructuredDataInput): Promise<IStructuredData>;
}
