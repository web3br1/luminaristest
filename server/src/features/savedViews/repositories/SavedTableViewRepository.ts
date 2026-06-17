import prisma from '../../../lib/prisma';
import { Prisma } from 'generated/prisma';
import {
  ISavedTableView,
  SavedTableViewConfig,
  CreateSavedTableViewInput,
  UpdateSavedTableViewInput,
} from '../models/SavedTableView.model';
import { ISavedTableViewRepository } from './ISavedTableViewRepository';

/** Prisma row shape selected for the saved view (config typed as JsonValue). */
type SavedTableViewRow = {
  id: string;
  userId: string;
  tableId: string;
  name: string;
  config: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Repository for SavedTableView data access. Only place with prisma.* for this entity.
 */
export class SavedTableViewRepository implements ISavedTableViewRepository {
  private static readonly selection = {
    id: true,
    userId: true,
    tableId: true,
    name: true,
    config: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  public async create(data: CreateSavedTableViewInput): Promise<ISavedTableView> {
    const row = await prisma.savedTableView.create({
      data: {
        user: { connect: { id: data.userId } },
        tableId: data.tableId,
        name: data.name,
        config: data.config as unknown as Prisma.InputJsonValue,
      },
      select: SavedTableViewRepository.selection,
    });
    return this.mapToDomain(row);
  }

  public async findManyByUserAndTable(userId: string, tableId: string): Promise<ISavedTableView[]> {
    const rows = await prisma.savedTableView.findMany({
      where: { userId, tableId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: SavedTableViewRepository.selection,
    });
    return rows.map((row) => this.mapToDomain(row));
  }

  public async findById(id: string): Promise<ISavedTableView | null> {
    const row = await prisma.savedTableView.findFirst({
      where: { id, deletedAt: null },
      select: SavedTableViewRepository.selection,
    });
    return row ? this.mapToDomain(row) : null;
  }

  public async update(id: string, data: UpdateSavedTableViewInput): Promise<ISavedTableView> {
    const patch: Prisma.SavedTableViewUpdateInput = {};
    if (data.tableId !== undefined) patch.tableId = data.tableId;
    if (data.name !== undefined) patch.name = data.name;
    if (data.config !== undefined) patch.config = data.config as unknown as Prisma.InputJsonValue;

    const row = await prisma.savedTableView.update({
      where: { id },
      data: patch,
      select: SavedTableViewRepository.selection,
    });
    return this.mapToDomain(row);
  }

  public async softDelete(id: string): Promise<void> {
    await prisma.savedTableView.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private mapToDomain(row: SavedTableViewRow): ISavedTableView {
    return {
      id: row.id,
      userId: row.userId,
      tableId: row.tableId,
      name: row.name,
      config: (row.config as unknown as SavedTableViewConfig) ?? {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
