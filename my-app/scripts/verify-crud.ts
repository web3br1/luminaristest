// Native fetch used


// Config
const BASE_URL = 'http://localhost:3001/api';
const EMAIL = 'teste@teste.com';
const PASSWORD = 'Teste@123';

// Tables to Test
const TABLES = [
    'Units', 'Products', 'Services', 'Employees', 'Suppliers', 'Customers',
    'Sales', 'Sale Items', 'Stock Movements', 'Expenses', 'Appointments', 'Leads'
];

async function main() {
    console.log('🚀 Starting CRUD Verification...');

    // 1. Login
    console.log('🔑 Logging in...');
    let token = '';
    try {
        const res = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: EMAIL, password: PASSWORD })
        });
        if (!res.ok) throw new Error(`Login failed: ${res.status}`);
        const data = await res.json();
        console.log('🔍 Login Response:', JSON.stringify(data, null, 2));
        token = data.data?.token; // Correct path from response
        console.log('✅ Logged in!');
    } catch (e) {
        console.error('❌ Login Error:', e);
        process.exit(1);
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
    console.log('🔍 Request Headers:', JSON.stringify(headers, null, 2));

    // 2. Get Table IDs
    console.log('📋 Resolving Table IDs...');
    const tableMap: Record<string, string> = {};
    try {
        const res = await fetch(`${BASE_URL}/dynamic-tables`, { headers });
        const data = await res.json();
        // console.log('🔍 Tables Raw Response (First 2 items):', JSON.stringify(Array.isArray(data) ? data.slice(0, 2) : data, null, 2));
        const tables = Array.isArray(data) ? data : (data.data || []);

        for (const t of TABLES) {
            const found = tables.find((tbl: { name?: string; internalName?: string; id?: string }) => tbl.name === t || tbl.internalName === t);
            if (found) tableMap[t] = found.id;
            else console.warn(`⚠️ Table not found: ${t}`);
        }
    } catch (e) {
        console.error('❌ Failed to fetch tables:', e);
        process.exit(1);
    }

    // 3. CRUD Loop
    for (const tableName of TABLES) {
        const tableId = tableMap[tableName];
        if (!tableId) continue;

        console.log(`\n🧪 Testing ${tableName} (${tableId})...`);

        // A. CREATE
        let createdId = '';
        try {
            const payload = getPayload(tableName);
            const res = await fetch(`${BASE_URL}/dynamic-tables/${tableId}/data`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ data: payload })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(JSON.stringify(json));
            createdId = json.data?.id || json.id;
            console.log(`   ✅ CREATE Success (ID: ${createdId})`);
        } catch (e) {
            console.error(`   ❌ CREATE Failed:`, e);
            continue; // Skip rest if create fails
        }

        // B. READ
        try {
            const res = await fetch(`${BASE_URL}/dynamic-tables/${tableId}/data/${createdId}`, { headers });
            if (!res.ok) throw new Error(`Status ${res.status}`);
            console.log(`   ✅ READ Success`);
        } catch (e) {
            console.error(`   ❌ READ Failed:`, e);
        }

        // C. UPDATE
        try {
            const updatePayload = getUpdatePayload(tableName);
            const res = await fetch(`${BASE_URL}/dynamic-tables/${tableId}/data/${createdId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ data: updatePayload })
            });
            if (!res.ok) throw new Error(`Status ${res.status}`);
            console.log(`   ✅ UPDATE Success`);
        } catch (e) {
            console.error(`   ❌ UPDATE Failed:`, e);
        }

        // D. DELETE
        try {
            const res = await fetch(`${BASE_URL}/dynamic-tables/${tableId}/data/${createdId}`, {
                method: 'DELETE',
                headers
            });
            if (!res.ok) throw new Error(`Status ${res.status}`);
            console.log(`   ✅ DELETE Success`);
        } catch (e) {
            console.error(`   ❌ DELETE Failed:`, e);
        }
    }
}

function getPayload(table: string): unknown {
    const ts = Date.now();
    switch (table) {
        case 'Units': return { name: `Test Unit ${ts}`, active: true };
        case 'Products': return { name: `Test Product ${ts}`, sku: `TEST-${ts}`, salePrice: 10, usageType: 'Sale' };
        case 'Services': return { name: `Test Service ${ts}`, price: 50, isActive: true };
        case 'Employees': return { name: `Test Emp ${ts}`, email: `emp${ts}@test.com`, isActive: true };
        case 'Suppliers': return { supplierName: `Test Sup ${ts}`, active: true };
        case 'Customers': return { name: `Test Cust ${ts}`, email: `cust${ts}@test.com` };
        case 'Sales': return { date: new Date().toISOString(), status: 'Draft', paymentStatus: 'Pending' };
        case 'Leads': return { leadName: `Test Lead ${ts}`, status: 'Novo' };
        case 'Expenses': return { description: `Test Exp ${ts}`, amount: 100, date: new Date().toISOString(), status: 'Pending' };
        case 'Appointments': return { startTime: new Date().toISOString(), endTime: new Date(Date.now() + 3600000).toISOString(), status: 'Scheduled', notes: 'Test' };
        // Dependent tables need IDs, hard to test in isolation without specific foreign keys. 
        // For verify script, populate FKs if possible or skip.
        // Skipping complex FK tables for simple generated payload: 'Sale Items', 'Stock Movements', 'Product Units'
        // Actually, we can try to fetch a valid FK from previous steps if we stored them, but for now let's use generic placeholders or skip specific validation heavy tables.
        default: return { name: `Generic Test ${ts}` };
    }
}

function getUpdatePayload(table: string): unknown {
    return { notes: 'Updated by Script', active: false };
}

main();
