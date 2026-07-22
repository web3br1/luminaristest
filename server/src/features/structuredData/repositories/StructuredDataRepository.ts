import prisma from '../../../lib/prisma';
import { Prisma } from 'generated/prisma';
import { CreateStructuredDataInput, UpdateStructuredDataInput } from '../dtos/StructuredDataDto';
import { IStructuredDataRepository } from './IStructuredDataRepository';
import { IStructuredData, toStructuredData } from '../models/StructuredData.model';
import { NotFoundError } from '../../../lib/errors';

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
    try {
      const result = await prisma.structuredData.update({
        where: { id },
        data: {
          data: data.data,
        },
      });

      return toStructuredData(result);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundError(`Structured data ${id} not found`);
      }
      throw error;
    }
  }
}
