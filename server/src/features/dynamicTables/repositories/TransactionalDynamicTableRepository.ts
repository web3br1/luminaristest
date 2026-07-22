/**
 * TransactionalDynamicTableRepository
 *
 * A thin wrapper around a Prisma interactive transaction client that implements
 * IDynamicTableRepository. All write operations (createData, updateData, deleteData,
 * etc.) are routed through the provided `tx` client so they participate in the
 * caller's prisma.$transaction block.
 *
 * Read operations are also routed through `tx` so they see the in-progress writes
 * (e.g. a plugin that reads back a record it just created within the same transaction).
 *
 * Usage:
 *   await prisma.$transaction(async (tx) => {
 *     const txRepo = new TransactionalDynamicTableRepository(tx);
 *     await txRepo.createData(...);
 *     // further writes inside this block are atomic
 *   });
 */
import type { DynamicTable } from 'generated/prisma';
import { Prisma } from 'generated/prisma';
import type { IDynamicTable, IDynamicTableData, ITableSchema, ISchemaField } from '../models/DynamicTable.model';
import type { CreateDynamicTableDtoType, UpdateDynamicTableDtoType, UpdateDynamicTableSchemaDtoType } from '../dtos/DynamicTable.dto';
import type { IDynamicTableRepository } from './IDynamicTableRepository';

/** Prisma interactive-transaction client type. */
type PrismaTx = Prisma.TransactionClient;

export class TransactionalDynamicTableRepository implements IDynamicTableRepository {
  constructor(private readonly tx: PrismaTx) {}

  private toDomainTable(row: DynamicTable): IDynamicTable {
    return {
      ...row,
      schema: (row.schema as unknown) as ITableSchema,
    };
  }

  // ── Table operations ────────────────────────────────────────────────────────

  async createTable(userId: string, data: CreateDynamicTableDtoType): Promise<IDynamicTable> {
    const row = await this.tx.dynamicTable.create({
      data: {
        userId,
        name: data.name,
        internalName: data.internalName,
        category: data.category,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prisma InputJsonValue: JSON fields require any cast at persistence boundary
        schema: data.schema as any,
      },
    });
    return this.toDomainTable(row);
  }

  async findTableById(tableId: string): Promise<IDynamicTable | null> {
    const row = await this.tx.dynamicTable.findUnique({ where: { id: tableId } });
    return row ? this.toDomainTable(row) : null;
  }

  async findTableByName(userId: string, name: string): Promise<IDynamicTable | null> {
    const row = await this.tx.dynamicTable.findFirst({
      where: { userId, name: { equals: name } },
    });
    return row ? this.toDomainTable(row) : null;
  }

  async findTableByInternalName(userId: string, internalName: string): Promise<IDynamicTable | null> {
    const row = await this.tx.dynamicTable.findFirst({
      where: { userId, internalName: { equals: internalName } },
    });
    return row ? this.toDomainTable(row) : null;
  }

  async findTablesByUserId(userId: string): Promise<IDynamicTable[]> {
    const rows = await this.tx.dynamicTable.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(r => this.toDomainTable(r));
  }

  async updateTable(tableId: string, data: UpdateDynamicTableDtoType): Promise<IDynamicTable> {
    const row = await this.tx.dynamicTable.update({
      where: { id: tableId },
      data: { name: data.name },
    });
    return this.toDomainTable(row);
  }

  async updateTableSchema(tableId: string, data: UpdateDynamicTableSchemaDtoType): Promise<IDynamicTable> {
    const row = await this.tx.dynamicTable.update({
      where: { id: tableId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prisma InputJsonValue: JSON fields require any cast at persistence boundary
      data: { schema: data.schema as any },
    });
    return this.toDomainTable(row);
  }

  async deleteTable(tableId: string): Promise<void> {
    await this.tx.dynamicTable.delete({ where: { id: tableId } });
  }

  async deleteTablesByUserId(userId: string): Promise<void> {
    await this.tx.dynamicTable.deleteMany({ where: { userId } });
  }

  // ── Data operations ─────────────────────────────────────────────────────────

  async createData(tableId: string, data: Record<string, unknown>): Promise<IDynamicTableData> {
    return this.tx.dynamicTableData.create({
      data: {
        dynamicTableId: tableId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prisma InputJsonValue: JSON fields require any cast at persistence boundary
        data: data as any,
      },
    });
  }

  async findDataById(dataId: string): Promise<IDynamicTableData | null> {
    return this.tx.dynamicTableData.findFirst({ where: { id: dataId, deletedAt: null } });
  }

  async findDataByIds(dataIds: string[]): Promise<IDynamicTableData[]> {
    return this.tx.dynamicTableData.findMany({
      where: { id: { in: dataIds }, deletedAt: null },
    });
  }

  async findDataByTableId(tableId: string, page: number = 1, limit: number = 50): Promise<{ data: IDynamicTableData[]; total: number }> {
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const safePage = Math.max(1, page);
    const skip = (safePage - 1) * safeLimit;

    const where = { dynamicTableId: tableId, deletedAt: null };

    const [data, total] = await Promise.all([
      this.tx.dynamicTableData.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.tx.dynamicTableData.count({ where }),
    ]);

    return { data, total };
  }

  async findAllDataByTableId(tableId: string): Promise<IDynamicTableData[]> {
    return this.tx.dynamicTableData.findMany({
      where: { dynamicTableId: tableId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async *findDataBatchStreamByTableId(tableId: string, batchSize: number = 1000): AsyncGenerator<IDynamicTableData[]> {
    let lastCursorId: string | undefined = undefined;
    while (true) {
      const batch: IDynamicTableData[] = await this.tx.dynamicTableData.findMany({
        where: { dynamicTableId: tableId, deletedAt: null },
        take: batchSize,
        skip: lastCursorId ? 1 : 0,
        cursor: lastCursorId ? { id: lastCursorId } : undefined,
        orderBy: { id: 'asc' },
      });
      if (batch.length === 0) break;
      yield batch;
      lastCursorId = batch[batch.length - 1].id;
    }
  }

  async updateData(dataId: string, data: Record<string, unknown>): Promise<IDynamicTableData> {
    return this.tx.dynamicTableData.update({
      where: { id: dataId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prisma InputJsonValue: JSON fields require any cast at persistence boundary
      data: { data: data as any },
    });
  }

  async deleteData(dataId: string): Promise<void> {
    await this.tx.dynamicTableData.update({
      where: { id: dataId },
      data: { deletedAt: new Date() },
    });
  }

  async deleteAllDataByUserId(userId: string): Promise<void> {
    await this.tx.dynamicTableData.deleteMany({
      where: { dynamicTable: { userId } },
    });
  }

  // ── Advanced query operations ────────────────────────────────────────────────

  async countTablesByCategory(userId: string): Promise<{ category: string; count: number }[]> {
    const result = await this.tx.dynamicTable.groupBy({
      by: ['category'],
      where: { userId },
      _count: { category: true },
    });
    return result.map((item: { category: string; _count: { category: number } }) => ({
      category: item.category,
      count: item._count.category,
    }));
  }

  async findTableByDataId(dataId: string): Promise<IDynamicTable | null> {
    const dataEntry = await this.tx.dynamicTableData.findFirst({
      where: { id: dataId, deletedAt: null },
      include: { dynamicTable: true },
    });
    return dataEntry?.dynamicTable ? this.toDomainTable(dataEntry.dynamicTable) : null;
  }

  async countByFieldValue(tableId: string, fieldName: string, value: unknown, excludeId?: string): Promise<number> {
    const jsonFieldPath = `$.${fieldName}`;
    const whereConditions: Prisma.Sql[] = [
      Prisma.sql`"dynamicTableId" = ${tableId}`,
      Prisma.sql`"deletedAt" IS NULL`,
      Prisma.sql`json_extract(data, ${jsonFieldPath}) = ${value}`,
    ];
    if (excludeId) {
      whereConditions.push(Prisma.sql`id != ${excludeId}`);
    }
    const whereClause = Prisma.join(whereConditions, ' AND ');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prisma InputJsonValue: $queryRaw not exposed on TransactionClient type
    const result: [{ count: bigint }] = await (this.tx as any).$queryRaw(
      Prisma.sql`SELECT COUNT(*) as count FROM "dynamic_table_data" WHERE ${whereClause}`
    );
    return Number(result[0].count);
  }

  /** Composite uniqueness probe — tx-aware mirror of DynamicTableRepository.countByCompositeFieldValues. */
  async countByCompositeFieldValues(tableId: string, fields: Array<{ name: string; value: unknown }>, excludeId?: string): Promise<number> {
    const whereConditions: Prisma.Sql[] = [
      Prisma.sql`"dynamicTableId" = ${tableId}`,
      Prisma.sql`"deletedAt" IS NULL`,
    ];
    for (const f of fields) {
      whereConditions.push(
        Prisma.sql`CAST(json_extract(data, ${`$.${f.name}`}) AS TEXT) = ${String(f.value)}`,
      );
    }
    if (excludeId) {
      whereConditions.push(Prisma.sql`id != ${excludeId}`);
    }
    const whereClause = Prisma.join(whereConditions, ' AND ');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prisma InputJsonValue: $queryRaw not exposed on TransactionClient type
    const result: [{ count: bigint }] = await (this.tx as any).$queryRaw(
      Prisma.sql`SELECT COUNT(*) as count FROM "dynamic_table_data" WHERE ${whereClause}`
    );
    return Number(result[0].count);
  }

  async countOverlaps(
    tableId: string,
    startField: string,
    endField: string,
    startValue: string,
    endValue: string,
    scope: Array<{ field: string; value: string }>,
    excludeId?: string,
  ): Promise<number> {
    const where: Prisma.Sql[] = [
      Prisma.sql`"dynamicTableId" = ${tableId}`,
      Prisma.sql`"deletedAt" IS NULL`,
      Prisma.sql`datetime(json_extract(data, ${`$.${startField}`})) < datetime(${endValue})`,
      Prisma.sql`datetime(json_extract(data, ${`$.${endField}`})) > datetime(${startValue})`,
    ];
    for (const s of scope) {
      where.push(Prisma.sql`json_extract(data, ${`$.${s.field}`}) = ${s.value}`);
    }
    if (excludeId) {
      where.push(Prisma.sql`id != ${excludeId}`);
    }
    const whereClause = Prisma.join(where, ' AND ');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prisma InputJsonValue: $queryRaw not exposed on TransactionClient type
    const result: [{ count: bigint }] = await (this.tx as any).$queryRaw(
      Prisma.sql`SELECT COUNT(*) as count FROM "dynamic_table_data" WHERE ${whereClause}`
    );
    return Number(result[0].count);
  }

  async findRowsByFieldValue(tableId: string, fieldName: string, value: string): Promise<IDynamicTableData[]> {
    const jsonFieldPath = `$.${fieldName}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prisma InputJsonValue: $queryRaw not exposed on TransactionClient type
    const rows: IDynamicTableData[] = await (this.tx as any).$queryRaw(
      Prisma.sql`
        SELECT * FROM "dynamic_table_data"
        WHERE "dynamicTableId" = ${tableId}
          AND "deletedAt" IS NULL
          AND json_extract(data, ${jsonFieldPath}) = ${value}
        ORDER BY "createdAt" DESC
      `
    );
    return rows;
  }

  async existsByIdInTable(dataId: string, tableId: string): Promise<boolean> {
    const count = await this.tx.dynamicTableData.count({
      where: { id: dataId, dynamicTableId: tableId, deletedAt: null },
    });
    return count > 0;
  }

  async findTablesReferencingTableId(targetTableId: string): Promise<IDynamicTable[]> {
    const rows = await this.tx.dynamicTable.findMany();
    const result: IDynamicTable[] = [];
    for (const row of rows) {
      const table = this.toDomainTable(row);
      const fields = (table.schema?.fields || []) as ISchemaField[];
      const hasReference = fields.some(
        (f: ISchemaField) => f?.type === 'relation' && f?.relation?.targetTable === targetTableId
      );
      if (hasReference) result.push(table);
    }
    return result;
  }

  async findRowsReferencingId(
    tableId: string,
    fieldName: string,
    targetId: string,
  ): Promise<IDynamicTableData[]> {
    const jsonScalarPath = `$.${fieldName}`;
    const likePattern = `%"${targetId}"%`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prisma InputJsonValue: $queryRaw not exposed on TransactionClient type
    const rows: IDynamicTableData[] = await (this.tx as any).$queryRaw(
      Prisma.sql`
        SELECT *
        FROM "dynamic_table_data"
        WHERE "dynamicTableId" = ${tableId}
          AND "deletedAt" IS NULL
          AND (
            json_extract(data, ${jsonScalarPath}) = ${targetId}
            OR (json_type(data, ${jsonScalarPath}) = 'array' AND data LIKE ${likePattern})
          )
        LIMIT 100
      `
    );
    return rows;
  }
}
