import prisma from '../../../lib/prisma';
import { Prisma } from 'generated/prisma';
import { CreateStructuredDataInput, UpdateStructuredDataInput } from '../types/StructuredData.types';
import { IStructuredDataRepository } from './IStructuredDataRepository';
import { IStructuredData, toStructuredData } from '../models/StructuredData.model';

export class StructuredDataRepository implements IStructuredDataRepository {
  constructor() {
    // Usamos a instância compartilhada do Prisma
  }

  public async findByDocumentId(documentId: string): Promise<IStructuredData | null> {
    const result = await prisma.structuredData.findUnique({
      where: { documentId },
    });
    
    return result ? toStructuredData(result) : null;
  }

  public async create(data: CreateStructuredDataInput): Promise<IStructuredData> {
    const result = await prisma.structuredData.create({
      data: {
        documentId: data.documentId,
        headers: data.headers,
        data: data.data,
      },
    });
    
    return toStructuredData(result);
  }

  public async update(id: string, data: UpdateStructuredDataInput): Promise<IStructuredData> {
    const result = await prisma.structuredData.update({
      where: { id },
      data: {
        data: data.data,
      },
    });
    
    return toStructuredData(result);
  }

  public async delete(id: string): Promise<void> {
    await prisma.structuredData.delete({
      where: { id }
    });
  }
}
