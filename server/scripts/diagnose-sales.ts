/**
 * Script de Diagnóstico de Vendas
 * 
 * Analisa todas as vendas no banco de dados e aplica os mesmos filtros
 * do ProfitKpiProcessor para identificar problemas e discrepâncias.
 */

import { PrismaClient } from '../generated/prisma/index';

const prisma = new PrismaClient();

// =============================================================================
// CONFIGURAÇÃO
// =============================================================================

const period: 'month' | 'year' = 'month';
const requireFinalized = true;
const requirePaid = true;
const statusField = 'status';
const paymentStatusField = 'paymentStatus';
const revenueAmountField = 'totalAmount';
const revenueDateField = 'date';
const excludeStatuses: string[] = ['Cancelled'];

// =============================================================================
// TIPOS
// =============================================================================

interface SaleRecord {
  id: string;
  data: Record<string, any>;
  status: string;
  paymentStatus: string;
  amount: number;
  rawAmount: any;
  date: Date | null;
  rawDate: any;
  periodKey: string | null;
  included: boolean;
  reason: string;
  dateDebug?: any;
}

// =============================================================================
// FUNÇÕES AUXILIARES
// =============================================================================

function getPeriodKey(date: Date, period: 'month' | 'year'): string {
  if (period === 'year') {
    return `${date.getFullYear()}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

// =============================================================================
// FUNÇÃO PRINCIPAL
// =============================================================================

async function diagnoseSales() {
  console.log('🔍 DIAGNÓSTICO DE VENDAS\n');
  console.log('='.repeat(80));
  console.log('');

  try {
    // 1. Buscar usuário
    console.log('📋 Buscando usuário...');
    const users = await prisma.user.findMany({ take: 1 });
    if (users.length === 0) {
      console.error('❌ Nenhum usuário encontrado no banco de dados');
      return;
    }
    const userId = users[0].id;
    console.log(`   ✅ Usuário encontrado: ${userId}`);
    console.log('');

    // 2. Buscar tabela de vendas
    console.log('📋 Buscando tabela de vendas...');
    const salesTable = await prisma.dynamicTable.findFirst({
      where: {
        userId,
        category: 'finance',
        OR: [
          { name: 'Sales' },
          { name: 'Vendas' },
          { name: 'sales' },
        ],
      },
    });

    if (!salesTable) {
      console.error('❌ Tabela de vendas não encontrada');
      console.log('   Buscando todas as tabelas disponíveis...');
      const allTables = await prisma.dynamicTable.findMany({
        where: { userId },
        select: { id: true, name: true, category: true },
      });
      if (allTables.length === 0) {
        console.log('   Nenhuma tabela encontrada para este usuário');
      } else {
        console.log('   Tabelas disponíveis:');
        allTables.forEach(t => {
          console.log(`     - ${t.name} (${t.category})`);
        });
      }
      return;
    }

    console.log(`   ✅ Tabela encontrada: ${salesTable.name} (ID: ${salesTable.id})`);
    console.log('');

    // 3. Buscar todos os dados da tabela
    console.log('📊 Buscando registros de vendas...');
    const salesData = await prisma.dynamicTableData.findMany({
      where: {
        dynamicTableId: salesTable.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`   ✅ ${salesData.length} registros encontrados`);
    console.log('');

    // 4. Processar cada venda
    const now = new Date();
    const currentPeriodKey = getPeriodKey(now, period);
    const prevPeriodKey = (() => {
      if (period === 'year') return `${now.getFullYear() - 1}`;
      const prev = new Date(now);
      prev.setMonth(prev.getMonth() - 1);
      return getPeriodKey(prev, period);
    })();

    console.log('📅 Períodos:');
    console.log(`   Período atual: ${currentPeriodKey}`);
    console.log(`   Período anterior: ${prevPeriodKey}`);
    console.log('');

    const sales: SaleRecord[] = [];
    let totalRevenue = 0;
    let totalRevenuePrevPeriod = 0;
    let rowsIncluded = 0;
    let rowsSkippedExcluded = 0;
    let rowsSkippedNotFinalized = 0;
    let rowsSkippedNotPaid = 0;
    let rowsSkippedInvalidAmount = 0;
    let rowsSkippedInvalidDate = 0;
    let rowsSkippedWrongPeriod = 0;

    console.log('🔍 Processando vendas...\n');

    for (const row of salesData) {
      const data = (row.data as Record<string, any>) || {};
      const rowStatus = String(data[statusField] || '');
      const rowPaymentStatus = String(data[paymentStatusField] || '');
      const rawAmountValue = data[revenueAmountField];
      const rowAmount = Number(rawAmountValue ?? 0);
      const rawDate = data[revenueDateField];
      const date = rawDate ? new Date(rawDate) : null;

      let reason = '';
      let included = false;
      let periodKey: string | null = null;

      // Skip excluded statuses
      if (statusField) {
        const st = rowStatus.toLowerCase();
        if (excludeStatuses.some((s) => st === String(s).toLowerCase())) {
          rowsSkippedExcluded++;
          reason = `Excluded status: ${rowStatus}`;
          sales.push({
            id: row.id,
            data,
            status: rowStatus,
            paymentStatus: rowPaymentStatus,
            amount: rowAmount,
            rawAmount: rawAmountValue,
            date,
            rawDate,
            periodKey: null,
            included: false,
            reason,
          });
          continue;
        }
      }

      // Require Finalized status if enabled
      if (requireFinalized && statusField) {
        const st = rowStatus.toLowerCase();
        if (st !== 'finalized') {
          rowsSkippedNotFinalized++;
          reason = `Not finalized: ${rowStatus}`;
          sales.push({
            id: row.id,
            data,
            status: rowStatus,
            paymentStatus: rowPaymentStatus,
            amount: rowAmount,
            rawAmount: rawAmountValue,
            date,
            rawDate,
            periodKey: null,
            included: false,
            reason,
          });
          continue;
        }
      }

      // Require Paid payment status if enabled
      if (requirePaid && paymentStatusField) {
        const paymentStatus = rowPaymentStatus.toLowerCase();
        if (paymentStatus !== 'paid' && paymentStatus !== 'pago') {
          rowsSkippedNotPaid++;
          reason = `Not paid: ${rowPaymentStatus}`;
          sales.push({
            id: row.id,
            data,
            status: rowStatus,
            paymentStatus: rowPaymentStatus,
            amount: rowAmount,
            rawAmount: rawAmountValue,
            date,
            rawDate,
            periodKey: null,
            included: false,
            reason,
          });
          continue;
        }
      }

      // Validate amount
      if (!Number.isFinite(rowAmount) || rowAmount <= 0) {
        rowsSkippedInvalidAmount++;
        reason = `Invalid amount: ${rowAmount}`;
        sales.push({
          id: row.id,
          data,
          status: rowStatus,
          paymentStatus: rowPaymentStatus,
          amount: rowAmount,
          rawAmount: rawAmountValue,
          date,
          rawDate,
          periodKey: null,
          included: false,
          reason,
        });
        continue;
      }

      // Validate date
      if (!date || !isFinite(date.getTime())) {
        rowsSkippedInvalidDate++;
        reason = `Invalid date: ${rawDate}`;
        sales.push({
          id: row.id,
          data,
          status: rowStatus,
          paymentStatus: rowPaymentStatus,
          amount: rowAmount,
          rawAmount: rawAmountValue,
          date,
          rawDate,
          periodKey: null,
          included: false,
          reason,
        });
        continue;
      }

      // Calculate period key
      periodKey = getPeriodKey(date, period);

      // Date debug info
      const dateDebug = {
        rawDate,
        dateISO: date.toISOString(),
        dateLocal: date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hours: date.getHours(),
        periodKey,
        currentPeriodKey,
        prevPeriodKey,
      };

      // Check period
      if (periodKey === currentPeriodKey) {
        totalRevenue += rowAmount;
        rowsIncluded++;
        included = true;
        reason = `Included (current period: ${periodKey})`;
      } else if (periodKey === prevPeriodKey) {
        totalRevenuePrevPeriod += rowAmount;
        included = true;
        reason = `Included (previous period: ${periodKey})`;
      } else {
        rowsSkippedWrongPeriod++;
        reason = `Wrong period: ${periodKey} (expected: ${currentPeriodKey} or ${prevPeriodKey})`;
      }

      sales.push({
        id: row.id,
        data,
        status: rowStatus,
        paymentStatus: rowPaymentStatus,
        amount: rowAmount,
        rawAmount: rawAmountValue,
        date,
        rawDate,
        periodKey,
        included,
        reason,
        dateDebug,
      });
    }

    // =============================================================================
    // RELATÓRIO
    // =============================================================================

    console.log('='.repeat(80));
    console.log('📊 RELATÓRIO DE DIAGNÓSTICO');
    console.log('='.repeat(80));
    console.log('');

    // Resumo geral
    console.log('📈 RESUMO GERAL:');
    console.log(`   Total de vendas no banco: ${salesData.length}`);
    console.log(`   Vendas processadas: ${sales.length}`);
    console.log(`   Vendas incluídas (período atual): ${rowsIncluded}`);
    console.log(`   Vendas incluídas (período anterior): ${sales.filter(s => s.included && s.periodKey === prevPeriodKey).length}`);
    console.log(`   Receita total (período atual): ${formatCurrency(totalRevenue)}`);
    console.log(`   Receita total (período anterior): ${formatCurrency(totalRevenuePrevPeriod)}`);
    console.log('');

    // Estatísticas de exclusão
    console.log('🚫 VENDAS EXCLUÍDAS:');
    console.log(`   Por status excluído: ${rowsSkippedExcluded}`);
    console.log(`   Por não finalizada: ${rowsSkippedNotFinalized}`);
    console.log(`   Por não paga: ${rowsSkippedNotPaid}`);
    console.log(`   Por valor inválido: ${rowsSkippedInvalidAmount}`);
    console.log(`   Por data inválida: ${rowsSkippedInvalidDate}`);
    console.log(`   Por período errado: ${rowsSkippedWrongPeriod}`);
    console.log('');

    // Análise por status
    console.log('📋 ANÁLISE POR STATUS:');
    const statusCounts: Record<string, number> = {};
    const paymentStatusCounts: Record<string, number> = {};
    sales.forEach(s => {
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
      paymentStatusCounts[s.paymentStatus] = (paymentStatusCounts[s.paymentStatus] || 0) + 1;
    });
    console.log('   Status:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`     - ${status}: ${count}`);
    });
    console.log('   Payment Status:');
    Object.entries(paymentStatusCounts).forEach(([status, count]) => {
      console.log(`     - ${status}: ${count}`);
    });
    console.log('');

    // Vendas incluídas (detalhadas)
    console.log('✅ VENDAS INCLUÍDAS (PERÍODO ATUAL):');
    const includedSales = sales.filter(s => s.included && s.periodKey === currentPeriodKey);
    if (includedSales.length === 0) {
      console.log('   Nenhuma venda incluída no período atual');
    } else {
      includedSales.forEach((s, idx) => {
        console.log(`   ${idx + 1}. ID: ${s.id}`);
        console.log(`      Valor: ${formatCurrency(s.amount)} (raw: ${JSON.stringify(s.rawAmount)})`);
        console.log(`      Status: ${s.status} | Payment: ${s.paymentStatus}`);
        console.log(`      Data: ${s.rawDate} → ${s.dateDebug?.dateLocal || 'N/A'}`);
        console.log(`      Período: ${s.periodKey}`);
        console.log('');
      });
    }
    console.log('');

    // Vendas excluídas (detalhadas)
    console.log('❌ VENDAS EXCLUÍDAS:');
    const excludedSales = sales.filter(s => !s.included);
    if (excludedSales.length === 0) {
      console.log('   Nenhuma venda excluída');
    } else {
      excludedSales.forEach((s, idx) => {
        console.log(`   ${idx + 1}. ID: ${s.id}`);
        console.log(`      Valor: ${formatCurrency(s.amount)} (raw: ${JSON.stringify(s.rawAmount)})`);
        console.log(`      Status: ${s.status} | Payment: ${s.paymentStatus}`);
        console.log(`      Data: ${s.rawDate} → ${s.dateDebug?.dateLocal || s.date?.toLocaleString('pt-BR') || 'N/A'}`);
        console.log(`      Período: ${s.periodKey || 'N/A'}`);
        console.log(`      Motivo: ${s.reason}`);
        console.log('');
      });
    }
    console.log('');

    // Análise de valores
    console.log('💰 ANÁLISE DE VALORES:');
    const zeroAmountSales = sales.filter(s => s.amount === 0);
    const nullAmountSales = sales.filter(s => s.rawAmount == null || s.rawAmount === undefined);
    const invalidAmountSales = sales.filter(s => !Number.isFinite(s.amount) || s.amount <= 0);
    console.log(`   Vendas com valor zero: ${zeroAmountSales.length}`);
    console.log(`   Vendas com valor null: ${nullAmountSales.length}`);
    console.log(`   Vendas com valor inválido: ${invalidAmountSales.length}`);
    if (zeroAmountSales.length > 0) {
      console.log('   Exemplos de vendas com valor zero:');
      zeroAmountSales.slice(0, 3).forEach(s => {
        console.log(`     - ID: ${s.id}, Status: ${s.status}, Payment: ${s.paymentStatus}, Raw: ${JSON.stringify(s.rawAmount)}`);
      });
    }
    console.log('');

    // Análise de períodos
    console.log('📅 ANÁLISE DE PERÍODOS:');
    const periodCounts: Record<string, number> = {};
    sales.forEach(s => {
      if (s.periodKey) {
        periodCounts[s.periodKey] = (periodCounts[s.periodKey] || 0) + 1;
      }
    });
    Object.entries(periodCounts).sort().forEach(([period, count]) => {
      const isCurrent = period === currentPeriodKey;
      const isPrev = period === prevPeriodKey;
      const marker = isCurrent ? ' (ATUAL)' : isPrev ? ' (ANTERIOR)' : ' (OUTRO)';
      console.log(`   ${period}: ${count} vendas${marker}`);
    });
    console.log('');

    // Problemas identificados
    console.log('⚠️  PROBLEMAS IDENTIFICADOS:');
    const problems: string[] = [];
    
    if (totalRevenue < 1000) {
      problems.push(`Receita muito baixa: ${formatCurrency(totalRevenue)} (esperado: > R$ 1.000,00)`);
    }
    
    if (rowsIncluded === 0) {
      problems.push('Nenhuma venda incluída no período atual');
    }
    
    if (rowsSkippedNotFinalized > 0) {
      problems.push(`${rowsSkippedNotFinalized} vendas excluídas por não estarem finalizadas`);
    }
    
    if (rowsSkippedNotPaid > 0) {
      problems.push(`${rowsSkippedNotPaid} vendas excluídas por não estarem pagas`);
    }
    
    if (rowsSkippedWrongPeriod > 0) {
      problems.push(`${rowsSkippedWrongPeriod} vendas excluídas por estarem em período diferente`);
    }
    
    if (zeroAmountSales.length > 0) {
      problems.push(`${zeroAmountSales.length} vendas com valor zero`);
    }

    if (problems.length === 0) {
      console.log('   ✅ Nenhum problema identificado');
    } else {
      problems.forEach((p, idx) => {
        console.log(`   ${idx + 1}. ${p}`);
      });
    }
    console.log('');

    // Recomendações
    console.log('💡 RECOMENDAÇÕES:');
    if (rowsSkippedNotFinalized > 0) {
      console.log('   - Verificar se as vendas Draft devem ser finalizadas');
    }
    if (rowsSkippedNotPaid > 0) {
      console.log('   - Verificar se as vendas devem ter paymentStatus="Paid"');
    }
    if (rowsSkippedWrongPeriod > 0) {
      console.log('   - Verificar se as datas das vendas estão corretas (timezone)');
    }
    if (totalRevenue < 1000) {
      console.log('   - Verificar se há mais vendas que deveriam estar no período atual');
      console.log('   - Verificar se os valores das vendas estão corretos');
    }
    console.log('');

    console.log('='.repeat(80));
    console.log('✅ Diagnóstico concluído!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Erro ao executar diagnóstico:', error);
    if (error instanceof Error) {
      console.error('   Mensagem:', error.message);
      console.error('   Stack:', error.stack);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Executar
diagnoseSales().catch(console.error);

