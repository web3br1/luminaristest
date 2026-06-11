import { z } from 'zod';
import { isValidCpf, isValidCnpj, isValidPhone } from '../utils/ValidationUtils';

import type { UserContext } from '../../../lib/authUtils';
import { IDynamicTableRepository } from '../repositories/IDynamicTableRepository';
import { IDynamicTablePolicy } from '../policies/IDynamicTablePolicy';
import { CreateDynamicTableDtoType, UpdateDynamicTableDtoType, CreateDynamicTableDataDtoType, UpdateDynamicTableDataDtoType, UpdateDynamicTableSchemaDtoType } from '../dtos/DynamicTable.dto';
import { IDynamicTable, ITableSchema } from '../models/DynamicTable.model';
import { DynamicTableCategory } from '../models/TableCategories';
import { NotFoundError, ForbiddenError, ValidationError } from '../../../lib/errors';
import { globalRuleRegistry } from '../rules/RuleRegistry';
import type { RuleContext } from '../rules/RuleTypes';
import { KnowledgeGraphService } from '../../chat/services/KnowledgeGraphService';
import prisma from '../../../lib/prisma';
import { TransactionalDynamicTableRepository } from '../repositories/TransactionalDynamicTableRepository';

export class DynamicTableService {
  private repository: IDynamicTableRepository;
  private policy: IDynamicTablePolicy;

  constructor(
    repository: IDynamicTableRepository,
    policy: IDynamicTablePolicy,
    private readonly knowledgeGraphService?: KnowledgeGraphService
  ) {
    this.repository = repository;
    this.policy = policy;
    // Plugins are registered centrally in the RuleRegistry
  }

  // --- Private Core Logic Methods ---

  private async _createTable(userId: string, data: CreateDynamicTableDtoType): Promise<IDynamicTable> {
    // Validação para impedir nomes de campos duplicados
    const fieldNames = data.schema.fields.map(field => field.name.trim().toLowerCase());
    const uniqueFieldNames = new Set(fieldNames);

    if (uniqueFieldNames.size !== fieldNames.length) {
      throw new ValidationError('O esquema da tabela não pode conter nomes de campos duplicados.');
    }

    // Validação estrutural do schema: compila o Zod para detectar inconsistências cedo
    // (mesmo que a primeira passagem de presets persista sem relações)
    this.buildZodSchema(data.schema as unknown as ITableSchema);

    // Se houver campos de relação, garanta que a tabela alvo exista (exceto quando for marcador de preset)
    for (const field of data.schema.fields) {
      if (field.type === 'relation' && field.relation?.targetTable) {
        const target = field.relation.targetTable;
        if (typeof target === 'string' && target.startsWith('@@PRESET_TABLE_KEY::')) {
          continue; // permitido no fluxo de preset, será resolvido na 2ª passagem
        }
        const targetTable = await this.repository.findTableById(target);
        if (!targetTable) {
          throw new ValidationError(`Relação inválida: tabela alvo '${target}' não existe.`);
        }
      }
    }

    const table = await this.repository.createTable(userId, data);
    if (this.knowledgeGraphService) {
      await this.knowledgeGraphService.syncGraph(userId).catch(err => console.error('Error syncing graph:', err));
    }
    return table;
  }

  private async _updateTable(tableId: string, data: UpdateDynamicTableDtoType): Promise<IDynamicTable> {
    const table = await this.repository.updateTable(tableId, data);
    const updatedTable = await this.repository.findTableById(tableId);
    if (updatedTable && this.knowledgeGraphService) {
      await this.knowledgeGraphService.syncGraph(updatedTable.userId).catch(err => console.error('Error syncing graph:', err));
    }
    return table;
  }

  private async _deleteTable(tableId: string): Promise<void> {
    // Resolve the owner before deletion so we can invalidate the KnowledgeGraph afterward.
    const tableToDelete = await this.repository.findTableById(tableId);

    // Impede excluir tabela que é referenciada por outras
    const refs = await this.repository.findTablesReferencingTableId(tableId);
    if (refs.length > 0) {
      const refNames = refs.map(r => r.name).join(', ');
      throw new ValidationError(`Não é possível excluir a tabela. Ela é referenciada por: ${refNames}`);
    }
    await this.repository.deleteTable(tableId);

    // Invalidate the KnowledgeGraph so the agent does not "see" the deleted table
    // on the next chat session. syncGraph will rebuild it from the remaining tables (R27).
    if (tableToDelete && this.knowledgeGraphService) {
      await this.knowledgeGraphService.syncGraph(tableToDelete.userId).catch(err =>
        console.error('Error syncing graph after table deletion:', err)
      );
    }
  }

  /**
   * Resolve preset relation markers (@@PRESET_TABLE_KEY::...) to concrete table IDs
   * using the provided presetKey→tableId map. Returns a deep-cloned schema.
   */
  private resolvePresetRelations(schema: ITableSchema, presetKeyToTableIdMap: Map<string, string>): ITableSchema {
    const resolved: ITableSchema = JSON.parse(JSON.stringify(schema));
    if (!Array.isArray(resolved.fields)) return resolved;
    for (const field of resolved.fields) {
      if (field.type === 'relation' && field.relation?.targetTable) {
        const tgt = field.relation.targetTable as unknown as string;
        if (typeof tgt === 'string' && tgt.startsWith('@@PRESET_TABLE_KEY::')) {
          const targetKey = tgt.replace('@@PRESET_TABLE_KEY::', '');
          const targetId = presetKeyToTableIdMap.get(targetKey);
          if (!targetId) {
            throw new ValidationError(`Não foi possível resolver a relação do campo '${field.name}' para a tabela '${targetKey}'.`);
          }
          (field.relation as any).targetTable = targetId as any;
        }
      }
    }
    return resolved;
  }

  // --- System-Facing Methods (Bypass Policy) ---

  /**
   * Creates a table as a system process, bypassing user policies.
   * This should only be called by trusted, internal server processes.
   * @param userId The ID of the user to associate the table with.
   * @param data The data for the new table.
   */
  public async createTableAsSystem(userId: string, data: CreateDynamicTableDtoType): Promise<IDynamicTable> {
    return this._createTable(userId, data);
  }

  /**
   * Updates a table as a system process, bypassing user policies.
   * This should only be called by trusted, internal server processes.
   * @param tableId The ID of the table to update.
   * @param data The data to update.
   */
  /**
   * Updates a table's schema as a system process, bypassing user policies.
   * @param tableId The ID of the table to update.
   * @param data The new schema data.
   */
  public async updateTableSchemaAsSystem(tableId: string, data: UpdateDynamicTableSchemaDtoType): Promise<IDynamicTable> {
    const tableExists = await this.repository.findTableById(tableId);
    if (!tableExists) {
      throw new NotFoundError('Table not found.');
    }
    // 1) Validar nomes duplicados e schema DTO completo
    const fieldNames = data.schema.fields.map(field => field.name.trim().toLowerCase());
    const uniqueFieldNames = new Set(fieldNames);
    if (uniqueFieldNames.size !== fieldNames.length) {
      throw new ValidationError('O esquema da tabela não pode conter nomes de campos duplicados.');
    }
    // 2) Validar schema via buildZodSchema
    this.buildZodSchema(data.schema);
    // 2.1) Verificar que relações apontam para tabelas existentes (ids reais)
    for (const field of data.schema.fields) {
      if (field.type === 'relation' && field.relation?.targetTable) {
        const target = field.relation.targetTable;
        if (typeof target === 'string' && target.startsWith('@@PRESET_TABLE_KEY::')) {
          throw new ValidationError(`Relação inválida em schema update: marcador de preset não é permitido nesta operação (${field.name}).`);
        }
        const targetTable = await this.repository.findTableById(target);
        if (!targetTable) {
          throw new ValidationError(`Relação inválida: tabela alvo '${target}' não existe (${field.name}).`);
        }
      }
    }
    // 3) Revalidar dados existentes contra o novo schema e bloquear se inválidos
    const existingData = await this.repository.findAllDataByTableId(tableId);
    for (const row of existingData) {
      try {
        this.validateDataAgainstSchema(row.data as any, data.schema as unknown as ITableSchema);
      } catch (err) {
        throw new ValidationError('Schema update would invalidate existing data. Aborting update.', { dataId: row.id });
      }
    }
    return this.repository.updateTableSchema(tableId, data);
  }

  public async updateTableAsSystem(tableId: string, data: UpdateDynamicTableDtoType): Promise<IDynamicTable> {
    const tableExists = await this.repository.findTableById(tableId);
    if (!tableExists) {
      throw new NotFoundError('Table not found.');
    }
    return this._updateTable(tableId, data);
  }

  /**
   * Deletes a table as a system process, bypassing user policies.
   * This should only be called by trusted, internal server processes.
   * @param tableId The ID of the table to delete.
   */
  /**
   * Installs a suite of tables from a preset as a system process.
   * Resolves relationships between tables during creation.
   * @param userId The ID of the user to associate the tables with.
   * @param preset The preset object containing table definitions.
   */
  public async installPresetAsSystem(userId: string, preset: { tables: Record<string, { name: string; category: DynamicTableCategory; schema: ITableSchema }> }) {
    // Pré-validação de dependências entre tabelas do preset
    const tableKeys = Object.keys(preset.tables);
    // Nova validação baseada em metadados de preset (requires/excludes/capabilities)
    // Recolhe capacidades fornecidas e requeridas e também coerções entre tabelas
    const provides = new Set<string>();
    const requires = new Map<string, string[]>();
    const requiresTables = new Map<string, string[]>();
    const excludesTables = new Map<string, string[]>();

    for (const key of tableKeys) {
      const def: any = preset.tables[key];
      const meta = def?.meta || {};
      (meta.providesCapabilities || []).forEach((c: string) => provides.add(c));
      if (Array.isArray(meta.requiresCapabilities) && meta.requiresCapabilities.length > 0) {
        requires.set(key, meta.requiresCapabilities);
      }
      if (Array.isArray(meta.requiresTables) && meta.requiresTables.length > 0) {
        requiresTables.set(key, meta.requiresTables);
      }
      if (Array.isArray(meta.excludesTables) && meta.excludesTables.length > 0) {
        excludesTables.set(key, meta.excludesTables);
      }
    }

    // Checa capacidades requeridas
    for (const [key, reqCaps] of requires.entries()) {
      const missing = reqCaps.filter(c => !provides.has(c));
      if (missing.length > 0) {
        throw new ValidationError(`Preset inválido: a tabela '${key}' requer capacidades ausentes: ${missing.join(', ')}`);
      }
    }

    // Checa requiresTables
    for (const [key, reqTables] of requiresTables.entries()) {
      const missing = reqTables.filter(tk => !preset.tables[tk]);
      if (missing.length > 0) {
        throw new ValidationError(`Preset inválido: a tabela '${key}' requer as tabelas: ${missing.join(', ')}`);
      }
    }

    // Checa excludesTables
    for (const [key, exclTables] of excludesTables.entries()) {
      const conflicts = exclTables.filter(tk => !!preset.tables[tk]);
      if (conflicts.length > 0) {
        throw new ValidationError(`Preset inválido: a tabela '${key}' não pode coexistir com: ${conflicts.join(', ')}`);
      }
    }
    for (const key of tableKeys) {
      const tableDef = preset.tables[key];
      if (!tableDef?.schema || !Array.isArray(tableDef.schema.fields)) {
        throw new ValidationError(`Tabela do preset inválida: '${key}' sem schema.fields`);
      }
      for (const field of tableDef.schema.fields) {
        if (field.type === 'relation' && field.relation?.targetTable) {
          const target = field.relation.targetTable;
          if (!target.startsWith('@@PRESET_TABLE_KEY::')) {
            throw new ValidationError(`Relação inválida em '${key}.${field.name}': targetTable precisa referenciar uma tabela do preset via @@PRESET_TABLE_KEY::targetKey`);
          }
          const targetKey = target.replace('@@PRESET_TABLE_KEY::', '');
          if (!preset.tables[targetKey]) {
            throw new ValidationError(`Relação inválida em '${key}.${field.name}': tabela alvo '${targetKey}' não existe no preset.`);
          }
        }
      }
    }

    const presetKeyToTableIdMap = new Map<string, string>();
    const createdTables: { id: string; presetKey: string; originalSchema: ITableSchema }[] = [];

    // 1. Primeira Passagem: Criar todas as tabelas com schemas parciais (sem relações)
    for (const presetKey in preset.tables) {
      const tableDefinition = preset.tables[presetKey];
      if (!tableDefinition?.schema || !Array.isArray(tableDefinition.schema.fields)) {
        throw new ValidationError(`Tabela do preset inválida: '${presetKey}' sem schema.fields`);
      }
      const tempSchema: ITableSchema = {
        ...tableDefinition.schema,
        fields: tableDefinition.schema.fields.filter(f => f.type !== 'relation'),
      };

      const newTable = await this._createTable(userId, {
        name: tableDefinition.name,
        category: tableDefinition.category, // Passar a categoria do preset
        schema: tempSchema,
        internalName: presetKey,
      });

      presetKeyToTableIdMap.set(presetKey, newTable.id);
      createdTables.push({
        id: newTable.id,
        presetKey: presetKey,
        originalSchema: tableDefinition.schema
      });
    }

    // 2. Segunda Passagem: Atualizar tabelas com os schemas completos e relações resolvidas
    for (const table of createdTables) {
      const resolvedSchema = this.resolvePresetRelations(table.originalSchema, presetKeyToTableIdMap);
      await this.updateTableSchemaAsSystem(table.id, { schema: resolvedSchema });
    }

    // 3. Substituir saleItems por variante adequada (products/services/mixed)
    const capsProvided = Array.from(provides.values());
    const hasStock = provides.has('inventory.stock');
    const hasServices = provides.has('services.catalog');
    const saleItemsKey = Object.keys(preset.tables).find(k => k === 'saleItems');
    if (saleItemsKey) {
      const saleItemsTableId = presetKeyToTableIdMap.get('saleItems');
      if (saleItemsTableId) {
        // Choose module variant and update schema of saleItems table accordingly
        let variantSchema: ITableSchema | null = null;
        try {
          const { saleItemsProductsOnlyModule } = await import('../presets/modules/finance/SalesItemsProductsOnly');
          const { saleItemsServicesOnlyModule } = await import('../presets/modules/finance/SalesItemsServicesOnly');
          const { saleItemsMixedModule } = await import('../presets/modules/finance/SalesItemsMixed');
          if (hasStock && hasServices) variantSchema = saleItemsMixedModule.schema;
          else if (hasStock) variantSchema = saleItemsProductsOnlyModule.schema;
          else variantSchema = saleItemsServicesOnlyModule.schema;
        } catch { }
        if (variantSchema) {
          const resolvedVariantSchema = this.resolvePresetRelations(variantSchema, presetKeyToTableIdMap);
          await this.updateTableSchemaAsSystem(saleItemsTableId, { schema: resolvedVariantSchema });
        }
      }
    }

    return { message: 'Preset installed successfully' };
  }

  public async deleteTableAsSystem(tableId: string): Promise<void> {
    const tableExists = await this.repository.findTableById(tableId);
    if (!tableExists) {
      throw new NotFoundError('Table not found.');
    }
    await this._deleteTable(tableId);
  }

  // --- User-Facing Methods (Policy-Enforced) ---

  /**
   * [USER-FACING] Attempts to create a table. This action is blocked by policy
   * for all users and will always throw a ForbiddenError.
   */
  async createTable(user: UserContext, data: CreateDynamicTableDtoType) {
    if (!this.policy.canCreate(user)) {
      throw new ForbiddenError('You do not have permission to create tables.');
    }
    // This part is now unreachable for regular users but kept for architectural integrity.
    return this._createTable(user.id, data);
  }

  async getTableById(user: UserContext, tableId: string) {
    let table = await this.repository.findTableById(tableId);

    // If not found by ID, try finding by Name (slug) as a fallback for the AI Agent
    if (!table) {
      table = await this.repository.findTableByName(user.userId, tableId);
    }

    if (!table) throw new NotFoundError('Table not found.');
    if (!this.policy.canView(user, table)) {
      throw new ForbiddenError('You do not have permission to view this table.');
    }
    return table;
  }

  async getTablesForUser(userId: string) {
    return this.repository.findTablesByUserId(userId);
  }

  /**
   * [USER-FACING] Attempts to update a table. This action is blocked by policy
   * for all users and will always throw a ForbiddenError.
   */
  async updateTable(user: UserContext, tableId: string, data: UpdateDynamicTableDtoType) {
    const table = await this.getTableById(user, tableId); // Re-uses permission check
    if (!this.policy.canUpdate(user, table)) {
      throw new ForbiddenError('You do not have permission to update this table.');
    }
    // This part is now unreachable for regular users.
    return this._updateTable(tableId, data);
  }

  /**
   * [USER-FACING] Attempts to delete a table. This action is blocked by policy
   * for all users and will always throw a ForbiddenError.
   */
  async deleteTable(user: UserContext, tableId: string) {
    const table = await this.getTableById(user, tableId); // Re-uses permission check
    if (!this.policy.canDelete(user, table)) {
      throw new ForbiddenError('You do not have permission to delete this table.');
    }
    // This part is now unreachable for regular users.
    await this._deleteTable(tableId);
  }

  async createTableData(user: UserContext, tableId: string, dataDto: CreateDynamicTableDataDtoType, options?: { isSystem?: boolean }) {
    const table = await this.getTableById(user, tableId);
    if (!this.policy.canManageData(user, table)) {
      throw new ForbiddenError('You do not have permission to add data to this table.');
    }
    // isSystem is derived from the call context only — never from the client payload.
    // Strip __isSystem from the data before validation to ensure it is never stored.
    const isSystem = !!(options?.isSystem);
    const sanitizedData = { ...(dataDto.data as any) };
    delete sanitizedData.__isSystem;
    const validatedData = this.validateDataAgainstSchema(sanitizedData, table.schema as unknown as ITableSchema);
    await this.validateAdvancedRules(table, validatedData);
    await this.enforceNoOverlap(table, table.schema as unknown as ITableSchema, validatedData, isSystem);
    // Rules: beforeCreate (validation-focused; runs outside transaction to avoid long locks)
    await this.runRules({ userId: table.userId, table, schema: table.schema as any, operation: 'create', before: null, after: validatedData, repository: this.repository, isSystem }, 'beforeCreate');

    // Wrap the main write + afterCreate side-effects in a single transaction so that
    // a plugin failure (e.g. SalesPlugin stock update) rolls back the record creation.
    const created = await prisma.$transaction(async (tx) => {
      const txRepo = new TransactionalDynamicTableRepository(tx);
      const record = await txRepo.createData(tableId, validatedData);
      // Include created id in 'after' context so plugins can reference the new entry
      const afterWithId = { ...validatedData, id: record.id } as any;
      await this.runRules({ userId: table.userId, table, schema: table.schema as any, operation: 'create', before: null, after: afterWithId, repository: txRepo, isSystem }, 'afterCreate');
      return record;
    });

    return created;
  }

  public async getTableData(user: UserContext, tableId: string, page: number = 1, limit: number = 50): Promise<{ data: import('../models/DynamicTable.model').IDynamicTableData[]; total: number; page: number; limit: number; totalPages: number }> {
    await this.getTableById(user, tableId);
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const safePage = Math.max(1, page);
    const { data, total } = await this.repository.findDataByTableId(tableId, safePage, safeLimit);
    return { data, total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) };
  }

  /** Internal unbounded fetch — used by analytics and AI services that need all rows. */
  public async getAllTableData(user: UserContext, tableId: string): Promise<import('../models/DynamicTable.model').IDynamicTableData[]> {
    await this.getTableById(user, tableId);
    return this.repository.findAllDataByTableId(tableId);
  }

  public async *getTableDataStream(user: UserContext, tableId: string, batchSize: number = 1000) {
    const table = await this.getTableById(user, tableId);
    yield* this.repository.findDataBatchStreamByTableId(tableId, batchSize);
  }

  public async getTableDataByIds(user: UserContext, tableId: string, recordIds: string[]) {
    const table = await this.getTableById(user, tableId);
    // Find records and ensure they belong to the requested table for security
    const records = await this.repository.findDataByIds(recordIds);
    return records.filter(row => row.dynamicTableId === tableId);
  }

  async resolveRelations(user: UserContext, lookups: { tableId: string, recordIds: string[], displayField?: string }[]) {
    const results: Record<string, Record<string, string>> = {};

    for (const lookup of lookups) {
      if (!lookup.recordIds || lookup.recordIds.length === 0) continue;
      
      try {
        const table = await this.getTableById(user, lookup.tableId);
        const data = await this.repository.findDataByIds(lookup.recordIds);
        
        let displayField = lookup.displayField;
        if (!displayField) {
          const schema = table.schema as unknown as ITableSchema;
          if (schema?.defaultDisplayField) {
            displayField = schema.defaultDisplayField;
          } else {
            const nameField = schema?.fields?.find(f => /name|title|nome|titulo|fantasyName|companyName/i.test(f.name));
            displayField = nameField ? nameField.name : undefined;
          }
        }

        const tableResults: Record<string, string> = {};
        for (const row of data) {
          const rowData = row.data as Record<string, any>;
          if (displayField && rowData[displayField] !== undefined) {
            tableResults[row.id] = String(rowData[displayField]);
          } else {
            // Fallback: pick the first string field, or just return ID
            const firstStringKey = Object.keys(rowData).find(k => typeof rowData[k] === 'string');
            tableResults[row.id] = firstStringKey ? String(rowData[firstStringKey]) : String(row.id);
          }
        }
        
        results[lookup.tableId] = tableResults;
      } catch (error) {
        // Se falhar (ex: sem permissão), ignora e continua
        console.warn(`Failed to resolve relations for table ${lookup.tableId}`, error);
      }
    }

    return results;
  }

  async updateTableData(user: UserContext, dataId: string, dataDto: UpdateDynamicTableDataDtoType, options?: { isSystem?: boolean }) {
    const table = await this.findTableForData(user, dataId);
    if (!this.policy.canManageData(user, table)) {
      throw new ForbiddenError('You do not have permission to update data in this table.');
    }
    // isSystem is derived from the call context only — never from the client payload.
    // Strip __isSystem from the data before validation to ensure it is never stored.
    const isSystem = !!(options?.isSystem);
    const sanitizedDataDto = { ...(dataDto.data as any) };
    delete sanitizedDataDto.__isSystem;
    dataDto = { ...dataDto, data: sanitizedDataDto };
    const schema = table.schema as unknown as ITableSchema;

    // --- Guard 1: readOnly fields ---
    if (!isSystem) {
      const readOnlyFields = schema.fields.filter(f => f.readOnly).map(f => f.name);
      const violations = readOnlyFields.filter(
        name => (dataDto.data as any)?.[name] !== undefined
      );
      if (violations.length > 0) {
        throw new ValidationError(`Field(s) [${violations.join(', ')}] are read-only and cannot be modified directly.`);
      }
    }

    const validatedData = this.validateDataAgainstSchema(dataDto.data, schema, true);
    const existingData = await this.repository.findDataById(dataId);
    if (!existingData) throw new NotFoundError('Data entry not found.');

    const mergedData = { ...(existingData.data as object), ...validatedData };

    // --- Guard 2: immutableAfter rules ---
    if (!isSystem) {
      const immutableRules = schema.immutableAfter ?? [];
      if (immutableRules.length > 0) {
        const currentData = existingData.data as Record<string, unknown>;
        for (const rule of immutableRules) {
          const currentFieldValue = currentData[rule.condition.field];
          const conditionMet = rule.condition.op === 'eq'
            ? currentFieldValue === rule.condition.value
            : Array.isArray(rule.condition.value) && rule.condition.value.includes(String(currentFieldValue));

          if (conditionMet) {
            if (rule.scope === 'all') {
              const changedFields = Object.keys(dataDto.data || {}).filter(
                key => JSON.stringify(currentData[key]) !== JSON.stringify((dataDto.data as any)[key])
              );
              if (changedFields.length > 0) {
                throw new ValidationError(
                  rule.errorMessage ?? `This record cannot be edited in its current state (${rule.condition.field}: ${currentFieldValue}).`
                );
              }
            } else {
              const blockedAndChanged = (rule.scope as string[]).filter(
                fieldName => (dataDto.data as any)?.[fieldName] !== undefined
                  && JSON.stringify(currentData[fieldName]) !== JSON.stringify((dataDto.data as any)[fieldName])
              );
              if (blockedAndChanged.length > 0) {
                throw new ValidationError(
                  rule.errorMessage ?? `Fields [${blockedAndChanged.join(', ')}] cannot be changed in this state.`
                );
              }
            }
          }
        }
      }
    }

    // --- Guard 3: lifecycle transitions (status state machine) ---
    if (!isSystem) {
      const lifecycleRules = schema.lifecycle ?? [];
      const currentData = existingData.data as Record<string, unknown>;
      for (const rule of lifecycleRules) {
        const prev = currentData[rule.field];
        const next = (mergedData as Record<string, unknown>)[rule.field];
        // No state change (or field not present in this update) → nothing to validate.
        if (next === undefined || next === prev) continue;
        const prevKey = String(prev);
        const nextKey = String(next);
        const allowedTargets = rule.transitions[prevKey];
        // Source state absent from transitions map ⇒ terminal: no outgoing change allowed.
        if (!allowedTargets || !allowedTargets.includes(nextKey)) {
          throw new ValidationError(
            rule.errorMessage ?? `Invalid status transition: '${prevKey}' → '${nextKey}'.`
          );
        }
      }
    }

    await this.validateAdvancedRules(table, mergedData, dataId);
    await this.enforceNoOverlap(table, schema, mergedData, isSystem, dataId);

    // Rules: beforeUpdate runs outside the transaction (validation-focused, avoids long locks).
    // afterWithId is intentionally mutable: plugins that write to ctx.after (e.g. GoalsPlugin,
    // LeadsPlugin computing derived fields) will have their changes persisted because we extract
    // the clean data object from afterWithId (minus id) before calling updateData.
    const beforeWithId = { ...(existingData.data as any), id: dataId } as any;
    const afterWithId = { ...mergedData as any, id: dataId } as any;
    await this.runRules({ userId: table.userId, table, schema: table.schema as any, operation: 'update', before: beforeWithId, after: afterWithId, repository: this.repository, isSystem }, 'beforeUpdate');

    // Wrap the main write + afterUpdate side-effects in a single transaction so that
    // a plugin failure (e.g. SalesPlugin stock/commission update) rolls back the record update.
    const updated = await prisma.$transaction(async (tx) => {
      const txRepo = new TransactionalDynamicTableRepository(tx);
      // Extract the (possibly mutated) data from afterWithId, stripping the synthetic id field.
      const { id: _afterId, ...persistedData } = afterWithId;
      const record = await txRepo.updateData(dataId, persistedData);
      await this.runRules({ userId: table.userId, table, schema: table.schema as any, operation: 'update', before: beforeWithId, after: afterWithId, repository: txRepo, isSystem }, 'afterUpdate');
      return record;
    });

    return updated;
  }

  async deleteTableData(user: UserContext, dataId: string) {
    const table = await this.findTableForData(user, dataId);
    if (!this.policy.canManageData(user, table)) {
      throw new ForbiddenError('You do not have permission to delete data from this table.');
    }
    const parentSchema = table.schema as unknown as ITableSchema;
    const constraints = parentSchema.deleteConstraints || [];
    const cascadeIds: { tableId: string, dataId: string }[] = [];

    // Verify references to this record in other tables (relation fields)
    const allTables = await this.repository.findTablesByUserId(table.userId);
    for (const t of allTables) {
      const schema = t.schema as unknown as ITableSchema;
      if (!schema?.fields) continue;

      // Only process tables that have relation fields pointing to the current table
      const relationFields = schema.fields.filter(
        f => f.type === 'relation' && f.relation?.targetTable === table.id
      );
      if (relationFields.length === 0) continue;

      // Query only rows that actually reference this dataId — no full table scan
      let referencingRows: any[] = [];
      for (const field of relationFields) {
        const rows = await this.repository.findRowsReferencingId(t.id, field.name, dataId);
        for (const row of rows) {
          if (!referencingRows.find(r => r.id === row.id)) referencingRows.push(row);
        }
      }
      if (referencingRows.length === 0) continue;

      const tableConstraints = constraints.filter(c => {
        const rawTarget = c.targetTable.replace('@@PRESET_TABLE_KEY::', '');
        return rawTarget === t.internalName || rawTarget === t.id;
      });

      if (tableConstraints.length === 0) {
        // Default behavior: RESTRICT
        throw new ValidationError(`Cannot delete the record. It is referenced by data in table '${t.name}'.`);
      }

      for (const constraint of tableConstraints) {
        if (constraint.type === 'IGNORE') continue;
        if (constraint.type === 'RESTRICT') {
          throw new ValidationError(constraint.errorMessage ?? `Cannot delete the record referenced by '${t.name}'.`);
        }
        if (constraint.type === 'RESTRICT_IF_AGGREGATE' && constraint.aggregate) {
          let aggregateValue = 0;
          for (const row of referencingRows) {
            const val = Number((row.data as any)?.[constraint.aggregate.field]) || 0;
            aggregateValue += val;
          }
          let shouldRestrict = false;
          switch (constraint.aggregate.operator) {
            case 'gt': shouldRestrict = aggregateValue > constraint.aggregate.value; break;
            case 'lt': shouldRestrict = aggregateValue < constraint.aggregate.value; break;
            case 'eq': shouldRestrict = aggregateValue === constraint.aggregate.value; break;
            case 'neq': shouldRestrict = aggregateValue !== constraint.aggregate.value; break;
          }
          if (shouldRestrict) {
            throw new ValidationError(constraint.errorMessage ?? `Restrict condition failed for table '${t.name}'.`);
          }
        }
        if (constraint.type === 'CASCADE') {
          for (const row of referencingRows) {
            cascadeIds.push({ tableId: t.id, dataId: row.id });
          }
        }
      }
    }
    // Rules: beforeDelete runs outside the transaction (validation-focused, avoids long locks).
    const existing = await this.repository.findDataById(dataId);
    await this.runRules({ userId: table.userId, table, schema: table.schema as any, operation: 'delete', before: existing?.data as any, after: null, repository: this.repository }, 'beforeDelete');

    // Wrap the main delete + cascade + afterDelete side-effects in a single transaction so that
    // a plugin failure rolls back the soft-delete and any cascade deletions.
    await prisma.$transaction(async (tx) => {
      const txRepo = new TransactionalDynamicTableRepository(tx);
      await txRepo.deleteData(dataId);

      // Execute cascade soft deletes recursively (within the same transaction)
      for (const cascade of cascadeIds) {
        await txRepo.deleteData(cascade.dataId);
      }

      await this.runRules({ userId: table.userId, table, schema: table.schema as any, operation: 'delete', before: existing?.data as any, after: null, repository: txRepo }, 'afterDelete');
    });
  }

  public async deleteAllTablesForUser(userId: string): Promise<void> {
    const tables = await this.repository.findTablesByUserId(userId);
    if (tables.length === 0) return;

    // 1) Purga todos os dados primeiro para quebrar quaisquer dependências por conteúdo
    await this.repository.deleteAllDataByUserId(userId);

    // 2) Agora podemos remover as tabelas sem nos preocupar com ciclos de referências por dados
    // Ainda assim, removemos direto pelo repositório para evitar a checagem de referential integrity entre schemas
    await this.repository.deleteTablesByUserId(userId);
  }

  private async findTableForData(user: UserContext, dataId: string): Promise<IDynamicTable> {
    const table = await this.repository.findTableByDataId(dataId);
    if (!table) throw new NotFoundError('The requested data entry or its parent table does not exist.');
    if (!this.policy.canView(user, table)) {
      throw new ForbiddenError('You do not have permission to access data in this table.');
    }
    return table;
  }

  private validateDataAgainstSchema(data: Record<string, any>, tableSchema: ITableSchema, isPartial = false) {
    try {
      let schema = this.buildZodSchema(tableSchema);
      if (isPartial) schema = schema.partial();
      return schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.log('[DynamicTableService] Validation Failed. FieldCount:', Object.keys(data || {}).length);
        console.log('[DynamicTableService] Validation Errors:', JSON.stringify(Object.keys(error.flatten().fieldErrors), null, 2));
        throw new ValidationError('Invalid data provided.', error.flatten().fieldErrors);
      }
      throw new ValidationError('Data validation failed.');
    }
  }

  private async runRules(ctx: RuleContext, phase: 'beforeCreate' | 'afterCreate' | 'beforeUpdate' | 'afterUpdate' | 'beforeDelete' | 'afterDelete') {
    const plugins = globalRuleRegistry.getApplicable(ctx);
    for (const p of plugins) {
      const fn = (p as any)[phase];
      if (typeof fn === 'function') {
        await fn.call(p, ctx);
      }
    }
  }

  private buildZodSchema(tableSchema: ITableSchema): z.ZodObject<any> {
    const shape: { [key: string]: z.ZodType<any, any> } = {};
    if (!tableSchema || !Array.isArray(tableSchema.fields)) {
      throw new ValidationError('Invalid table schema definition.');
    }

    for (const field of tableSchema.fields) {
      let zodField: z.ZodType<any, any>;
      // Normaliza tipos equivalentes
      const fieldType = (field.type === 'datetime') ? 'date' : field.type;

      switch (fieldType) {
        case 'textarea':
        case 'string': {
          let stringField = z.string();

          // First, apply generic validations that return a ZodString
          if (field.validation?.minLength !== undefined) {
            stringField = stringField.min(field.validation.minLength);
          }
          if (field.validation?.maxLength !== undefined) {
            stringField = stringField.max(field.validation.maxLength);
          }

          // Now, apply format-based validations which may return a ZodEffects
          let finalStringValidation: z.ZodTypeAny = stringField;
          if (field.format) {
            switch (field.format) {
              case 'email':
                finalStringValidation = stringField.email({ message: 'Formato de email inválido.' });
                break;
              case 'url':
                finalStringValidation = stringField.url({ message: 'Formato de URL inválido.' });
                break;
              case 'cpf':
                finalStringValidation = stringField.refine(isValidCpf, { message: 'CPF/CNPJ inválido. CPF deve ter 11 dígitos ou CNPJ deve ter 14 dígitos.' });
                break;
              case 'cnpj':
                finalStringValidation = stringField.refine(isValidCnpj, { message: 'CNPJ inválido. Deve conter 14 dígitos numéricos.' });
                break;
              case 'phone':
                finalStringValidation = stringField.refine(isValidPhone, { message: 'Telefone inválido. Deve conter 10 ou 11 dígitos numéricos.' });
                break;
              case 'custom':
                if (field.regex) {
                  try {
                    const customRegex = new RegExp(field.regex);
                    finalStringValidation = stringField.regex(customRegex, { message: `O valor não corresponde ao formato exigido para o campo '${field.label || field.name}'.` });
                  } catch (e) {
                    throw new ValidationError(`Regex inválida fornecida para o campo '${field.name}'.`);
                  }
                }
                break;
            }
          }

          zodField = finalStringValidation;
          break;
        }
        case 'number': {
          let numberField = z.coerce.number();
          if (field.validation?.minValue !== undefined) {
            numberField = numberField.min(field.validation.minValue);
          }
          if (field.validation?.maxValue !== undefined) {
            numberField = numberField.max(field.validation.maxValue);
          }
          zodField = numberField;
          break;
        }
        case 'boolean':
          zodField = z.boolean();
          break;
        case 'date':
          zodField = z.coerce.date();
          break;
        // 'datetime' é normalizado para 'date' acima
        case 'relation': {
          const base = z.string().cuid({ message: 'ID de relação inválido.' });
          if (field.relation?.allowMultiple) {
            zodField = z.array(base).min(1, { message: 'Selecione ao menos um item na relação.' });
          } else {
            zodField = base;
          }
          break;
        }
        case 'select':
          if (!field.options || field.options.length === 0) {
            throw new ValidationError(`O campo de seleção '${field.name}' não possui opções definidas no schema.`);
          }
          // Garante que o array de opções não esteja vazio para o z.enum
          zodField = z.enum(field.options as [string, ...string[]]);
          break;
        case 'json': {
          // Accept any JSON-compatible object
          zodField = z.any();
          break;
        }
        default:
          throw new ValidationError(`Tipo de campo desconhecido: ${field.type}`);
      }

      if (field.defaultValue !== undefined) {
        zodField = zodField.default(field.defaultValue);
      }

      if (!field.required) {
        if (field.defaultValue === undefined) {
          zodField = zodField.optional();
        }
        zodField = zodField.nullable();
      }

      shape[field.name] = zodField;
    }
    return z.object(shape);
  }

  /**
   * Enforces schema-declared anti-overlap rules (e.g. appointment scheduling conflicts).
   * Bypassed for system-originated writes (consistent with prior plugin behavior).
   * Each bound must be a valid date; otherwise the rule is skipped (presence is enforced
   * elsewhere by `required`/`compare`).
   */
  private async enforceNoOverlap(
    table: IDynamicTable,
    schema: ITableSchema,
    data: Record<string, any>,
    isSystem: boolean,
    excludeId?: string,
  ) {
    if (isSystem) return;
    const rules = schema.noOverlap ?? [];
    for (const rule of rules) {
      const startValue = data[rule.startField];
      const endValue = data[rule.endField];
      if (startValue === undefined || startValue === null || endValue === undefined || endValue === null) continue;
      if (!isFinite(new Date(startValue).getTime()) || !isFinite(new Date(endValue).getTime())) continue;

      const scope: Array<{ field: string; value: string }> = [];
      for (const f of rule.scopeFields ?? []) {
        const v = data[f];
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          scope.push({ field: f, value: String(v) });
        }
      }

      const count = await this.repository.countOverlaps(
        table.id,
        rule.startField,
        rule.endField,
        String(startValue),
        String(endValue),
        scope,
        excludeId,
      );
      if (count > 0) {
        throw new ValidationError(rule.errorMessage ?? 'This record overlaps an existing one in the same period.');
      }
    }
  }

  private async validateAdvancedRules(table: IDynamicTable, data: Record<string, any>, dataIdToExclude?: string) {
    const schema = table.schema as unknown as ITableSchema;

    for (const field of schema.fields) {
      const value = data[field.name];
      if (value === undefined || value === null) continue;

      // 1. Validate Uniqueness
      if (field.unique) {
        const count = await this.repository.countByFieldValue(table.id, field.name, value, dataIdToExclude);
        if (count > 0) {
          throw new ValidationError(`The value '${value}' for field '${field.label}' already exists and must be unique.`);
        }
      }

      // 2. Validate Relation
      if (field.type === 'relation' && field.relation) {
        if (field.relation.allowMultiple) {
          if (!Array.isArray(value)) {
            throw new ValidationError(`Field '${field.label}' expects a list of IDs.`);
          }
          const unique = new Set(value);
          if (unique.size !== value.length) {
            throw new ValidationError(`Field '${field.label}' contains duplicate IDs.`);
          }
          for (const id of value) {
            const exists = await this.repository.existsByIdInTable(id, field.relation.targetTable);
            if (!exists) {
              throw new ValidationError(`Related record with ID '${id}' in the target table for field '${field.label}' was not found.`);
            }
          }
        } else {
          const relatedExists = await this.repository.existsByIdInTable(value, field.relation.targetTable);
          if (!relatedExists) {
            throw new ValidationError(`Related record with ID '${value}' in the target table for field '${field.label}' was not found.`);
          }
        }
      }
    }

    // 3. Validate compositeUnique rules
    const compositeRules = schema.compositeUnique ?? [];
    for (const rule of compositeRules) {
      // Only check if ALL fields in the composite key are present in the payload
      const allPresent = rule.fields.every(f => data[f] !== undefined && data[f] !== null);
      if (!allPresent) continue;

      const existingRows = await this.repository.findAllDataByTableId(table.id);
      const duplicate = existingRows.find(row => {
        if (dataIdToExclude && row.id === dataIdToExclude) return false;
        const d = row.data as Record<string, unknown>;
        return rule.fields.every(f => String(d[f]) === String(data[f]));
      });

      if (duplicate) {
        throw new ValidationError(
          rule.errorMessage ?? `Duplicate entry: the combination of [${rule.fields.join(', ')}] must be unique.`
        );
      }
    }

    // 4. Validate requiredIf — conditional required fields
    for (const field of schema.fields) {
      if (!field.requiredIf) continue;

      const { field: condField, op, value: condValue } = field.requiredIf;
      const actualCondValue = data[condField];

      let conditionMet = false;
      if (op === 'eq') {
        conditionMet = actualCondValue === condValue;
      } else if (op === 'neq') {
        conditionMet = actualCondValue !== condValue;
      } else if (op === 'in') {
        const arr = Array.isArray(condValue) ? condValue : [condValue];
        conditionMet = arr.includes(actualCondValue as any);
      }

      if (conditionMet) {
        const fieldValue = data[field.name];
        const isEmpty = fieldValue === null || fieldValue === undefined || fieldValue === '';
        if (isEmpty) {
          throw new ValidationError(
            `Field '${field.label || field.name}' is required when '${condField}' is '${Array.isArray(condValue) ? condValue.join(' | ') : condValue}'.`,
            { [field.name]: [`Required when ${condField} = ${condValue}`] }
          );
        }
      }
    }

    // 5. Validate compare — cross-field comparison rules
    const compareRules = schema.compare ?? [];
    for (const rule of compareRules) {
      const leftRaw = data[rule.left];
      const rightRaw = data[rule.right];

      // Skip if either field is absent (presence is enforced by required/requiredIf)
      if (leftRaw === undefined || leftRaw === null || rightRaw === undefined || rightRaw === null) continue;

      // Resolve typed values for comparison
      const leftField = schema.fields.find(f => f.name === rule.left);
      const rightField = schema.fields.find(f => f.name === rule.right);
      const fieldType = leftField?.type ?? rightField?.type ?? 'string';

      let leftVal: number | string;
      let rightVal: number | string;

      if (fieldType === 'date' || fieldType === 'datetime') {
        leftVal = new Date(leftRaw as string).getTime();
        rightVal = new Date(rightRaw as string).getTime();
      } else if (fieldType === 'number') {
        leftVal = Number(leftRaw);
        rightVal = Number(rightRaw);
      } else {
        leftVal = String(leftRaw);
        rightVal = String(rightRaw);
      }

      let passed = true;
      switch (rule.op) {
        case 'gt':  passed = leftVal > rightVal;  break;
        case 'gte': passed = leftVal >= rightVal; break;
        case 'lt':  passed = leftVal < rightVal;  break;
        case 'lte': passed = leftVal <= rightVal; break;
        case 'eq':  passed = leftVal === rightVal; break;
        case 'neq': passed = leftVal !== rightVal; break;
      }

      if (!passed) {
        const defaultMsg = `Field '${rule.left}' must be ${rule.op} '${rule.right}'.`;
        throw new ValidationError(rule.errorMessage ?? defaultMsg);
      }
    }
  }
}

