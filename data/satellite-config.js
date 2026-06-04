/* ════════════════════════════════════════════════════════════════════
   Satellite basemap configuration
   ────────────────────────────────────────────────────────────────────
   ภาพดาวเทียมที่ใช้ในระบบ — สลับปีได้จาก dropdown ในหน้าแผนที่/รายงาน

   ภาพปัจจุบัน → Esri World Imagery
   ภาพ พ.ศ. 2536 → Landsat 5 TM จาก Microsoft Planetary Computer
                    (ฟรี · ไม่ต้อง login · ภาพถ่ายวันที่ 25 ธ.ค. 1993)

   📍 Scene ที่ใช้: LT05_L2SP_129048_19931225_02_T1
       - Path/Row: 129/048
       - วันที่ถ่าย: 25 ธันวาคม 1993
       - ครอบคลุม: lng 100.30–102.50, lat 16.39–18.30 (ทั้งจังหวัดเลย)
       - Sensor: Landsat 5 TM (30m resolution)
       - Source: Microsoft Planetary Computer (USGS Collection 2 Level-2)

   หากต้องการเปลี่ยน scene อื่น query STAC API ได้ที่:
       POST https://planetarycomputer.microsoft.com/api/stac/v1/search
       body: { "collections": ["landsat-c2-l2"],
               "bbox": [lng1,lat1,lng2,lat2],
               "datetime": "1993-01-01/1993-12-31",
               "query": {"platform":{"eq":"landsat-5"},
                         "eo:cloud_cover":{"lt":30}} }
   ════════════════════════════════════════════════════════════════════ */

window.SATELLITE_BASEMAPS = {
  current: {
    label: "🛰️ ภาพปัจจุบัน",
    yearTH: "ปัจจุบัน",
    yearCE: "current",
    tileUrl: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri World Imagery",
    maxZoom: 19,
    note: null,
  },
  y2536: {
    label: "🕰️ ภาพ พ.ศ. 2536",
    yearTH: "พ.ศ. 2536 (1993)",
    yearCE: "1993",
    // Microsoft Planetary Computer — Landsat 5 TM ปี 1993 ของเลย
    // ไม่ต้อง login · ฟรี · ภาพ true color (RGB) ที่ enhance แล้ว
    tileUrl: "https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?collection=landsat-c2-l2&item=LT05_L2SP_129048_19931225_02_T1&assets=red&assets=green&assets=blue&color_formula=gamma+RGB+2.7%2C+saturation+1.5%2C+sigmoidal+RGB+15+0.55&format=png",
    attribution: "Landsat 5 (25 ธ.ค. 1993) · Microsoft Planetary Computer · USGS",
    maxZoom: 14,        // Landsat 30m — zoom in มากกว่า 14 จะเบลอ
    maxNativeZoom: 14,  // Leaflet จะใช้ tile zoom 14 แล้ว upscale ถ้า user zoom เกิน
    bounds: [[16.39, 100.30], [18.30, 102.50]],  // จำกัดพื้นที่ตาม scene bbox
    note: "📅 ภาพถ่าย 25 ธันวาคม 1993 (พ.ศ. 2536) · Landsat 5 TM · ใช้ตรวจสอบพื้นที่ป่าก่อนวันที่ตัด FSC (1 พ.ย. 2537)",
    // isPlaceholder: false  — ใช้งานได้จริงแล้ว
  },
};

window.DEFAULT_BASEMAP_KEY = "current";
