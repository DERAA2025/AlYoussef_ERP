import sqlite3
import os

DB = "/tmp/test.db"
SCHEMA = "/home/claude/yousef-erp-app/src-tauri/migrations/001_initial.sql"

if os.path.exists(DB):
    os.remove(DB)

con = sqlite3.connect(DB)
con.execute("PRAGMA foreign_keys = ON;")
con.executescript(open(SCHEMA, encoding="utf-8").read())

# ---------- 1. Insert a realistic small dataset ----------
con.execute("INSERT INTO clients (id,name,type) VALUES ('cl1','شركة الاختبار','قطاع خاص')")

con.execute("""INSERT INTO contracts (id,num,client_id,type,contract_value,status,vat,retention)
                VALUES ('co1','CTR-001','cl1','itemized',NULL,'سارٍ',14,5)""")
con.execute("""INSERT INTO contract_boq_items (id,contract_id,sort_order,wbs,desc,unit,qty,price)
                VALUES ('boq1','co1',0,'A.01','حفر','م3',1000,50)""")

con.execute("""INSERT INTO assignments (id,num,contract_id,status,retention,vat,retention_method)
                VALUES ('as1','ASN-001','co1','جارٍ',5,14,'deduct_first')""")
con.execute("""INSERT INTO assignment_items (assignment_id,sort_order,wbs,desc,unit,assign_qty,price)
                VALUES ('as1',0,'A.01','حفر','م3',500,50)""")

con.execute("""INSERT INTO extracts (id,num,assignment_id,type,status,value)
                VALUES ('ex1','EXT-1','as1','مرحلي','مقدم',5000)""")
con.execute("""INSERT INTO extract_items (extract_id,sort_order,wbs,desc,unit,price,assign_qty,prev_qty,period_qty,current_qty)
                VALUES ('ex1',0,'A.01','حفر','م3',50,500,0,100,100)""")

# contract's guarantee soft-link to this assignment (no FK, plain text)
con.execute("UPDATE contracts SET guarantee_method='deduct', guarantee_assign_id='as1', guarantee_extract_id='ex1' WHERE id='co1'")

con.execute("INSERT INTO subcontractors (id,name,spec) VALUES ('sub1','مقاول التأسيسات','حفر')")
con.execute("""INSERT INTO sub_contracts (id,num,sub_id,assignment_id,type,value,status)
                VALUES ('sc1','SUB-1','sub1','as1','boq',20000,'سارٍ')""")
con.execute("INSERT INTO sub_payments (id,sub_id,contract_id,date,amount,method) VALUES ('sp1','sub1','sc1','2026-01-01',5000,'كاش')")

con.execute("INSERT INTO suppliers (id,name,type) VALUES ('sup1','مورد الحديد','مواد بناء')")
con.execute("""INSERT INTO purchases (id,supplier_id,type,desc,amount,charge_type,charge_ref)
                VALUES ('pu1','sup1','شراء','حديد تسليح',15000,'assignment','as1')""")

con.commit()
print("1. Insert realistic dataset: OK")

# ---------- 2. Foreign key enforcement rejects bad references ----------
try:
    con.execute("INSERT INTO assignments (id,num,contract_id) VALUES ('bad1','X','NOPE')")
    con.commit()
    print("2. FK enforcement: FAILED (bad insert was accepted!)")
except sqlite3.IntegrityError as e:
    con.rollback()
    print(f"2. FK enforcement: OK (correctly rejected: {e})")

# ---------- 3. Cascade delete: deleting a contract removes its children ----------
con.execute("DELETE FROM contracts WHERE id='co1'")
con.commit()
remaining = {
    "contracts": con.execute("SELECT COUNT(*) FROM contracts WHERE id='co1'").fetchone()[0],
    "boq_items": con.execute("SELECT COUNT(*) FROM contract_boq_items WHERE contract_id='co1'").fetchone()[0],
    "assignments": con.execute("SELECT COUNT(*) FROM assignments WHERE id='as1'").fetchone()[0],
    "assignment_items": con.execute("SELECT COUNT(*) FROM assignment_items WHERE assignment_id='as1'").fetchone()[0],
    "extracts": con.execute("SELECT COUNT(*) FROM extracts WHERE id='ex1'").fetchone()[0],
    "extract_items": con.execute("SELECT COUNT(*) FROM extract_items WHERE extract_id='ex1'").fetchone()[0],
}
print("3. Cascade delete after removing contract co1:", remaining,
      "-> OK" if all(v == 0 for v in remaining.values()) else "-> FAILED")

# sub_contracts.assignment_id should be SET NULL (not cascaded), since sub_contracts
# depends on the subcontractor, not the assignment
sc_assignment = con.execute("SELECT assignment_id FROM sub_contracts WHERE id='sc1'").fetchone()[0]
print("   sub_contracts.assignment_id after cascade:", sc_assignment,
      "-> OK (SET NULL as expected)" if sc_assignment is None else "-> FAILED")

con.close()
print("\nAll checks complete.")
