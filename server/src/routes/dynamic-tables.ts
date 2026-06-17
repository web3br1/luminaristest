import { Router } from 'express';
import {
  listTables,
  getTable,
  getTableData,
  createTableData,
  updateTableData,
  deleteTableData,
  batchDeleteTableData,
  resolveRelations,
  syncPreset,
} from '@/controllers/dynamicTablesController';

const router = Router();

// /api/dynamic-tables
router.get('/', listTables);
router.post('/lookup', resolveRelations);
// Admin-only: additively evolve an installed table's schema from its preset module.
// Declared before the /:tableId param routes so it is not captured as a table id.
router.post('/sync-preset', syncPreset);

// /api/dynamic-tables/:tableId
router.get('/:tableId', getTable);

// /api/dynamic-tables/:tableId/data
router.get('/:tableId/data', getTableData);
router.post('/:tableId/data', createTableData);

// Bulk soft-delete. Declared BEFORE /:tableId/data/:dataId so 'batch-delete'
// is not captured as a dataId param.
router.post('/:tableId/data/batch-delete', batchDeleteTableData);

// /api/dynamic-tables/:tableId/data/:dataId
router.put('/:tableId/data/:dataId', updateTableData);
router.delete('/:tableId/data/:dataId', deleteTableData);

export default router;
