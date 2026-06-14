/**
 * CRM demo seed — populates the CRM screens with volume test data.
 *
 * - Idempotent: every seeded record is tagged `data.__demo = true`; a re-run
 *   deletes prior demo rows first, so it never duplicates.
 * - Creates the `crmAccounts` / `crmContacts` tables for the user if missing
 *   (the CRM module is selectable and may not be installed).
 * - Writes directly via Prisma (bypasses the rule engine) — intended for dev only.
 *
 * Usage:  cd server && node scripts/seed-crm-demo.js [--email=user@x] [--leads=80]
 *         (default email: testuser@luminaris.test)
 */
const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const EMAIL = args.email || process.env.SEED_EMAIL || 'testuser@luminaris.test';
const N_ACCOUNTS = Number(args.accounts || 15);
const N_CONTACTS = Number(args.contacts || 45);
const N_LEADS = Number(args.leads || 80);
const N_PROPOSALS = Number(args.proposals || 45);

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const chance = (p) => Math.random() < p;
const daysFromNow = (d) => new Date(Date.now() + d * 86400000).toISOString();

const COMPANIES = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Soylent', 'Hooli', 'Stark', 'Wayne', 'Wonka', 'Cyberdyne', 'Tyrell', 'Pied Piper', 'Massive Dynamic', 'Aperture', 'Black Mesa', 'Nakatomi', 'Oscorp', 'Gekko & Co', 'Vandelay', 'Prestige'];
const SUFFIX = ['Ltda', 'S.A.', 'ME', 'Tech', 'Group', 'Brasil'];
const SEGMENTS = ['SaaS', 'Varejo', 'Indústria', 'Saúde', 'Educação', 'Serviços', 'Agro', 'Logística'];
const SIZES = ['Micro', 'Small', 'Medium', 'Large', 'Enterprise'];
const CITIES = [['São Paulo', 'SP'], ['Rio de Janeiro', 'RJ'], ['Belo Horizonte', 'MG'], ['Curitiba', 'PR'], ['Porto Alegre', 'RS'], ['Recife', 'PE'], ['Salvador', 'BA']];
const FIRST = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karina', 'Lucas', 'Mariana', 'Nelson', 'Olívia', 'Paulo', 'Renata', 'Sérgio', 'Tatiana', 'Vinícius'];
const LAST = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Costa', 'Almeida', 'Lima', 'Carvalho', 'Rocha'];
const JOBS = ['CEO', 'CTO', 'Gerente de Compras', 'Diretor Comercial', 'Analista', 'Coordenador', 'Head de Marketing', 'Founder'];
const BUYING_ROLES = ['Decision Maker', 'Influencer', 'Champion', 'Gatekeeper', 'User'];
const SOURCES = ['LinkedIn', 'Indicação', 'Google Ads', 'Evento', 'Inbound', 'Cold Call', 'Webinar', 'Parceiro'];
const BANT3 = ['Low', 'Medium', 'High'];
const TIMING = ['Urgent', 'Short', 'Medium', 'Long'];
const LEAD_STATUS = ['Open', 'Open', 'Open', 'Open', 'Won', 'Lost', 'Disqualified']; // weighted to Open
const CURRENCIES = ['BRL', 'BRL', 'BRL', 'USD', 'EUR'];
const PROP_STATUS = ['Draft', 'Sent', 'Sent', 'Accepted', 'Rejected', 'Expired'];
const ACT_TYPES = ['note', 'call', 'email', 'stage_change'];

const ACCOUNTS_SCHEMA = {
  defaultDisplayField: 'name',
  fields: [
    { name: 'name', label: 'Account Name', type: 'string', required: true },
    { name: 'segment', label: 'Segment', type: 'string' },
    { name: 'size', label: 'Size', type: 'select', options: SIZES },
    { name: 'website', label: 'Website', type: 'string' },
    { name: 'taxId', label: 'CPF/CNPJ', type: 'string' },
    { name: 'city', label: 'City', type: 'string' },
    { name: 'state', label: 'State', type: 'string' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
};
const CONTACTS_SCHEMA = {
  defaultDisplayField: 'name',
  fields: [
    { name: 'name', label: 'Contact Name', type: 'string', required: true },
    { name: 'email', label: 'Email', type: 'string' },
    { name: 'phone', label: 'Phone', type: 'string' },
    { name: 'jobTitle', label: 'Job Title', type: 'string' },
    { name: 'role', label: 'Buying Role', type: 'select', options: BUYING_ROLES },
    { name: 'accountId', label: 'Account', type: 'string' },
    { name: 'leadId', label: 'Lead', type: 'string' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
};

async function getTable(userId, internalName) {
  return prisma.dynamicTable.findFirst({ where: { userId, internalName } });
}
async function ensureTable(userId, internalName, name, schema) {
  let t = await getTable(userId, internalName);
  if (!t) {
    t = await prisma.dynamicTable.create({ data: { userId, name, internalName, category: 'leads', schema } });
    console.log(`  + tabela criada: ${internalName} (${t.id})`);
  }
  return t;
}
async function clearDemo(tableId) {
  const rows = await prisma.dynamicTableData.findMany({ where: { dynamicTableId: tableId } });
  const ids = rows.filter((r) => r.data && r.data.__demo === true).map((r) => r.id);
  if (ids.length) await prisma.dynamicTableData.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}
async function createRow(tableId, data) {
  const r = await prisma.dynamicTableData.create({ data: { dynamicTableId: tableId, data: { ...data, __demo: true } } });
  return r.id;
}
async function createMany(tableId, records) {
  if (!records.length) return;
  await prisma.dynamicTableData.createMany({ data: records.map((d) => ({ dynamicTableId: tableId, data: { ...d, __demo: true } })) });
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) throw new Error(`Usuário não encontrado: ${EMAIL}`);
  const userId = user.id;
  console.log(`🌱 Seed CRM para ${EMAIL}`);

  const [leadsT, stagesT, pipesT, propsT, actsT, unitsT] = await Promise.all([
    getTable(userId, 'leads'),
    getTable(userId, 'leadStages'),
    getTable(userId, 'leadPipelines'),
    getTable(userId, 'leadProposals'),
    getTable(userId, 'leadActivities'),
    getTable(userId, 'units'),
  ]);
  for (const [k, t] of Object.entries({ leads: leadsT, leadStages: stagesT, leadPipelines: pipesT, leadProposals: propsT, leadActivities: actsT })) {
    if (!t) throw new Error(`Tabela '${k}' não existe para o usuário — instale o Core/CRM primeiro.`);
  }

  const units = unitsT ? await prisma.dynamicTableData.findMany({ where: { dynamicTableId: unitsT.id } }) : [];
  const unitId = units[0]?.id || null;
  const pipes = await prisma.dynamicTableData.findMany({ where: { dynamicTableId: pipesT.id } });
  if (!pipes.length) throw new Error('Nenhum pipeline configurado.');
  const pipe = pipes[0];
  const stages = (await prisma.dynamicTableData.findMany({ where: { dynamicTableId: stagesT.id } }))
    .filter((s) => String(s.data.pipelineId) === pipe.id)
    .sort((a, b) => (Number(a.data.order) || 0) - (Number(b.data.order) || 0));
  if (!stages.length) throw new Error('Pipeline sem etapas.');

  const accountsT = await ensureTable(userId, 'crmAccounts', 'CRM Accounts', ACCOUNTS_SCHEMA);
  const contactsT = await ensureTable(userId, 'crmContacts', 'CRM Contacts', CONTACTS_SCHEMA);

  let removed = 0;
  for (const t of [leadsT, propsT, actsT, accountsT, contactsT]) removed += await clearDemo(t.id);
  console.log(`  limpou ${removed} registros demo anteriores`);

  // Accounts
  const accountIds = [];
  for (let i = 0; i < N_ACCOUNTS; i++) {
    const [city, state] = pick(CITIES);
    const name = `${pick(COMPANIES)} ${pick(SUFFIX)}`;
    accountIds.push(await createRow(accountsT.id, {
      name, segment: pick(SEGMENTS), size: pick(SIZES),
      website: `https://${name.toLowerCase().replace(/[^a-z]/g, '')}.com.br`,
      taxId: `${randInt(10, 99)}.${randInt(100, 999)}.${randInt(100, 999)}/0001-${randInt(10, 99)}`,
      city, state, unitId,
    }));
  }

  // Leads (spread across stages)
  const leadIds = [];
  for (let i = 0; i < N_LEADS; i++) {
    const stage = stages[i % stages.length];
    const status = pick(LEAD_STATUS);
    const hasProp = chance(0.55);
    leadIds.push(await createRow(leadsT.id, {
      leadName: `${pick(COMPANIES)} ${pick(SUFFIX)}`,
      source: pick(SOURCES), score: randInt(10, 98), status, unitId,
      pipelineId: pipe.id, stageId: stage.id,
      bantBudget: pick(BANT3), bantAuthority: pick(BANT3), bantNeed: pick(BANT3), bantTiming: pick(TIMING),
      email: `contato${i}@empresa.com`, phone: `+55 11 9${randInt(1000, 9999)}-${randInt(1000, 9999)}`,
      lastContactAt: daysFromNow(-randInt(1, 40)),
      nextActionAt: chance(0.5) ? daysFromNow(randInt(1, 21)) : undefined,
      latestProposalAmount: hasProp ? randInt(5, 400) * 1000 : undefined,
      latestProposalCurrency: hasProp ? pick(CURRENCIES) : undefined,
      latestProposalWinProbability: hasProp ? randInt(10, 90) : undefined,
    }));
  }

  // Contacts (linked to accounts + some to leads)
  const contacts = [];
  for (let i = 0; i < N_CONTACTS; i++) {
    contacts.push({
      name: `${pick(FIRST)} ${pick(LAST)}`,
      email: `pessoa${i}@empresa.com`,
      phone: `+55 21 9${randInt(1000, 9999)}-${randInt(1000, 9999)}`,
      jobTitle: pick(JOBS), role: pick(BUYING_ROLES),
      accountId: pick(accountIds), leadId: chance(0.5) ? pick(leadIds) : undefined,
    });
  }
  await createMany(contactsT.id, contacts);

  // Proposals (linked to leads)
  const proposals = [];
  for (let i = 0; i < N_PROPOSALS; i++) {
    proposals.push({
      leadId: pick(leadIds), amount: randInt(5, 400) * 1000, currency: pick(CURRENCIES),
      winProbability: randInt(10, 95), status: pick(PROP_STATUS),
      estimatedCloseDate: daysFromNow(randInt(-20, 60)),
    });
  }
  await createMany(propsT.id, proposals);

  // Activities (notes/calls/emails + future meetings for the calendar)
  const activities = [];
  for (const leadId of leadIds) {
    const n = randInt(1, 3);
    for (let j = 0; j < n; j++) {
      activities.push({ leadId, type: pick(ACT_TYPES), message: `Interação registrada #${j + 1}`, payload: {} });
    }
    if (chance(0.4)) {
      const when = daysFromNow(randInt(1, 30)); // future → shows on calendar
      activities.push({ leadId, type: 'meeting', message: 'Reunião agendada', payload: { when } });
    }
  }
  await createMany(actsT.id, activities);

  console.log(`✅ Seed concluída:`);
  console.log(`   accounts=${accountIds.length}  leads=${leadIds.length}  contacts=${contacts.length}  proposals=${proposals.length}  activities=${activities.length}`);
}

main()
  .catch((e) => { console.error('❌', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
