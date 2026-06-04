/* ════════════════════════════════════════════════════════════
   FSC Users Database
   ──────────────────────────────────────────────────────────────
   ⚠️ ใช้ SHA-256 hash + localStorage — เหมาะกับ internal access
   control ไม่ใช่ระบบป้องกัน hack ระดับสูง
   passwordHash = SHA-256(password + ":" + username)

   ระดับสิทธิ์ (จากต่ำสุดไปสูงสุด):
     viewer  - หลัง login: เห็นเฉพาะ แดชบอร์ด / แผนที่ดาวเทียม / ตรวจสอบย้อนกลับ
     manager - viewer + รายชื่อเกษตรกร / ล็อตรับซื้อ / สร้างแผนที่รายงาน / บันทึกข้อมูลใหม่
     admin   - manager + จัดการบัญชีผู้ใช้

   ⚠️ ทุกหน้าต้อง login ก่อนเสมอ (ไม่อนุญาต anonymous access)
   ════════════════════════════════════════════════════════════ */
window.USERS = [
  {
    username: "CPA",
    displayName: "CPA Manager",
    role: "manager",
    // SHA-256("4909:CPA")  →  password = "4909"
    passwordHash: "bbdd9a19017d352765a7494d5a12d96a249b8c162c972743966f1e96f0fc3e14",
    createdAt: 1747353600000,
    lastLoginAt: null,
  },
];
