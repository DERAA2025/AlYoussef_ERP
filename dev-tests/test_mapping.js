const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const assert = require('assert');

const dbFile = '/tmp/mapping-test.db';
if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
const sdb = new DatabaseSync(dbFile);
sdb.exec('PRAGMA foreign_keys = ON;');
sdb.exec(fs.readFileSync(__dirname + '/001_initial.sql', 'utf8'));

// ---- dbExecute/dbSelect implementations backed by node:sqlite ----
async function dbExecute(query, values = []) {
  if (query.trim() === 'BEGIN TRANSACTION') { sdb.exec('BEGIN'); return; }
  if (query.trim() === 'COMMIT') { sdb.exec('COMMIT'); return; }
  if (query.trim() === 'ROLLBACK') { sdb.exec('ROLLBACK'); return; }
  const stmt = sdb.prepare(query);
  stmt.run(...values.map(v => (v === undefined ? null : v)));
}
async function dbSelect(query, values = []) {
  const stmt = sdb.prepare(query);
  return stmt.all(...values.map(v => (v === undefined ? null : v)));
}

// Make these visible to the required module (it expects globals of the same name,
// exactly like the real app file where they're plain top-level functions)
global.dbExecute = dbExecute;
global.dbSelect = dbSelect;

const { saveAllToDb, loadAllFromDb } = require('./db-mapping.js');

// ---- Build a realistic sample db object exercising every table & edge case ----
const sample = {
  clients: [
    { id: 'cl1', name: 'شركة الاختبار', type: 'قطاع خاص', contact: 'أحمد', phone: '0100', email: 'a@b.com', notes: '' },
    { id: 'cl2', name: 'جهة حكومية', type: 'جهة حكومية', contact: '', phone: '', email: '', notes: 'ملاحظة' },
  ],
  contracts: [
    {
      id: 'co1', num: 'CTR-001', clientId: 'cl1', type: 'itemized', contractValue: null,
      start: '2026-01-01', end: '2026-12-31', status: 'سارٍ', vat: 14, retention: 5,
      guaranteeType: 'initial', guaranteeMethod: 'deduct', guaranteeRef: '', guaranteeBank: '',
      guaranteeStatus: 'pending', guaranteeAssignId: 'as1', guaranteeExtractId: 'ex1', desc: 'وصف',
      boq: [
        { id: 'boq1', wbs: 'A.01', desc: 'حفر', unit: 'م3', qty: 1000, price: 50 },
        { id: 'boq2', wbs: 'B.01', desc: 'خرسانة', unit: 'م3', qty: 200, price: 900 },
      ],
    },
    {
      id: 'co2', num: 'CTR-002', clientId: 'cl2', type: 'fixed', contractValue: 500000,
      start: '2026-02-01', end: '', status: 'موقوف', vat: 0, retention: 0,
      guaranteeType: 'initial', guaranteeMethod: 'cash', guaranteeRef: '', guaranteeBank: '',
      guaranteeStatus: 'pending', guaranteeAssignId: '', guaranteeExtractId: '', desc: '',
      boq: [],
    },
  ],
  annexes: [
    { id: 'an1', contractId: 'co1', num: 'ANN-1', type: 'value', date: '2026-03-01', value: 20000, newdate: '', status: 'معتمد', desc: '' },
  ],
  assignments: [
    {
      id: 'as1', num: 'ASN-001', contractId: 'co1', desc: 'حفر الأساسات', start: '2026-01-05', end: '2026-03-01',
      status: 'جارٍ', notes: '', retention: 5, retentionFinal: 50, warrantyMonths: 12, vat: 14,
      retentionMethod: 'deduct_first', retentionInstrument: 'cash', retentionRef: '', retentionDueDays: 15,
      retentionPaidStatus: 'pending',
      items: [
        { wbs: 'A.01', desc: 'حفر', unit: 'م3', assignQty: 500, price: 50 },
      ],
    },
  ],
  extracts: [
    {
      id: 'ex1', num: 'EXT-1', assignId: 'as1', type: 'مرحلي', date: '2026-02-01', status: 'مقدم',
      deduction: 5, socialIns: 1, irregular: 0.5, stamps: 0.1, tax: 0, einvoice: '', notes: '',
      value: 5000, completion: 20,
      items: [
        { wbs: 'A.01', desc: 'حفر', unit: 'م3', price: 50, assignQty: 500, prevQty: 0, periodQty: 100, currentQty: 100 },
      ],
    },
  ],
  subcontractors: [
    { id: 'sub1', name: 'مقاول التأسيسات', spec: 'حفر', contact: '', phone: '', notes: '' },
  ],
  subContracts: [
    {
      id: 'sc1', num: 'SUB-1', subId: 'sub1', assignId: 'as1', type: 'boq', value: 20000,
      start: '2026-01-10', end: '', status: 'سارٍ', desc: '',
      items: [{ wbsRef: 'A.01', desc: 'حفر', unit: 'م3', qty: 500, price: 40 }],
      payments: [],
    },
    {
      id: 'sc2', num: 'SUB-2', subId: 'sub1', assignId: '', type: 'lump', value: 10000,
      start: '', end: '', status: 'سارٍ', desc: '',
      items: [],
      payments: [{ assignRef: 'as1', amount: 5000, date: '2026-01-15', status: 'مستحق', notes: '' }],
    },
  ],
  subPayments: [
    { id: 'sp1', subId: 'sub1', contractId: 'sc1', date: '2026-01-20', amount: 5000, method: 'كاش', ref: '', notes: '' },
  ],
  suppliers: [
    { id: 'sup1', name: 'مورد الحديد', type: 'مواد بناء', contact: '', phone: '', notes: '' },
  ],
  purchases: [
    { id: 'pu1', supplierId: 'sup1', type: 'شراء', desc: 'حديد تسليح', unit: 'طن', qty: 10, unitPrice: 25000, amount: 250000, date: '2026-01-12', chargeType: 'assignment', chargeRef: 'as1', invoice: 'INV-1', notes: '' },
  ],
  supplierPayments: [
    { id: 'spy1', supplierId: 'sup1', date: '2026-01-25', amount: 100000, method: 'تحويل بنكي', ref: 'REF1', notes: '' },
  ],
  wbsCodes: [
    { id: 'w1', code: 'A.01', desc: 'أعمال الحفر والردم', cat: 'أعمال ترابية' },
  ],
  company: { name: 'اليوسف للمقاولات', reg: '12345', phone: '', address: '' },
};

(async () => {
  await saveAllToDb(sample);

  const reloaded = {};
  await loadAllFromDb(reloaded);

  // ---- Field-by-field comparisons (normalizing null/undefined/'' as equivalent) ----
  const norm = v => (v === undefined || v === null ? '' : v);

  function compareEntity(label, original, reloadedArr, fields, keyField = 'id') {
    assert.strictEqual(reloadedArr.length, original.length, `${label}: row count mismatch`);
    for (const o of original) {
      const r = reloadedArr.find(x => x[keyField] === o[keyField]);
      assert.ok(r, `${label}: missing row ${o[keyField]}`);
      for (const f of fields) {
        const ov = norm(o[f]), rv = norm(r[f]);
        assert.strictEqual(String(rv), String(ov), `${label}.${f} mismatch for ${o[keyField]}: expected ${ov}, got ${rv}`);
      }
    }
  }

  compareEntity('clients', sample.clients, reloaded.clients, ['name', 'type', 'contact', 'phone', 'email', 'notes']);
  compareEntity('contracts', sample.contracts, reloaded.contracts,
    ['num', 'clientId', 'type', 'contractValue', 'start', 'end', 'status', 'vat', 'retention',
      'guaranteeType', 'guaranteeMethod', 'guaranteeStatus', 'guaranteeAssignId', 'guaranteeExtractId', 'desc']);
  compareEntity('annexes', sample.annexes, reloaded.annexes, ['contractId', 'num', 'type', 'date', 'value', 'status']);
  compareEntity('assignments', sample.assignments, reloaded.assignments,
    ['num', 'contractId', 'desc', 'status', 'retention', 'retentionFinal', 'warrantyMonths', 'vat', 'retentionMethod']);
  compareEntity('extracts', sample.extracts, reloaded.extracts,
    ['num', 'assignId', 'type', 'status', 'deduction', 'socialIns', 'irregular', 'stamps', 'tax', 'value', 'completion']);
  compareEntity('subcontractors', sample.subcontractors, reloaded.subcontractors, ['name', 'spec']);
  compareEntity('subContracts', sample.subContracts, reloaded.subContracts, ['num', 'subId', 'assignId', 'type', 'value', 'status']);
  compareEntity('subPayments', sample.subPayments, reloaded.subPayments, ['subId', 'contractId', 'date', 'amount', 'method']);
  compareEntity('suppliers', sample.suppliers, reloaded.suppliers, ['name', 'type']);
  compareEntity('purchases', sample.purchases, reloaded.purchases, ['supplierId', 'type', 'desc', 'amount', 'chargeType', 'chargeRef']);
  compareEntity('supplierPayments', sample.supplierPayments, reloaded.supplierPayments, ['supplierId', 'date', 'amount', 'method']);
  compareEntity('wbsCodes', sample.wbsCodes, reloaded.wbsCodes, ['code', 'desc', 'cat']);

  // ---- Nested items ----
  const co1 = reloaded.contracts.find(c => c.id === 'co1');
  assert.strictEqual(co1.boq.length, 2, 'contract co1 should have 2 BOQ rows');
  assert.strictEqual(co1.boq[0].wbs, 'A.01', 'BOQ order/content mismatch (row 0)');
  assert.strictEqual(co1.boq[1].wbs, 'B.01', 'BOQ order/content mismatch (row 1)');
  assert.strictEqual(Number(co1.boq[1].price), 900, 'BOQ price mismatch');

  const as1 = reloaded.assignments.find(a => a.id === 'as1');
  assert.strictEqual(as1.items.length, 1);
  assert.strictEqual(Number(as1.items[0].assignQty), 500);

  const ex1 = reloaded.extracts.find(e => e.id === 'ex1');
  assert.strictEqual(ex1.items.length, 1);
  assert.strictEqual(Number(ex1.items[0].periodQty), 100);
  assert.strictEqual(Number(ex1.items[0].prevQty), 0);

  const sc1 = reloaded.subContracts.find(s => s.id === 'sc1');
  assert.strictEqual(sc1.items.length, 1);
  assert.strictEqual(Number(sc1.items[0].price), 40);

  const sc2 = reloaded.subContracts.find(s => s.id === 'sc2');
  assert.strictEqual(sc2.payments.length, 1);
  assert.strictEqual(Number(sc2.payments[0].amount), 5000);
  assert.strictEqual(sc2.assignId, '', 'sub-contract with no linked assignment should round-trip as empty string');

  // ---- company (singleton) ----
  assert.strictEqual(reloaded.company.name, 'اليوسف للمقاولات');
  assert.strictEqual(reloaded.company.reg, '12345');

  // ---- Overall financial total sanity check (mirrors how the real app would verify a migration) ----
  const sumField = (arr, f) => arr.reduce((s, x) => s + (parseFloat(x[f]) || 0), 0);
  const beforeContractVat = sumField(sample.contracts, 'vat');
  const afterContractVat = sumField(reloaded.contracts, 'vat');
  assert.strictEqual(afterContractVat, beforeContractVat, 'aggregate VAT field mismatch after round-trip');

  console.log('ALL MAPPING TESTS PASSED ✔');
})().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
