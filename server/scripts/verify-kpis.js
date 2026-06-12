/**
 * KPI Verification Script — fetches all analytics chart endpoints and reports
 * which KPIs have non-zero values.
 */
const http = require('http');

const TOKEN_PLACEHOLDER = '__TOKEN__';
const BASE = 'http://localhost:3001/api/analytics/data?key=';

const ALL_KEYS = [
  'sales.revenueKpis',
  'sales.productCostKpis',
  'sales.profitKpis',
  'sales.cashflowKpis',
  'sales.profitByCustomer',
  'sales.costByCustomer',
  'sales.profitByCampaign',
  'sales.revenueGrossEvolution',
  'sales.revenueNetEvolution',
  'sales.revenueByType',
  'sales.revenueNewVsRecurring',
  'sales.revenueByCustomerTop',
  'sales.revenueByBusinessDay',
  'sales.revenueByChannel',
  'saleItems.typeComparison',
  'saleItems.servicesMonthlyReceived',
  'saleItems.productsMonthlyReceived',
  'saleItems.productsProfitMonthly',
  'saleItems.serviceEstimatedCost',
  'saleItems.serviceEstimatedProfit',
  'saleItems.employeeServiceProfit',
  'expenses.costKpis',
  'expenses.costFixedVsVariable',
  'expenses.costTotalEvolution',
  'expenses.costByCategory',
  'expenses.costPlannedVsUnplanned',
];

function fetch(url, token) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { headers: { Authorization: `Bearer ${token}` } }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('JSON parse error: ' + body.slice(0, 100))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function login() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ email: 'testuser@luminaris.test', password: 'test123' });
    const req = http.request({
      host: 'localhost', port: 3001, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const d = JSON.parse(data);
        resolve(d.data?.token || d.token || '');
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const token = await login();
  if (!token) throw new Error('Login failed — no token returned');
  console.log('✅ Logged in successfully\n');

  const results = {};
  for (const key of ALL_KEYS) {
    const d = await fetch(BASE + encodeURIComponent(key), token);
    if (!d.success) {
      results[key] = { status: 'API_ERR', detail: d.message || d.error || JSON.stringify(d) };
      continue;
    }
    const chartData = d.data || {};
    const inner = chartData.data;
    if (Array.isArray(inner)) {
      // KPI type
      const total = inner.length;
      const zeros = inner
        .filter(k => (k.value === 0 || k.value === null || k.value === undefined) && !k.previousValue)
        .map(k => k.label || k.name || '?');
      results[key] = { status: 'OK', type: 'kpi', total, zeros };
    } else if (inner && typeof inner === 'object') {
      // Chart type
      const datasets = inner.datasets || [];
      const labels = inner.labels || [];
      const totalPts = datasets.reduce((s, ds) => s + (ds.data || []).length, 0);
      const nonzero = datasets.reduce((s, ds) => s + (ds.data || []).filter(v => v && v !== 0).length, 0);
      results[key] = { status: 'OK', type: 'chart', series: datasets.length, labels: labels.length, nonzero, totalPts };
    } else {
      results[key] = { status: 'OK', type: chartData.type || '?', raw: JSON.stringify(inner).slice(0, 80) };
    }
  }

  // Print report
  console.log('='.repeat(72));
  console.log('KPI VERIFICATION REPORT — Luminaris');
  console.log('='.repeat(72));
  let currentGroup = '';
  let okCount = 0;
  for (const [key, r] of Object.entries(results)) {
    const group = key.split('.')[0];
    if (group !== currentGroup) {
      currentGroup = group;
      console.log(`\n--- ${group.toUpperCase()} ---`);
    }
    if (r.status === 'OK') {
      okCount++;
      if (r.type === 'kpi') {
        const nonzero = r.total - r.zeros.length;
        const icon = r.zeros.length === 0 ? '✅' : r.zeros.length < 3 ? '⚠️ ' : '❌';
        const zeroStr = r.zeros.length ? ` | zeros: [${r.zeros.join(', ')}]` : '';
        console.log(`  ${icon} ${key}: ${nonzero}/${r.total} KPIs non-zero${zeroStr}`);
      } else {
        const icon = r.nonzero > 0 ? '✅' : '❌';
        console.log(`  ${icon} ${key}: ${r.series} series, ${r.labels} labels, ${r.nonzero}/${r.totalPts} non-zero pts`);
      }
    } else {
      console.log(`  ❌ ${key}: ${r.status} — ${r.detail}`);
    }
  }
  console.log(`\n${'='.repeat(72)}`);
  console.log(`SUMMARY: ${okCount}/${ALL_KEYS.length} endpoints returned data`);
  console.log('='.repeat(72));
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
