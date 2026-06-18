import type { Request, Response } from 'express';
import { z } from 'zod';
import { handleApiError } from '@/lib/apiUtils';
import { getUserContextFromRequest } from '@/lib/authUtils';
import { getFactory } from '@/lib/factory';
// eslint-disable-next-line no-restricted-imports -- DEBT: prisma.* em controller, viola contrato §2 (só Repository). Backlog: docs/architecture/lint-layer-gate.md. Remover ao migrar para repository.
import prisma from '@/lib/prisma';
import logger from '@/lib/logger';

const QuickCreationSchema = z.object({
  mode: z.literal('quick').optional(),
  suiteKey: z.string().min(1, 'suiteKey é obrigatório'),
});

const CustomCreationSchema = z.object({
  mode: z.literal('custom'),
  presetKey: z.string().min(1, 'presetKey é obrigatório'),
  removedTables: z.array(z.string()).optional(),
  addedFields: z.record(z.string(), z.array(z.unknown())).optional(),
});

const UnifiedCreationSchema = z.union([QuickCreationSchema, CustomCreationSchema]);

import { UnauthorizedError, ValidationError } from '@/lib/errors';
import { ISchemaField, ITableSchema } from '@/features/dynamicTables/models/DynamicTable.model';
import { getPresetByKey } from '@/features/dynamicTables/presets/PresetManager';
import { CoreSystemPreset, tablePresetSuites, PresetSuite, PresetTableDefinition } from '@/features/dynamicTables/presets';
import { DYNAMIC_TABLE_CATEGORY_CONFIG, DynamicTableCategoryConfig } from '@/features/dynamicTables/models/TableCategories';
import { presetService } from '@/features/dynamicTables/services/PresetService';
import { CreateDynamicTableDto } from '@/features/dynamicTables/dtos/DynamicTable.dto';

export async function createDashboard(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const validationResult = UnifiedCreationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Payload inválido',
        details: validationResult.error.issues,
      });
    }

    const payload = validationResult.data as z.infer<typeof UnifiedCreationSchema>;

    const dynamicTableService = getFactory().getDynamicTableService();
    const existingTables = await dynamicTableService.getTablesForUser(ctx.id);

    if (existingTables.length > 0) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Setup já foi concluído. Este usuário já possui tabelas.',
      });
    }

    if (payload.mode === 'custom') {
      return await handleCustomCreation(
        ctx.id,
        payload.presetKey,
        payload.removedTables || [],
        payload.addedFields || {},
        res
      );
    } else {
      return await handleQuickCreation(
        ctx.id,
        payload.suiteKey,
        res
      );
    }
  } catch (error) {
    return handleApiError(error, res);
  }
}

async function handleCustomCreation(
  userId: string,
  presetKey: string,
  removedTables: string[],
  addedFields: Record<string, unknown[]>,
  res: Response
) {
  try {
    const originalPreset = await getPresetByKey(presetKey);

    const finalTablesConfig: Record<string, PresetTableDefinition> = {
      ...CoreSystemPreset.tables,
      ...originalPreset.tables,
    };

    const coreTableKeys = Object.keys(CoreSystemPreset.tables);

    for (const tableKey of removedTables) {
      if (!coreTableKeys.includes(tableKey)) {
        delete finalTablesConfig[tableKey];
      }
    }

    if (addedFields) {
      for (const tableKey in addedFields) {
        const fields = addedFields[tableKey] || [];
        // Validação forte de cada campo adicionado usando o DTO de criação (schema.fields)
        for (const f of fields) {
          const single = CreateDynamicTableDto.shape.schema.safeParse({ fields: [f] });
          if (!single.success) {
            res.status(400).json({ error: `Campo inválido em addedFields para a tabela '${tableKey}'.`, details: single.error.flatten() });
            return;
          }
        }
        if (finalTablesConfig[tableKey] && fields.length > 0) {
          const tableSchema = finalTablesConfig[tableKey].schema;
          if (tableSchema) {
            tableSchema.fields.push(...(fields as ISchemaField[]));
          }
        }
      }
    }

    if (Object.keys(finalTablesConfig).length === 0) {
      res.status(400).json({
        error: 'A configuração final não pode estar vazia. Nenhuma tabela foi selecionada.',
      });
      return;
    }

    const service = getFactory().getDynamicTableService();

    const finalPayload: { tables: Record<string, PresetTableDefinition & { internalName: string }> } = { tables: {} };
    for (const internalName in finalTablesConfig) {
      const tableData = finalTablesConfig[internalName];
      finalPayload.tables[internalName] = {
        name: tableData.name || internalName.replace(/_/g, ' '),
        category: tableData.category,
        schema: tableData.schema,
        internalName: internalName,
      };
    }
    // Verificar dependências quebradas localmente antes de chamar o service
    for (const key in finalPayload.tables) {
      const def = finalPayload.tables[key];
      if (!def?.schema?.fields) continue;
      for (const field of def.schema.fields as ISchemaField[]) {
        if (field.type === 'relation' && field.relation?.targetTable) {
          const target = field.relation.targetTable;
          if (target.startsWith('@@PRESET_TABLE_KEY::')) {
            const targetKey = target.replace('@@PRESET_TABLE_KEY::', '');
            if (!finalPayload.tables[targetKey]) {
              res.status(400).json({ error: `Configuração inválida: relação '${key}.${field.name}' aponta para presetKey inexistente '${targetKey}'.` });
              return;
            }
          }
        }
      }
    }

    const result = await service.installPresetAsSystem(userId, finalPayload);

    return res.status(201).json({
      success: true,
      message: 'Dashboard criado com sucesso usando configurações customizadas!',
      data: result,
    });
  } catch (error) {
    return handleApiError(error, res);
  }
}

async function handleQuickCreation(
  userId: string,
  suiteKey: string,
  res: Response
) {
  try {
    let selectedPreset: PresetSuite | undefined;
    for (const category in tablePresetSuites) {
      const categoryPresets = tablePresetSuites[category as keyof typeof tablePresetSuites];
      if (Object.prototype.hasOwnProperty.call(categoryPresets, suiteKey)) {
        selectedPreset = categoryPresets[suiteKey as keyof typeof categoryPresets];
        break;
      }
    }

    if (!selectedPreset) {
      res.status(404).json({ error: `Preset com chave '${suiteKey}' não encontrado.` });
      return;
    }

    const service = getFactory().getDynamicTableService();
    // Mescla Core + Business em um único preset para permitir referências cruzadas via @@PRESET_TABLE_KEY::
    const mergedPreset = {
      tables: {
        ...CoreSystemPreset.tables,
        ...(selectedPreset.tables || {}),
      },
    };

    // Validate analytics configurations if present
    const analyticsConfigs = (selectedPreset as { analytics?: unknown[] }).analytics;
    if (Array.isArray(analyticsConfigs) && analyticsConfigs.length > 0) {
      const { validateConfigurations } = await import('@/features/analytics/services/AnalyticsValidator');
      const tableSchemas = new Map<string, ITableSchema>();

      // Build schema map from preset tables
      for (const [key, table] of Object.entries(mergedPreset.tables)) {
        tableSchemas.set(key, table.schema);
      }

      const validationResult = validateConfigurations(analyticsConfigs as Parameters<typeof validateConfigurations>[0], tableSchemas);
      if (!validationResult.valid) {
        const errorMessages = validationResult.errors.map(e => `${e.field}: ${e.message}`).join('; ');
        res.status(400).json({
          error: `Analytics configuration validation failed: ${errorMessages}`
        });
        return;
      }
    }

    await service.installPresetAsSystem(userId, mergedPreset);

    const coreTableList = Object.keys(CoreSystemPreset.tables);
    const businessTableList = Object.keys(selectedPreset.tables || {});

    return res.status(201).json({
      success: true,
      message: 'Dashboard e tabelas criados com sucesso!',
      data: {
        suiteKey,
        tables: {
          core: coreTableList,
          business: businessTableList,
        },
      },
    });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function getDashboardData(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const dynamicTableService = getFactory().getDynamicTableService();
    const tables = await dynamicTableService.getTablesForUser(ctx.id);
    return res.status(200).json({ success: true, data: tables });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function getDashboardPresets(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const allPresets = presetService.getAllPresetSummaries();
    return res.status(200).json({ success: true, data: allPresets });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function getDashboardPresetByKey(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const { presetKey } = req.params;
    if (!presetKey) throw new ValidationError('Invalid preset key');

    const preset = presetService.getPresetByKey(presetKey);
    if (preset) {
      return res.status(200).json({ success: true, data: preset });
    } else {
      return res.status(404).json({ success: false, message: 'Preset not found.' });
    }
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function getDashboardSidebar(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const repository = getFactory().getDynamicTableRepository();
    const tableCounts = await repository.countTablesByCategory(ctx.id);

    const countsMap = new Map<string, number>();
    for (const item of tableCounts) {
      countsMap.set(item.category, item.count);
    }

    // Get all tables for virtual category calculations
    const allTables = await getFactory().getDynamicTableService().getTablesForUser(ctx.id);

    // Compute counts; include virtual categories
    const sidebarData = DYNAMIC_TABLE_CATEGORY_CONFIG
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(categoryConfig => {
        if (!categoryConfig.isVirtual) {
          return {
            key: categoryConfig.key,
            displayName: categoryConfig.displayName,
            i18nKey: categoryConfig.i18nKey,
            icon: categoryConfig.icon,
            count: countsMap.get(categoryConfig.key) || 0,
          } satisfies DynamicTableCategoryConfig & { count: number };
        }

        // Virtual category (e.g., 'sales'): derive count from source categories and name matching
        const sourceCats = categoryConfig.sourceCategories || [];
        let count = 0;
        if (sourceCats.length > 0) {
          const nameMatchers = (categoryConfig.virtualNameMatchers || []).map(s => s.toLowerCase());
          count = allTables.filter(t => sourceCats.includes(t.category) && (nameMatchers.length === 0 || nameMatchers.includes(t.name.toLowerCase()))).length;
        }

        return {
          key: categoryConfig.key,
          displayName: categoryConfig.displayName,
          i18nKey: categoryConfig.i18nKey,
          icon: categoryConfig.icon,
          count,
        } satisfies DynamicTableCategoryConfig & { count: number };
      });

    return res.status(200).json({ success: true, data: sidebarData });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function deleteUserSystem(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const service = getFactory().getDynamicTableService();
    await service.deleteAllTablesForUser(ctx.id);

    // Clean up stale KnowledgeGraph and orphaned ActionProposals so the agent
    // does not inject references to now-deleted tables into prompts (R27).
    await prisma.knowledgeGraph.deleteMany({ where: { userId: ctx.id } });
    await prisma.actionProposal.deleteMany({ where: { userId: ctx.id } });

    logger.info(`User system reset: tables, KnowledgeGraph, and proposals cleaned for user ${ctx.id}`);

    return res.status(204).end();
  } catch (error) {
    return handleApiError(error, res);
  }
}


