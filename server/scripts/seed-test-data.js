/**
 * Seed de dados de teste para verificação de todos os KPIs do sistema Luminaris.
 * Popula: Sales, SaleItems, Expenses, StockMovements, Appointments,
 *         Products, Services, Customers, Employees, OtherRevenues, Commissions, Campaigns
 */
const { PrismaClient } = require('../generated/prisma');
const p = new PrismaClient();

// ── IDs das tabelas (extraídos do DB) ─────────────────────────────────────────
const T = {
  sales:           'cmqaecoxj0010cinoq6ofj3x4',
  saleItems:       'cmqaecoxk0012cinomest2xj1',
  expenses:        'cmqaecoxl001acinoj1i9km7m',
  stockMovements:  'cmqaecoxm001gcino3n63vgxk',
  appointments:    'cmqaecoxi000ycinoh37ahljj',
  customers:       'cmqaecoxf000ocinovmbd4kx7',
  products:        'cmqaecoxh000ucinor052wbtu',
  services:        'cmqaecoxg000scino1za7ddty',
  otherRevenues:   'cmqaecoxl001ccinowb5mqzkl',
  commissions:     'cmqaecoxn001icino4px18jc8',
  campaigns:       'cmqaecoxl0018cinoqjmwjvaz',
  employees:       'cmqaecoxb0006cinowkobsvba',
  units:           'cmqaecox90004cino973kenql',
};

const UNIT_RECORD_ID = 'cmqaefm2i001mcino5ay3suuu'; // "Main Unit" already seeded

// Helper: create a DynamicTableData record
async function create(tableId, data) {
  return p.dynamicTableData.create({
    data: { dynamicTableId: tableId, data },
    select: { id: true }
  });
}

// Helper: date string for N months ago on a given day
function monthDate(monthsAgo, dayOfMonth = 15) {
  const d = new Date();
  d.setDate(1); // prevent month-overflow when shifting
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(dayOfMonth);
  return d.toISOString().split('T')[0];
}

async function main() {
  console.log('🧹 Clearing existing test data...');
  for (const tableId of [
    T.sales, T.saleItems, T.expenses, T.stockMovements,
    T.appointments, T.customers, T.products, T.services,
    T.otherRevenues, T.commissions, T.campaigns, T.employees,
  ]) {
    await p.dynamicTableData.deleteMany({ where: { dynamicTableId: tableId } });
  }

  // ── Campaigns ───────────────────────────────────────────────────────────────
  console.log('🏷️  Seeding Campaigns...');
  const campaign1 = await create(T.campaigns, { name: 'Summer Promo', channel: 'Social Media', budget: 2000, status: 'Active', startDate: monthDate(2), endDate: monthDate(0) });
  const campaign2 = await create(T.campaigns, { name: 'Loyalty Program', channel: 'Email', budget: 500, status: 'Active', startDate: monthDate(3), endDate: monthDate(0) });

  // ── Customers ───────────────────────────────────────────────────────────────
  console.log('👤 Seeding Customers...');
  const customers = [];
  for (let i = 1; i <= 8; i++) {
    const c = await create(T.customers, { name: `Customer ${i}`, email: `customer${i}@test.com`, phone: `1190000000${i}`, isActive: true });
    customers.push(c.id);
  }

  // ── Employees (needed for serviceEstimatedCost KPI) ─────────────────────────
  console.log('👷 Seeding Employees...');
  const emp1 = await create(T.employees, { name: 'Ana Silva', role: 'Hairdresser', monthlyCost: 4500, isActive: true });
  const emp2 = await create(T.employees, { name: 'Bruno Costa', role: 'Nail Technician', monthlyCost: 3200, isActive: true });
  const emp3 = await create(T.employees, { name: 'Carla Mendes', role: 'Colorist', monthlyCost: 5000, isActive: true });

  // ── Products ────────────────────────────────────────────────────────────────
  console.log('📦 Seeding Products...');
  const prod1 = await create(T.products, { name: 'Shampoo Pro', sku: 'SHP-001', category: 'Hair Care', salePrice: 45.00, costPrice: 18.00, stockQuantity: 100, isActive: true });
  const prod2 = await create(T.products, { name: 'Hair Treatment', sku: 'TRT-001', category: 'Hair Care', salePrice: 85.00, costPrice: 32.00, stockQuantity: 50, isActive: true });
  const prod3 = await create(T.products, { name: 'Nail Polish Set', sku: 'NPL-001', category: 'Nails', salePrice: 35.00, costPrice: 12.00, stockQuantity: 200, isActive: true });

  // ── Services ────────────────────────────────────────────────────────────────
  console.log('💇 Seeding Services...');
  const svc1 = await create(T.services, { name: 'Haircut', category: 'Hair', price: 80.00, duration: 45, isActive: true });
  const svc2 = await create(T.services, { name: 'Hair Coloring', category: 'Hair', price: 250.00, duration: 120, isActive: true });
  const svc3 = await create(T.services, { name: 'Manicure', category: 'Nails', price: 60.00, duration: 60, isActive: true });

  // ── Stock Movements (used by productCostKpis WAC calculation) ──────────────
  console.log('📦 Seeding Stock Movements...');
  await create(T.stockMovements, { productId: prod1.id, unitId: UNIT_RECORD_ID, type: 'In', reason: 'Purchase', quantity: 60, cost: 1080.00, date: monthDate(6), paymentStatus: 'Paid', paymentMethod: 'Pix' });
  await create(T.stockMovements, { productId: prod2.id, unitId: UNIT_RECORD_ID, type: 'In', reason: 'Purchase', quantity: 30, cost: 960.00, date: monthDate(6), paymentStatus: 'Paid', paymentMethod: 'Pix' });
  await create(T.stockMovements, { productId: prod3.id, unitId: UNIT_RECORD_ID, type: 'In', reason: 'Purchase', quantity: 100, cost: 1200.00, date: monthDate(4), paymentStatus: 'Paid', paymentMethod: 'Pix' });
  // More recent stock to extend WAC into current window
  await create(T.stockMovements, { productId: prod1.id, unitId: UNIT_RECORD_ID, type: 'In', reason: 'Purchase', quantity: 40, cost: 720.00, date: monthDate(1), paymentStatus: 'Paid', paymentMethod: 'Pix' });
  await create(T.stockMovements, { productId: prod2.id, unitId: UNIT_RECORD_ID, type: 'In', reason: 'Purchase', quantity: 20, cost: 640.00, date: monthDate(1), paymentStatus: 'Paid', paymentMethod: 'Pix' });

  // ── Appointments ────────────────────────────────────────────────────────────
  console.log('🗓️  Seeding Appointments...');
  for (let i = 0; i < 30; i++) {
    const moAgo = Math.floor(i / 10);
    await create(T.appointments, {
      customerId: customers[i % customers.length],
      serviceId: [svc1.id, svc2.id, svc3.id][i % 3],
      employeeId: [emp1.id, emp2.id, emp3.id][i % 3],
      date: monthDate(moAgo, (i % 27) + 1),
      durationMinutes: [45, 120, 60][i % 3],
      status: i < 25 ? 'Completed' : 'Scheduled',
      totalAmount: [80, 250, 60][i % 3],
      notes: `Appointment ${i + 1}`,
    });
  }

  // ── Sales — 12 months growing trend ─────────────────────────────────────────
  console.log('💰 Seeding Sales (12 months)...');
  const saleIds = [];
  const monthlySalesData = [
    [11, 8500, 6], [10, 9200, 7], [9, 10100, 8], [8, 9800, 7],
    [7, 11200, 9], [6, 10500, 8], [5, 12300, 10], [4, 11800, 9],
    [3, 13500, 11], [2, 14200, 12], [1, 15100, 13], [0, 16500, 14],
  ];

  const employees = [emp1.id, emp2.id, emp3.id];

  for (const [moAgo, totalBudget, numSales] of monthlySalesData) {
    const avgSale = totalBudget / numSales;
    for (let s = 0; s < numSales; s++) {
      const amount = Math.round((avgSale * (0.7 + Math.random() * 0.6)) * 100) / 100;
      const discount = Math.round(amount * 0.05 * 100) / 100;
      const tax = Math.round(amount * 0.08 * 100) / 100;
      const net = Math.round((amount - discount + tax) * 100) / 100;
      // New customers: first 2 sales of each month from months 0-11
      const isNew = s < 2 && moAgo >= 0;
      const isLoyal = s > 3;

      const sale = await create(T.sales, {
        unitId: UNIT_RECORD_ID,
        customerId: customers[s % customers.length],
        date: monthDate(moAgo, (s % 27) + 1),
        dueDate: monthDate(moAgo, Math.min(28, (s % 27) + 15)),
        status: 'Finalized',
        paymentStatus: 'Paid',
        paymentMethod: ['Pix', 'Credit Card', 'Cash'][s % 3],
        subtotal: amount,
        discountAmount: discount,
        taxAmount: tax,
        totalAmount: net,
        channel: ['Direct', 'Online', 'Referral'][s % 3],
        revenueType: s % 4 === 0 ? 'NonOperational' : 'Operational',
        isNewCustomer: isNew,
        isLoyalCustomer: isLoyal,
        campaignId: s % 3 === 0 ? campaign1.id : (s % 5 === 0 ? campaign2.id : null),
        simpleCustomer: false,
      });
      saleIds.push({ id: sale.id, moAgo, amount: net });
    }
  }

  // Pending sales: some overdue (dueDate in past) for Contas a Receber Vencidas
  for (let i = 0; i < 6; i++) {
    const isOverdue = i < 3; // first 3 are overdue
    const sale = await create(T.sales, {
      unitId: UNIT_RECORD_ID,
      customerId: customers[i % customers.length],
      date: monthDate(isOverdue ? 2 : 0, i + 1),
      dueDate: isOverdue ? monthDate(1, i + 5) : monthDate(0, 25), // overdue: 1 mo ago; future: end of month
      status: 'Finalized',
      paymentStatus: 'Pending',
      paymentMethod: 'Credit Card',
      subtotal: 1200,
      discountAmount: 60,
      taxAmount: 96,
      totalAmount: 1236,
      channel: 'Online',
      revenueType: 'Operational',
      isNewCustomer: false,
      isLoyalCustomer: true,
      simpleCustomer: false,
    });
    saleIds.push({ id: sale.id, moAgo: isOverdue ? 2 : 0, amount: 1236 });

  }

  console.log(`   Created ${saleIds.length} sales records`);

  // ── Sale Items — ALL months (so productsProfitMonthly covers recent months) ─
  console.log('🛒 Seeding Sale Items (all months)...');
  const prods = [prod1.id, prod2.id, prod3.id];
  const prodPrices = [45, 85, 35];
  const svcs = [svc1.id, svc2.id, svc3.id];
  const svcPrices = [80, 250, 60];
  const emps = [emp1.id, emp2.id, emp3.id];

  for (const { id: saleId } of saleIds) {
    // Mix: ~60% products, ~40% services
    const isProduct = Math.random() > 0.4;
    if (isProduct) {
      const pIdx = Math.floor(Math.random() * 3);
      const qty = Math.ceil(Math.random() * 3);
      await create(T.saleItems, {
        saleId,
        itemType: 'Product',
        productId: prods[pIdx],
        serviceId: null,
        responsibleEmployeeId: emps[Math.floor(Math.random() * 3)],
        quantity: qty,
        unitPrice: prodPrices[pIdx],
        totalPrice: qty * prodPrices[pIdx],
        discountAmount: 0,
      });
    } else {
      const sIdx = Math.floor(Math.random() * 3);
      await create(T.saleItems, {
        saleId,
        itemType: 'Service',
        productId: null,
        serviceId: svcs[sIdx],
        responsibleEmployeeId: emps[Math.floor(Math.random() * 3)],
        quantity: 1,
        unitPrice: svcPrices[sIdx],
        totalPrice: svcPrices[sIdx],
        discountAmount: 0,
      });
    }
  }

  // ── Expenses — 12 months ─────────────────────────────────────────────────────
  console.log('💸 Seeding Expenses (12 months)...');
  const fixedCats = [
    { cat: 'Rent', monthly: 3500 },
    { cat: 'Personnel', monthly: 8000 },
    { cat: 'Utilities', monthly: 600 },
  ];
  const variableCats = [
    { cat: 'Marketing', monthly: 1200 },
    { cat: 'Supplies', monthly: 800 },
    { cat: 'Maintenance', monthly: 300 },
  ];
  const taxCat = { cat: 'Tax', monthly: 1000 };

  for (let moAgo = 0; moAgo <= 11; moAgo++) {
    // Fixed expenses
    for (const { cat, monthly } of fixedCats) {
      const amount = Math.round(monthly * (0.9 + Math.random() * 0.2) * 100) / 100;
      await create(T.expenses, {
        category: cat,
        description: `${cat} - ${monthDate(moAgo)}`,
        amount,
        date: monthDate(moAgo, 5),
        dueDate: monthDate(moAgo, 10),
        paymentDate: monthDate(moAgo, 8),
        paymentStatus: 'Paid',
        paymentMethod: 'Transfer',
        isPlanned: true,
        expenseType: 'Fixed',
      });
    }
    // Variable expenses — day 4 ensures paymentDate is always before the 12th cutoff of any month
    for (const { cat, monthly } of variableCats) {
      const amount = Math.round(monthly * (0.75 + Math.random() * 0.5) * 100) / 100;
      await create(T.expenses, {
        category: cat,
        description: `${cat} - ${monthDate(moAgo)}`,
        amount,
        date: monthDate(moAgo, 4),
        dueDate: monthDate(moAgo, 10),
        paymentDate: monthDate(moAgo, 4),
        paymentStatus: 'Paid',
        paymentMethod: 'Transfer',
        isPlanned: true,
        expenseType: 'Variable',
      });
    }
    // Tax — day 3
    {
      const amount = Math.round(taxCat.monthly * (0.9 + Math.random() * 0.2) * 100) / 100;
      await create(T.expenses, {
        category: taxCat.cat,
        description: `Tax - ${monthDate(moAgo)}`,
        amount,
        date: monthDate(moAgo, 3),
        dueDate: monthDate(moAgo, 8),
        paymentDate: monthDate(moAgo, 3),
        paymentStatus: 'Paid',
        paymentMethod: 'Transfer',
        isPlanned: true,
        expenseType: 'Tax',
      });
    }
    // Non-recurring every 3 months — category 'Não Recorrente' matches processor keyword
    if (moAgo % 3 === 0) {
      const amount = Math.round((500 + Math.random() * 2000) * 100) / 100;
      await create(T.expenses, {
        category: 'Não Recorrente',
        description: `Equipment purchase - ${monthDate(moAgo)}`,
        amount,
        date: monthDate(moAgo, 2),
        dueDate: monthDate(moAgo, 7),
        paymentDate: monthDate(moAgo, 2),
        paymentStatus: 'Paid',
        paymentMethod: 'Credit Card',
        isPlanned: false,
        expenseType: 'Non-Recurring',
      });
    }
  }

  // Pending expenses (payables) — needed for Contas a Pagar KPIs
  // Some overdue (dueDate in past), some upcoming
  for (let i = 0; i < 6; i++) {
    const isOverdue = i < 3;
    await create(T.expenses, {
      category: i % 2 === 0 ? 'Supplies' : 'Marketing',
      description: `Pending expense ${i + 1}`,
      amount: Math.round((300 + Math.random() * 700) * 100) / 100,
      date: monthDate(isOverdue ? 2 : 0, i + 1),
      dueDate: isOverdue ? monthDate(1, i + 5) : monthDate(0, 25),
      paymentStatus: 'Pending',
      paymentMethod: 'Transfer',
      isPlanned: true,
      expenseType: 'Variable',
    });
  }

  // ── Other Revenues ───────────────────────────────────────────────────────────
  console.log('📊 Seeding Other Revenues...');
  for (let i = 0; i < 6; i++) {
    await create(T.otherRevenues, {
      description: `Other Revenue ${i + 1}`,
      amount: Math.round((200 + Math.random() * 800) * 100) / 100,
      date: monthDate(i),
      category: ['Interest', 'Rental', 'Commission'][i % 3],
      paymentStatus: 'Received',
    });
  }

  // ── Commissions ──────────────────────────────────────────────────────────────
  console.log('💼 Seeding Commissions...');
  for (let i = 0; i < 12; i++) {
    await create(T.commissions, {
      employeeId: employees[i % 3],
      saleId: saleIds[i]?.id || null,
      amount: Math.round((150 + Math.random() * 400) * 100) / 100,
      date: monthDate(i % 4),
      paymentStatus: i < 8 ? 'Paid' : 'Pending',
    });
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const entries = Object.entries(T).filter(([k]) => k !== 'units');
  const counts = await Promise.all(
    entries.map(async ([name, id]) => {
      const count = await p.dynamicTableData.count({ where: { dynamicTableId: id } });
      return `  ${name}: ${count} records`;
    })
  );
  console.log('\n✅ Seed complete! Record counts:');
  counts.forEach(c => console.log(c));
}

main()
  .catch(e => { console.error('❌ Seed failed:', e.message); process.exit(1); })
  .finally(() => p.$disconnect());
