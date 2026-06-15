/**
 * COMPLETE KPIs TEST SUITE
 *
 * Tests all KPIs from all tables that have analytics using REAL database data:
 * - Revenue (17 KPIs from Sales)
 * - Costs (14 KPIs from Expenses)
 * - Profits (18 KPIs from Sales + Expenses)
 * - Cashflow (11 KPIs from Sales + Expenses)
 *
 * This script connects to the database, fetches real data, and uses the actual
 * KPI processors to validate calculations.
 */

import { PrismaClient } from '../generated/prisma/index';
import { revenueKpiProcessor } from '../src/features/analytics/kpis/revenue';
import { costKpiProcessor } from '../src/features/analytics/kpis/cost';
import { profitKpiProcessor } from '../src/features/analytics/kpis/profit';
import { cashflowKpiProcessor } from '../src/features/analytics/kpis/cashflow';
import type { TableDataRow } from '../src/features/analytics/core';

const prisma = new PrismaClient();

// =============================================================================
// HELPERS
// =============================================================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

// =============================================================================
// DATABASE FETCHING
// =============================================================================

async function fetchUser() {
  const users = await prisma.user.findMany({ take: 1 });
  if (users.length === 0) {
    throw new Error('No user found in database');
  }
  return users[0];
}

async function fetchTableData(
  user: { id: string },
  tableName: string
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dev diagnostic script
): Promise<{ table: any; schema: any; rows: TableDataRow[] }> {
  const table = await prisma.dynamicTable.findFirst({
    where: {
      userId: user.id,
      OR: [
        { name: tableName },
        { name: tableName.toLowerCase() },
      ],
    },
  });

  if (!table) {
    throw new Error(`Table ${tableName} not found`);
  }

  const data = await prisma.dynamicTableData.findMany({
    where: { dynamicTableId: table.id },
  });

  const rows: TableDataRow[] = data.map((row) => ({
    id: row.id,
    data: (row.data as Record<string, unknown>) || {},
  }));

  return {
    table,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dev diagnostic script
    schema: (table.schema as any) || { fields: [] },
    rows,
  };
}

// =============================================================================
// TEST FUNCTIONS
// =============================================================================

async function testRevenueKPIs(
  user: { id: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dev diagnostic script
  salesTable: any,
  salesRows: TableDataRow[]
) {
  console.log('\n💰 REVENUE KPIs TEST (17 KPIs from Sales table)\n');
  console.log(`   Found ${salesRows.length} sales records\n`);

  const context = {
    table: salesTable,
    schema: salesTable.schema || {},
    rows: salesRows,
    params: {
      amountField: 'totalAmount',
      discountField: 'discountAmount',
      taxField: 'taxAmount',
      dateField: 'date',
      statusField: 'status',
      paymentStatusField: 'paymentStatus',
      customerIdField: 'customerId',
      isNewCustomerField: 'isNewCustomer',
      isLoyalCustomerField: 'isLoyalCustomer',
      revenueTypeField: 'revenueType',
      excludeStatuses: ['Cancelled'],
      monthsWindow: 12,
      period: 'month' as const,
    },
  };

  const results = await revenueKpiProcessor(context);

  console.log('📊 BACKEND RESULTS:');
  results.forEach((kpi) => {
    const value = kpi.name.includes('%') || kpi.name.includes('Percent')
      ? formatPercent(kpi.value)
      : formatCurrency(kpi.value);
    console.log(`   ${kpi.name}: ${value}`);
  });

  return results;
}

async function testCostKPIs(
  user: { id: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dev diagnostic script
  expensesTable: any,
  expensesRows: TableDataRow[]
) {
  console.log('\n💸 COST KPIs TEST (14 KPIs from Expenses table)\n');
  console.log(`   Found ${expensesRows.length} expense records\n`);

  const context = {
    table: expensesTable,
    schema: expensesTable.schema || {},
    rows: expensesRows,
    params: {
      amountField: 'amount',
      categoryField: 'category',
      paymentDateField: 'paymentDate',
      isPlannedField: 'isPlanned',
      paymentStatusField: 'paymentStatus',
      monthsWindow: 12,
      period: 'month' as const,
    },
  };

  const results = await costKpiProcessor(context);

  console.log('📊 BACKEND RESULTS:');
  results.forEach((kpi) => {
    const value = kpi.name.includes('%') || kpi.name.includes('Percent')
      ? formatPercent(kpi.value)
      : formatCurrency(kpi.value);
    console.log(`   ${kpi.name}: ${value}`);
  });

  return results;
}

async function testProfitKPIs(
  user: { id: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dev diagnostic script
  salesTable: any,
  salesRows: TableDataRow[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dev diagnostic script
  expensesTable: any,
  expensesRows: TableDataRow[]
) {
  console.log('\n📈 PROFIT KPIs TEST (18 KPIs from Sales + Expenses)\n');
  console.log(`   Found ${salesRows.length} sales and ${expensesRows.length} expense records\n`);

  const context = {
    table: salesTable,
    schema: salesTable.schema || { fields: [] },
    rows: salesRows,
    params: {
      amountField: 'totalAmount',
      discountField: 'discountAmount',
      taxField: 'taxAmount',
      dateField: 'date',
      statusField: 'status',
      paymentStatusField: 'paymentStatus',
      revenueAmountField: 'totalAmount',
      revenueDateField: 'date',
      costSourceTableKey: '@@PRESET_TABLE_KEY::expenses',
      expenseAmountField: 'amount',
      expenseDateField: 'paymentDate',
      expenseCategoryField: 'category',
      expensePaymentStatusField: 'paymentStatus',
      period: 'month' as const,
      requireFinalized: true,
      requirePaid: true,
      requireExpensePaid: true,
    },
    fetchByPresetTableKey: async (key: string) => {
      const result = await fetchTableData(user, key.replace('@@PRESET_TABLE_KEY::', ''));
      return {
        table: result.table,
        schema: result.schema,
        rows: result.rows,
      };
    },
  };

  const results = await profitKpiProcessor(context);

  console.log('📊 BACKEND RESULTS:');
  results.forEach((kpi) => {
    const value = kpi.name.includes('%') || kpi.name.includes('Margem')
      ? formatPercent(kpi.value)
      : formatCurrency(kpi.value);
    console.log(`   ${kpi.name}: ${value}`);
  });

  return results;
}

async function testCashflowKPIs(
  user: { id: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dev diagnostic script
  salesTable: any,
  salesRows: TableDataRow[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dev diagnostic script
  expensesTable: any,
  expensesRows: TableDataRow[]
) {
  console.log('\n💵 CASHFLOW KPIs TEST (11 KPIs from Sales + Expenses)\n');
  console.log(`   Found ${salesRows.length} sales and ${expensesRows.length} expense records\n`);

  const context = {
    table: salesTable,
    schema: salesTable.schema || { fields: [] },
    rows: salesRows,
    params: {
      amountField: 'totalAmount',
      dateField: 'date',
      statusField: 'status',
      paymentStatusField: 'paymentStatus',
      revenueAmountField: 'totalAmount',
      revenueDateField: 'date',
      costSourceTableKey: '@@PRESET_TABLE_KEY::expenses',
      expenseAmountField: 'amount',
      expenseDateField: 'paymentDate',
      expensePaymentStatusField: 'paymentStatus',
      period: 'month' as const,
      requireFinalized: true,
      requirePaid: true,
      requireExpensePaid: true,
    },
    fetchByPresetTableKey: async (key: string) => {
      const result = await fetchTableData(user, key.replace('@@PRESET_TABLE_KEY::', ''));
      return {
        table: result.table,
        schema: result.schema,
        rows: result.rows,
      };
    },
  };

  const results = await cashflowKpiProcessor(context);

  console.log('📊 BACKEND RESULTS:');
  results.forEach((kpi) => {
    const value = kpi.name.includes('%') || kpi.name.includes('Índice')
      ? formatPercent(kpi.value)
      : formatCurrency(kpi.value);
    console.log(`   ${kpi.name}: ${value}`);
  });

  return results;
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function runAllTests() {
  try {
    console.log('🚀 STARTING COMPLETE KPIs TEST SUITE\n');
    console.log('📊 Testing all 60 KPIs using REAL database data\n');
    console.log('='.repeat(80));

    // Fetch user
    const user = await fetchUser();
    console.log(`\n✅ User found: ${user.email || user.id}\n`);

    // Fetch tables
    console.log('📋 Fetching tables...');
    const { table: salesTable, rows: salesRows } = await fetchTableData(user, 'sales');
    console.log(`   ✅ Sales table: ${salesRows.length} records`);

    const { table: expensesTable, rows: expensesRows } = await fetchTableData(user, 'expenses');
    console.log(`   ✅ Expenses table: ${expensesRows.length} records\n`);

    // Run tests
    const revenueResults = await testRevenueKPIs(user, salesTable, salesRows);
    const costResults = await testCostKPIs(user, expensesTable, expensesRows);
    const profitResults = await testProfitKPIs(user, salesTable, salesRows, expensesTable, expensesRows);
    const cashflowResults = await testCashflowKPIs(user, salesTable, salesRows, expensesTable, expensesRows);

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('\n🎉 TEST SUITE COMPLETED\n');

    console.log('📊 FINAL SUMMARY:');
    console.log(`   Revenue KPIs:  ${revenueResults.length} KPIs`);
    console.log(`   Cost KPIs:    ${costResults.length} KPIs`);
    console.log(`   Profit KPIs:  ${profitResults.length} KPIs`);
    console.log(`   Cashflow KPIs: ${cashflowResults.length} KPIs`);
    console.log(`   📈 TOTAL:      ${revenueResults.length + costResults.length + profitResults.length + cashflowResults.length} KPIs tested`);

    console.log('\n✅ All KPI categories tested successfully!');
    console.log('💡 Review the results above to verify calculations are correct.');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('\n❌ Test suite failed:', errorMessage);
    if (errorStack) {
      console.error(errorStack);
    }
    // Use globalThis.process for Node.js compatibility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- globalThis.process not in type definitions
    if (typeof globalThis !== 'undefined' && (globalThis as any).process?.exit) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- globalThis.process not in type definitions
      (globalThis as any).process.exit(1);
    } else {
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

runAllTests();

