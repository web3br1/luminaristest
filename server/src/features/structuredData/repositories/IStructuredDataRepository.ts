import { CreateStructuredDataInput, UpdateStructuredDataInput } from '../types/StructuredData.types';
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
  
  /**
   * Deletes structured data by ID
   */
  delete(id: string): Promise<void>;
}
