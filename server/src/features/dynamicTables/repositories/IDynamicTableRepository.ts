import { IDynamicTable, IDynamicTableData } from '../models/DynamicTable.model';
import { CreateDynamicTableDtoType, UpdateDynamicTableDtoType, UpdateDynamicTableSchemaDtoType } from '../dtos/DynamicTable.dto';

export interface IDynamicTableRepository {
  // Table operations
  createTable(userId: string, data: CreateDynamicTableDtoType): Promise<IDynamicTable>;
  findTableById(tableId: string): Promise<IDynamicTable | null>;
  findTableByName(userId: string, name: string): Promise<IDynamicTable | null>;
  findTableByInternalName(userId: string, internalName: string): Promise<IDynamicTable | null>;
  findTablesByUserId(userId: string): Promise<IDynamicTable[]>;
  updateTable(tableId: string, data: UpdateDynamicTableDtoType): Promise<IDynamicTable>;
  updateTableSchema(tableId: string, data: UpdateDynamicTableSchemaDtoType): Promise<IDynamicTable>;
  deleteTable(tableId: string): Promise<void>;
  deleteTablesByUserId(userId: string): Promise<void>;

  // Data operations
  createData(tableId: string, data: Record<string, any>): Promise<IDynamicTableData>;
  findDataById(dataId: string): Promise<IDynamicTableData | null>;
  findDataByIds(dataIds: string[]): Promise<IDynamicTableData[]>;
  findDataByTableId(tableId: string, page?: number, limit?: number): Promise<{ data: IDynamicTableData[]; total: number }>;
  /** Internal use only — returns ALL rows without pagination for validation/analytics. */
  findAllDataByTableId(tableId: string): Promise<IDynamicTableData[]>;
  findDataBatchStreamByTableId(tableId: string, batchSize?: number): AsyncGenerator<IDynamicTableData[]>;
  updateData(dataId: string, data: Record<string, any>): Promise<IDynamicTableData>;
  deleteData(dataId: string): Promise<void>;
  /**
   * Deletes all data entries for all dynamic tables that belong to the given user.
   */
  deleteAllDataByUserId(userId: string): Promise<void>;

  // Métodos para validação avançada
  countByFieldValue(tableId: string, fieldName: string, value: any, excludeId?: string): Promise<number>;
  countOverlaps(
    tableId: string,
    startField: string,
    endField: string,
    startValue: string,
    endValue: string,
    scope: Array<{ field: string; value: string }>,
    excludeId?: string,
  ): Promise<number>;
  findRowsByFieldValue(tableId: string, fieldName: string, value: string): Promise<IDynamicTableData[]>;
  existsByIdInTable(dataId: string, tableId: string): Promise<boolean>;

  /**
   * Finds the parent table of a given data entry ID.
   * Useful for permission checks where you only have the dataId.
   */
  findTableByDataId(dataId: string): Promise<IDynamicTable | null>;

  /**
   * Counts the number of tables a user has, grouped by category.
   * @param userId The ID of the user.
   * @returns A promise that resolves to an array of objects, each containing a category and the count of tables in it.
   */
  countTablesByCategory(userId: string): Promise<{ category: string; count: number }[]>;

  /**
   * Lists tables whose schema contains a relation to the provided tableId.
   * Used to prevent deleting tables that are referenced by others.
   */
  findTablesReferencingTableId(targetTableId: string): Promise<IDynamicTable[]>;

  /**
   * Returns rows in `tableId` where the JSON field `fieldName` references `targetId`
   * (exact scalar match OR element inside a JSON array).
   * Used to scope the delete-constraint scan without loading entire tables.
   */
  findRowsReferencingId(tableId: string, fieldName: string, targetId: string): Promise<IDynamicTableData[]>;

}
