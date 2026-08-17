/* ════════════ Firebase — เก็บล็อต/ตรวจติดตาม/ผู้ใช้ไว้ส่วนกลาง ════════════
   แทนที่ localStorage เดิม (ซึ่งอยู่แยกเครื่อง ไม่ sync กัน) ด้วย Firestore
   เปิด offline persistence ไว้ — บันทึกได้แม้เน็ตหลุดที่จุดรับซื้อ แล้ว sync
   อัตโนมัติเมื่อกลับมามีสัญญาณ ระบบ login เข้าเว็บยังใช้ username/password
   เดิมทุกอย่าง (เทียบ hash ฝั่ง client) — Anonymous sign-in ที่นี่ใช้แค่ให้
   Firestore/Storage security rules เช็คได้ว่ามาจากแอปจริง ไม่เกี่ยวกับ
   ระบบ login ของผู้ใช้ ──────────────────────────────────────────── */
const firebaseConfig = {
  apiKey: "AIzaSyC-BZksC39x2na2fyb7Ox_eVsahuStTZsE",
  authDomain: "fsc-cpa-traceability.firebaseapp.com",
  projectId: "fsc-cpa-traceability",
  storageBucket: "fsc-cpa-traceability.firebasestorage.app",
  messagingSenderId: "557936037616",
  appId: "1:557936037616:web:527731be3e18f7aa863c35",
};

firebase.initializeApp(firebaseConfig);
const fbDb = firebase.firestore();
const fbStorage = firebase.storage();

fbDb.enablePersistence({ synchronizeTabs: true }).catch(err => {
  console.warn("Firestore offline persistence ไม่เปิดใช้งาน:", err.code);
});

const fbReady = firebase.auth().signInAnonymously().catch(err => {
  console.error("Firebase anonymous sign-in ล้มเหลว:", err);
});
