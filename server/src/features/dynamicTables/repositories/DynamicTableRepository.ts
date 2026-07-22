import prisma from '../../../lib/prisma';
import type { DynamicTable, DynamicTableData } from 'generated/prisma';
import { IDynamicTable, IDynamicTableData, ITableSchema, ISchemaField } from '../models/DynamicTable.model';
import { CreateDynamicTableDtoType, UpdateDynamicTableDtoType, UpdateDynamicTableSchemaDtoType } from '../dtos/DynamicTable.dto';
import { Prisma } from 'generated/prisma';
import { IDynamicTableRepository } from './IDynamicTableRepository';
import { Prisma as PrismaNs } from 'generated/prisma';

export class DynamicTableRepository implements IDynamicTableRepository {
  /**
   * Accepts a Prisma client or an interactive-transaction client. Defaults to the
   * singleton, so `new DynamicTableRepository()` keeps working. Passing a `tx` client
   * makes every method run inside that transaction (used by the service for atomicity).
   */
  constructor(private readonly client: Prisma.TransactionClient = prisma) {}

  private toDomainTable(row: DynamicTable): IDynamicTable {
    return {
      ...row,
      schema: (row.schema as unknown) as ITableSchema,
    };
  }

  async createTable(userId: string, data: CreateDynamicTableDtoType): Promise<IDynamicTable> {
    const row = await this.client.dynamicTable.create({
      data: {
        userId,
        name: data.name,
        internalName: data.internalName,
        category: data.category,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prisma InputJsonValue: JSON fields require any cast at persistence boundary
        schema: data.schema as any, // Prisma expects JsonValue
      },
    });
    return this.toDomainTable(row);
  }

  async findTableById(tableId: string): Promise<IDynamicTable | null> {
    const row = await this.client.dynamicTable.findUnique({ where: { id: tableId } });
    return row ? this.toDomainTable(row) : null;
  }

  async findTableByName(userId: string, name: string): Promise<IDynamicTable | null> {
    const row = await this.client.dynamicTable.findFirst({
      where: {
        userId,
        name: {
          equals: name,
        },
      },
    });
    return row ? this.toDomainTable(row) : null;
  }

  async findTableByInternalName(userId: string, internalName: string): Promise<IDynamicTable | null> {
    const row = await this.client.dynamicTable.findFirst({
      where: {
        userId,
        internalName: {
          equals: internalName,
        },
      },
    });
    return row ? this.toDomainTable(row) : null;
  }

  async findTablesByUserId(userId: string): Promise<IDynamicTable[]> {
    const rows = await this.client.dynamicTable.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(r => this.toDomainTable(r));
  }

  async updateTable(tableId: string, data: UpdateDynamicTableDtoType): Promise<IDynamicTable> {
    const row = await this.client.dynamicTable.update({
      where: { id: tableId },
      data: { name: data.name },
    });
    return this.toDomainTable(row);
  }

  async deleteTable(tableId: string): Promise<void> {
    await this.client.dynamicTable.delete({ where: { id: tableId } });
  }

  async deleteTablesByUserId(userId: string): Promise<void> {
    await this.client.dynamicTable.deleteMany({ where: { userId } });
  }

  async createData(tableId: string, data: Record<string, unknown>): Promise<IDynamicTableData> {
    return this.client.dynamicTableData.create({
      data: {
        dynamicTableId: tableId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prisma InputJsonValue: JSON fields require any cast at persistence boundary
        data: data as any, // Prisma expects JsonValue
      },
    });
  }

  async findDataById(dataId: string): Promise<IDynamicTableData | null> {
    return this.client.dynamicTableData.findFirst({ where: { id: dataId, deletedAt: null } });
  }

  async findDataByIds(dataIds: string[]): Promise<IDynamicTableData[]> {
    return this.client.dynamicTableData.findMany({
      where: { id: { in: dataIds }, deletedAt: null }
    });
  }

  async findDataByTableId(tableId: string, page: number = 1, limit: number = 50): Promise<{ data: IDynamicTableData[]; total: number }> {
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const safePage = Math.max(1, page);
    const skip = (safePage - 1) * safeLimit;

    const where = { dynamicTableId: tableId, deletedAt: null };

    const [data, total] = await Promise.all([
      this.client.dynamicTableData.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.client.dynamicTableData.count({ where }),
    ]);

    return { data, total };
  }

  async findAllDataByTableId(tableId: string): Promise<IDynamicTableData[]> {
    return this.client.dynamicTableData.findMany({
      where: { dynamicTableId: tableId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findDataByTableIdPaged(tableId: string, limit: number, offset: number): Promise<IDynamicTableData[]> {
    return this.client.dynamicTableData.findMany({
      where: { dynamicTableId: tableId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async countDataByTableId(tableId: string): Promise<number> {
    return this.client.dynamicTableData.count({
      where: { dynamicTableId: tableId, deletedAt: null },
    });
  }

  async *findDataBatchStreamByTableId(tableId: string, batchSize: number = 1000): AsyncGenerator<IDynamicTableData[]> {
    let lastCursorId: string | undefined = undefined;

    while (true) {
      const batch: IDynamicTableData[] = await this.client.dynamicTableData.findMany({
        where: { dynamicTableId: tableId, deletedAt: null },
        take: batchSize,
        skip: lastCursorId ? 1 : 0,
        cursor: lastCursorId ? { id: lastCursorId } : undefined,
        orderBy: { id: 'asc' }, // MUST be properly ordered by a unique sequential field for cursor pagination
      });

      if (batch.length === 0) break;

      yield batch;

      lastCursorId = batch[batch.length - 1].id;
    }
  }

  async updateData(dataId: string, data: Record<string, unknown>): Promise<IDynamicTableData> {
    return this.client.dynamicTableData.update({
      where: { id: dataId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prisma InputJsonValue: JSON fields require any cast at persistence boundary
      data: { data: data as any }, // Prisma expects JsonValue
    });
  }

  async deleteData(dataId: string): Promise<void> {
    await this.client.dynamicTableData.update({ where: { id: dataId }, data: { deletedAt: new Date() } });
  }

  async deleteAllDataByUserId(userId: string): Promise<void> {
    // Delete all data entries for tables owned by the user
    await this.client.dynamicTableData.deleteMany({
      where: {
        dynamicTable: {
          userId: userId,
        },
      },
    });
  }

  public async countTablesByCategory(userId: string): Promise<{ category: string; count: number }[]> {
    const result = await this.client.dynamicTable.groupBy({
      by: ['category'],
      where: {
        userId: userId,
      },
      _count: {
        category: true,
      },
    });

    // O tipo do item retornado pelo groupBy do Prisma é inferido aqui
    return result.map((item: { category: string; _count: { category: number } }) => ({
      category: item.category,
      count: item._count.category,
    }));
  }

  async findTableByDataId(dataId: string): Promise<IDynamicTable | null> {
    const dataEntry = await this.client.dynamicTableData.findFirst({
      where: { id: dataId, deletedAt: null },
      include: { dynamicTable: true },
    });
    return dataEntry?.dynamicTable ? this.toDomainTable(dataEntry.dynamicTable) : null;
  }

  async updateTableSchema(tableId: string, data: UpdateDynamicTableSchemaDtoType): Promise<IDynamicTable> {
    const updatedTable = await this.client.dynamicTable.update({
      where: { id: tableId },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prisma InputJsonValue: JSON fields require any cast at persistence boundary
        schema: data.schema as any, // Prisma expects JsonValue
      },
    });
    return this.toDomainTable(updatedTable);
  }

  async countByFieldValue(tableId: string, fieldName: string, value: unknown, excludeId?: string): Promise<number> {
    // O caminho do campo JSON é construído dinamicamente, mas `fieldName` é validado
    // contra nosso schema, então é seguro.
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

    const result: [{ count: bigint }] = await this.client.$queryRaw(
      Prisma.sql`SELECT COUNT(*) as count FROM "dynamic_table_data" WHERE ${whereClause}`
    );

    return Number(result[0].count);
  }

  /**
   * Counts rows where ALL provided fields match their values (composite uniqueness).
   * Indexed equivalent of `findDataByTableId(...).filter(...)` filtering in memory.
   * Field names come from the schema (trusted); values are bound parameters.
   * Compares as TEXT to match the prior `String(a) === String(b)` semantics.
   */
  async countByCompositeFieldValues(tableId: string, fields: Array<{ name: string; value: any }>, excludeId?: string): Promise<number> {
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

    const result: [{ count: bigint }] = await this.client.$queryRaw(
      Prisma.sql`SELECT COUNT(*) as count FROM "dynamic_table_data" WHERE ${whereClause}`
    );

    return Number(result[0].count);
  }

  /**
   * Counts existing rows whose [startField, endField] interval overlaps the given
   * [startValue, endValue], optionally scoped by equality on additional JSON fields.
   * Half-open overlap: existing.start < newEnd AND existing.end > newStart.
   * Uses datetime() to normalize ISO date/datetime strings before comparison.
   * Field names come from the schema (trusted), values are bound parameters.
   */
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

    const result: [{ count: bigint }] = await this.client.$queryRaw(
      Prisma.sql`SELECT COUNT(*) as count FROM "dynamic_table_data" WHERE ${whereClause}`
    );

    return Number(result[0].count);
  }

  /**
   * Returns ALL non-deleted rows of a table whose JSON `fieldName` equals `value`.
   * Indexed equivalent of `findDataByTableId(...).filter(r => r.data[field] === value)`,
   * without loading the whole table. Unlike `findRowsReferencingId`, it has NO LIMIT â€”
   * safe for business collections (sale items, commissions) where truncation would
   * corrupt aggregates. Scalar match only. Preserves `ORDER BY createdAt DESC` for parity.
   */
  async findRowsByFieldValue(tableId: string, fieldName: string, value: string): Promise<IDynamicTableData[]> {
    const jsonFieldPath = `$.${fieldName}`;
    const rows: IDynamicTableData[] = await this.client.$queryRaw(
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
    const count = await this.client.dynamicTableData.count({
      where: {
        id: dataId,
        dynamicTableId: tableId,
        deletedAt: null,
      },
    });
    return count > 0;
  }

  // removed duplicate implementation

  async findTablesReferencingTableId(targetTableId: string, userId: string): Promise<IDynamicTable[]> {
    // Busca as tabelas do usuário e filtra por schemas que contenham relação apontando para targetTableId
    const rows = await this.client.dynamicTable.findMany({ where: { userId } });
    const result: IDynamicTable[] = [];
    for (const row of rows) {
      const table = this.toDomainTable(row);
      const fields = (table.schema?.fields || []) as ISchemaField[];
      const hasReference = fields.some((f: ISchemaField) => f?.type === 'relation' && f?.relation?.targetTable === targetTableId);
      if (hasReference) {
        result.push(table);
      }
    }
    return result;
  }

  async findRowsReferencingId(
    tableId: string,
    fieldName: string,
    targetId: string
  ): Promise<IDynamicTableData[]> {
    // Uses json_extract (SQLite) to find rows where the JSON field equals targetId
    // OR where the field is a JSON array containing targetId.
    // NO LIMIT: this drives the delete-constraint scan in DynamicTableService._deleteDataWithin.
    // Truncating would corrupt RESTRICT_IF_AGGREGATE sums (partial total → wrongly allows the
    // delete) and CASCADE (referencing rows beyond the cap left as orphans). The result set is
    // bounded by real referencing data and the scan already runs inside the delete $transaction.
    const jsonScalarPath = `$.${fieldName}`;
    const likePattern = `%"${targetId}"%`;

    const rows: IDynamicTableData[] = await this.client.$queryRaw(
      Prisma.sql`
        SELECT *
        FROM "dynamic_table_data"
        WHERE "dynamicTableId" = ${tableId}
          AND "deletedAt" IS NULL
          AND (
            json_extract(data, ${jsonScalarPath}) = ${targetId}
            OR (json_type(data, ${jsonScalarPath}) = 'array' AND data LIKE ${likePattern})
          )
      `
    );
    return rows;
  }
  async getDataByTableId(tableId: string, userId: string): Promise<Record<string, unknown>[]> {
    // Primeiro, verifique se a tabela pertence ao usuário para garantir a permissão.
    const table = await this.client.dynamicTable.findFirst({
      where: {
        id: tableId,
        userId: userId, // Garante que apenas o proprietário possa acessar.
      },
    });

    // Se a tabela não for encontrada ou não pertencer ao usuário, retorne um array vazio.
    if (!table) {
      return [];
    }

    // Se a permissão for verificada, busque todos os dados da tabela.
    const dataEntries = await this.client.dynamicTableData.findMany({
      where: {
        dynamicTableId: tableId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Mapeia para incluir o ID do registro junto com os dados.
    return dataEntries.map(entry => ({
      id: entry.id,
      ...(entry.data as object), // Espalha o conteúdo do JSON
    }));
  }
}
