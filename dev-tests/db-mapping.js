// ============================================================
// SQLITE PERSISTENCE MAPPING — shared logic
// This file's exported functions are pasted verbatim into dist/index.html.
// It depends only on two async primitives, dbExecute(sql, params) and
// dbSelect(sql, params), which the host environment must provide:
//   - in the real app: backed by the Tauri SQL plugin (plugin:sql|execute/select)
//   - in this test file: backed by Node's built-in node:sqlite module
// Keeping the mapping logic identical between both means testing it here
// gives real confidence about the version that ships in the app.
// ============================================================

async function saveAllToDb(dbObj){
  await dbExecute('BEGIN TRANSACTION');
  try{
    // ---- wipe (children first) ----
    for(const t of [
      'extract_items','extracts','assignment_items',
      'sub_contract_payment_schedule','sub_contract_items','sub_payments','sub_contracts',
      'assignments','annexes','contract_boq_items','contracts',
      'purchases','supplier_payments','suppliers','subcontractors','clients',
      'wbs_codes','company_settings'
    ]) await dbExecute(`DELETE FROM ${t}`);

    // ---- clients ----
    for(const c of dbObj.clients||[])
      await dbExecute(
        `INSERT INTO clients (id,name,type,contact,phone,email,notes) VALUES (?,?,?,?,?,?,?)`,
        [c.id,c.name,c.type,c.contact,c.phone,c.email,c.notes]);

    // ---- contracts + boq items ----
    for(const c of dbObj.contracts||[]){
      await dbExecute(
        `INSERT INTO contracts (id,num,client_id,type,contract_value,start,end,status,vat,retention,
          guarantee_type,guarantee_method,guarantee_ref,guarantee_bank,guarantee_status,
          guarantee_assign_id,guarantee_extract_id,desc)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [c.id,c.num,c.clientId,c.type,c.contractValue,c.start,c.end,c.status,c.vat,c.retention,
         c.guaranteeType,c.guaranteeMethod,c.guaranteeRef,c.guaranteeBank,c.guaranteeStatus,
         c.guaranteeAssignId||null,c.guaranteeExtractId||null,c.desc]);
      let i=0;
      for(const r of c.boq||[]){
        await dbExecute(
          `INSERT INTO contract_boq_items (id,contract_id,sort_order,wbs,desc,unit,qty,price)
           VALUES (?,?,?,?,?,?,?,?)`,
          [r.id,c.id,i++,r.wbs,r.desc,r.unit,r.qty,r.price]);
      }
    }

    // ---- annexes ----
    for(const a of dbObj.annexes||[])
      await dbExecute(
        `INSERT INTO annexes (id,contract_id,num,type,date,value,newdate,status,desc)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [a.id,a.contractId,a.num,a.type,a.date,a.value,a.newdate,a.status,a.desc]);

    // ---- assignments + items ----
    for(const a of dbObj.assignments||[]){
      await dbExecute(
        `INSERT INTO assignments (id,num,contract_id,desc,start,end,status,notes,retention,
          retention_final,warranty_months,vat,retention_method,retention_instrument,
          retention_ref,retention_due_days,retention_paid_status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [a.id,a.num,a.contractId,a.desc,a.start,a.end,a.status,a.notes,a.retention,
         a.retentionFinal,a.warrantyMonths,a.vat,a.retentionMethod,a.retentionInstrument,
         a.retentionRef,a.retentionDueDays,a.retentionPaidStatus]);
      let i=0;
      for(const it of a.items||[]){
        await dbExecute(
          `INSERT INTO assignment_items (assignment_id,sort_order,wbs,desc,unit,assign_qty,price)
           VALUES (?,?,?,?,?,?,?)`,
          [a.id,i++,it.wbs,it.desc,it.unit,it.assignQty,it.price]);
      }
    }

    // ---- extracts + items ----
    for(const e of dbObj.extracts||[]){
      await dbExecute(
        `INSERT INTO extracts (id,num,assignment_id,type,date,status,deduction,social_ins,
          irregular,stamps,tax,einvoice,notes,value,completion)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [e.id,e.num,e.assignId,e.type,e.date,e.status,e.deduction,e.socialIns,
         e.irregular,e.stamps,e.tax,e.einvoice,e.notes,e.value,e.completion]);
      let i=0;
      for(const it of e.items||[]){
        await dbExecute(
          `INSERT INTO extract_items (extract_id,sort_order,wbs,desc,unit,price,assign_qty,
            prev_qty,period_qty,current_qty)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [e.id,i++,it.wbs,it.desc,it.unit,it.price,it.assignQty,it.prevQty,it.periodQty,it.currentQty]);
      }
    }

    // ---- subcontractors ----
    for(const s of dbObj.subcontractors||[])
      await dbExecute(
        `INSERT INTO subcontractors (id,name,spec,contact,phone,notes) VALUES (?,?,?,?,?,?)`,
        [s.id,s.name,s.spec,s.contact,s.phone,s.notes]);

    // ---- sub_contracts + items + payment schedule ----
    for(const sc of dbObj.subContracts||[]){
      await dbExecute(
        `INSERT INTO sub_contracts (id,num,sub_id,assignment_id,type,value,start,end,status,desc)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [sc.id,sc.num,sc.subId,sc.assignId||null,sc.type,sc.value,sc.start,sc.end,sc.status,sc.desc]);
      let i=0;
      for(const it of sc.items||[]){
        await dbExecute(
          `INSERT INTO sub_contract_items (sub_contract_id,sort_order,wbs_ref,desc,unit,qty,price)
           VALUES (?,?,?,?,?,?,?)`,
          [sc.id,i++,it.wbsRef,it.desc,it.unit,it.qty,it.price]);
      }
      let j=0;
      for(const p of sc.payments||[]){
        await dbExecute(
          `INSERT INTO sub_contract_payment_schedule (sub_contract_id,sort_order,assign_ref,amount,date,status,notes)
           VALUES (?,?,?,?,?,?,?)`,
          [sc.id,j++,p.assignRef,p.amount,p.date,p.status,p.notes]);
      }
    }

    // ---- sub_payments (actual recorded payments) ----
    for(const p of dbObj.subPayments||[])
      await dbExecute(
        `INSERT INTO sub_payments (id,sub_id,contract_id,date,amount,method,ref,notes)
         VALUES (?,?,?,?,?,?,?,?)`,
        [p.id,p.subId,p.contractId||null,p.date,p.amount,p.method,p.ref,p.notes]);

    // ---- suppliers ----
    for(const s of dbObj.suppliers||[])
      await dbExecute(
        `INSERT INTO suppliers (id,name,type,contact,phone,notes) VALUES (?,?,?,?,?,?)`,
        [s.id,s.name,s.type,s.contact,s.phone,s.notes]);

    // ---- purchases ----
    for(const p of dbObj.purchases||[])
      await dbExecute(
        `INSERT INTO purchases (id,supplier_id,type,desc,unit,qty,unit_price,amount,date,
          charge_type,charge_ref,invoice,notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [p.id,p.supplierId,p.type,p.desc,p.unit,p.qty,p.unitPrice,p.amount,p.date,
         p.chargeType,p.chargeRef,p.invoice,p.notes]);

    // ---- supplier_payments ----
    for(const p of dbObj.supplierPayments||[])
      await dbExecute(
        `INSERT INTO supplier_payments (id,supplier_id,date,amount,method,ref,notes)
         VALUES (?,?,?,?,?,?,?)`,
        [p.id,p.supplierId,p.date,p.amount,p.method,p.ref,p.notes]);

    // ---- wbs_codes ----
    for(const w of dbObj.wbsCodes||[])
      await dbExecute(`INSERT INTO wbs_codes (id,code,desc,cat) VALUES (?,?,?,?)`,
        [w.id,w.code,w.desc,w.cat]);

    // ---- company_settings (singleton row) ----
    const co=dbObj.company||{};
    await dbExecute(
      `INSERT INTO company_settings (id,name,reg,phone,address) VALUES (1,?,?,?,?)`,
      [co.name,co.reg,co.phone,co.address]);

    await dbExecute('COMMIT');
  }catch(err){
    await dbExecute('ROLLBACK');
    throw err;
  }
}

async function loadAllFromDb(target){
  const clients=await dbSelect('SELECT * FROM clients');
  target.clients=clients.map(c=>({id:c.id,name:c.name,type:c.type,contact:c.contact,phone:c.phone,email:c.email,notes:c.notes}));

  const contracts=await dbSelect('SELECT * FROM contracts');
  const boqRows=await dbSelect('SELECT * FROM contract_boq_items ORDER BY contract_id, sort_order');
  target.contracts=contracts.map(c=>({
    id:c.id,num:c.num,clientId:c.client_id,type:c.type,contractValue:c.contract_value,
    start:c.start,end:c.end,status:c.status,vat:c.vat,retention:c.retention,
    guaranteeType:c.guarantee_type,guaranteeMethod:c.guarantee_method,guaranteeRef:c.guarantee_ref,
    guaranteeBank:c.guarantee_bank,guaranteeStatus:c.guarantee_status,
    guaranteeAssignId:c.guarantee_assign_id||'',guaranteeExtractId:c.guarantee_extract_id||'',
    desc:c.desc,
    boq:boqRows.filter(r=>r.contract_id===c.id).map(r=>({id:r.id,wbs:r.wbs,desc:r.desc,unit:r.unit,qty:r.qty,price:r.price}))
  }));

  const annexes=await dbSelect('SELECT * FROM annexes');
  target.annexes=annexes.map(a=>({id:a.id,contractId:a.contract_id,num:a.num,type:a.type,date:a.date,value:a.value,newdate:a.newdate,status:a.status,desc:a.desc}));

  const assignments=await dbSelect('SELECT * FROM assignments');
  const assignItems=await dbSelect('SELECT * FROM assignment_items ORDER BY assignment_id, sort_order');
  target.assignments=assignments.map(a=>({
    id:a.id,num:a.num,contractId:a.contract_id,desc:a.desc,start:a.start,end:a.end,status:a.status,
    notes:a.notes,retention:a.retention,retentionFinal:a.retention_final,warrantyMonths:a.warranty_months,
    vat:a.vat,retentionMethod:a.retention_method,retentionInstrument:a.retention_instrument,
    retentionRef:a.retention_ref,retentionDueDays:a.retention_due_days,retentionPaidStatus:a.retention_paid_status,
    items:assignItems.filter(it=>it.assignment_id===a.id).map(it=>({wbs:it.wbs,desc:it.desc,unit:it.unit,assignQty:it.assign_qty,price:it.price}))
  }));

  const extracts=await dbSelect('SELECT * FROM extracts');
  const extractItems=await dbSelect('SELECT * FROM extract_items ORDER BY extract_id, sort_order');
  target.extracts=extracts.map(e=>({
    id:e.id,num:e.num,assignId:e.assignment_id,type:e.type,date:e.date,status:e.status,
    deduction:e.deduction,socialIns:e.social_ins,irregular:e.irregular,stamps:e.stamps,tax:e.tax,
    einvoice:e.einvoice,notes:e.notes,value:e.value,completion:e.completion,
    items:extractItems.filter(it=>it.extract_id===e.id).map(it=>({
      wbs:it.wbs,desc:it.desc,unit:it.unit,price:it.price,assignQty:it.assign_qty,
      prevQty:it.prev_qty,periodQty:it.period_qty,currentQty:it.current_qty
    }))
  }));

  const subcontractors=await dbSelect('SELECT * FROM subcontractors');
  target.subcontractors=subcontractors.map(s=>({id:s.id,name:s.name,spec:s.spec,contact:s.contact,phone:s.phone,notes:s.notes}));

  const subContracts=await dbSelect('SELECT * FROM sub_contracts');
  const scItems=await dbSelect('SELECT * FROM sub_contract_items ORDER BY sub_contract_id, sort_order');
  const scSchedule=await dbSelect('SELECT * FROM sub_contract_payment_schedule ORDER BY sub_contract_id, sort_order');
  target.subContracts=subContracts.map(sc=>({
    id:sc.id,num:sc.num,subId:sc.sub_id,assignId:sc.assignment_id||'',type:sc.type,value:sc.value,
    start:sc.start,end:sc.end,status:sc.status,desc:sc.desc,
    items:scItems.filter(it=>it.sub_contract_id===sc.id).map(it=>({wbsRef:it.wbs_ref,desc:it.desc,unit:it.unit,qty:it.qty,price:it.price})),
    payments:scSchedule.filter(p=>p.sub_contract_id===sc.id).map(p=>({assignRef:p.assign_ref,amount:p.amount,date:p.date,status:p.status,notes:p.notes}))
  }));

  const subPayments=await dbSelect('SELECT * FROM sub_payments');
  target.subPayments=subPayments.map(p=>({id:p.id,subId:p.sub_id,contractId:p.contract_id,date:p.date,amount:p.amount,method:p.method,ref:p.ref,notes:p.notes}));

  const suppliers=await dbSelect('SELECT * FROM suppliers');
  target.suppliers=suppliers.map(s=>({id:s.id,name:s.name,type:s.type,contact:s.contact,phone:s.phone,notes:s.notes}));

  const purchases=await dbSelect('SELECT * FROM purchases');
  target.purchases=purchases.map(p=>({
    id:p.id,supplierId:p.supplier_id,type:p.type,desc:p.desc,unit:p.unit,qty:p.qty,unitPrice:p.unit_price,
    amount:p.amount,date:p.date,chargeType:p.charge_type,chargeRef:p.charge_ref,invoice:p.invoice,notes:p.notes
  }));

  const supplierPayments=await dbSelect('SELECT * FROM supplier_payments');
  target.supplierPayments=supplierPayments.map(p=>({id:p.id,supplierId:p.supplier_id,date:p.date,amount:p.amount,method:p.method,ref:p.ref,notes:p.notes}));

  const wbsCodes=await dbSelect('SELECT * FROM wbs_codes');
  target.wbsCodes=wbsCodes.map(w=>({id:w.id,code:w.code,desc:w.desc,cat:w.cat}));

  const company=await dbSelect('SELECT * FROM company_settings WHERE id=1');
  target.company=company.length?{name:company[0].name,reg:company[0].reg,phone:company[0].phone,address:company[0].address}:{name:'',reg:'',phone:'',address:''};
}

module.exports={saveAllToDb,loadAllFromDb};
