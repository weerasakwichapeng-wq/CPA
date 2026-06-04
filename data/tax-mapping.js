// Mapping ของเอกสารการเสียภาษีตาม FMU
// ─────────────────────────────────────────────────────────────────
// โครงสร้าง:
//   window.TAX_DOCS.mapping[fmuNum]    → array of {path, title}  (legacy: FMU-level)
//   window.TAX_DOCS.yearly[year][plot] → pdf path                 (per-plot, per-year)
//                                                                    "FMU16-*" = wildcard ครอบคลุมทุก plot ของ FMU16
// ─────────────────────────────────────────────────────────────────

window.TAX_DOCS = (function () {
  const m = {};

  // ── FMU1-15: ไฟล์รวม ──
  for (let i = 1; i <= 15; i++) {
    m[i] = [{
      path: "documents/tax/fmu_1-15_combined.pdf",
      title: `เอกสารเสียภาษี FMU${i} (รวม FMU1-15)`,
    }];
  }

  // ── FMU ที่จับคู่ตรง: ใส่เฉพาะที่ยืนยันได้ ──
  const directMatches = {
    25: "fmu025.pdf",   // นางสาคร สุริยะ
    26: "fmu026.pdf",   // นางดารา จำปาสิม
    27: "fmu027.pdf",   // นางไพเราะ ดีลุนชัย
    28: "fmu028.pdf",   // นางสุดใจ เขียนศรีอ่อน
    29: "fmu029.pdf",   // นายสุพรรณ ศิริวิโรจน์
    30: "fmu030.pdf",   // นางสุทัศสี พรมตาไก้
    31: "fmu031.pdf",   // นางไพรัช สุขะ (3 หน้า)
    32: "fmu032.pdf",   // นางหนูนิต คำดี
    33: "fmu033.pdf",   // นางวารุณี รอดเส
    34: "fmu034.pdf",   // นายบัวไล คำดี
    35: "fmu035.pdf",   // นางพิมพ์พร สุริยะ
    36: "fmu036.pdf",   // นางบุญเยี่ยม ยูพา
    37: "fmu037.pdf",   // นางสาวสุนทรินทร์ ทองอินทร์ (3 หน้า)
    38: "fmu038.pdf",   // นางสาวสงัด บุตรศรี (2 หน้า)
    40: "fmu040.pdf",   // นางปรียา บัวระภา
    41: "fmu041.pdf",   // นางอนงค์รัก อาจแก้ว
    43: "fmu043.pdf",   // นายสำเนียง วงศ์ปล้อง
    45: "fmu045.pdf",   // นายประสงค์ สอนแก้ว
    47: "fmu047.pdf",   // นางคำฮ้อย ลีเบาะ
    48: "fmu048.pdf",   // นางคำปุ่น ชัยชนะ
    49: "fmu049.pdf",   // นางกฤติยาภรณ์ อ่อนอุทัย (2 หน้า)
    54: "fmu054.pdf",   // นางสาววิมลศิริ ภักมี
    56: "fmu056.pdf",   // นางบุญมี โคตรสีเมือง
    57: "fmu057.pdf",   // นายเนรมิตร ชัยชนะ
    58: "fmu058.pdf",   // นายทองหนัก ธรรมสิมมา
    60: "fmu060.pdf",   // นางบรรเทา เวียงแสง
    61: "fmu061.pdf",   // นางทองย้อย โสสีทา
    62: "fmu062.pdf",   // นางบุญโฮม บุดดาซุย
    63: "fmu063.pdf",   // นายกงใจ พันบุญมา
    64: "fmu064.pdf",   // นายชม บุญทา
    65: "fmu065.pdf",   // นางหอมจันทร์ ศิริบุญคุณ
    66: "fmu066.pdf",   // นางหนูวิน ธรรมสิมมา
    67: "fmu067.pdf",   // นายสำเนา คงดี
    68: "fmu068.pdf",   // นายน้อย คงดี
    69: "fmu069.pdf",   // นางทุมมา คงดี/สอสุธรรม
    70: "fmu070.pdf",   // นางนิพาภรณ์ กันพร้อม
    71: "fmu071.pdf",   // นายพินิจ ชัยชนะ
    72: "fmu072.pdf",   // นางศศิมา การุญญเวทย์
    74: "fmu074.pdf",   // นางนิดหน่อย คงดี
    75: "fmu075.pdf",   // นายสุพัฒน์ แก้วทาสี
  };
  for (const [fmu, file] of Object.entries(directMatches)) {
    m[parseInt(fmu)] = [{
      path: `documents/tax/${file}`,
      title: `เอกสารเสียภาษี FMU${fmu}`,
    }];
  }

  // ── FMU ที่จับคู่ไม่ได้ในชุด FMU-level: ใส่ array ว่าง ──
  // (panel จะแสดงเฉพาะเอกสารรายปี ถ้ามี)
  const pending = [16, 17, 18, 19, 20, 21, 22, 23, 24,
                   39, 42, 44, 46, 50, 51, 52, 53, 55, 59, 73];
  pending.forEach(fmu => { m[fmu] = []; });

  // ─────────────────────────────────────────────────────────────
  // ── เอกสารภาษีรายปี รายแปลง (เจ้กุล-เฮียหลิน) ──
  // "FMU16-*" = wildcard ครอบคลุมทุก plot ของ FMU16
  // ─────────────────────────────────────────────────────────────
  const yearly = {
    "2568": {
      "FMU16-*": "documents/tax-yearly/2568/FMU16-1_to_FMU16-4.pdf",
      "FMU17-*": "documents/tax-yearly/2568/FMU17.pdf",
      "FMU22-1": "documents/tax-yearly/2568/FMU22-1.pdf",
      "FMU22-2": "documents/tax-yearly/2568/FMU22-2.pdf",
      "FMU22-4": "documents/tax-yearly/2568/FMU22-4_FMU22-6_FMU24-3.pdf",
      "FMU22-5": "documents/tax-yearly/2568/FMU22-5.pdf",
      "FMU22-6": "documents/tax-yearly/2568/FMU22-4_FMU22-6_FMU24-3.pdf",
      "FMU23-1": "documents/tax-yearly/2568/FMU23-1.pdf",
      "FMU23-2": "documents/tax-yearly/2568/FMU23-2.pdf",
      "FMU23-3": "documents/tax-yearly/2568/FMU23-3.pdf",
      "FMU24-1": "documents/tax-yearly/2568/FMU24-1.pdf",
      "FMU24-2": "documents/tax-yearly/2568/FMU24-2.pdf",
      "FMU24-3": "documents/tax-yearly/2568/FMU22-4_FMU22-6_FMU24-3.pdf",
    },
    "2569": {
      "FMU22-1": "documents/tax-yearly/2569/FMU22-1.pdf",
      "FMU22-2": "documents/tax-yearly/2569/FMU22-2.pdf",
      "FMU22-4": "documents/tax-yearly/2569/FMU22-4_FMU22-6_FMU24-3.pdf",
      "FMU22-5": "documents/tax-yearly/2569/FMU22-5.pdf",
      "FMU22-6": "documents/tax-yearly/2569/FMU22-4_FMU22-6_FMU24-3.pdf",
      "FMU23-1": "documents/tax-yearly/2569/FMU23-1.pdf",
      "FMU23-2": "documents/tax-yearly/2569/FMU23-2.pdf",
      "FMU23-3": "documents/tax-yearly/2569/FMU23-3.pdf",
      "FMU24-1": "documents/tax-yearly/2569/FMU24-1.pdf",
      "FMU24-2": "documents/tax-yearly/2569/FMU24-2.pdf",
      "FMU24-3": "documents/tax-yearly/2569/FMU22-4_FMU22-6_FMU24-3.pdf",
    },
  };

  // Helper: หาเอกสารรายปีของแปลงที่ระบุ (รองรับ wildcard FMUx-*)
  function findYearly(plot) {
    if (!plot) return [];
    const results = [];
    const fmuPrefix = plot.split("-")[0] + "-*";  // "FMU22-1" → "FMU22-*"
    Object.entries(yearly).sort((a, b) => b[0].localeCompare(a[0])).forEach(([year, plots]) => {
      const path = plots[plot] || plots[fmuPrefix];
      if (path) results.push({ year, path });
    });
    return results;
  }

  return { mapping: m, yearly, findYearly };
})();
