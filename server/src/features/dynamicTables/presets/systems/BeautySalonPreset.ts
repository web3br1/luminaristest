import type { ITableSchema } from '../../models/DynamicTable.model';
import { createTableFromModule } from '../../utils/TableFactory';
import { customerModule } from '../modules/people/CustomerModule';
import { serviceModule } from '../modules/service/ServiceModule';
import { productModule, productUnitModule } from '../modules/product/ProductModule';
import { salesModule } from '../modules/finance/SalesModule';
import { saleItemsMixedModule } from '../modules/finance/SalesItemsMixed';
import { stockMovementsModule } from '../modules/inventory/StockMovementsModule';
import { appointmentsModule } from '../modules/planning/AppointmentsModule';
import { goalsModule } from '../modules/business/GoalsModule';
import { reportsModule } from '../modules/business/ReportsModule';
import { campaignsModule } from '../modules/business/CampaignsModule';
import { expensesModule } from '../modules/finance/ExpensesModule';
import { suppliersModule } from '../modules/people/SuppliersModule';
import { otherRevenuesModule } from '../modules/finance/OtherRevenuesModule';
import { financialBaselinesModule } from '../modules/finance/FinancialBaselinesModule';
import { commissionsModule } from '../modules/finance/CommissionsModule';

/**
 * @description
 * A complete and robust ERP preset for beauty salon chains, optimized for BI, scalability, and governance.
 * Supports multiple units, customer management (LGPD), appointments, detailed inventory, sales, full financials,
 * strategic goals, and granular auditing.
 *
 * @version 4.0
 * @author Business Intelligence & Strategy Team
 * @updated 2025-07-07
 */
const BeautySalonPreset = {
  key: 'beautySalon',
  name: 'Advanced Beauty Salon ERP',
  description: 'Complete management solution for salons with scheduling, inventory, sales, financials, and marketing.',
  tables: {
    customers: createTableFromModule(customerModule),
    suppliers: createTableFromModule(suppliersModule),
    services: createTableFromModule(serviceModule),
    products: createTableFromModule(productModule),
    productUnits: createTableFromModule(productUnitModule),
    appointments: createTableFromModule(appointmentsModule),
    sales: createTableFromModule(salesModule),
    // Defaulta para mixed; o instalador trocará conforme capacidades
    saleItems: createTableFromModule(saleItemsMixedModule),
    goals: createTableFromModule(goalsModule),
    reports: createTableFromModule(reportsModule),
    campaigns: createTableFromModule(campaignsModule),
    expenses: createTableFromModule(expensesModule),
    otherRevenues: createTableFromModule(otherRevenuesModule),
    financialBaselines: createTableFromModule(financialBaselinesModule),
    stockMovements: createTableFromModule(stockMovementsModule),
    commissions: createTableFromModule(commissionsModule),
  },
};

export default BeautySalonPreset;
