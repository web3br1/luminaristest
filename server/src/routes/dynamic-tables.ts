import { Router } from 'express';
import {
  listTables,
  getTable,
  getTableData,
  createTableData,
  updateTableData,
  deleteTableData,
  resolveRelations,
} from '@/controllers/dynamicTablesController';

const router = Router();

// /api/dynamic-tables
router.get('/', listTables);
router.post('/lookup', resolveRelations);

// /api/dynamic-tables/:tableId
router.get('/:tableId', getTable);

// /api/dynamic-tables/:tableId/data
router.get('/:tableId/data', getTableData);
router.post('/:tableId/data', createTableData);

// /api/dynamic-tables/:tableId/data/:dataId
router.put('/:tableId/data/:dataId', updateTableData);
router.delete('/:tableId/data/:dataId', deleteTableData);

export default router;
