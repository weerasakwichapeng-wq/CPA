/* FSC ตรวจสอบย้อนกลับ - เถ้าแก่น้อยยางพารา */

const MEMBERS = window.MEMBERS || [];
let PRODUCTIVE = window.PRODUCTIVE_AREAS || [];
let WATER = window.WATER_AREAS || [];
let LANDTITLES = window.LAND_TITLES || [];
let BUFFERZONES = window.BUFFER_ZONES || [];

/* Classify polygon by styleUrl color code embedded in the style name.
   Productive area KML uses: 7CB342 = green (productive),
                             A1C2FA / B2EBF2 = blue (water bodies),
                             AFB42B = olive (misc).
*/
function classifyByStyle(styleUrl) {
  if (!styleUrl) return "productive";
  const m = styleUrl.match(/poly-([0-9A-Fa-f]{6})/);
  if (!m) return "productive";
  const hex = m[1].toUpperCase();
  // Blue/cyan family → water
  if (hex === "A1C2FA" || hex === "B2EBF2" || hex.startsWith("00B") || hex.startsWith("0288")) return "water";
  // Green family → productive
  if (hex === "7CB342" || hex.startsWith("00C") || hex.startsWith("00E") || hex.startsWith("4CA") || hex.startsWith("388")) return "productive";
  // Yellow / orange family → land title
  if (hex === "FFEA00" || hex.startsWith("FF") || hex === "AFB42B") return "landtitle";
  return "productive";
}

/* Parse KML; if classifyBlue=true, polygons with blue style become "water" type */
function parseKML(xmlText, defaultType, classifyByColor) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const placemarks = doc.getElementsByTagName("Placemark");
  const features = [];
  for (const pm of placemarks) {
    const nameEl = pm.getElementsByTagName("name")[0];
    const descEl = pm.getElementsByTagName("description")[0];
    const coordsEl = pm.getElementsByTagName("coordinates")[0];
    const styleEl = pm.getElementsByTagName("styleUrl")[0];
    if (!coordsEl) continue;
    const coords = coordsEl.textContent.trim().split(/\s+/).map(t => {
      const [lng, lat] = t.split(",").map(Number);
      return [lng, lat];
    }).filter(c => !isNaN(c[0]) && !isNaN(c[1]));
    if (coords.length < 3) continue;
    const styleUrl = styleEl ? styleEl.textContent.trim() : "";
    let type = defaultType;
    if (classifyByColor) {
      const cls = classifyByStyle(styleUrl);
      if (cls === "water") type = "water";
      else type = defaultType;
    }
    features.push({
      name: nameEl ? nameEl.textContent.trim() : "",
      description: descEl ? descEl.textContent.trim() : "",
      type,
      styleUrl,
      coordinates: coords,
    });
  }
  return features;
}

async function loadKMLData() {
  // Data is already loaded via <script src="data/*.js"> tags (works on file:// too).
  // Only fall back to fetching .kml files if the bundled .js data is missing/empty.
  if (PRODUCTIVE.length > 0 && LANDTITLES.length > 0) return;

  try {
    const res = await fetch("data/productive.kml");
    if (res.ok) {
      const all = parseKML(await res.text(), "productive", true);
      if (PRODUCTIVE.length === 0) PRODUCTIVE = all.filter(f => f.type === "productive");
      if (WATER.length === 0) WATER = all.filter(f => f.type === "water");
    }
  } catch (e) { /* file:// blocks fetch — already covered by bundled .js */ }

  try {
    const res = await fetch("data/landtitles.kml");
    if (res.ok && LANDTITLES.length === 0) {
      LANDTITLES = parseKML(await res.text(), "landtitle", false);
    }
  } catch (e) { /* same */ }
}

const LS_KEY = "fsc_custom_records";
const LS_FILES = "fsc_doc_files";
const LS_QUOTA = "fsc_quota_data";   // keyed by memberId or plot
const LS_LOTS = "fsc_lots";          // array of lot objects
const LS_USERS = "fsc_users";        // array of users (override window.USERS)
const LS_SESSION = "fsc_session";    // current session { username, role, expiresAt }

/* ════════════ Sync status (Google Sheets last update) ════════════
   แสดงเวลาที่ดึงข้อมูลจาก Google Sheets ครั้งล่าสุด + เตือนถ้าเก่าเกินไป
   ตัวแปร window.MEMBERS_LAST_SYNC + MEMBERS_SOURCE_URL ถูกเขียนโดย
   extract-members.ps1 ตอนรัน
   ──────────────────────────────────────────────────── */
const SYNC_WARN_DAYS = 7;  // เตือนถ้าข้อมูลเก่ากว่า 7 วัน

function fmtTimeSince(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชม.ที่แล้ว`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} วันที่แล้ว`;
  return `${Math.floor(d / 30)} เดือนที่แล้ว`;
}

function renderSyncStatus() {
  const ts = window.MEMBERS_LAST_SYNC;
  const url = window.MEMBERS_SOURCE_URL || "#";
  if (!ts) return;
  const syncDate = new Date(ts);
  if (isNaN(syncDate)) return;
  const ageMs = Date.now() - syncDate.getTime();
  const ageDays = ageMs / (24 * 3600 * 1000);
  const isStale = ageDays > SYNC_WARN_DAYS;

  // ── Footer chip ── (แทรกใน footer หรือสร้างใหม่)
  let chip = document.getElementById("syncStatusChip");
  if (!chip) {
    const footer = document.querySelector("footer.footer");
    if (footer) {
      chip = document.createElement("span");
      chip.id = "syncStatusChip";
      chip.className = "sync-status-chip";
      footer.insertBefore(chip, footer.firstChild);
    }
  }
  if (chip) {
    chip.className = "sync-status-chip" + (isStale ? " sync-stale" : "");
    const icon = isStale ? "⚠️" : "📅";
    const dateStr = syncDate.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
    chip.innerHTML = `${icon} ข้อมูล Google Sheets อัพเดทล่าสุด <b>${fmtTimeSince(ageMs)}</b> <span class="sync-date">(${dateStr})</span>`;
    chip.title = isStale
      ? `ข้อมูลเก่ากว่า ${SYNC_WARN_DAYS} วัน — รัน extract-members.ps1 เพื่อ sync จาก Google Sheets`
      : `ข้อมูลล่าสุด · ดึงจาก ${url}`;
  }

  // ── เตือนแบบ banner ใหญ่ ถ้าข้อมูลเก่ามาก ──
  if (isStale && !document.getElementById("syncStaleBanner")) {
    const banner = document.createElement("div");
    banner.id = "syncStaleBanner";
    banner.className = "sync-stale-banner";
    banner.innerHTML = `
      ⚠️ <b>ข้อมูลในเว็บอาจไม่ใช่ล่าสุด</b> — อัพเดทล่าสุดเมื่อ <b>${fmtTimeSince(ageMs)}</b>
      <br><span style="font-size:12px">ถ้ามีการแก้ไข Google Sheets ใหม่ กรุณารัน <code>extract-members.ps1</code> เพื่อ sync</span>
      <a href="${url}" target="_blank" class="sync-link-btn">🔗 เปิด Google Sheets</a>
      <button class="banner-close">✕</button>`;
    document.body.appendChild(banner);
    banner.querySelector(".banner-close").onclick = () => banner.remove();
  }
}

/* ════════════ Satellite basemap helpers ════════════
   เลือกปีของภาพถ่ายดาวเทียม (ปัจจุบัน / พ.ศ. 2536 สำหรับ FSC pre-1994)
   config อยู่ใน data/satellite-config.js (window.SATELLITE_BASEMAPS)
   ────────────────────────────────────────────── */
const LS_BASEMAP = "fsc_basemap_key";
function getBasemapConfig(key) {
  const all = window.SATELLITE_BASEMAPS || {};
  return all[key] || all[window.DEFAULT_BASEMAP_KEY] || all.current || {
    tileUrl: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri", maxZoom: 19,
  };
}
function getSelectedBasemapKey() {
  return localStorage.getItem(LS_BASEMAP) || window.DEFAULT_BASEMAP_KEY || "current";
}
function setSelectedBasemapKey(key) { localStorage.setItem(LS_BASEMAP, key); }
function createBasemapLayer(key) {
  const cfg = getBasemapConfig(key);
  const opts = {
    attribution: cfg.attribution || "",
    maxZoom: cfg.maxZoom || 19,
  };
  if (cfg.maxNativeZoom != null) opts.maxNativeZoom = cfg.maxNativeZoom;
  if (cfg.bounds) opts.bounds = L.latLngBounds(cfg.bounds);
  return L.tileLayer(cfg.tileUrl, opts);
}
function showBasemapWarning(key) {
  const cfg = getBasemapConfig(key);
  // ล้าง warning เก่า (ถ้ามี)
  const old = document.getElementById("basemapWarn");
  if (old) old.remove();
  if (!cfg.isPlaceholder && !cfg.note) return;
  const banner = document.createElement("div");
  banner.id = "basemapWarn";
  banner.className = "basemap-warn";
  const noteText = cfg.note || "";
  const warnText = cfg.isPlaceholder
    ? `⚠️ <b>กำลังใช้ภาพ placeholder</b> — ยังไม่ได้ตั้งค่า URL จริงของภาพ ${cfg.yearTH || cfg.yearCE} กรุณาแก้ <code>data/satellite-config.js</code>`
    : `📅 <b>ภาพถ่าย: ${cfg.yearTH || cfg.yearCE}</b>`;
  banner.innerHTML = `${warnText}${noteText ? `<br><span class="basemap-warn-note">${noteText}</span>` : ""} <button class="basemap-warn-close">✕</button>`;
  document.body.appendChild(banner);
  banner.querySelector(".basemap-warn-close").onclick = () => banner.remove();
  // auto-hide after 12s if it's just an info note (no warning)
  if (!cfg.isPlaceholder) setTimeout(() => banner.remove(), 12000);
}

/* ════════════ Auth ════════════
   ⚠️ Not real cryptography — internal access control only.
   passwordHash = SHA-256(password + ":" + username)  */
const SESSION_HOURS = 8;
// Routes ที่ไม่ต้อง login (login form + setup wizard)
const NO_AUTH_ROUTES = new Set(["login", "setup"]);
// Required minimum role per route — ทุก route นอกเหนือจาก NO_AUTH_ROUTES ต้อง login
// viewer = เห็น แดชบอร์ด/แผนที่/ตรวจสอบย้อนกลับ
// manager = viewer + เกษตรกร/ล็อต/รายงาน/บันทึกข้อมูล
// admin = ทั้งหมด + จัดการบัญชี
const ROUTE_ROLES = {
  dashboard: "viewer",
  map: "viewer",
  trace: "viewer",
  farmer: "viewer",  // detail page เข้าได้จาก trace search
  farmers: "manager",
  documents: "manager",
  report: "manager",
  add: "manager",
  lots: "manager",
  "lots/new": "manager",
  lot: "manager",
  compliance: "manager",
  ltfix: "admin",
  users: "admin",
};
const ROLE_RANK = { anonymous: -1, viewer: 0, manager: 1, admin: 2 };

async function hashPassword(password, username) {
  const enc = new TextEncoder().encode(password + ":" + (username || ""));
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function loadUsers() {
  let ls = [];
  try { ls = JSON.parse(localStorage.getItem(LS_USERS) || "[]"); } catch { ls = []; }
  const bundled = window.USERS || [];
  // Merge: บัญชีจาก data/users.js (bundled) เป็นหลัก + localStorage เป็น override
  // (เช่น password ที่เปลี่ยนใหม่, lastLoginAt) และ user ที่เพิ่มผ่าน admin panel
  const map = new Map();
  bundled.forEach(u => map.set(u.username, { ...u }));
  ls.forEach(u => {
    if (map.has(u.username)) {
      // user มีอยู่ใน bundle — localStorage override เฉพาะ field ที่อัพเดท
      map.set(u.username, { ...map.get(u.username), ...u });
    } else {
      // user ใหม่ที่เพิ่มผ่าน admin panel หลัง deploy
      map.set(u.username, u);
    }
  });
  return Array.from(map.values());
}
function saveUsers(arr) { localStorage.setItem(LS_USERS, JSON.stringify(arr)); }
function hasAdmin() { return loadUsers().some(u => u.role === "admin"); }

function getSession() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_SESSION) || "null");
    if (!s) return null;
    if (s.expiresAt && s.expiresAt < Date.now()) { localStorage.removeItem(LS_SESSION); return null; }
    return s;
  } catch { return null; }
}
function getCurrentUser() {
  const s = getSession();
  if (!s) return { username: null, role: "anonymous", displayName: "ไม่ได้เข้าสู่ระบบ" };
  const u = loadUsers().find(x => x.username === s.username);
  if (!u) { localStorage.removeItem(LS_SESSION); return { username: null, role: "anonymous", displayName: "ไม่ได้เข้าสู่ระบบ" }; }
  return u;
}
function hasAnyUser() { return loadUsers().length > 0; }
function isLoggedIn() { return getCurrentUser().role !== "anonymous"; }
function hasRole(required) {
  const me = getCurrentUser();
  return ROLE_RANK[me.role || "viewer"] >= ROLE_RANK[required];
}
async function loginUser(username, password) {
  const users = loadUsers();
  // Case-insensitive username matching
  const u = users.find(x => (x.username || "").toLowerCase() === (username || "").toLowerCase());
  if (!u) throw new Error("ไม่พบบัญชีผู้ใช้นี้");
  // ใช้ stored username (เคสตรง) ในการ hash เพื่อให้ match กับ passwordHash ที่บันทึกไว้
  const h = await hashPassword(password, u.username);
  if (h !== u.passwordHash) throw new Error("รหัสผ่านไม่ถูกต้อง");
  u.lastLoginAt = Date.now();
  saveUsers(users);
  localStorage.setItem(LS_SESSION, JSON.stringify({
    username: u.username, role: u.role,
    expiresAt: Date.now() + SESSION_HOURS * 3600 * 1000,
  }));
  return u;
}
function logoutUser() {
  localStorage.removeItem(LS_SESSION);
  location.hash = "#/dashboard";
  router();
}
function renderUserChip() {
  const chip = $("#userChip");
  if (!chip) return;
  const me = getCurrentUser();
  chip.innerHTML = "";
  if (me.username) {
    const badge = el("span", { class: "user-role user-role-" + me.role }, me.role);
    chip.append(
      el("span", { class: "user-name" }, `👤 ${me.displayName || me.username}`),
      badge,
      el("button", { class: "btn btn-small btn-logout", onclick: logoutUser }, "ออกจากระบบ"),
    );
  } else {
    chip.append(el("a", { href: "#/login", class: "btn btn-small btn-login" }, "🔐 เข้าสู่ระบบ"));
  }
}
function updateNavVisibility() {
  const me = getCurrentUser();
  $$(".mainnav a[data-requires-role]").forEach(a => {
    const need = a.dataset.requiresRole;
    a.style.display = hasRole(need) ? "" : "none";
  });
}

function loadCustom() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; } }
function saveCustom(arr) { localStorage.setItem(LS_KEY, JSON.stringify(arr)); }
function loadFiles() { try { return JSON.parse(localStorage.getItem(LS_FILES) || "{}"); } catch { return {}; } }
function saveFiles(obj) { localStorage.setItem(LS_FILES, JSON.stringify(obj)); }
function loadQuotas() { try { return JSON.parse(localStorage.getItem(LS_QUOTA) || "{}"); } catch { return {}; } }
function saveQuotas(obj) { localStorage.setItem(LS_QUOTA, JSON.stringify(obj)); }

/* ── Lots storage ── */
function loadLots() {
  // Merge: bundled (window.LOTS from data/lots.js) + user edits (localStorage)
  // localStorage takes precedence (most recent edits)
  let ls = [];
  try { ls = JSON.parse(localStorage.getItem(LS_LOTS) || "[]"); } catch { ls = []; }
  const bundled = window.LOTS || [];
  if (ls.length === 0) return bundled.slice();
  // Combine by lotId, localStorage wins
  const map = new Map();
  bundled.forEach(l => map.set(l.lotId, l));
  ls.forEach(l => map.set(l.lotId, l));
  return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
function saveLots(arr) { localStorage.setItem(LS_LOTS, JSON.stringify(arr)); }
function getLot(lotId) { return loadLots().find(l => l.lotId === lotId); }
function upsertLot(lot) {
  const all = loadLots();
  const idx = all.findIndex(l => l.lotId === lot.lotId);
  if (idx >= 0) all[idx] = lot; else all.unshift(lot);
  saveLots(all);
}
function deleteLot(lotId) {
  const all = loadLots().filter(l => l.lotId !== lotId);
  saveLots(all);
}
function nextLotId() {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthLots = loadLots().filter(l => l.lotId && l.lotId.startsWith(`LOT-${ym}-`));
  const maxNum = monthLots.reduce((mx, l) => {
    const n = parseInt(l.lotId.split("-")[2], 10);
    return isNaN(n) ? mx : Math.max(mx, n);
  }, 0);
  return `LOT-${ym}-${String(maxNum + 1).padStart(4, "0")}`;
}
function getQuotaFor(rec) {
  const store = loadQuotas();
  const override = store[rec.memberId] || store[rec.plot] || {};
  // Merge with values from the record itself (from Excel) — overrides win where set
  const base = {
    yieldPerRai: rec.yieldPerRai,
    deliveryPerRound: rec.deliveryPerRound,
    sacksReceived: rec.sacksReceived,
    yieldCupLumpKgYear: rec.yieldCupLumpKgYear,
    yieldLatexKgRai: rec.yieldLatexKgRai,
    hub: rec.hub,
    buyer: rec.buyer,
    revenueShare: rec.revenueShare,
    ayi: rec.ayi,
  };
  return { ...base, ...override };
}
function setQuotaFor(rec, q) {
  const store = loadQuotas();
  const key = rec.memberId || rec.plot;
  if (!key) return;
  if (q && Object.values(q).some(v => v !== "" && v != null)) store[key] = { ...q, _updatedAt: Date.now() };
  else delete store[key];
  saveQuotas(store);
}

/* ============ Utilities ============ */
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === "class") e.className = attrs[k];
    else if (k === "html") e.innerHTML = attrs[k];
    else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
    else e.setAttribute(k, attrs[k]);
  }
  for (const c of children) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
function fmtNum(n, digits) {
  if (n == null || n === "") return "-";
  const v = Number(n);
  if (isNaN(v)) return n;
  return v.toLocaleString("th-TH", { maximumFractionDigits: digits ?? 2 });
}
function safe(s) { return (s == null || s === "") ? "-" : s; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* Convert Excel serial date → readable date if it looks like one */
function fmtDate(v) {
  if (!v) return "-";
  if (typeof v === "number" && v > 50000 && v < 90000) {
    const d = new Date((v - 25569) * 86400 * 1000);
    return d.toLocaleDateString("th-TH");
  }
  return String(v);
}

function getAllRecords() {
  const customs = loadCustom().map(c => ({ ...c, _custom: true }));
  return [...MEMBERS, ...customs];
}

/* ============ Router ============ */
const ROUTES = {
  dashboard: renderDashboard,
  farmers: renderFarmers,
  farmer: renderFarmerDetail,
  map: renderMap,
  documents: renderDocuments,
  trace: renderTrace,
  ltfix: renderLtFix,
  report: renderReport,
  add: renderAdd,
  lots: renderLots,
  "lots/new": renderLotForm,
  lot: renderLotDetail,
  setup: renderSetup,
  login: renderLogin,
  users: renderUsersAdmin,
  compliance: renderCompliance,
};

function router() {
  let hash = location.hash.slice(2) || "dashboard"; // strip "#/"

  // ── First-run setup guard: no user at all → force /setup ──
  if (!hasAnyUser() && !hash.startsWith("setup")) {
    location.hash = "#/setup";
    hash = "setup";
  }
  // ── Block /setup once user exists ──
  if (hash.startsWith("setup") && hasAnyUser()) {
    location.hash = "#/dashboard";
    hash = "dashboard";
  }

  const segments = hash.split("/");
  let route, params, tplKey;
  // Try compound route first (e.g., "lots/new")
  if (segments.length > 1 && ROUTES[`${segments[0]}/${segments[1]}`]) {
    route = `${segments[0]}/${segments[1]}`;
    params = segments.slice(2);
    tplKey = "lot-new";
  } else {
    route = segments[0];
    params = segments.slice(1);
    if (route === "farmer") tplKey = "farmer-detail";
    else if (route === "lot") tplKey = "lot-detail";
    else tplKey = route;
  }

  // ── Auth/Role guard ──
  // 1) ถ้าไม่ใช่ NO_AUTH_ROUTES และยังไม่ login → ไป login
  if (!NO_AUTH_ROUTES.has(route) && !isLoggedIn()) {
    sessionStorage.setItem("fsc_login_back", "#/" + hash);
    location.hash = "#/login";
    route = "login"; tplKey = "login"; params = [];
  } else {
    // 2) Login แล้ว แต่สิทธิ์ไม่พอ → กลับไปหน้า dashboard + แจ้งเตือน
    const requiredRole = ROUTE_ROLES[route];
    if (requiredRole && !hasRole(requiredRole)) {
      const me = getCurrentUser();
      alert(`⚠️ หน้านี้ต้องการสิทธิ์ระดับ "${requiredRole}" ขึ้นไป — สิทธิ์ปัจจุบันของคุณคือ "${me.role}"`);
      location.hash = "#/dashboard";
      route = "dashboard"; tplKey = "dashboard"; params = [];
    }
  }

  const handler = ROUTES[route] || renderDashboard;
  // Highlight nav (use first segment so /lots/new highlights "lots")
  $$(".mainnav a").forEach(a => a.classList.toggle("active", a.dataset.route === segments[0]));
  const tpl = $(`#tpl-${tplKey}`);
  const view = $("#view");
  view.innerHTML = "";
  if (tpl) view.append(tpl.content.cloneNode(true));
  handler(params);
  renderUserChip();
  updateNavVisibility();
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", router);
window.addEventListener("load", async () => {
  await loadKMLData();
  $("#dataCount").textContent = `${MEMBERS.length} สมาชิก · ${PRODUCTIVE.length} แปลงผลิต · ${WATER.length} แหล่งน้ำ · ${LANDTITLES.length} เอกสารสิทธิ์`;

  renderUserChip();
  updateNavVisibility();
  renderSyncStatus();

  // Big-yellow banner if opened via file:// — PDF viewing won't work properly
  if (location.protocol === "file:") {
    const banner = document.createElement("div");
    banner.className = "file-protocol-banner";
    banner.innerHTML = `
      ⚠️ <b>คำเตือน:</b> คุณเปิดเว็บผ่าน <code>file://</code> ซึ่ง Chrome จะบล็อกการแสดงไฟล์ PDF
      <br>👉 <b>กรุณาปิดแท็บนี้แล้วดับเบิลคลิกไฟล์ "เปิดเว็บไซต์.bat"</b> เพื่อเปิดผ่าน HTTP เซิร์ฟเวอร์ (http://localhost:8765)
      <button class="banner-close">✕</button>
    `;
    document.body.insertBefore(banner, document.body.firstChild);
    banner.querySelector(".banner-close").onclick = () => banner.remove();
  }

  if (!location.hash) location.hash = "#/dashboard";
  else router();
});

/* ============ Dashboard ============ */
function renderDashboard() {
  const all = getAllRecords();
  $("#statMembers").textContent = all.length;
  const fmus = new Set(all.map(m => m.fmu).filter(Boolean));
  $("#statFMU").textContent = fmus.size;
  const totalArea = all.reduce((s, m) => s + (Number(m.areaRai) || 0), 0);
  $("#statArea").textContent = fmtNum(totalArea, 2);
  const waterStat = $("#statWater"); if (waterStat) waterStat.textContent = WATER.length;
  $("#statDocs").textContent = LANDTITLES.length;

  // Doc types — bar chart (many categories)
  const docTypeCount = {};
  all.forEach(m => { const t = m.docType; if (t) docTypeCount[t] = (docTypeCount[t] || 0) + 1; });
  renderBars("#docTypeChart", docTypeCount);

  // สายพันธุ์ — donut (few categories)
  const spCount = {};
  all.forEach(m => { const t = m.species; if (t) spCount[t] = (spCount[t] || 0) + 1; });
  renderDonut("#speciesChart", spCount, { palette: ["#2e7d32", "#1976d2", "#f57c00"] });

  // เพศ — donut
  const genderCount = {};
  all.forEach(m => { const v = m.gender; if (v) genderCount[v] = (genderCount[v] || 0) + 1; });
  renderDonut("#genderChart", genderCount, { palette: ["#1976d2", "#e91e63"] });

  // การจัดการแปลง — donut
  const mgmtCount = {};
  all.forEach(m => { const v = m.management; if (v) mgmtCount[v] = (mgmtCount[v] || 0) + 1; });
  renderDonut("#managementChart", mgmtCount, { palette: ["#00897b", "#fb8c00"] });

  // ระบบแบ่งกรีด — bar chart (many categories)
  const contractCount = {};
  all.forEach(m => { const v = m.contract; if (v) contractCount[v] = (contractCount[v] || 0) + 1; });
  renderBars("#contractChart", contractCount);

  // ── จำนวนเอกสารสิทธิ์ต่อตำบล แยกตามประเภท (deduplicated) ──
  const docBySubdistrict = {};
  const seenDocKey = new Set();
  all.forEach(m => {
    const sub = m.subdistrict;
    const docNo = m.docNo;
    const docType = m.docType;
    if (!sub || !docNo) return;
    const key = `${sub}::${docType}::${docNo}`;
    if (seenDocKey.has(key)) return;
    seenDocKey.add(key);
    if (!docBySubdistrict[sub]) docBySubdistrict[sub] = {};
    const dt = docType || "(ไม่ระบุ)";
    docBySubdistrict[sub][dt] = (docBySubdistrict[sub][dt] || 0) + 1;
  });
  renderDocBySubdistrict("#docPerSubdistrictChart", docBySubdistrict);

  // ── พื้นที่ลักษณะต่างๆ (sum of rai) ──
  const areaTypes = {
    "พื้นที่ให้ผลผลิต": 0,
    "พื้นที่เปิดกรีด": 0,
    "พื้นที่ทำไม้": 0,
    "ที่อยู่อาศัย": 0,
    "นาข้าว": 0,
    "แหล่งน้ำ": 0,
    "ผลไม้": 0,
    "อื่นๆ": 0,
    "พื้นที่อนุรักษ์": 0,
  };
  all.forEach(m => {
    areaTypes["พื้นที่ให้ผลผลิต"] += Number(m.productiveRai) || 0;
    areaTypes["พื้นที่เปิดกรีด"] += Number(m.tappingArea) || 0;
    areaTypes["พื้นที่ทำไม้"] += Number(m.woodArea) || 0;
    areaTypes["ที่อยู่อาศัย"] += Number(m.residenceArea) || 0;
    areaTypes["นาข้าว"] += Number(m.riceArea) || 0;
    areaTypes["แหล่งน้ำ"] += Number(m.waterArea) || 0;
    areaTypes["ผลไม้"] += Number(m.fruitArea) || 0;
    areaTypes["อื่นๆ"] += Number(m.otherArea) || 0;
    areaTypes["พื้นที่อนุรักษ์"] += Number(m.conservationArea) || 0;
  });
  const areaTypesRounded = {};
  Object.entries(areaTypes).forEach(([k, v]) => { if (v > 0) areaTypesRounded[k] = +v.toFixed(2); });
  // Stacked bar — proportional view shows composition at a glance
  renderStackedBar("#areaTypeChart", areaTypesRounded, { unit: "ไร่" });

  // ── พื้นที่ในแต่ละอำเภอ — donut (few categories) ──
  const districtArea = {};
  all.forEach(m => {
    const d = m.district;
    if (!d) return;
    districtArea[d] = (districtArea[d] || 0) + (Number(m.areaRai) || 0);
  });
  const districtAreaRounded = {};
  Object.entries(districtArea).forEach(([k, v]) => { districtAreaRounded[k] = +v.toFixed(2); });
  const totalArea2 = Object.values(districtAreaRounded).reduce((s, v) => s + v, 0);
  renderDonut("#districtChart", districtAreaRounded, {
    palette: ["#2e7d32", "#1976d2", "#f57c00", "#7b1fa2"],
    centerLabel: fmtNum(totalArea2, 0),
    centerSub: "ไร่",
  });

  // ── ปริมาณยางต่อ HUB — donut ──
  const hubYield = {};
  all.forEach(m => {
    const h = m.hub;
    if (!h) return;
    hubYield[h] = (hubYield[h] || 0) + (Number(m.yieldCupLumpKgYear) || 0);
  });
  const hubYieldRounded = {};
  Object.entries(hubYield).forEach(([k, v]) => { hubYieldRounded[k] = Math.round(v); });
  const totalHub = Object.values(hubYieldRounded).reduce((s, v) => s + v, 0);
  renderDonut("#hubChart", hubYieldRounded, {
    palette: ["#00897b", "#5e35b1", "#d84315"],
    centerLabel: (totalHub / 1000).toFixed(0) + "k",
    centerSub: "กก./ปี",
  });

  // ── ผลผลิตยางแห้งรวม ──
  // ยางก้อนถ้วยมีน้ำหนักประมาณ 65% เป็นยางแห้ง (DRC)
  const totalCupLump = all.reduce((s, m) => s + (Number(m.yieldCupLumpKgYear) || 0), 0);
  const totalLatex = all.reduce((s, m) => s + (Number(m.yieldLatexKgRai) || 0) * (Number(m.areaRai) || 0), 0);
  const dryRubberFromCupLump = totalCupLump * 0.65;  // DRC ~65%
  const totalDryRubber = dryRubberFromCupLump;
  const totalProductiveRai = all.reduce((s, m) => s + (Number(m.productiveRai) || 0), 0);
  const avgYieldPerRai = totalProductiveRai ? totalDryRubber / totalProductiveRai : 0;
  const annualYieldEl = $("#annualYieldStats");
  if (annualYieldEl) {
    annualYieldEl.innerHTML = "";
    const tiles = [
      { icon: "📦", label: "ยางก้อนถ้วยรวมต่อปี", value: fmtNum(totalCupLump, 0) + " กก.", cls: "qt-orange" },
      { icon: "💧", label: "ยางแห้งคาดการณ์ (DRC 65%)", value: fmtNum(totalDryRubber, 0) + " กก.", cls: "qt-green" },
      { icon: "🌳", label: "พื้นที่ให้ผลผลิตรวม", value: fmtNum(totalProductiveRai, 2) + " ไร่", cls: "qt-teal" },
      { icon: "📊", label: "ผลผลิตเฉลี่ย", value: fmtNum(avgYieldPerRai, 1) + " กก./ไร่/ปี", cls: "qt-blue" },
      { icon: "🏭", label: "จำนวน HUB", value: Object.keys(hubYield).length + " แห่ง", cls: "qt-purple" },
      { icon: "📍", label: "อำเภอที่ครอบคลุม", value: Object.keys(districtArea).length + " อำเภอ", cls: "qt-yellow" },
    ];
    tiles.forEach(t => {
      annualYieldEl.append(el("div", { class: "quota-tile " + t.cls },
        el("div", { class: "qt-icon" }, t.icon),
        el("div", { class: "qt-body" },
          el("div", { class: "qt-label" }, t.label),
          el("div", { class: "qt-value" }, t.value),
        ),
      ));
    });
  }

  renderWoodPlan(all);

  const tbody = $("#recentTable tbody");
  const recent = all.slice(-10).reverse();
  recent.forEach(m => {
    const tr = el("tr", { onclick: () => location.hash = `#/farmer/${encodeURIComponent(m.memberId || m.plot || m.fmu)}` },
      el("td", null, safe(m.fmu)),
      el("td", null, safe(m.nameTh)),
      el("td", null, fmtNum(m.areaRai, 2)),
      el("td", null, safe(m.species)),
      el("td", null, `${safe(m.subdistrict)} / ${safe(m.district)}`),
      el("td", null, "▸"),
    );
    tbody.append(tr);
  });
}

// SVG Donut chart — professional, compact
function renderDonut(sel, counts, opts) {
  const container = $(sel);
  if (!container) return;
  opts = opts || {};
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0 || entries.length === 0) {
    container.innerHTML = `<div class="muted" style="padding:20px;text-align:center">— ไม่มีข้อมูล —</div>`;
    return;
  }
  const PALETTE = opts.palette || ["#2e7d32", "#1976d2", "#f57c00", "#7b1fa2", "#00897b", "#c62828", "#5d4037", "#455a64"];
  const size = opts.size || 140;
  const stroke = opts.stroke || 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const segs = entries.map(([k, v], i) => {
    const pct = v / total;
    const dash = pct * c;
    const seg = `<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none"
      stroke="${PALETTE[i % PALETTE.length]}" stroke-width="${stroke}"
      stroke-dasharray="${dash} ${c}" stroke-dashoffset="${-offset}"
      transform="rotate(-90 ${size/2} ${size/2})" />`;
    offset += dash;
    return seg;
  }).join("");
  const centerText = opts.centerLabel || total.toLocaleString("th-TH");
  const centerSub = opts.centerSub || "รวม";

  const legend = entries.map(([k, v], i) => {
    const pct = ((v / total) * 100).toFixed(1);
    return `<div class="donut-legend-row">
      <span class="donut-dot" style="background:${PALETTE[i % PALETTE.length]}"></span>
      <span class="donut-legend-label">${k}</span>
      <span class="donut-legend-count">${v.toLocaleString("th-TH")}</span>
      <span class="donut-legend-pct">${pct}%</span>
    </div>`;
  }).join("");

  container.innerHTML = `
    <div class="donut-wrap">
      <svg viewBox="0 0 ${size} ${size}" class="donut-svg">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--gray-100)" stroke-width="${stroke}"/>
        ${segs}
        <text x="${size/2}" y="${size/2 - 4}" text-anchor="middle" class="donut-center-num">${centerText}</text>
        <text x="${size/2}" y="${size/2 + 16}" text-anchor="middle" class="donut-center-sub">${centerSub}</text>
      </svg>
      <div class="donut-legend">${legend}</div>
    </div>`;
}

// Stacked horizontal bar — single row showing proportions of all categories
function renderStackedBar(sel, counts, opts) {
  const container = $(sel);
  if (!container) return;
  opts = opts || {};
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) {
    container.innerHTML = `<div class="muted" style="padding:20px">— ไม่มีข้อมูล —</div>`;
    return;
  }
  const PALETTE = opts.palette || ["#2e7d32", "#388e3c", "#43a047", "#66bb6a", "#81c784", "#a5d6a7", "#1976d2", "#42a5f5", "#90caf9"];
  const unit = opts.unit || "";

  const segments = entries.map(([k, v], i) => {
    const pct = (v / total) * 100;
    return `<div class="stacked-seg" style="width:${pct}%;background:${PALETTE[i % PALETTE.length]}" title="${k}: ${v.toLocaleString("th-TH")} ${unit} (${pct.toFixed(1)}%)"></div>`;
  }).join("");

  const legend = entries.map(([k, v], i) => {
    const pct = ((v / total) * 100).toFixed(1);
    const formatted = v.toLocaleString("th-TH", { maximumFractionDigits: 2 });
    return `<div class="stacked-legend-row">
      <span class="donut-dot" style="background:${PALETTE[i % PALETTE.length]}"></span>
      <span class="stacked-legend-label">${k}</span>
      <span class="stacked-legend-value">${formatted}${unit ? " " + unit : ""}</span>
      <span class="stacked-legend-pct">${pct}%</span>
    </div>`;
  }).join("");

  container.innerHTML = `
    <div class="stacked-bar-wrap">
      <div class="stacked-bar">${segments}</div>
      <div class="stacked-legend">${legend}</div>
    </div>`;
}

function renderBars(sel, counts, opts) {
  const container = $(sel);
  if (!container) return;
  opts = opts || {};
  const maxRows = opts.maxRows || 12;
  const unit = opts.unit || "";
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, maxRows);
  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  const max = Math.max(...entries.map(e => e[1]), 1);
  container.innerHTML = "";
  if (entries.length === 0) {
    container.append(el("div", { class: "muted", style: "padding:10px;text-align:center" }, "— ไม่มีข้อมูล —"));
    return;
  }
  entries.forEach(([k, v], i) => {
    const pct = total ? (v / total) * 100 : 0;
    const formatted = v.toLocaleString("th-TH", { maximumFractionDigits: 2 });
    const label = k.length > 22 ? k.slice(0, 20) + "…" : k;
    const row = el("div", { class: "bar-row" },
      el("div", { class: "bar-head" },
        el("span", { class: "bar-label", title: k }, label),
        el("span", { class: "bar-value" }, formatted + (unit ? " " + unit : "")),
        el("span", { class: "bar-pct" }, pct.toFixed(1) + "%"),
      ),
      el("div", { class: "bar-track" },
        el("div", { class: "bar-fill", style: `width:${(v / max) * 100}%` }),
      ),
    );
    container.append(row);
  });
}

/* ============ Doc type breakdown by subdistrict ============ */
function renderDocBySubdistrict(sel, data) {
  const container = $(sel);
  if (!container) return;

  const PALETTE = {
    "น.ส.4 จ.":      "#1565c0",
    "น.ส.3 ก.":      "#00897b",
    "น.ส.3":         "#26a69a",
    "ส.ป.ก. 4-01 ก": "#f57c00",
    "ส.ป.ก. 4-01 ข": "#e64a19",
    "ส.ป.ก. 4-01":   "#ff8f00",
  };
  const FALLBACK = ["#5e35b1","#8e24aa","#00838f","#558b2f"];
  const color = (dt, i) => PALETTE[dt] || FALLBACK[i % FALLBACK.length];

  // doc types เรียงตามความถี่รวม
  const typeTotal = {};
  Object.values(data).forEach(counts =>
    Object.entries(counts).forEach(([dt, n]) => { typeTotal[dt] = (typeTotal[dt] || 0) + n; })
  );
  const docTypes = Object.entries(typeTotal).sort((a, b) => b[1] - a[1]).map(([dt]) => dt);
  const grandTotal = Object.values(typeTotal).reduce((s, v) => s + v, 0);

  // ตำบลเรียงตามยอดรวม
  const rows = Object.entries(data).sort((a, b) =>
    Object.values(b[1]).reduce((s, v) => s + v, 0) - Object.values(a[1]).reduce((s, v) => s + v, 0)
  );
  const maxTotal = rows[0] ? Object.values(rows[0][1]).reduce((s, v) => s + v, 0) : 1;

  // grid: [ตำบล][bar][col per type...][รวม]
  const cols = `80px 1fr ${docTypes.map(() => "44px").join(" ")} 44px`;

  const hdrTypes = docTypes.map((dt, i) =>
    `<div class="dbs-hdr" style="color:${color(dt,i)}" title="${dt}">${dt.replace("ส.ป.ก. 4-01", "สปก.4-01")}</div>`
  ).join("");

  const dataRows = rows.map(([sub, counts]) => {
    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    const barPct = (total / maxTotal) * 100;
    const segs = docTypes.map((dt, i) => {
      const n = counts[dt] || 0;
      if (!n) return "";
      return `<div class="dbs-seg" style="width:${(n/total*100).toFixed(1)}%;background:${color(dt,i)}" title="${dt}: ${n}"></div>`;
    }).join("");
    const cells = docTypes.map((dt, i) => {
      const n = counts[dt] || 0;
      return `<div class="dbs-cell${n ? " dbs-has" : ""}" style="${n ? `color:${color(dt,i)}` : ""}">${n || "—"}</div>`;
    }).join("");
    return `<div class="dbs-sub">${sub}</div>
      <div class="dbs-bar-col"><div class="dbs-minibar" style="width:${barPct}%">${segs}</div></div>
      ${cells}
      <div class="dbs-cell dbs-total">${total}</div>`;
  }).join("");

  const footCells = docTypes.map(dt =>
    `<div class="dbs-cell dbs-foot">${typeTotal[dt]}</div>`
  ).join("");

  container.innerHTML = `
    <div class="dbs-grid" style="grid-template-columns:${cols}">
      <div class="dbs-hdr">ตำบล</div>
      <div class="dbs-hdr"></div>
      ${hdrTypes}
      <div class="dbs-hdr dbs-hdr-total">รวม</div>
      ${dataRows}
      <div class="dbs-sub dbs-foot">รวมทั้งหมด</div>
      <div class="dbs-bar-col dbs-foot"></div>
      ${footCells}
      <div class="dbs-cell dbs-foot dbs-grand">${grandTotal}</div>
    </div>`;
}

/* ============ Wood harvest plan ============ */
function renderWoodPlan(all) {
  const THIS_YEAR = new Date().getFullYear() + 543;
  const PLAN5_END = THIS_YEAR + 4;
  const BAR_H = 140;

  const byYear = {};
  all.forEach(m => {
    const yr = Number(m.cutBEActual);  // ใช้ปีตัดโค่นจริง ไม่ใช่ปีคำนวณ 25 ปี
    if (!yr) return;
    if (!byYear[yr]) byYear[yr] = { plots: 0, area: 0, vol: 0, val: 0 };
    byYear[yr].plots++;
    byYear[yr].area += Number(m.areaRai) || 0;
    byYear[yr].vol  += Number(m.woodVolume) || 0;
    byYear[yr].val  += Number(m.woodValue) || 0;
  });

  // ── แผน 5 ปี ──
  const el5 = $("#woodPlan5yr");
  if (el5) {
    const years5 = [];
    for (let y = THIS_YEAR; y <= PLAN5_END; y++) {
      years5.push({ yr: y, ...(byYear[y] || { plots: 0, area: 0, vol: 0, val: 0 }) });
    }
    const tot = years5.reduce((a, d) => ({
      plots: a.plots + d.plots, area: a.area + d.area,
      vol: a.vol + d.vol, val: a.val + d.val,
    }), { plots: 0, area: 0, vol: 0, val: 0 });

    const kpis = [
      ["แปลงที่จะตัดโค่น", tot.plots + " แปลง", "wp-kpi-orange"],
      ["พื้นที่รวม", fmtNum(tot.area, 1) + " ไร่", "wp-kpi-teal"],
      ["ปริมาตรไม้", fmtNum(tot.vol, 0) + " ลบ.ม.", "wp-kpi-green"],
      ["มูลค่าโดยประมาณ", fmtNum(tot.val / 1000, 2) + " ล้าน฿", "wp-kpi-blue"],
    ];

    const rows = years5.map(d => {
      const isCurr = d.yr === THIS_YEAR;
      const badge = isCurr ? ' <span class="wp-badge">ปีนี้</span>' : "";
      return `<tr${isCurr ? ' class="wp-curr-row"' : ""}>
        <td>${d.yr}${badge}</td>
        <td class="num">${d.plots || "—"}</td>
        <td class="num">${d.area ? fmtNum(d.area, 1) : "—"}</td>
        <td class="num">${d.vol ? fmtNum(d.vol, 0) : "—"}</td>
        <td class="num">${d.val ? fmtNum(d.val, 0) : "—"}</td>
      </tr>`;
    }).join("");

    el5.innerHTML = `
      <div class="wp-kpi-grid">${kpis.map(([l, v, c]) =>
        `<div class="wp-kpi-tile ${c}"><div class="wp-kpi-val">${v}</div><div class="wp-kpi-lbl">${l}</div></div>`
      ).join("")}</div>
      <table class="wp-tbl">
        <thead><tr>
          <th>พ.ศ.</th><th class="num">แปลง</th><th class="num">ไร่</th>
          <th class="num">ปริมาตร (ลบ.ม.)</th><th class="num">มูลค่า (พัน฿)</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="wp-total">
          <td>รวม 5 ปี</td>
          <td class="num">${tot.plots}</td>
          <td class="num">${fmtNum(tot.area, 1)}</td>
          <td class="num">${fmtNum(tot.vol, 0)}</td>
          <td class="num">${fmtNum(tot.val, 0)}</td>
        </tr></tfoot>
      </table>`;
  }

  // ── แผน 25 ปี (timeline) ──
  const el25 = $("#woodPlan25yr");
  if (el25) {
    const yrs = Object.keys(byYear).map(Number).sort((a, b) => a - b);
    const minYr = yrs[0], maxYr = yrs[yrs.length - 1];
    const maxPlots = Math.max(...yrs.map(y => byYear[y].plots));

    const bars = [];
    for (let y = minYr; y <= maxYr; y++) {
      const d = byYear[y] || { plots: 0, area: 0, vol: 0, val: 0 };
      const px = d.plots ? Math.max(Math.round((d.plots / maxPlots) * BAR_H), 3) : 0;
      const cls = y < THIS_YEAR ? "wp-bar-past" : y === THIS_YEAR ? "wp-bar-curr" : "wp-bar-future";
      const tip = `พ.ศ. ${y}: ${d.plots} แปลง · ${fmtNum(d.vol, 0)} ลบ.ม. · ${fmtNum(d.val, 0)} พัน฿`;
      bars.push(`<div class="wp-bar-col" title="${tip}">
        <div class="wp-bar-top">${d.plots || ""}</div>
        <div class="wp-bar-track"><div class="wp-bar ${cls}" style="height:${px}px"></div></div>
        <div class="wp-bar-yr">${String(y).slice(2)}</div>
      </div>`);
    }

    el25.innerHTML = `
      <div class="wp-leg-strip">
        <span class="wp-leg-dot" style="background:var(--gray-300)"></span><span>ผ่านมาแล้ว</span>
        <span class="wp-leg-dot" style="background:#f57c00"></span><span>ปีนี้ (${THIS_YEAR})</span>
        <span class="wp-leg-dot" style="background:#43a047"></span><span>กำหนดตัดโค่น</span>
      </div>
      <div class="wp-timeline">${bars.join("")}</div>
      <div class="wp-tl-note">ตัวเลขบนแท่ง = จำนวนแปลง · วางเมาส์เพื่อดูรายละเอียด</div>`;
  }
}

/* ============ Farmers list ============ */
function renderFarmers() {
  const all = getAllRecords();
  const tbody = $("#farmersTable tbody");
  const search = $("#searchInput");
  const filterFMU = $("#filterFMU");
  const filterDoc = $("#filterDocType");

  const fmus = [...new Set(all.map(m => m.fmu).filter(Boolean))].sort();
  fmus.forEach(f => filterFMU.append(el("option", { value: f }, f)));
  const docs = [...new Set(all.map(m => m.docType).filter(Boolean))].sort();
  docs.forEach(d => filterDoc.append(el("option", { value: d }, d)));

  function render() {
    const q = search.value.trim().toLowerCase();
    const fF = filterFMU.value;
    const fD = filterDoc.value;
    tbody.innerHTML = "";
    let count = 0;
    all.forEach(m => {
      if (fF && m.fmu !== fF) return;
      if (fD && m.docType !== fD) return;
      if (q) {
        const blob = `${m.fmu} ${m.plot} ${m.memberId} ${m.nameTh} ${m.nameEn} ${m.docNo} ${m.subdistrict} ${m.district} ${m.idCard} ${m.phone}`.toLowerCase();
        if (!blob.includes(q)) return;
      }
      count++;
      const key = m.memberId || m.plot || m.fmu;
      const tr = el("tr", { onclick: () => location.hash = `#/farmer/${encodeURIComponent(key)}` },
        el("td", null, String(m.no || "")),
        el("td", null, safe(m.rmu)),
        el("td", null, safe(m.fmu)),
        el("td", null, safe(m.plot)),
        el("td", null, safe(m.nameTh) + (m._custom ? " 🆕" : "")),
        el("td", null, safe(m.phone)),
        el("td", null, safe(m.docType)),
        el("td", null, safe(m.docNo)),
        el("td", null, fmtNum(m.areaRai, 2)),
        el("td", null, safe(m.species)),
        el("td", null, safe(m.subdistrict)),
        el("td", null, "▸"),
      );
      tbody.append(tr);
    });
    $("#resultCount").textContent = `พบ ${count} รายการ`;
  }
  search.addEventListener("input", render);
  filterFMU.addEventListener("change", render);
  filterDoc.addEventListener("change", render);
  render();
}

/* ============ Farmer detail ============ */
function renderFarmerDetail(params) {
  const key = decodeURIComponent(params[0] || "");
  const all = getAllRecords();
  const m = all.find(x => (x.memberId === key) || (x.plot === key) || (x.fmu === key));
  if (!m) { $("#view").innerHTML = `<div class="page"><a href="#/farmers" class="back-link">← กลับ</a><div class="panel">ไม่พบข้อมูล</div></div>`; return; }

  $("#dNameTh").textContent = safe(m.nameTh);
  $("#dNameEn").textContent = safe(m.nameEn);
  $("#dFmu").textContent = `FMU: ${safe(m.fmu)}`;
  $("#dPlot").textContent = `แปลง: ${safe(m.plot)}`;

  function fillKV(sel, rows) {
    const dl = $(sel);
    rows.forEach(([k, v]) => { dl.append(el("dt", null, k), el("dd", null, safe(v))); });
  }

  fillKV("#kvPersonal", [
    ["รหัสสมาชิก", m.memberId], ["เพศ", m.gender], ["อายุ", m.age],
    ["เบอร์โทร", m.phone], ["เลขบัตรประชาชน", m.idCard],
    ["เลขทะเบียนเกษตรกรชาวสวนยาง", m.rubberRegNo],
  ]);
  fillKV("#kvPlot", [
    ["พื้นที่ (ไร่-งาน-ตร.วา)", `${safe(m.rai)}-${safe(m.ngan)}-${safe(m.sqWah)}`],
    ["พื้นที่รวม (ไร่)", fmtNum(m.areaRai, 2)],
    ["พื้นที่ (เฮกตาร์)", fmtNum(m.areaHa, 4)],
    ["พื้นที่ให้ผลผลิต (ไร่)", fmtNum(m.productiveRai, 2)],
    ["พื้นที่เปิดกรีด (ไร่)", fmtNum(m.tappingArea, 2)],
    ["พื้นที่ทำไม้ (ไร่)", fmtNum(m.woodArea, 2)],
    ["พื้นที่อนุรักษ์/ที่อยู่อาศัย/อื่น (ไร่)", fmtNum(m.totalNonProductive, 2)],
    ["พ.ศ.ที่ปลูก", m.plantBE], ["อายุยาง (ปี)", m.rubberAge],
    ["ระยะปลูก", m.spacing], ["สายพันธุ์", m.species],
    ["พิกัด (Lat, Lng)", (m.lat && m.lng) ? `${fmtNum(m.lat, 6)}, ${fmtNum(m.lng, 6)}` : "-"],
    ["ที่ตั้ง", `หมู่ ${safe(m.moo)} ${safe(m.village)} ต.${safe(m.subdistrict)} อ.${safe(m.district)} จ.${safe(m.province)}`],
  ]);
  fillKV("#kvDoc", [
    ["ประเภทเอกสาร", m.docType], ["เลขที่เอกสาร", m.docNo],
    ["ชื่อเจ้าของเอกสารสิทธิ์", m.docOwnerTh], ["Name (EN)", m.docOwnerEn],
    ["ความสัมพันธ์", m.relation], ["การชำระภาษีที่ดิน", m.taxStatus],
    ["วันที่ออกเอกสารสิทธิ์", fmtDate(m.docIssueDate)],
    ["ก่อน-หลัง 37", m.beforeAfter37],
  ]);
  fillKV("#kvMgmt", [
    ["การจัดการแปลง", m.management],
    ["RM ที่รับผิดชอบ", m.rmResponsible],
    ["GE ที่รับผิดชอบ", m.geResponsible],
    ["พ.ศ.ที่ขอทุนปลูกแทน", m.plantYear],
    ["ตัดโค่นเมื่ออายุ", m.cutAge],
    ["รูปแบบการกรีด", m.tappingType],
    ["สัญญาการกรีด", m.contract],
    ["เหตุผลที่ให้ผ่านปี 2563", m.reasonPass],
  ]);

  // Chemicals
  const chemEl = document.querySelector("#kvChem");
  if (chemEl) {
    [
      ["ประเภทสารเคมี", m.chemicalType],
      ["วันที่ใช้", m.chemicalApplyDate],
      ["อัตราใช้", m.chemicalRate],
      ["ส่วนผสม", m.chemicalIngredient],
      ["การขึ้นทะเบียน", m.chemicalRegistered],
      ["การอนุญาต", m.chemicalApproval],
      ["ปริมาณ", m.chemicalAmount],
      ["CAS Number", m.chemicalCas],
    ].forEach(([k, v]) => { chemEl.append(el("dt", null, k), el("dd", null, safe(v))); });
  }
  // Wood plan
  const woodEl = document.querySelector("#kvWood");
  if (woodEl) {
    [
      ["พ.ศ. ตัดโค่น (25 ปี)", m.cutBE25],
      ["พ.ศ. จริง", m.cutBEActual],
      ["น้ำหนักไม้ (กก.)", fmtNum(m.woodWeight, 2)],
      ["ปริมาตรไม้ (ลบ.ม.)", fmtNum(m.woodVolume, 2)],
      ["มูลค่าไม้ (บาท)", fmtNum(m.woodValue, 2)],
      ["AYI", fmtNum(m.ayi, 2)],
      ["AAC", fmtNum(m.aac, 2)],
    ].forEach(([k, v]) => { woodEl.append(el("dt", null, k), el("dd", null, safe(v))); });
  }

  // Attached doc files
  const files = loadFiles();
  const fileKey = m.memberId || m.plot;
  const docFilesContainer = $("#docFiles");
  if (files[fileKey]) {
    files[fileKey].forEach(f => {
      docFilesContainer.append(el("a", {
        href: f.data, target: "_blank", class: "uploaded-file",
        download: f.name,
      }, `📎 ${f.name}`));
    });
  } else {
    docFilesContainer.append(el("div", { class: "muted" }, "ยังไม่มีไฟล์เอกสารสิทธิ์แนบ — เพิ่มได้ในหน้า 'บันทึกข้อมูลใหม่'"));
  }

  // ── Land title documents section ──
  renderLandTitlePanel(m);

  // ── Tax documents section ──
  renderTaxPanel(m);

  // ── Application documents (เอกสารการสมัคร) ──
  renderApplicationPanel(m);

  // ── FSC supporting evidence (e.g., SPK declaration for ส.ป.ก. plots) ──
  renderFscEvidencePanel(m);

  // ── Quota section ──
  renderQuotaPanel(m);

  // Detail map
  const map = L.map("detailMap").setView([17.4, 101.5], 13);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Tiles © Esri", maxZoom: 19,
  }).addTo(map);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19, opacity: 0.8,
  }).addTo(map);

  const polys = [];
  PRODUCTIVE.forEach(p => {
    if (p.name === m.plot || p.name === m.fmu + "-" + (m.plot || "").split("-").pop()) {
      const layer = L.polygon(p.coordinates.map(c => [c[1], c[0]]), {
        color: "#00e676", weight: 3, fillColor: "#00c853", fillOpacity: 0.55,
      }).addTo(map);
      layer.bindPopup(`<b>${p.name}</b><br>🟢 พื้นที่ให้ผลผลิต`);
      polys.push(layer);
    }
  });
  LANDTITLES.forEach(p => {
    if (p.name && (p.name.split(",").map(s => s.trim()).includes(m.plot))) {
      const layer = L.polygon(p.coordinates.map(c => [c[1], c[0]]), {
        color: "#ffd600", weight: 3, fillColor: "#fff59d", fillOpacity: 0.15, dashArray: "10,6",
      }).addTo(map);
      layer.bindPopup(`<b>${p.name}</b><br>🟨 เอกสารสิทธิ์<br>${(p.description || "").substring(0, 200)}`);
      polys.push(layer);
    }
  });

  if (polys.length) {
    const group = L.featureGroup(polys);
    map.fitBounds(group.getBounds(), { padding: [30, 30] });
  } else {
    const info = el("div", { class: "muted", style: "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:12px 20px;border-radius:8px;z-index:1000" }, "ไม่พบ polygon สำหรับแปลงนี้");
    $("#detailMap").append(info);
  }

  $("#editBtn").onclick = () => {
    location.hash = `#/add`;
    setTimeout(() => prefillForm(m), 50);
  };
  $("#printBtn").onclick = () => window.print();
  $("#reportBtn").onclick = () => {
    location.hash = `#/report/${encodeURIComponent(m.memberId || m.plot)}`;
  };
  const cBtn = $("#complianceBtn");
  if (cBtn) cBtn.onclick = () => {
    location.hash = `#/compliance/${encodeURIComponent(m.memberId || m.plot)}`;
  };
}

/* ════════════════════════════════════════════════════════════════════
   📑 FSC COMPLIANCE REPORT — Conversion Date Verification (Principle 6.10)
   รวมหลักฐานทุกชั้นในหน้าเดียว: เอกสารสิทธิ์, ปีปลูก, GIS overlap, ภาพดาวเทียม
   ปัจจุบัน vs พ.ศ. 2536 → สรุป PASS / REVIEW / FAIL อัตโนมัติ
   ════════════════════════════════════════════════════════════════════ */

// แปลง Excel serial date หรือ string เป็น พ.ศ. (ตัวเลข)
function dateToBE(raw) {
  if (!raw) return null;
  // Excel serial
  if (typeof raw === "number" && raw > 50000 && raw < 90000) {
    const d = new Date((raw - 25569) * 86400 * 1000);
    return d.getFullYear() + 543;
  }
  // BE-format number e.g. 235120 (2x10y3m20d) — เดาเป็น YYYYMMDD พ.ศ.
  if (typeof raw === "number" && raw > 240000 && raw < 260000) {
    return Math.floor(raw / 10000);  // 235120 → 2351 (ผิด format)
  }
  // String YYYY-MM-DD
  if (typeof raw === "string") {
    const m = raw.match(/(\d{4})/);
    if (m) {
      const y = parseInt(m[1], 10);
      return y < 2500 ? y + 543 : y;
    }
  }
  return null;
}

// Point-in-polygon (ray casting) for [lng, lat] arrays
function pointInPolygon(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > pt[1]) !== (yj > pt[1])) &&
      (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function renderCompliance(params) {
  const plotKey = params && params[0] ? decodeURIComponent(params[0]) : null;
  const all = getAllRecords();
  const m = all.find(x => x.memberId === plotKey || x.plot === plotKey);
  if (!m) {
    $("#view").innerHTML = `<div class="page"><a href="#/farmers" class="back-link">← กลับ</a><div class="panel">ไม่พบข้อมูลแปลง ${safe(plotKey)}</div></div>`;
    return;
  }

  // ── Header meta ──
  const me = getCurrentUser();
  const now = new Date();
  const reportNo = `FSC-CONV-${m.fmu || "?"}-${m.plot || "?"}-${now.getFullYear() + 543}${String(now.getMonth() + 1).padStart(2, "0")}`;
  $("#compReportNo").textContent = reportNo;
  $("#compReportDate").textContent = now.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
  $("#compReportBy").textContent = `${me.displayName || me.username || "-"} (${me.role})`;
  $("#compBackLink").href = `#/farmer/${encodeURIComponent(plotKey)}`;

  // ── 1. Plot identification ──
  $("#cFmu").textContent = safe(m.fmu);
  $("#cPlot").textContent = safe(m.plot);
  $("#cOwner").textContent = safe(m.nameTh);
  $("#cMemberId").textContent = safe(m.memberId);
  $("#cArea").textContent = `${fmtNum(m.areaRai, 2)} ไร่ (${fmtNum(m.areaHa, 4)} เฮกตาร์)`;
  $("#cLatLng").textContent = (m.lat && m.lng) ? `${fmtNum(m.lat, 6)}, ${fmtNum(m.lng, 6)}` : "-";
  $("#cLocation").textContent = `หมู่ที่ ${safe(m.moo)} ${safe(m.village)} ต.${safe(m.subdistrict)} อ.${safe(m.district)} จ.${safe(m.province)}`;

  // ── 2. Land Title ──
  $("#cDocType").textContent = safe(m.docType);
  $("#cDocNo").textContent = safe(m.docNo);
  $("#cDocOwner").textContent = safe(m.docOwnerTh);
  $("#cTaxStatus").textContent = safe(m.taxStatus);
  const docBE = dateToBE(m.docIssueDate);
  $("#cDocDate").textContent = docBE ? `${m.docIssueDate} (พ.ศ. ${docBE})` : safe(m.docIssueDate);
  $("#cBeforeAfter").textContent = safe(m.beforeAfter37);
  const reason = (m.reasonPass || "").trim();
  $("#cReasonPass").textContent = reason || "— ไม่ระบุ —";

  const docFlag = $("#cFlagDoc");
  let docPass = null;
  let docDecision = "";  // ข้อความที่จะใช้ใน Final Assessment

  // ลำดับการพิจารณา:
  // 1) มี reasonPass = "เอกสารออกก่อน 30 พ.ย. 2537" → PASS เด็ดขาด
  // 2) document date หรือ beforeAfter37 ระบุก่อน 2537 → PASS
  // 3) beforeAfter37 = "หลัง" + มี reasonPass อื่น (ผ่อนผัน) → REVIEW
  // 4) beforeAfter37 = "หลัง" + ไม่มี reasonPass → FAIL
  // 5) ไม่มีข้อมูลชัดเจน → REVIEW

  if (reason.includes("ก่อน 30 พ.ย. 2537") || reason.includes("ก่อน 2537")) {
    docFlag.className = "comp-flag comp-pass";
    docFlag.innerHTML = `✅ <b>PASS</b> — มีเหตุผลผ่าน FSC: <b>"${reason}"</b> (เอกสารยืนยันการครอบครองก่อนวันที่ตัด FSC 30 พ.ย. 2537)`;
    docPass = true;
    docDecision = `✅ เอกสารยืนยันสภาพพื้นที่ก่อนวันที่ตัด FSC (${reason})`;
  } else if (isSpkDocType(m.docType)) {
    // ส.ป.ก. ทุกแปลง → PASS อัตโนมัติ เพราะมีประกาศเขตปฏิรูปที่ดิน (ก่อนปี 2537) เป็นหลักฐานประกอบ
    docFlag.className = "comp-flag comp-pass";
    docFlag.innerHTML = `✅ <b>PASS (ส.ป.ก.)</b> — ที่ดิน ส.ป.ก. (${m.docType}) อยู่ในเขตปฏิรูปที่ดินที่ประกาศก่อนปี 2537 → พื้นที่ถูกกำหนดให้เป็นเกษตรกรรมก่อนวันที่ตัด FSC<br><span style="font-size:9pt">📜 หลักฐานประกอบ: ประกาศเขตปฏิรูปที่ดิน สปก. เมืองเลย-วังสะพุง (ดูได้ในส่วน "หลักฐานประกอบ FSC")</span>`;
    docPass = true;
    docDecision = `✅ ส.ป.ก. (${m.docType}) — อยู่ในเขตปฏิรูปที่ดินก่อน 2537`;
  } else if (docBE && docBE < 2538) {
    docFlag.className = "comp-flag comp-pass";
    docFlag.innerHTML = `✅ <b>PASS</b> — เอกสารสิทธิ์ออกก่อนวันที่ตัดของ FSC (พ.ศ. ${docBE} &lt; 2537)`;
    docPass = true;
    docDecision = `✅ เอกสารสิทธิ์ออก พ.ศ. ${docBE} (ก่อน 2537)`;
  } else if (m.beforeAfter37 && m.beforeAfter37.includes("ก่อน")) {
    docFlag.className = "comp-flag comp-pass";
    docFlag.innerHTML = `✅ <b>PASS</b> — เอกสารสิทธิ์ระบุ "ก่อน 2537"${reason ? ` · เหตุผล: ${reason}` : ""}`;
    docPass = true;
    docDecision = `✅ เอกสารสิทธิ์ระบุก่อน 2537`;
  } else if (m.beforeAfter37 && m.beforeAfter37.includes("หลัง")) {
    if (reason) {
      // มี reasonPass อื่น (เช่น "เอกสารออกก่อน 30 พ.ย. 2538/39/40" หรือ "ไม่มีส่วนได้ส่วนเสีย...")
      // → REVIEW เพราะเป็นการผ่อนผัน FSC ต้องมีหลักฐานเสริม
      docFlag.className = "comp-flag comp-review";
      docFlag.innerHTML = `⚠️ <b>REVIEW</b> — เอกสารสิทธิ์ระบุ "หลัง 2537" — มีเหตุผลผ่อนผัน FSC: <b>"${reason}"</b><br><span style="font-size:9pt">⚙️ ต้องเก็บหลักฐานเสริม เช่น ภาพถ่ายดาวเทียมปี 2536 (ดูส่วนที่ 6), คำให้การพยาน, ทบก. เก่า, ก.ส.น. รุ่นก่อน</span>`;
      docPass = null;  // null = REVIEW
      docDecision = `⚠️ เอกสาร "หลัง 2537" แต่มีเหตุผลผ่อนผัน: ${reason}`;
    } else {
      docFlag.className = "comp-flag comp-fail";
      docFlag.innerHTML = `❌ <b>FAIL</b> — เอกสารสิทธิ์ระบุ "หลัง 2537" และไม่มีเหตุผลผ่อนผันในระบบ — ต้องตรวจสอบเร่งด่วน`;
      docPass = false;
      docDecision = `❌ เอกสาร "หลัง 2537" และไม่มีเหตุผลผ่อนผัน`;
    }
  } else {
    docFlag.className = "comp-flag comp-review";
    docFlag.innerHTML = `⚠️ <b>REVIEW</b> — ไม่พบวันที่ออกเอกสารชัดเจน — กรุณาตรวจสอบเอกสารต้นฉบับ${reason ? `<br>เหตุผลในระบบ: ${reason}` : ""}`;
    docDecision = `⚠️ ไม่พบวันที่ออกเอกสาร`;
  }

  // ── 3. GIS Cross-checks ──
  const prodPoly = PRODUCTIVE.find(p => p.name === m.plot);
  const ltPoly = LANDTITLES.find(p => p.name && p.name.split(",").map(s => s.trim()).includes(m.plot));
  $("#cPolyCheck").innerHTML = prodPoly
    ? `✅ มีขอบเขต polygon (${prodPoly.coordinates.length} จุด)`
    : `⚠️ ไม่พบ polygon ในชั้นข้อมูลพื้นที่ผลิต`;
  $("#cLtPolyCheck").innerHTML = ltPoly
    ? `✅ มีขอบเขต polygon เอกสารสิทธิ์ (${ltPoly.coordinates.length} จุด)`
    : `⚠️ ไม่พบ polygon เอกสารสิทธิ์`;

  // WDPA / IFL overlap check (point-in-polygon at centroid)
  let centerPt = null;
  if (prodPoly) {
    const c = polyCentroid(prodPoly.coordinates);
    centerPt = [c[1], c[0]];  // → [lng, lat]
  } else if (ltPoly) {
    const c = polyCentroid(ltPoly.coordinates);
    centerPt = [c[1], c[0]];
  } else if (m.lat && m.lng) {
    centerPt = [Number(m.lng), Number(m.lat)];
  }

  let inWdpa = false, wdpaName = "";
  if (centerPt && window.WDPA_AREAS) {
    for (const f of window.WDPA_AREAS) {
      for (const ring of (f.rings || [])) {
        if (pointInPolygon(centerPt, ring)) { inWdpa = true; wdpaName = f.name; break; }
      }
      if (inWdpa) break;
    }
  }
  const wdpaEl = $("#cWdpaCheck");
  if (inWdpa) {
    wdpaEl.innerHTML = `❌ <b>FAIL</b> — แปลงทับซ้อนกับเขตอนุรักษ์ "${wdpaName}" — ห้ามเด็ดขาด ต้องชี้แจง`;
  } else {
    wdpaEl.innerHTML = `✅ <b>PASS</b> — แปลงไม่อยู่ในเขต WDPA Protected Area`;
  }

  let inIfl = false;
  if (centerPt && window.IFL_THAILAND) {
    for (const f of window.IFL_THAILAND) {
      if (f.coords && pointInPolygon(centerPt, f.coords)) { inIfl = true; break; }
    }
  }
  const iflEl = $("#cIflCheck");
  if (inIfl) {
    iflEl.innerHTML = `❌ <b>FAIL</b> — แปลงทับซ้อนกับ Intact Forest Landscape (ป่าธรรมชาติ)`;
  } else {
    iflEl.innerHTML = `✅ <b>PASS</b> — แปลงไม่อยู่ในพื้นที่ป่าธรรมชาติ (IFL)`;
  }

  // ── 5. Supporting documents list ──
  const fmuMatch = (m.fmu || "").match(/FMU\s*(\d+)/i);
  const fmuNum = fmuMatch ? parseInt(fmuMatch[1], 10) : null;
  const docsList = $("#cDocsList");
  docsList.innerHTML = "";
  const docItems = [];
  if (fmuNum && AVAILABLE_FMU_PDFS.has(fmuNum)) docItems.push({ icon: "📜", name: `เอกสารสิทธิ์ที่ดิน FMU${fmuNum}`, status: "มีไฟล์" });
  if (fmuNum && window.TAX_DOCS && window.TAX_DOCS[`FMU${fmuNum}`]) docItems.push({ icon: "📋", name: `เอกสารภาษีที่ดิน FMU${fmuNum}`, status: "มีไฟล์" });
  if (fmuNum && AVAILABLE_APPLICATION_PDFS.has(fmuNum)) docItems.push({ icon: "📝", name: `เอกสารการสมัคร FMU${fmuNum}`, status: "มีไฟล์" });
  if (m.rubberRegNo && m.rubberRegNo !== "-") docItems.push({ icon: "🏛️", name: `ทะเบียนเกษตรกรชาวสวนยาง: ${m.rubberRegNo}`, status: "ขึ้นทะเบียนแล้ว" });
  if (docItems.length) {
    docItems.forEach(d => {
      docsList.append(el("div", { class: "comp-doc-item" },
        el("span", { class: "comp-doc-icon" }, d.icon),
        el("span", { class: "comp-doc-name" }, d.name),
        el("span", { class: "comp-doc-status" }, "✓ " + d.status),
      ));
    });
  } else {
    docsList.append(el("div", { class: "muted" }, "ยังไม่มีเอกสารประกอบในระบบ"));
  }

  // ── 6. Side-by-side maps ──
  function setupMap(divId, basemapKey) {
    const cfg = getBasemapConfig(basemapKey);
    const map = L.map(divId, { zoomControl: false, attributionControl: false });
    L.tileLayer(cfg.tileUrl, { maxZoom: cfg.maxZoom || 19, maxNativeZoom: cfg.maxNativeZoom }).addTo(map);
    const layers = [];
    if (prodPoly) {
      layers.push(L.polygon(prodPoly.coordinates.map(c => [c[1], c[0]]), {
        color: "#ff3d00", weight: 3, fill: false, dashArray: "6,4",
      }).addTo(map));
    }
    if (ltPoly) {
      layers.push(L.polygon(ltPoly.coordinates.map(c => [c[1], c[0]]), {
        color: "#ffd600", weight: 2.5, fill: false, opacity: 0.9,
      }).addTo(map));
    }
    if (layers.length) {
      map.fitBounds(L.featureGroup(layers).getBounds(), { padding: [20, 20] });
    } else if (m.lat && m.lng) {
      map.setView([m.lat, m.lng], 14);
    } else {
      map.setView([17.4, 101.5], 12);
    }
    setTimeout(() => map.invalidateSize(), 100);
    return map;
  }
  setupMap("cMap1993", "y2536");
  setupMap("cMapCurrent", "current");

  // ── 7. Final assessment ──
  const reasonsList = $("#cFinalReasons");
  reasonsList.innerHTML = "";
  const reasons = [];
  let pass = 0, fail = 0, review = 0;
  if (docPass === true) { pass++; reasons.push(docDecision || "✅ เอกสารสิทธิ์ยืนยันก่อนวันที่ตัด FSC"); }
  else if (docPass === false) { fail++; reasons.push(docDecision || "❌ เอกสารหลังวันที่ตัด FSC"); }
  else { review++; reasons.push(docDecision || "⚠️ ต้องเก็บหลักฐานเสริมเอกสารสิทธิ์"); }

  if (inWdpa) { fail++; reasons.push("❌ แปลงทับซ้อนเขตอนุรักษ์ WDPA"); }
  else { pass++; reasons.push("✅ ไม่อยู่ในเขต WDPA"); }

  if (inIfl) { fail++; reasons.push("❌ แปลงทับซ้อน Intact Forest Landscape"); }
  else { pass++; reasons.push("✅ ไม่อยู่ในพื้นที่ป่าธรรมชาติ (IFL)"); }

  reasons.forEach(r => reasonsList.append(el("li", null, r)));

  const finalBox = $("#cFinalBox");
  const finalIcon = $("#cFinalIcon");
  const finalLabel = $("#cFinalLabel");
  const stampEl = $("#compStamp");
  if (fail > 0) {
    finalBox.className = "comp-score-box comp-fail";
    finalIcon.textContent = "❌";
    finalLabel.textContent = "FAIL — ต้องแก้ไข";
    stampEl.textContent = "FAIL";
    stampEl.className = "comp-stamp comp-stamp-fail";
  } else if (review > 0) {
    finalBox.className = "comp-score-box comp-review";
    finalIcon.textContent = "⚠️";
    finalLabel.textContent = "REVIEW — ต้องเก็บหลักฐานเพิ่ม";
    stampEl.textContent = "REVIEW";
    stampEl.className = "comp-stamp comp-stamp-review";
  } else {
    finalBox.className = "comp-score-box comp-pass";
    finalIcon.textContent = "✅";
    finalLabel.textContent = "PASS — ผ่านเกณฑ์";
    stampEl.textContent = "PASS";
    stampEl.className = "comp-stamp comp-stamp-pass";
  }

  // ── Print button + map resize on print ──
  $("#compPrintBtn").onclick = () => setTimeout(() => window.print(), 200);
  window.addEventListener("beforeprint", () => {
    document.querySelectorAll(".comp-map").forEach(el => {
      const map = el._leaflet_map; if (map) map.invalidateSize();
    });
  });
}

/* ════════════════════════════════════════════════════════════════════
   📜 FSC SUPPORTING EVIDENCE
   หลักฐานประกอบเพิ่มเติมที่ใช้ยืนยันสิทธิ์การใช้ที่ดินก่อน FSC cutoff
   ตัวอย่าง: ประกาศเขตปฏิรูปที่ดิน (สปก.) ออกก่อนปี 2537 → ใช้กับแปลง ส.ป.ก. ทั้งหมด
   ════════════════════════════════════════════════════════════════════ */

// ตรวจว่า docType เป็น "ส.ป.ก." กลุ่มใดหรือไม่ (4-01, 4-01 ก, 4-01 ข, 5-03, etc.)
function isSpkDocType(docType) {
  if (!docType) return false;
  return /ส\.?ป\.?ก\.?/i.test(docType);
}

function renderFscEvidencePanel(rec) {
  const panel = $("#panelFscEvidence");
  const tag = $("#fscEvidenceTag");
  const note = $("#fscEvidenceNote");
  const list = $("#fscEvidenceList");
  if (!panel || !list) return;

  const evidences = [];

  // หลักฐานที่ 1: ประกาศเขตปฏิรูปที่ดิน สปก. — สำหรับแปลง ส.ป.ก. ทุกประเภท
  if (isSpkDocType(rec.docType)) {
    evidences.push({
      icon: "📜",
      title: "ประกาศเขตปฏิรูปที่ดิน สปก. เมืองเลย-วังสะพุง",
      subtitle: "หลักฐานยืนยันพื้นที่ถูกประกาศเป็นเขตเกษตรกรรมก่อนปี 2537",
      detail: "ใช้ประกอบเอกสารสิทธิ์ ส.ป.ก. ที่ออกหลังปี 2537 — พิสูจน์ว่าพื้นที่ไม่ใช่ป่าธรรมชาติก่อนวันที่ตัดของ FSC",
      path: "documents/fsc-evidence/spk-declaration-loei.pdf",
      tagText: "สปก. PASS",
    });
  }

  if (evidences.length === 0) {
    panel.style.display = "none";
    return;
  }

  panel.style.display = "";
  tag.textContent = `${evidences.length} ฉบับ`;
  note.innerHTML = `📌 <b>เอกสารเหล่านี้ใช้ประกอบการยืนยันสิทธิ์ที่ดิน</b> สำหรับเกษตรกรแปลงนี้ — ใช้ตอน FSC audit ตามมาตรา 6.10 (Conversion Date 1 พ.ย. 2537)`;

  list.innerHTML = "";
  evidences.forEach(ev => {
    const card = el("div", { class: "fsc-ev-card", onclick: () => {
      openWatermarkedPdf(ev.path, null, ev.title);
    } },
      el("div", { class: "fsc-ev-icon" }, ev.icon),
      el("div", { class: "fsc-ev-body" },
        el("div", { class: "fsc-ev-title" }, ev.title),
        el("div", { class: "fsc-ev-subtitle" }, ev.subtitle),
        el("div", { class: "fsc-ev-detail muted" }, ev.detail),
      ),
      el("div", { class: "fsc-ev-tag" }, ev.tagText),
      el("div", { class: "fsc-ev-action" }, "🔍 เปิดดู"),
    );
    list.append(card);
  });
}

/* ============ Application documents panel (เอกสารการสมัคร) ============ */
function renderApplicationPanel(rec) {
  const panel = $("#panelApplication");
  const list = $("#appDocList");
  const tag = $("#appFmuTag");
  const note = $("#appNote");
  if (!panel || !list) return;

  const fmuMatch = (rec.fmu || "").match(/FMU\s*(\d+)/i);
  if (!fmuMatch) { panel.style.display = "none"; return; }
  const fmuNum = parseInt(fmuMatch[1], 10);

  panel.style.display = "";
  tag.textContent = `FMU${fmuNum}`;
  list.innerHTML = "";

  if (AVAILABLE_APPLICATION_PDFS.has(fmuNum)) {
    const path = applicationPdfPath(fmuNum);
    note.innerHTML = `📝 <b>เอกสารการสมัครเข้าร่วมกลุ่ม FMU${fmuNum}</b> — เปิดดูได้พร้อมลายน้ำ`;
    const card = el("div", { class: "lt-doc-card", onclick: () => {
      openWatermarkedPdf(path, null, `FMU${fmuNum} (เอกสารการสมัคร)`);
    } },
      el("div", { class: "lt-doc-icon" }, "📋"),
      el("div", { class: "lt-doc-body" },
        el("div", { class: "lt-doc-title" }, `เอกสารการสมัคร FMU${fmuNum}`),
        el("div", { class: "lt-doc-meta" }, "🔒 ดูได้อย่างเดียว · มีลายน้ำกำกับ"),
      ),
      el("div", { class: "lt-doc-action" }, "🔍 เปิดดู"),
    );
    list.append(card);
  } else {
    note.innerHTML = `⏳ <b>FMU${fmuNum}: ยังไม่มีไฟล์เอกสารการสมัคร</b>`;
    list.append(el("div", { class: "tax-pending" },
      el("div", { class: "tax-pending-icon" }, "📭"),
      el("div", { class: "tax-pending-text" },
        el("b", null, "ยังไม่มีเอกสารการสมัครของ FMU นี้"),
        el("div", { class: "muted", style: "margin-top:4px" }, "เอกสารจะถูกเพิ่มเมื่อมีข้อมูลเข้ามาในระบบ"),
      ),
    ));
  }
}

/* ============ Land title documents panel (in farmer detail) ============ */
function renderLandTitlePanel(rec) {
  const panel = $("#panelLandTitle");
  const list = $("#ltDocList");
  const userBox = $("#ltUserFiles");
  const tag = $("#ltFmuTag");
  const note = $("#ltNote");
  if (!panel || !list) return;

  const fmuMatch = (rec.fmu || "").match(/FMU\s*(\d+)/i);
  if (!fmuMatch) { panel.style.display = "none"; return; }
  const fmuNum = parseInt(fmuMatch[1], 10);

  panel.style.display = "";
  tag.textContent = `FMU${fmuNum}`;

  // Official watermarked land title PDF (uses ltfix mapping if user has corrected)
  list.innerHTML = "";
  if (AVAILABLE_FMU_PDFS.has(fmuNum)) {
    const path = landTitlePdfForFmu(fmuNum);
    const mapping = loadLtFix();
    const correctedFile = Object.entries(mapping).find(([f, a]) => parseInt(a, 10) === fmuNum);
    const noteExtra = correctedFile ? ` <small>(ปรับ map: FMU${String(correctedFile[0]).padStart(3,"0")}.pdf)</small>` : "";
    note.innerHTML = `📄 <b>เอกสารสิทธิ์ที่ดินทางการของ FMU${fmuNum}</b> — เปิดดูได้พร้อมลายน้ำ${noteExtra}`;
    const card = el("div", { class: "lt-doc-card", onclick: () => {
      openWatermarkedPdf(path, null, `FMU${String(fmuNum).padStart(3,"0")} (เอกสารสิทธิ์)`);
    } },
      el("div", { class: "lt-doc-icon" }, "📜"),
      el("div", { class: "lt-doc-body" },
        el("div", { class: "lt-doc-title" }, `เอกสารสิทธิ์ที่ดิน FMU${fmuNum}`),
        el("div", { class: "lt-doc-meta" }, "🔒 ดูได้อย่างเดียว · มีลายน้ำกำกับ"),
      ),
      el("div", { class: "lt-doc-action" }, "🔍 เปิดดู"),
    );
    list.append(card);
  } else {
    note.innerHTML = `⏳ <b>FMU${fmuNum}: ยังไม่มีไฟล์เอกสารสิทธิ์ทางการ</b>`;
    list.append(el("div", { class: "tax-pending" },
      el("div", { class: "tax-pending-icon" }, "📭"),
      el("div", { class: "tax-pending-text" },
        el("b", null, "ยังไม่มีเอกสารสิทธิ์ของ FMU นี้"),
        el("div", { class: "muted", style: "margin-top:4px" }, "เอกสารจะถูกเพิ่มเมื่อมีข้อมูลเข้ามาในระบบ"),
      ),
    ));
  }

  // User-attached supplementary files (from landtitle placemarks containing this FMU)
  userBox.innerHTML = "";
  const docFiles = loadDocFiles();
  const matchingPlacemarks = (window.LAND_TITLES || []).filter(d => {
    if (!d.name) return false;
    return d.name.split(",").some(s => {
      const m = s.trim().match(/FMU\s*(\d+)/i);
      return m && parseInt(m[1], 10) === fmuNum;
    });
  });
  const supplementary = [];
  matchingPlacemarks.forEach(d => {
    const files = docFiles[d.name];
    if (files && files.length) {
      files.forEach((f, idx) => supplementary.push({ placemark: d.name, file: f, idx }));
    }
  });
  if (supplementary.length) {
    userBox.append(el("h4", { style: "margin:14px 0 8px 0;font-size:14px;color:var(--gray-700)" }, "📎 ไฟล์แนบเพิ่มเติม"));
    supplementary.forEach(s => {
      const item = el("div", { class: "doc-file-item" },
        el("a", { href: s.file.data, target: "_blank", class: "doc-file-link", download: s.file.name },
          `📎 ${s.file.name} (${s.placemark})`),
      );
      userBox.append(item);
    });
  }

  // Upload button to attach more files (keyed by farmer's FMU)
  const uploadKey = `__FMU${fmuNum}__`;
  const inputId = `lt-upload-${fmuNum}`;
  const fileInput = el("input", {
    type: "file", id: inputId, accept: "application/pdf,image/*",
    style: "display:none",
    onchange: e => {
      const fl = e.target.files[0];
      if (!fl) return;
      const reader = new FileReader();
      reader.onload = () => {
        const s = loadDocFiles();
        s[uploadKey] = s[uploadKey] || [];
        s[uploadKey].push({ name: fl.name, type: fl.type, size: fl.size, uploadedAt: Date.now(), data: reader.result });
        saveDocFiles(s);
        renderLandTitlePanel(rec);
      };
      reader.readAsDataURL(fl);
    },
  });
  const label = el("label", { class: "btn-attach", for: inputId, style: "margin-top:10px" }, "📎 แนบไฟล์เพิ่มเติม (PDF/รูป)");
  userBox.append(fileInput, label);

  // Show files uploaded under __FMUx__ key (per-farmer uploads)
  const ownFiles = docFiles[uploadKey] || [];
  if (ownFiles.length) {
    const wrap = el("div", { style: "margin-top:8px" });
    ownFiles.forEach((f, idx) => {
      const item = el("div", { class: "doc-file-item" },
        el("a", { href: f.data, target: "_blank", class: "doc-file-link", download: f.name }, `📎 ${f.name}`),
        el("button", {
          class: "btn-icon", title: "ลบ",
          onclick: e => {
            e.preventDefault(); e.stopPropagation();
            if (!confirm(`ลบไฟล์ "${f.name}"?`)) return;
            const s = loadDocFiles();
            s[uploadKey].splice(idx, 1);
            if (!s[uploadKey].length) delete s[uploadKey];
            saveDocFiles(s);
            renderLandTitlePanel(rec);
          },
        }, "🗑️"),
      );
      wrap.append(item);
    });
    userBox.insertBefore(wrap, label);
  }
}

/* ============ Tax documents panel ============ */
function renderTaxPanel(rec) {
  const panel = $("#panelTax");
  const list = $("#taxDocList");
  const tag = $("#taxFmuTag");
  const note = $("#taxNote");
  if (!panel || !list || !window.TAX_DOCS) {
    console.warn("[tax] panel or TAX_DOCS missing", { panel: !!panel, list: !!list, TAX_DOCS: !!window.TAX_DOCS });
    if (panel) panel.style.display = "none";
    return;
  }

  const fmuMatch = (rec.fmu || "").match(/FMU\s*(\d+)/i);
  if (!fmuMatch) { panel.style.display = "none"; return; }
  const fmuNum = parseInt(fmuMatch[1], 10);
  const mapping = window.TAX_DOCS.mapping || {};
  const findYearly = window.TAX_DOCS.findYearly || (() => []);

  // เอกสาร legacy (FMU-level — รวมหลายปีในไฟล์เดียว)
  const legacyEntries = (fmuNum in mapping) ? (mapping[fmuNum] || []) : [];

  // เอกสารรายปี (per plot — แยกตามปี)
  const yearlyDocs = findYearly(rec.plot);

  // ถ้าไม่มีเอกสารใดเลย → ซ่อน panel
  if (legacyEntries.length === 0 && yearlyDocs.length === 0 && !(fmuNum in mapping)) {
    panel.style.display = "none";
    return;
  }

  panel.style.display = "";
  tag.textContent = `FMU${fmuNum}`;
  list.innerHTML = "";

  // ── Yearly tax docs (ใหม่กว่า → แสดงก่อน) ──
  if (yearlyDocs.length) {
    list.append(el("h4", { class: "tax-section-h" }, `📅 เอกสารรายปี (${rec.plot})`));
    yearlyDocs.forEach(doc => {
      const card = el("div", { class: "tax-doc-card tax-doc-yearly" },
        el("div", { class: "tax-doc-icon" }, "📋"),
        el("div", { class: "tax-doc-body" },
          el("div", { class: "tax-doc-title" }, `เอกสารเสียภาษี พ.ศ. ${doc.year}`),
          el("div", { class: "tax-doc-meta" }, `แปลง ${rec.plot} · ${doc.path.split("/").pop()}`),
        ),
        el("div", { class: "tax-doc-year-badge" }, doc.year),
        el("div", { class: "tax-doc-action" }, "🔍 เปิดดู"),
      );
      card.onclick = () => openWatermarkedPdf(doc.path, null, `เอกสารภาษี ${rec.plot} (พ.ศ. ${doc.year})`);
      list.append(card);
    });
  }

  // ── Legacy FMU-level docs ──
  if (legacyEntries.length) {
    if (yearlyDocs.length) {
      list.append(el("h4", { class: "tax-section-h" }, "📦 เอกสารระดับ FMU (ชุดเก่า)"));
    }
    legacyEntries.forEach(entry => {
      if (!entry.path) return;
      const card = el("div", { class: "tax-doc-card" },
        el("div", { class: "tax-doc-icon" }, "📋"),
        el("div", { class: "tax-doc-body" },
          el("div", { class: "tax-doc-title" }, entry.title || "เอกสารเสียภาษี"),
          el("div", { class: "tax-doc-meta" }, entry.page ? `เปิดที่หน้า ${entry.page}` : "คลิกเพื่อเปิดดู"),
        ),
        el("div", { class: "tax-doc-action" }, "🔍 เปิดดู"),
      );
      card.onclick = () => {
        let url = entry.path;
        if (entry.page) url += `#page=${entry.page}`;
        openWatermarkedPdf(url, null, `${entry.title || "เอกสารภาษี"} — FMU${fmuNum}`);
      };
      list.append(card);
    });
  }

  // ── Header note ──
  if (yearlyDocs.length && legacyEntries.length) {
    note.innerHTML = `📄 <b>เอกสารเสียภาษีของแปลง ${rec.plot}</b> — มีทั้งเอกสารรายปี (${yearlyDocs.length} ปี) และไฟล์ชุดเก่า`;
  } else if (yearlyDocs.length) {
    note.innerHTML = `📄 <b>เอกสารเสียภาษีรายปีของแปลง ${rec.plot}</b> — ${yearlyDocs.length} ปี`;
  } else if (legacyEntries.length) {
    if (fmuNum <= 15) {
      note.innerHTML = `📦 <b>FMU1-FMU15 ใช้ไฟล์รวม</b> — เอกสารของ FMU1-15 อยู่ในไฟล์เดียวกัน (นายวีรวัฒน์ กาญจนดุล)`;
    } else {
      note.innerHTML = `📄 <b>เอกสารเสียภาษีของ FMU${fmuNum}</b>`;
    }
  } else {
    // FMU อยู่ใน mapping (pending list) แต่ไม่มีเอกสาร
    note.innerHTML = `⏳ <b>FMU${fmuNum} แปลง ${rec.plot}: ยังไม่มีเอกสารภาษี</b> — รอเพิ่มข้อมูล`;
    list.append(el("div", { class: "tax-pending" },
      el("div", { class: "tax-pending-icon" }, "📭"),
      el("div", { class: "tax-pending-text" },
        el("b", null, "ยังไม่มีเอกสารเสียภาษีของแปลงนี้"),
        el("div", { class: "muted", style: "margin-top:4px" }, "เอกสารจะถูกเพิ่มเมื่อมีข้อมูลเข้ามาในระบบ"),
      ),
    ));
  }
}

/* ============ Quota panel (render + inline edit) ============ */
function renderQuotaPanel(rec) {
  const view = $("#quotaView");
  const form = $("#quotaForm");
  const editBtn = $("#editQuotaBtn");
  const cancelBtn = $("#cancelQuotaBtn");
  if (!view || !form) return;

  function fmtKg(v) { return v == null || v === "" ? "-" : fmtNum(v, 2) + " กก."; }
  function fmtSacks(v) { return v == null || v === "" ? "-" : fmtNum(v, 0) + " ใบ"; }
  function fmtBaht(v) { return v == null || v === "" ? "-" : fmtNum(v, 2) + " ฿/กก."; }
  function fmtDateInput(v) {
    if (!v) return "-";
    try { return new Date(v).toLocaleDateString("th-TH"); } catch { return v; }
  }

  function paint() {
    const q = getQuotaFor(rec);
    const area = Number(rec.areaRai) || 0;
    const yieldPerRai = Number(q.yieldPerRai) || 0;
    const estAnnual = area * yieldPerRai;

    view.innerHTML = "";
    // Prefer record's annual yield if present, else estimate from yield-per-rai × area
    const annualKg = q.yieldCupLumpKgYear || estAnnual;
    const tiles = [
      { icon: "🌾", label: "ผลผลิตต่อไร่", value: q.yieldPerRai ? fmtKg(q.yieldPerRai) + "/ไร่/ปี" : "-", cls: "qt-green" },
      { icon: "🚚", label: "ปริมาณส่งยางต่อรอบ", value: fmtKg(q.deliveryPerRound), cls: "qt-blue" },
      { icon: "🧺", label: "จำนวนกระสอบที่ได้รับ", value: fmtSacks(q.sacksReceived), cls: "qt-orange" },
      { icon: "📈", label: "ผลผลิตยางก้อนถ้วยต่อปี", value: annualKg ? fmtKg(annualKg) : "-", cls: "qt-teal" },
      { icon: "🏭", label: "จุดรับซื้อ (Hub)", value: q.hub || "-", cls: "qt-purple" },
      { icon: "💼", label: "ผู้รับซื้อ", value: q.buyer || "-", cls: "qt-yellow" },
      { icon: "💰", label: "ราคารับซื้อ", value: fmtBaht(q.pricePerKg), cls: "qt-yellow" },
      { icon: "📅", label: "รอบส่งล่าสุด", value: fmtDateInput(q.lastDeliveryDate), cls: "qt-purple" },
      { icon: "⚖️", label: "ส่วนแบ่งรายได้", value: q.revenueShare || "-", cls: "qt-green" },
      { icon: "📊", label: "AYI (ดัชนีผลผลิต)", value: q.ayi != null ? fmtNum(q.ayi, 2) : "-", cls: "qt-blue" },
    ];
    tiles.forEach(t => {
      view.append(el("div", { class: "quota-tile " + t.cls },
        el("div", { class: "qt-icon" }, t.icon),
        el("div", { class: "qt-body" },
          el("div", { class: "qt-label" }, t.label),
          el("div", { class: "qt-value" }, t.value),
        ),
      ));
    });
    if (q.quotaNote) {
      view.append(el("div", { class: "quota-note" },
        el("strong", null, "📝 หมายเหตุ: "), q.quotaNote,
      ));
    }
    if (q._updatedAt) {
      view.append(el("div", { class: "muted quota-updated" },
        "อัปเดตล่าสุด: " + new Date(q._updatedAt).toLocaleString("th-TH"),
      ));
    }
  }
  paint();

  function showForm() {
    const q = getQuotaFor(rec);
    ["yieldPerRai", "deliveryPerRound", "sacksReceived", "pricePerKg", "lastDeliveryDate", "quotaNote"].forEach(k => {
      if (form.elements[k]) form.elements[k].value = q[k] ?? "";
    });
    view.style.display = "none";
    form.style.display = "";
    editBtn.style.display = "none";
  }
  function hideForm() {
    form.style.display = "none";
    view.style.display = "";
    editBtn.style.display = "";
  }
  editBtn.onclick = showForm;
  cancelBtn.onclick = hideForm;
  form.onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    setQuotaFor(rec, data);
    paint();
    hideForm();
  };
}

/* ============ Big Map ============ */
function renderMap() {
  $("#cntProd").textContent = PRODUCTIVE.length;
  $("#cntWater").textContent = WATER.length;
  $("#cntLT").textContent = LANDTITLES.length;
  $("#cntBuffer").textContent = BUFFERZONES.length;
  const map = L.map("bigMap").setView([17.4, 101.5], 12);

  // ── Satellite basemap (สลับปีได้ ผ่าน dropdown ใน toolbar) ──
  let baseLayer = createBasemapLayer(getSelectedBasemapKey()).addTo(map);
  // Boundary/labels overlay (อยู่บน basemap แต่โปร่งใส)
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19, opacity: 0.8,
  }).addTo(map);

  // Basemap year selector
  const ySel = $("#mapBasemapYear");
  if (ySel) {
    ySel.value = getSelectedBasemapKey();
    ySel.addEventListener("change", e => {
      const key = e.target.value;
      setSelectedBasemapKey(key);
      map.removeLayer(baseLayer);
      baseLayer = createBasemapLayer(key).addTo(map);
      baseLayer.bringToBack();
      showBasemapWarning(key);
    });
    // Show warning on first load if placeholder
    showBasemapWarning(ySel.value);
  }

  const prodLayer = L.layerGroup();
  const waterLayer = L.layerGroup();
  const ltLayer = L.layerGroup();
  const bufferLayer = L.layerGroup();

  // Water bodies: bright cyan/blue fill, solid border
  WATER.forEach(p => {
    const poly = L.polygon(p.coordinates.map(c => [c[1], c[0]]), {
      color: "#01579b",
      weight: 2,
      fillColor: "#29b6f6",
      fillOpacity: 0.7,
      smoothFactor: 1,
    });
    poly.bindPopup(`<div class="map-popup"><div class="pop-tag pop-tag-blue">🔵 แหล่งน้ำ</div><h4>${p.name}</h4></div>`);
    poly.bindTooltip(p.name, { className: "tip-water", direction: "top" });
    poly._name = p.name;
    poly.on("mouseover", e => e.target.setStyle({ weight: 4, fillOpacity: 0.9 }));
    poly.on("mouseout", e => e.target.setStyle({ weight: 2, fillOpacity: 0.7 }));
    waterLayer.addLayer(poly);
  });

  // Productive: SOLID lime/green fill, thin border — looks like "active rubber plot"
  PRODUCTIVE.forEach(p => {
    const poly = L.polygon(p.coordinates.map(c => [c[1], c[0]]), {
      color: "#00e676",       // bright lime border
      weight: 2,
      fillColor: "#00c853",   // vivid green fill
      fillOpacity: 0.55,
      smoothFactor: 1,
    });
    poly.bindPopup(`<div class="map-popup"><div class="pop-tag pop-tag-green">🟢 พื้นที่ให้ผลผลิต</div><h4>${p.name}</h4><a class="pop-link" href="#/farmer/${encodeURIComponent(p.name)}">→ ดูข้อมูลแปลง</a></div>`);
    poly.bindTooltip(p.name, { className: "tip-prod", direction: "top" });
    poly._name = p.name;
    poly.on("mouseover", e => e.target.setStyle({ weight: 4, fillOpacity: 0.75 }));
    poly.on("mouseout", e => e.target.setStyle({ weight: 2, fillOpacity: 0.55 }));
    prodLayer.addLayer(poly);
  });
  // Land title: outline only (no fill) so productive polygons underneath remain visible
  LANDTITLES.forEach(p => {
    const poly = L.polygon(p.coordinates.map(c => [c[1], c[0]]), {
      color: "#ffd600",        // vivid yellow border
      weight: 3,
      fill: false,
      dashArray: "10,6",
      smoothFactor: 1,
    });
    poly.bindPopup(`<div class="map-popup"><div class="pop-tag pop-tag-yellow">🟨 เอกสารสิทธิ์ที่ดิน</div><h4>${p.name}</h4><div class="pop-desc">${(p.description || "").replace(/<br\s*\/?>/g, "<br>").substring(0, 600)}</div></div>`);
    poly.bindTooltip(p.name, { className: "tip-lt", direction: "top" });
    poly._name = p.name;
    poly.on("mouseover", e => e.target.setStyle({ weight: 5 }));
    poly.on("mouseout", e => e.target.setStyle({ weight: 3 }));
    ltLayer.addLayer(poly);
  });

  // Buffer zone: purple dashed boundary lines (จาก Buffer zone.kml)
  BUFFERZONES.forEach(f => {
    const line = L.polyline(f.coordinates.map(c => [c[1], c[0]]), {
      color: "#6a1b9a",
      weight: 3,
      dashArray: "6,4",
      smoothFactor: 1,
    });
    line.bindPopup(`<div class="map-popup"><div class="pop-tag" style="background:#6a1b9a;color:white">🟪 Buffer Zone</div><h4>${f.name}</h4></div>`);
    line.bindTooltip(f.name, { className: "tip-buffer", direction: "top" });
    line._name = f.name;
    line.on("mouseover", e => e.target.setStyle({ weight: 5 }));
    line.on("mouseout", e => e.target.setStyle({ weight: 3 }));
    bufferLayer.addLayer(line);
  });

  // ── IFL + WDPA fetched from OpenStreetMap via Overpass API (reliable, no auth) ──
  // Bounding box: Loei province area (jt extends slightly outside FMU range)
  const OSM_BBOX = "16.5,100.8,17.9,102.5";
  const iflLayer = L.layerGroup();
  const wdpaLayer = L.layerGroup();
  let iflLoaded = false, wdpaLoaded = false;

  // Convert OSM JSON (ways + nodes) to GeoJSON Polygon features
  function osmToPolygons(osm) {
    const nodes = {};
    osm.elements.forEach(e => { if (e.type === "node") nodes[e.id] = [e.lon, e.lat]; });
    const features = [];
    osm.elements.forEach(e => {
      if (e.type === "way" && e.nodes && e.nodes.length > 2) {
        const coords = e.nodes.map(id => nodes[id]).filter(Boolean);
        if (coords.length > 2) {
          features.push({
            type: "Feature",
            properties: e.tags || {},
            geometry: { type: "Polygon", coordinates: [coords] },
          });
        }
      }
    });
    return features;
  }

  const OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
  ];
  async function fetchOverpass(query) {
    let lastErr;
    for (const url of OVERPASS_MIRRORS) {
      try {
        // GET with URL-encoded data avoids POST/CORS preflight issues
        const fullUrl = url + "?data=" + encodeURIComponent(query);
        console.log("[Overpass] trying", url);
        const res = await fetch(fullUrl);
        if (!res.ok) { lastErr = new Error("HTTP " + res.status); continue; }
        const data = await res.json();
        console.log("[Overpass] success from", url);
        return data;
      } catch (e) {
        console.warn("[Overpass] failed", url, e.message);
        lastErr = e;
      }
    }
    throw lastErr || new Error("Overpass mirrors all failed");
  }

  // Fetch a named protected area boundary from Nominatim (returns GeoJSON polygon)
  async function fetchNominatimBoundary(name) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=geojson&polygon_geojson=1&limit=1&countrycodes=th`;
    console.log("[Nominatim] fetch", name);
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error("Nominatim HTTP " + res.status);
    return res.json();
  }

  // Simplified Thailand outline (rough ~40-point polygon, sufficient for clipping)
  const THAILAND_FALLBACK = {
    type: "Feature",
    properties: { name: "Thailand (simplified)" },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [97.5, 20.4], [99.0, 20.5], [100.2, 20.4], [100.7, 19.5], [101.3, 19.6],
        [101.3, 18.5], [102.1, 17.95], [102.5, 17.85], [103.2, 18.2], [104.0, 17.9],
        [104.7, 17.5], [104.8, 16.4], [105.4, 16.0], [105.5, 15.0], [105.6, 14.4],
        [104.5, 14.4], [103.0, 14.1], [102.4, 13.5], [102.6, 12.5], [101.8, 12.7],
        [101.0, 12.6], [100.3, 13.4], [100.0, 13.0], [100.0, 12.0], [99.9, 11.5],
        [99.5, 10.5], [99.2, 9.5], [99.5, 9.0], [99.7, 8.5], [100.3, 7.5],
        [100.5, 7.0], [101.5, 6.7], [101.8, 5.9], [101.2, 5.6], [100.3, 6.4],
        [99.6, 6.7], [98.9, 7.9], [98.4, 8.4], [98.2, 9.3], [98.7, 10.2],
        [98.5, 11.0], [98.5, 12.0], [98.1, 13.0], [98.5, 14.5], [99.0, 16.1],
        [97.7, 16.5], [97.5, 17.5], [97.8, 18.5], [97.4, 19.5], [97.5, 20.4],
      ]],
    },
  };

  // Cache Thailand boundary (try Nominatim first, fallback to simplified)
  let _thailandBoundary = null;
  async function getThailandBoundary() {
    if (_thailandBoundary) return _thailandBoundary;
    try {
      const url = "https://nominatim.openstreetmap.org/search?country=Thailand&format=geojson&polygon_geojson=1&limit=1&polygon_threshold=0.05";
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      const data = await res.json();
      if (data.features && data.features[0] && data.features[0].geometry) {
        const g = data.features[0].geometry;
        if (g.type === "Polygon" || g.type === "MultiPolygon") {
          _thailandBoundary = data.features[0];
          console.log("[Thailand] boundary loaded from Nominatim:", g.type);
          return _thailandBoundary;
        }
      }
    } catch (e) {
      console.warn("[Thailand] Nominatim fetch failed:", e);
    }
    // Fallback to simplified outline
    console.log("[Thailand] using simplified fallback boundary");
    _thailandBoundary = THAILAND_FALLBACK;
    return _thailandBoundary;
  }

  // Clip a GeoJSON Feature to Thailand. Returns array of polygon coord rings.
  function clipToThailand(feature, thailand) {
    function extractRings(geom) {
      if (!geom) return [];
      if (geom.type === "Polygon") return [geom.coordinates[0]];
      if (geom.type === "MultiPolygon") return geom.coordinates.map(r => r[0]).filter(Boolean);
      return [];
    }
    if (!thailand || !window.turf) {
      console.warn("[clip] turf or Thailand boundary not available — using raw polygon");
      return extractRings(feature.geometry);
    }
    try {
      // Normalize feature: ensure polygon coordinates use simple Polygon
      let toClip = feature;
      if (feature.geometry.type === "MultiPolygon") {
        // Process each polygon individually
        const out = [];
        feature.geometry.coordinates.forEach(rings => {
          const subFeat = turf.polygon(rings);
          try {
            const sc = turf.intersect(subFeat, thailand);
            if (sc) out.push(...extractRings(sc.geometry));
          } catch (e) { /* skip bad subpolygon */ }
        });
        return out;
      }
      const clipped = turf.intersect(feature, thailand);
      if (!clipped) {
        console.warn("[clip] intersection empty — feature outside Thailand");
        return [];
      }
      return extractRings(clipped.geometry);
    } catch (e) {
      console.warn("[clip] failed:", e.message, "— using raw polygon");
      return extractRings(feature.geometry);
    }
  }

  // Known protected areas in/near จ.เลย (covering FMU bounding region)
  const WDPA_NAMES = [
    "Phu Ruea National Park",          // ภูเรือ
    "Phu Kradueng National Park",       // ภูกระดึง
    "Phu Luang Wildlife Sanctuary",     // ภูหลวง
    "Phu Suan Sai National Park",       // ภูสวนทราย
    "Na Haeo National Park",            // นาแห้ว
    "Phu Pha Lek National Park",        // ภูผาเหล็ก
  ];
  const IFL_NAMES = [
    // Major forest reserves in northern Thailand
    "Phu Khieo Wildlife Sanctuary",
    "Nam Nao National Park",
  ];

  async function loadGeoFromNominatim(names, layerGroup, style, tag) {
    const thailand = await getThailandBoundary();
    let count = 0;
    for (const name of names) {
      try {
        const data = await fetchNominatimBoundary(name);
        if (!data.features || data.features.length === 0) continue;
        const f = data.features[0];
        if (!f.geometry) continue;
        const displayName = f.properties.display_name?.split(",")[0] || name;
        // Clip to Thailand boundary
        const clippedRings = clipToThailand(f, thailand);
        if (clippedRings.length === 0) {
          console.warn(`[${tag}] ${name} — fully outside Thailand, skipped`);
          continue;
        }
        clippedRings.forEach(ring => {
          if (!ring || ring.length < 3) return;
          const poly = L.polygon(ring.map(c => [c[1], c[0]]), style);
          poly.bindPopup(`<div class="map-popup"><div class="pop-tag" style="background:${style.color};color:white">${tag}</div><h4>${displayName}</h4></div>`);
          poly.bindTooltip(displayName);
          layerGroup.addLayer(poly);
          count++;
        });
        // Respect Nominatim rate limit (1 req/sec)
        await new Promise(r => setTimeout(r, 1100));
      } catch (e) {
        console.warn(`[${tag}] failed for ${name}:`, e.message);
      }
    }
    return count;
  }

  function loadWDPA() {
    if (wdpaLoaded) return;
    // ใช้ pre-parsed data จาก data/wdpa.js (window.WDPA_AREAS) — shpjs มี bug กับ WDPA zip format นี้
    const data = window.WDPA_AREAS || [];
    if (!data.length) {
      showMapToast("❌ ไม่พบ data/wdpa.js — รัน extract-wdpa.ps1 เพื่อสร้างไฟล์", 8000);
      console.error("[WDPA] window.WDPA_AREAS empty — run extract-wdpa.ps1 to generate data/wdpa.js");
      wdpaLoaded = true;
      return;
    }
    const style = { color: "#00695c", weight: 1.5, fillColor: "#80cbc4", fillOpacity: 0.5 };
    let totalCount = 0;
    data.forEach(f => {
      const name = f.name || "Protected Area";
      const desig = f.desig || "";
      (f.rings || []).forEach(ring => {
        if (!ring || ring.length < 3) return;
        const latLngs = ring.map(c => [c[1], c[0]]);  // convert [lng,lat] → [lat,lng]
        const poly = L.polygon(latLngs, style);
        poly.bindPopup(`<div class="map-popup"><div class="pop-tag" style="background:#00695c;color:white">🟦 WDPA</div><h4>${name}</h4><div class="pop-desc">${desig}</div></div>`);
        poly.bindTooltip(name);
        wdpaLayer.addLayer(poly);
        totalCount++;
      });
    });
    wdpaLoaded = true;
    console.log("[WDPA] loaded", totalCount, "polygons from window.WDPA_AREAS");
    if (totalCount > 0) {
      const bounds = L.featureGroup(wdpaLayer.getLayers()).getBounds();
      showMapToast(`✅ โหลด WDPA สำเร็จ — ${totalCount} พื้นที่อนุรักษ์ <button class="btn btn-small" style="margin-left:8px" onclick="window._zoomToWDPA && window._zoomToWDPA()">📍 ดูทั้งหมด</button>`, 8000);
      window._zoomToWDPA = () => map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      showMapToast("❌ ไม่พบ polygon ใน WDPA_AREAS", 6000);
    }
  }

  async function loadIFL() {
    if (iflLoaded) return;
    showMapToast("⏳ กำลังโหลด IFL 2025 Thailand (~7 MB)...", 10000);
    const style = { color: "#1b5e20", weight: 1.5, fillColor: "#a5d6a7", fillOpacity: 0.45 };
    try {
      if (!window.IFL_THAILAND) {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "data/ifl-thailand.js";
          s.onload = resolve;
          s.onerror = () => reject(new Error("ไม่พบไฟล์ data/ifl-thailand.js"));
          document.head.appendChild(s);
        });
      }
      if (!window.IFL_THAILAND || !window.IFL_THAILAND.length) {
        throw new Error("IFL_THAILAND data empty");
      }
      let count = 0;
      for (const f of window.IFL_THAILAND) {
        if (!f.coords || f.coords.length < 3) continue;
        // coords คือ [lng, lat] → Leaflet ต้องการ [lat, lng]
        const latLngs = f.coords.map(c => [c[1], c[0]]);
        const poly = L.polygon(latLngs, style);
        const areaKm2 = f.area
          ? `${f.area.toLocaleString("th-TH", { maximumFractionDigits: 0 })} ตร.กม.`
          : "";
        poly.bindPopup(`<div class="map-popup"><div class="pop-tag" style="background:#1b5e20;color:white">🟢 IFL 2025</div><h4>${f.id}</h4><div class="pop-desc">พื้นที่: ${areaKm2}</div></div>`);
        poly.bindTooltip(f.id, { sticky: true });
        iflLayer.addLayer(poly);
        count++;
      }
      iflLoaded = true;
      showMapToast(count > 0
        ? `✅ โหลด IFL 2025 สำเร็จ — ${count} พื้นที่ป่าสมบูรณ์`
        : "ℹ️ ไม่พบข้อมูล IFL ในไฟล์");
    } catch (e) {
      console.error("[IFL]", e);
      showMapToast("❌ โหลด IFL ไม่สำเร็จ: " + e.message, 6000);
    }
  }

  // Add layers in z-order: WDPA/IFL (bottom), productive, water, LT outline, buffer zone (top)
  prodLayer.addTo(map);
  waterLayer.addTo(map);
  ltLayer.addTo(map);
  bufferLayer.addTo(map);

  // Buffer zone must always render above every other layer — re-assert
  // its z-order whenever another layer is (re)added to the map.
  function bringBufferToFront() { bufferLayer.eachLayer(l => l.bringToFront && l.bringToFront()); }

  $("#togProductive").addEventListener("change", e => {
    if (e.target.checked) { map.addLayer(prodLayer); bringBufferToFront(); } else map.removeLayer(prodLayer);
  });
  $("#togWater").addEventListener("change", e => {
    if (e.target.checked) { map.addLayer(waterLayer); bringBufferToFront(); } else map.removeLayer(waterLayer);
  });
  $("#togLandTitle").addEventListener("change", e => {
    if (e.target.checked) { map.addLayer(ltLayer); bringBufferToFront(); } else map.removeLayer(ltLayer);
  });
  $("#togBuffer").addEventListener("change", e => {
    if (e.target.checked) { map.addLayer(bufferLayer); bringBufferToFront(); } else map.removeLayer(bufferLayer);
  });
  $("#togIFL").addEventListener("change", async e => {
    if (e.target.checked) {
      await loadIFL();
      iflLayer.addTo(map);
      bringBufferToFront();
    } else map.removeLayer(iflLayer);
  });
  $("#togWDPA").addEventListener("change", async e => {
    if (e.target.checked) {
      await loadWDPA();
      wdpaLayer.addTo(map);
      bringBufferToFront();
    } else map.removeLayer(wdpaLayer);
  });

  // Fit all
  const allPolys = [...prodLayer.getLayers(), ...waterLayer.getLayers(), ...ltLayer.getLayers(), ...bufferLayer.getLayers()];
  if (allPolys.length) map.fitBounds(L.featureGroup(allPolys).getBounds());

  $("#fitAllBtn").onclick = () => map.fitBounds(L.featureGroup(allPolys).getBounds());

  $("#mapSearch").addEventListener("input", e => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) return;
    const found = allPolys.find(l => l._name && l._name.toLowerCase().includes(q));
    if (found) {
      map.fitBounds(found.getBounds(), { padding: [40, 40] });
      found.openPopup();
    }
  });

  setTimeout(() => map.invalidateSize(), 100);
}

/* ============ PDF Watermarking ============ */
const WATERMARK_TEXT = "ใช้สำหรับโครงการการจัดการสวนป่าอย่างยั่งยืน บริษัท เจริญโภคภัณฑ์การเกษตร จำกัด เท่านั้น";
const THAI_FONT_URLS = [
  "https://cdn.jsdelivr.net/gh/cadsondemak/Sarabun@master/fonts/Sarabun-Bold.ttf",
  "https://cdn.jsdelivr.net/npm/@fontsource/sarabun@5.0.0/files/sarabun-thai-700-normal.woff",
  "https://raw.githubusercontent.com/cadsondemak/Sarabun/master/fonts/Sarabun-Bold.ttf",
];
let _fontBytesCache = null;
async function loadThaiFontBytes() {
  if (_fontBytesCache) return _fontBytesCache;
  let lastErr = null;
  for (const url of THAI_FONT_URLS) {
    try {
      console.log("[font] fetching", url);
      const res = await fetch(url);
      if (!res.ok) { lastErr = new Error("HTTP " + res.status + " from " + url); continue; }
      _fontBytesCache = await res.arrayBuffer();
      console.log("[font] loaded", url, _fontBytesCache.byteLength, "bytes");
      return _fontBytesCache;
    } catch (e) {
      console.warn("[font] failed:", url, e);
      lastErr = e;
    }
  }
  throw new Error("ไม่สามารถโหลดฟอนต์ไทยจาก CDN ได้ — โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ต" + (lastErr ? " (" + lastErr.message + ")" : ""));
}

// FMU numbers that have an actual PDF file on disk (1..75)
const AVAILABLE_FMU_PDFS = new Set(Array.from({ length: 75 }, (_, i) => i + 1));

// FMU numbers that have an "application document" PDF in documents/applications/
// (68 files: FMU1-19, 25-35, 37-55, 56-70, 72-75)
const AVAILABLE_APPLICATION_PDFS = new Set([
  1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,
  16,17,18,19,
  25,26,27,
  28,29,
  30,31,32,33,34,35,
  37,38,39,
  40,41,
  42,
  43,44,45,46,
  47,48,49,50,51,52,53,54,55,
  56,57,58,59,
  60,61,62,63,64,65,66,67,68,69,
  70,72,73,74,75,
]);
function applicationPdfPath(num) {
  return `documents/applications/FMU${num}.pdf`;
}

// Extract FMU numbers from a land title placemark name like "FMU1-1, FMU2-3" → [1, 2]
function fmuNumbersFromName(name) {
  if (!name) return [];
  const matches = [...name.matchAll(/FMU\s*(\d+)/gi)];
  return [...new Set(matches.map(m => parseInt(m[1], 10)))].filter(n => AVAILABLE_FMU_PDFS.has(n));
}
function fmuPdfPath(num) {
  return `documents/landtitles/FMU${String(num).padStart(3, "0")}.pdf`;
}

async function generateWatermarkedPdf(pdfUrl) {
  if (!window.PDFLib) throw new Error("pdf-lib ยังไม่โหลด (ตรวจสอบการเชื่อมต่ออินเทอร์เน็ตของ unpkg.com)");
  if (!window.fontkit) throw new Error("fontkit ยังไม่โหลด");

  const { PDFDocument, degrees, rgb } = window.PDFLib;
  console.log("[wm] fetching PDF:", pdfUrl);
  const pdfRes = await fetch(pdfUrl);
  if (!pdfRes.ok) throw new Error(`ไม่พบไฟล์ PDF: ${pdfUrl} (HTTP ${pdfRes.status}) — ต้องเปิดผ่าน .bat (HTTP) ไม่ใช่ file://`);
  const pdfBytes = await pdfRes.arrayBuffer();
  console.log("[wm] PDF loaded:", pdfBytes.byteLength, "bytes");

  const fontBytes = await loadThaiFontBytes();

  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  pdfDoc.registerFontkit(window.fontkit);
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });

  const pages = pdfDoc.getPages();
  for (const page of pages) {
    const { width, height } = page.getSize();
    const diagonal = Math.sqrt(width * width + height * height);

    // Diagonal main watermark — single bold line, centered, rotated
    const fontSize = Math.min(width, height) * 0.030;
    const textWidth = font.widthOfTextAtSize(WATERMARK_TEXT, fontSize);
    const rows = Math.max(3, Math.ceil(diagonal / (fontSize * 5)));

    for (let i = 0; i < rows; i++) {
      const y = (i / rows) * height + (height / rows) / 2;
      page.drawText(WATERMARK_TEXT, {
        x: width / 2 - textWidth / 2,
        y: y - fontSize / 2,
        size: fontSize,
        font: font,
        color: rgb(0.85, 0.15, 0.15),
        opacity: 0.18,
        rotate: degrees(-30),
      });
    }

    // Strong banner at top of page
    page.drawRectangle({
      x: 0, y: height - fontSize * 2.5, width: width, height: fontSize * 2.5,
      color: rgb(0.85, 0.15, 0.15), opacity: 0.10,
    });
    const bannerSize = Math.min(width, height) * 0.022;
    const bw = font.widthOfTextAtSize(WATERMARK_TEXT, bannerSize);
    page.drawText(WATERMARK_TEXT, {
      x: width / 2 - bw / 2,
      y: height - fontSize * 1.7,
      size: bannerSize,
      font: font,
      color: rgb(0.6, 0.05, 0.05),
      opacity: 0.85,
    });

    // Footer line
    page.drawText(WATERMARK_TEXT, {
      x: width / 2 - bw / 2,
      y: fontSize * 0.6,
      size: bannerSize,
      font: font,
      color: rgb(0.6, 0.05, 0.05),
      opacity: 0.85,
    });
  }

  const out = await pdfDoc.save();
  return new Blob([out], { type: "application/pdf" });
}

// PDF modal viewer — view-only (download/print disabled via Chrome PDF viewer params)
function showPdfModal(title) {
  let modal = document.getElementById("pdfModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "pdfModal";
    modal.className = "pdf-modal";
    modal.innerHTML = `
      <div class="pdf-modal-content">
        <div class="pdf-modal-header">
          <span class="pdf-modal-title"></span>
          <div class="pdf-modal-actions">
            <span class="view-only-tag">🔒 ดูได้อย่างเดียว ห้ามดาวน์โหลด</span>
            <button class="btn btn-small pdf-close-btn">✕ ปิด</button>
          </div>
        </div>
        <div class="pdf-viewer-wrap">
          <iframe class="pdf-modal-frame"></iframe>
          <div class="pdf-watermark-overlay"></div>
        </div>
        <div class="pdf-modal-status"></div>
      </div>`;
    document.body.append(modal);
    modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
    modal.querySelector(".pdf-close-btn").addEventListener("click", closeModal);
    // Block context menu (right-click "Save as") on the viewer area
    modal.querySelector(".pdf-viewer-wrap").addEventListener("contextmenu", e => e.preventDefault());
    // Build HTML watermark overlay
    const wm = modal.querySelector(".pdf-watermark-overlay");
    const lines = 18;
    for (let i = 0; i < lines; i++) {
      const span = document.createElement("div");
      span.className = "wm-line";
      span.textContent = WATERMARK_TEXT;
      wm.appendChild(span);
    }
  }
  function closeModal() {
    const iframe = modal.querySelector(".pdf-modal-frame");
    iframe.removeAttribute("src");
    modal.style.display = "none";
  }
  modal.querySelector(".pdf-modal-title").textContent = title || "เอกสาร PDF";
  modal.style.display = "flex";
  return modal;
}

function openWatermarkedPdf(pdfUrl, _ignored, title) {
  const absUrl = new URL(pdfUrl, window.location.href).href;
  console.log("[doc] opening:", absUrl, "protocol:", location.protocol);

  const modal = showPdfModal(title);
  const frame = modal.querySelector(".pdf-modal-frame");
  const status = modal.querySelector(".pdf-modal-status");

  if (location.protocol === "file:") {
    // Chrome blocks PDF in iframes from file:// — use <embed> as fallback,
    // which more browsers permit in this scenario. The HTML watermark stays on top.
    const wrap = modal.querySelector(".pdf-viewer-wrap");
    frame.style.display = "none";
    let emb = wrap.querySelector("embed.pdf-modal-embed");
    if (!emb) {
      emb = document.createElement("embed");
      emb.className = "pdf-modal-embed";
      emb.type = "application/pdf";
      emb.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%;");
      wrap.insertBefore(emb, wrap.firstChild);
    }
    emb.src = absUrl;
    status.innerHTML = `⚠️ <b>เปิดผ่าน file://</b> — Chrome อาจบล็อกการแสดงเอกสาร<br>
      <small>ถ้าเอกสารไม่ขึ้น ให้ปิดแท็บนี้ → ดับเบิลคลิก <b>เปิดเว็บไซต์.bat</b> → เปิดผ่าน http://localhost:8765 แทน</small>`;
    return;
  }

  // Hide any leftover embed from file:// fallback
  const oldEmb = modal.querySelector("embed.pdf-modal-embed");
  if (oldEmb) oldEmb.style.display = "none";
  frame.style.display = "";

  status.textContent = "⏳ กำลังโหลดเอกสาร...";
  frame.onload = () => { status.textContent = ""; };
  frame.src = absUrl + "#toolbar=0";
}

/* ============ Documents page ============ */
const LS_DOC_FILES = "fsc_landtitle_files"; // keyed by land title placemark name
function loadDocFiles() { try { return JSON.parse(localStorage.getItem(LS_DOC_FILES) || "{}"); } catch { return {}; } }
function saveDocFiles(obj) { localStorage.setItem(LS_DOC_FILES, JSON.stringify(obj)); }

function renderDocuments() {
  const list = $("#docList");
  const search = $("#docSearch");

  function buildFileSection(docName) {
    const store = loadDocFiles();
    const files = store[docName] || [];
    const wrap = el("div", { class: "doc-files" });

    // Auto-attached official FMU PDFs (watermarked on-the-fly)
    const fmuNums = fmuNumbersFromName(docName);
    fmuNums.forEach(num => {
      const path = fmuPdfPath(num);
      const fname = `FMU${String(num).padStart(3, "0")}.pdf`;
      const item = el("div", { class: "doc-file-item doc-file-official" });
      const viewBtn = el("button", {
        class: "doc-file-link doc-file-btn",
        title: "เปิดดูเอกสาร (ห้ามดาวน์โหลด)",
        onclick: e => {
          e.stopPropagation();
          openWatermarkedPdf(path, null, `FMU${String(num).padStart(3,"0")}`);
        },
      }, `📄 เอกสารทางการ FMU${num} (ดูได้อย่างเดียว)`);
      item.append(viewBtn);
      wrap.append(item);
    });

    // Existing files
    files.forEach((f, idx) => {
      const item = el("div", { class: "doc-file-item" });
      const link = el("a", {
        href: f.data, target: "_blank", class: "doc-file-link",
        download: f.name,
        onclick: e => e.stopPropagation(),
      }, `📎 ${f.name}`);
      const del = el("button", {
        class: "btn-icon", title: "ลบไฟล์",
        onclick: e => {
          e.stopPropagation();
          if (!confirm(`ลบไฟล์ "${f.name}"?`)) return;
          const s = loadDocFiles();
          s[docName].splice(idx, 1);
          if (s[docName].length === 0) delete s[docName];
          saveDocFiles(s);
          render();
        },
      }, "🗑️");
      item.append(link, del);
      wrap.append(item);
    });
    // Upload button
    const fileId = `file-${btoa(unescape(encodeURIComponent(docName))).replace(/[^a-zA-Z0-9]/g, "")}`;
    const input = el("input", {
      type: "file", id: fileId, accept: "application/pdf,image/*",
      style: "display:none",
      onchange: e => {
        const fl = e.target.files[0];
        if (!fl) return;
        if (fl.size > 5 * 1024 * 1024) {
          if (!confirm(`ไฟล์ขนาด ${(fl.size/1024/1024).toFixed(1)} MB ใหญ่กว่า 5 MB อาจทำให้พื้นที่เก็บข้อมูลเต็ม ต้องการอัปโหลดต่อไหม?`)) return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const s = loadDocFiles();
            s[docName] = s[docName] || [];
            s[docName].push({ name: fl.name, type: fl.type, size: fl.size, uploadedAt: Date.now(), data: reader.result });
            saveDocFiles(s);
            render();
          } catch (err) {
            alert("เก็บไฟล์ไม่สำเร็จ — พื้นที่ localStorage อาจเต็ม\n" + err.message);
          }
        };
        reader.readAsDataURL(fl);
      },
    });
    const label = el("label", {
      class: "btn-attach", for: fileId,
      onclick: e => e.stopPropagation(),
    }, "📎 แนบไฟล์ PDF");
    wrap.append(input, label);
    return wrap;
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    list.innerHTML = "";
    let count = 0, withFile = 0;
    const store = loadDocFiles();
    LANDTITLES.forEach(d => {
      const blob = `${d.name} ${d.description}`.toLowerCase();
      if (q && !blob.includes(q)) return;
      count++;
      const userFiles = store[d.name] && store[d.name].length > 0;
      const officialFmus = fmuNumbersFromName(d.name);
      const hasFile = userFiles || officialFmus.length > 0;
      if (hasFile) withFile++;
      const card = el("div", { class: "doc-card" + (hasFile ? " has-file" : "") + (officialFmus.length > 0 ? " has-official" : ""), onclick: () => {
        location.hash = `#/map`;
        setTimeout(() => {
          const mi = $("#mapSearch");
          if (mi) { mi.value = d.name.split(",")[0].trim(); mi.dispatchEvent(new Event("input")); }
        }, 200);
      } },
        el("h4", null, (hasFile ? "✅" : "📄") + ` ${d.name}`),
        el("div", { class: "doc-info" }, (d.description || "").replace(/<br>/g, "\n")),
        buildFileSection(d.name),
      );
      list.append(card);
    });
    $("#docCount").textContent = `${count} เอกสาร (แนบไฟล์แล้ว ${withFile})`;
  }
  search.addEventListener("input", render);
  render();
}

/* ============ Trace page ============ */
function renderTrace() {
  let traceMiniMaps = [];

  function badge(text, cls) {
    return el("span", { class: "tr-badge " + (cls || "") }, text);
  }

  function fscBadge(ok, labelOk, labelNo) {
    return badge(ok ? "✅ " + labelOk : "❌ " + labelNo, ok ? "tr-badge-green" : "tr-badge-red");
  }

  function buildCoCFlow(m) {
    const flow = el("div", { class: "coc-flow" });
    const steps = [
      { icon: "🌱", title: "แปลงปลูก", sub: safe(m.plot) },
      { icon: "📦", title: "รูปแบบผลิต", sub: safe(m.productForm) },
      { icon: "🏭", title: "HUB รับซื้อ", sub: safe(m.hub) },
      { icon: "🏢", title: "ผู้ซื้อ", sub: m.buyer ? (m.buyer.length > 20 ? m.buyer.slice(0, 20) + "…" : m.buyer) : "-" },
    ];
    steps.forEach((s, i) => {
      flow.append(el("div", { class: "coc-step" },
        el("div", { class: "coc-icon" }, s.icon),
        el("div", { class: "coc-label" }, s.title),
        el("div", { class: "coc-sub" }, s.sub),
      ));
      if (i < steps.length - 1) flow.append(el("div", { class: "coc-arrow" }, "→"));
    });
    return flow;
  }

  function buildFscCompliance(m) {
    const wrap = el("div", { class: "tr-compliance" });
    const totalArea = Number(m.areaRai) || 0;
    const fscArea = Number(m.fscArea) || 0;
    const nonFscArea = Number(m.nonFscArea) || 0;
    const pct = totalArea ? Math.round((fscArea / totalArea) * 100) : 0;

    wrap.append(
      el("div", { class: "tr-compliance-title" }, "🛡️ FSC Compliance"),
      el("div", { class: "tr-compliance-grid" },
        el("div", null,
          fscBadge(fscArea > 0, `พื้นที่ FSC ${fmtNum(fscArea,2)} ไร่ (${pct}%)`, `ไม่มีพื้นที่ FSC`)),
        el("div", null,
          fscBadge(m.beforeAfter37 && m.beforeAfter37.includes("หลัง"), "หลังปี 2537 ✓", `ก่อนปี 2537: ${safe(m.beforeAfter37)}`)),
        el("div", null,
          fscBadge(m.taxStatus === "ชำระแล้ว" || m.taxStatus === "ได้รับการยกเว้น", `ภาษีที่ดิน: ${safe(m.taxStatus)}`, `ภาษีที่ดิน: ${safe(m.taxStatus)}`)),
        el("div", null,
          fscBadge(!!m.reasonPass && m.reasonPass !== "-", safe(m.reasonPass).slice(0, 40), "ยังไม่มีเหตุผลผ่าน FSC")),
      ),
    );
    if (fscArea > 0 || nonFscArea > 0) {
      const barWrap = el("div", { class: "fsc-area-bar-wrap", title: `FSC: ${fmtNum(fscArea,2)} ไร่ · ไม่ผ่าน: ${fmtNum(nonFscArea,2)} ไร่` });
      const fscPct = totalArea ? (fscArea / totalArea) * 100 : 0;
      const nonPct = totalArea ? (nonFscArea / totalArea) * 100 : 0;
      barWrap.append(
        el("div", { class: "fsc-area-bar" },
          fscPct > 0 ? el("div", { class: "fsc-bar-seg fsc-bar-fsc", style: `width:${fscPct}%` }, fscPct > 10 ? `FSC ${fscPct.toFixed(0)}%` : "") : null,
          nonPct > 0 ? el("div", { class: "fsc-bar-seg fsc-bar-non", style: `width:${nonPct}%` }, nonPct > 10 ? `Non ${nonPct.toFixed(0)}%` : "") : null,
        ),
        el("div", { class: "fsc-area-bar-legend" },
          el("span", { class: "fsc-dot fsc-dot-fsc" }, `FSC ${fmtNum(fscArea,2)} ไร่`),
          nonFscArea > 0 ? el("span", { class: "fsc-dot fsc-dot-non" }, `Non-FSC ${fmtNum(nonFscArea,2)} ไร่`) : null,
        ),
      );
      wrap.append(barWrap);
    }
    return wrap;
  }

  function buildYieldSection(m) {
    const cupLump = Number(m.yieldCupLumpKgYear) || 0;
    const drc = cupLump * 0.65;
    const ayi = Number(m.ayi) || 0;
    const aac = Number(m.aac) || 0;
    return el("div", { class: "tr-yield-grid" },
      el("div", { class: "tr-yield-tile" },
        el("div", { class: "tr-yield-val" }, fmtNum(cupLump, 0)),
        el("div", { class: "tr-yield-lbl" }, "📦 ยางก้อนถ้วย (กก./ปี)"),
      ),
      el("div", { class: "tr-yield-tile" },
        el("div", { class: "tr-yield-val" }, fmtNum(drc, 0)),
        el("div", { class: "tr-yield-lbl" }, "💧 ยางแห้ง DRC 65% (กก./ปี)"),
      ),
      el("div", { class: "tr-yield-tile" },
        el("div", { class: "tr-yield-val" }, fmtNum(ayi, 2)),
        el("div", { class: "tr-yield-lbl" }, "🌳 AYI (ตัน/ไร่/ปี)"),
      ),
      el("div", { class: "tr-yield-tile" },
        el("div", { class: "tr-yield-val" }, m.contract ? m.contract.split(" ")[0] : "-"),
        el("div", { class: "tr-yield-lbl" }, "✂️ สัญญากรีด"),
      ),
    );
  }

  function buildMiniMap(m, prodPoly, ltPoly, mapId) {
    const wrap = el("div", { class: "tr-minimap-wrap" });
    const toggleBtn = el("button", { class: "btn btn-small tr-minimap-btn" }, "🗺️ ดูแผนที่แปลง");
    const mapDiv = el("div", { id: mapId, class: "tr-minimap", style: "display:none" });
    let mapInstance = null;
    toggleBtn.onclick = () => {
      if (mapDiv.style.display === "none") {
        mapDiv.style.display = "block";
        toggleBtn.textContent = "🗺️ ซ่อนแผนที่";
        if (!mapInstance) {
          mapInstance = L.map(mapId, { zoomControl: true }).setView([m.lat || 17.4, m.lng || 101.5], 14);
          L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
            attribution: "© Esri", maxZoom: 19,
          }).addTo(mapInstance);
          L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
            maxZoom: 19, opacity: 0.8,
          }).addTo(mapInstance);
          const polys = [];
          if (prodPoly) {
            const layer = L.polygon(prodPoly.coordinates.map(c => [c[1], c[0]]), {
              color: "#00e676", weight: 3, fillColor: "#00c853", fillOpacity: 0.55,
            }).addTo(mapInstance);
            layer.bindPopup(`<b>${prodPoly.name}</b><br>🟢 พื้นที่ให้ผลผลิต<br>${fmtNum(m.productiveRai,2)} ไร่`);
            polys.push(layer);
          }
          if (ltPoly) {
            const layer = L.polygon(ltPoly.coordinates.map(c => [c[1], c[0]]), {
              color: "#ffd600", weight: 2, fillColor: "#fff59d", fillOpacity: 0.15, dashArray: "8,5",
            }).addTo(mapInstance);
            layer.bindPopup(`<b>${ltPoly.name}</b><br>🟨 เอกสารสิทธิ์`);
            polys.push(layer);
          }
          if (polys.length) {
            mapInstance.fitBounds(L.featureGroup(polys).getBounds(), { padding: [24, 24] });
          } else if (m.lat && m.lng) {
            mapInstance.setView([m.lat, m.lng], 15);
            L.circleMarker([m.lat, m.lng], { radius: 8, color: "#2e7d32", fillColor: "#43a047", fillOpacity: 0.9 })
              .bindPopup(`<b>${safe(m.nameTh)}</b><br>${safe(m.plot)}`)
              .addTo(mapInstance);
          }
          traceMiniMaps.push(mapInstance);
          setTimeout(() => mapInstance.invalidateSize(), 50);
        }
      } else {
        mapDiv.style.display = "none";
        toggleBtn.textContent = "🗺️ ดูแผนที่แปลง";
      }
    };
    wrap.append(toggleBtn, mapDiv);
    return wrap;
  }

  let mapCounter = 0;

  function renderLotMatch(lot, result) {
    const t = calcLotTotals(lot);
    const card = el("div", { class: "trace-lot-card" },
      el("h3", null, `📦 ${lot.lotId}`),
      el("div", { class: "muted" },
        `วันที่รับซื้อ ${safe(lot.purchaseDate)} · HUB ${safe(lot.hub)} · ${safe(lot.productForm)} · ${safe(lot.fscClaim)}`),
      el("div", { class: "trace-lot-kpis" },
        el("div", { class: "trace-lot-kpi" },
          el("div", { class: "trace-lot-kpi-label" }, "น้ำหนักรวม"),
          el("div", { class: "trace-lot-kpi-value" }, fmtNum(t.totalWeightKg, 2) + " กก.")),
        el("div", { class: "trace-lot-kpi" },
          el("div", { class: "trace-lot-kpi-label" }, `DRC ${lot.drcPercent}%`),
          el("div", { class: "trace-lot-kpi-value" }, fmtNum(t.totalDrcKg, 2) + " กก.")),
        el("div", { class: "trace-lot-kpi" },
          el("div", { class: "trace-lot-kpi-label" }, "แปลงต้นทาง"),
          el("div", { class: "trace-lot-kpi-value" }, t.plotCount + " แปลง")),
        el("div", { class: "trace-lot-kpi" },
          el("div", { class: "trace-lot-kpi-label" }, "สถานะ"),
          el("div", { class: "trace-lot-kpi-value" }, safe(lot.status))),
      ),
      el("h4", { style: "margin:14px 0 6px 0" }, "🌱 แปลงต้นทาง:"),
    );
    const tbl = el("table", { class: "data-table", style: "background:white;border-radius:6px;margin:0" });
    tbl.append(el("thead", null, el("tr", null,
      el("th", null, "#"), el("th", null, "FMU/แปลง"), el("th", null, "เกษตรกร"),
      el("th", null, "น้ำหนัก"), el("th", null, "%"), el("th", null, "ใบชั่ง"), el("th", null, ""))));
    const tb = el("tbody");
    lot.sources.forEach((s, i) => {
      const pct = t.totalWeightKg ? (Number(s.weightKg) / t.totalWeightKg) * 100 : 0;
      tb.append(el("tr", null,
        el("td", null, String(i + 1)),
        el("td", null, el("b", null, safe(s.fmu)), " · ", safe(s.plot)),
        el("td", null, safe(s.nameTh)),
        el("td", null, fmtNum(s.weightKg, 2) + " กก."),
        el("td", null, fmtNum(pct, 1) + "%"),
        el("td", null, safe(s.weighSlipNo)),
        el("td", null, el("a", { class: "btn btn-small", href: `#/farmer/${encodeURIComponent(s.memberId || s.plot)}` }, "ดู →")),
      ));
    });
    tbl.append(tb);
    card.append(tbl);
    card.append(el("div", { class: "actions-bar", style: "margin-top:14px" },
      el("a", { class: "btn btn-primary", href: `#/lot/${encodeURIComponent(lot.lotId)}` }, "📋 ดูรายละเอียดล็อต →")));
    result.append(card);
  }

  function doTrace() {
    const q = $("#traceInput").value.trim().toLowerCase();
    if (!q) return;
    const result = $("#traceResult");
    result.innerHTML = "";

    // ── Lot search (open to all per spec) ──
    const lots = loadLots();
    const lotMatches = lots.filter(l => {
      const blob = [l.lotId, l.hub, l.productForm, l.fscClaim, l.transferDocNo,
        ...(l.sources || []).map(s => `${s.fmu} ${s.plot} ${s.nameTh}`)].join(" ").toLowerCase();
      return blob.includes(q);
    });
    lotMatches.slice(0, 5).forEach(lot => renderLotMatch(lot, result));
    if (lotMatches.length > 5) {
      result.append(el("div", { class: "muted", style: "margin:8px 0 16px" }, `และอีก ${lotMatches.length - 5} ล็อต`));
    }

    // ── Member/plot search ──
    const all = getAllRecords();
    const matches = all.filter(m => {
      const blob = [m.fmu, m.plot, m.memberId, m.nameTh, m.nameEn, m.docNo, m.idCard,
                    m.subdistrict, m.district, m.village, m.hub].filter(Boolean).join(" ").toLowerCase();
      return blob.includes(q);
    });

    if (matches.length === 0 && lotMatches.length === 0) {
      result.innerHTML = `<div class="trace-result"><div class="trace-empty"><div class="trace-empty-icon">🔍</div><h3>ไม่พบข้อมูล</h3><p class="muted">ลองค้นด้วย: <b>เลขล็อต (LOT-YYYYMM-XXXX)</b>, FMU, รหัสสมาชิก, ชื่อ, เลขเอกสารสิทธิ์, ตำบล, อำเภอ หรือ HUB</p></div></div>`;
      return;
    }
    if (matches.length === 0) return;
    if (lotMatches.length) {
      result.append(el("h3", { style: "margin:24px 0 8px 0" }, "👥 แปลง/เกษตรกรที่ตรงคำค้น"));
    }
    const showCount = Math.min(matches.length, 15);

    if (matches.length > 1) {
      result.append(el("div", { class: "trace-found-banner" },
        el("span", null, `พบ ${matches.length} รายการ${matches.length > 15 ? ` · แสดง ${showCount} รายการแรก` : ""}`),
      ));
    }

    matches.slice(0, showCount).forEach(m => {
      mapCounter++;
      const mapId = `trace-minimap-${mapCounter}`;
      const prodPoly = PRODUCTIVE.find(p => p.name === m.plot);
      const ltPoly = LANDTITLES.find(p => p.name && p.name.split(",").map(s => s.trim()).includes(m.plot));

      const card = el("div", { class: "trace-result trace-result-v2" });

      // ── Header ──
      const header = el("div", { class: "tr-header" },
        el("div", { class: "tr-header-main" },
          el("div", { class: "tr-badges-row" },
            el("span", { class: "tr-fmu-badge" }, safe(m.fmu)),
            el("span", { class: "tr-plot-badge" }, safe(m.plot)),
            m.hub ? el("span", { class: "tr-hub-badge" }, `🏭 ${safe(m.hub)}`) : null,
          ),
          el("h3", { class: "tr-name" }, safe(m.nameTh)),
          m.nameEn ? el("div", { class: "tr-name-en" }, safe(m.nameEn)) : null,
          el("div", { class: "tr-location" },
            `📌 หมู่ ${safe(m.moo)} ${safe(m.village)} ต.${safe(m.subdistrict)} อ.${safe(m.district)} จ.${safe(m.province)}`),
        ),
        el("div", { class: "tr-header-meta" },
          el("div", { class: "tr-meta-row" }, el("span", { class: "tr-meta-lbl" }, "รหัสสมาชิก"), el("span", null, safe(m.memberId))),
          el("div", { class: "tr-meta-row" }, el("span", { class: "tr-meta-lbl" }, "เบอร์โทร"), el("span", null, safe(m.phone))),
          el("div", { class: "tr-meta-row" }, el("span", { class: "tr-meta-lbl" }, "สถานะแปลง"), badge(safe(m.plotStatus), m.plotStatus === "Active" ? "tr-badge-green" : "tr-badge-gray")),
        ),
      );
      card.append(header);

      // ── Chain of Custody flow ──
      const cocSection = el("div", { class: "tr-section" },
        el("div", { class: "tr-section-title" }, "🔗 ห่วงโซ่การดูแลรักษา (Chain of Custody)"),
        buildCoCFlow(m),
      );
      card.append(cocSection);

      // ── Two-column body ──
      const body = el("div", { class: "tr-body-grid" });

      // Left col: Plot + Document
      const leftCol = el("div", { class: "tr-col" });

      leftCol.append(el("div", { class: "tr-sub-title" }, "🌱 ข้อมูลแปลงปลูก"));
      const plotItems = [
        ["พื้นที่รวม", `${fmtNum(m.areaRai, 2)} ไร่ (${fmtNum(m.areaHa, 4)} ฮ.)`],
        ["พื้นที่ให้ผลผลิต", `${fmtNum(m.productiveRai, 2)} ไร่`],
        ["พื้นที่เปิดกรีด", `${fmtNum(m.tappingArea, 2)} ไร่`],
        ["สายพันธุ์", safe(m.species)],
        ["ปีที่ปลูก (พ.ศ.)", safe(m.plantBE)],
        ["อายุยาง", m.rubberAge ? `${m.rubberAge} ปี` : "-"],
        ["ระยะปลูก", safe(m.spacing)],
        ["อายุกรีด", m.tappingAge ? `${m.tappingAge} ปี` : "-"],
        ["พิกัด", (m.lat && m.lng) ? `${Number(m.lat).toFixed(5)}, ${Number(m.lng).toFixed(5)}` : "-"],
      ];
      const plotDl = el("dl", { class: "tr-dl" });
      plotItems.forEach(([k, v]) => plotDl.append(el("dt", null, k), el("dd", null, v)));
      leftCol.append(plotDl);

      leftCol.append(el("div", { class: "tr-sub-title", style: "margin-top:14px" }, "📄 เอกสารสิทธิ์"));
      const docDl = el("dl", { class: "tr-dl" });
      [
        ["ประเภท", safe(m.docType)],
        ["เลขที่", safe(m.docNo)],
        ["ชื่อเจ้าของ", safe(m.docOwnerTh)],
        ["ความสัมพันธ์", safe(m.relation)],
        ["ภาษีที่ดิน", safe(m.taxStatus)],
        ["ออกเอกสาร", fmtDate(m.docIssueDate)],
        ["ก่อน/หลัง 2537", safe(m.beforeAfter37)],
        ["Polygon สวน", prodPoly ? `✅ มี (${prodPoly.coordinates.length} จุด)` : "❌ ไม่พบ"],
        ["Polygon เอกสาร", ltPoly ? "✅ มี" : "❌ ไม่พบ"],
      ].forEach(([k, v]) => docDl.append(el("dt", null, k), el("dd", null, v)));
      leftCol.append(docDl);

      // Right col: Yield + Chemical + Wood + Management
      const rightCol = el("div", { class: "tr-col" });

      rightCol.append(el("div", { class: "tr-sub-title" }, "💰 ผลผลิต & โควต้า"));
      rightCol.append(buildYieldSection(m));

      const yieldDl = el("dl", { class: "tr-dl", style: "margin-top:8px" });
      const quota = getQuotaFor(m);
      [
        ["ผลผลิตต่อไร่", quota.yieldPerRai ? `${fmtNum(quota.yieldPerRai, 0)} กก./ไร่/ปี` : (m.yieldPerRai ? `${fmtNum(m.yieldPerRai,0)} กก./ไร่/ปี` : "-")],
        ["ส่งต่อรอบ", quota.deliveryPerRound ? `${fmtNum(quota.deliveryPerRound,0)} กก.` : "-"],
        ["รูปแบบผลิต", safe(m.productForm)],
        ["สัดส่วนรายได้", safe(m.revenueShare)],
      ].forEach(([k, v]) => yieldDl.append(el("dt", null, k), el("dd", null, v)));
      rightCol.append(yieldDl);

      rightCol.append(el("div", { class: "tr-sub-title", style: "margin-top:14px" }, "🌳 แผนทำไม้"));
      const woodDl = el("dl", { class: "tr-dl" });
      [
        ["ตัดโค่นปี (พ.ศ.)", safe(m.cutBE25)],
        ["น้ำหนักไม้", fmtNum(m.woodWeight, 0) !== "-" ? `${fmtNum(m.woodWeight, 0)} กก.` : "-"],
        ["มูลค่าไม้", fmtNum(m.woodValue, 0) !== "-" ? `${fmtNum(m.woodValue, 0)} บาท` : "-"],
        ["AYI", m.ayi ? `${fmtNum(m.ayi, 2)} ตัน/ไร่/ปี` : "-"],
      ].forEach(([k, v]) => woodDl.append(el("dt", null, k), el("dd", null, v)));
      rightCol.append(woodDl);

      rightCol.append(el("div", { class: "tr-sub-title", style: "margin-top:14px" }, "🧪 สารเคมี"));
      const chemDl = el("dl", { class: "tr-dl" });
      [
        ["ประเภท", safe(m.chemicalType)],
        ["ส่วนผสม", safe(m.chemicalIngredient)],
        ["อัตรา", safe(m.chemicalRate)],
        ["ทะเบียน", safe(m.chemicalRegistered)],
      ].forEach(([k, v]) => chemDl.append(el("dt", null, k), el("dd", null, v)));
      rightCol.append(chemDl);

      rightCol.append(el("div", { class: "tr-sub-title", style: "margin-top:14px" }, "👨‍💼 ผู้รับผิดชอบ"));
      const mgmtDl = el("dl", { class: "tr-dl" });
      [
        ["RM", safe(m.rmResponsible)],
        ["GE", safe(m.geResponsible)],
        ["การจัดการ", safe(m.management)],
        ["RMU", safe(m.rmu)],
      ].forEach(([k, v]) => mgmtDl.append(el("dt", null, k), el("dd", null, v)));
      rightCol.append(mgmtDl);

      body.append(leftCol, rightCol);
      card.append(body);

      // ── FSC Compliance section ──
      card.append(buildFscCompliance(m));

      // ── Mini map + Actions ──
      const footer = el("div", { class: "tr-footer" },
        buildMiniMap(m, prodPoly, ltPoly, mapId),
        el("div", { class: "tr-actions" },
          el("a", { class: "btn btn-primary", href: `#/farmer/${encodeURIComponent(m.memberId || m.plot)}` }, "📋 ดูข้อมูลฉบับเต็ม →"),
          el("a", { class: "btn btn-secondary", href: "#/map" }, "🗺️ แผนที่รวม"),
          el("button", { class: "btn", onclick: () => window.print() }, "🖨️ พิมพ์"),
        ),
      );
      card.append(footer);
      result.append(card);
    });

    if (matches.length > showCount) {
      result.append(el("div", { class: "trace-more-note" },
        `และอีก ${matches.length - showCount} รายการ — กรุณาระบุคำค้นให้เฉพาะเจาะจงขึ้น`));
    }
  }

  $("#traceBtn").onclick = doTrace;
  $("#traceInput").addEventListener("keydown", e => { if (e.key === "Enter") doTrace(); });
}

/* ════════════════════════════════════════════════════════════
   🔐 AUTH PAGES — Setup, Login, User Management
   ════════════════════════════════════════════════════════════ */

function renderSetup() {
  const form = $("#setupForm");
  if (!form) return;
  form.onsubmit = async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form).entries());
    if (fd.password !== fd.passwordConfirm) {
      alert("⚠️ รหัสผ่านไม่ตรงกัน"); return;
    }
    const hash = await hashPassword(fd.password, fd.username);
    const users = loadUsers();
    if (users.some(u => u.username === fd.username)) {
      alert("⚠️ ชื่อผู้ใช้นี้มีอยู่แล้ว"); return;
    }
    users.push({
      username: fd.username.trim(),
      displayName: fd.displayName.trim(),
      role: "admin",
      passwordHash: hash,
      createdAt: Date.now(),
      lastLoginAt: null,
    });
    saveUsers(users);
    // auto login
    try { await loginUser(fd.username.trim(), fd.password); } catch {}
    alert("✅ สร้างบัญชี admin สำเร็จ — เข้าสู่ระบบเรียบร้อย");
    location.hash = "#/dashboard";
    router();
  };
}

function renderLogin() {
  const form = $("#loginForm");
  if (!form) return;
  const err = $("#loginError");
  form.onsubmit = async e => {
    e.preventDefault();
    err.style.display = "none";
    const fd = Object.fromEntries(new FormData(form).entries());
    try {
      await loginUser(fd.username.trim(), fd.password);
      // Go back to where they came from, or dashboard
      const back = sessionStorage.getItem("fsc_login_back");
      sessionStorage.removeItem("fsc_login_back");
      location.hash = back || "#/dashboard";
      router();
    } catch (e2) {
      err.textContent = "❌ " + e2.message;
      err.style.display = "block";
    }
  };
}

function renderUsersAdmin() {
  const me = getCurrentUser();
  function refresh() {
    const users = loadUsers();
    $("#usrCount").textContent = `${users.length} บัญชี`;
    const tbody = $("#usersTable tbody");
    tbody.innerHTML = "";
    users.forEach(u => {
      const tr = el("tr", null,
        el("td", null, el("b", null, u.username)),
        el("td", null, safe(u.displayName)),
        el("td", null, el("span", { class: "user-role user-role-" + u.role }, u.role)),
        el("td", null, u.createdAt ? new Date(u.createdAt).toLocaleDateString("th-TH") : "-"),
        el("td", null, u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("th-TH") : "-"),
        el("td", null,
          u.username === me.username
            ? el("span", { class: "muted" }, "(คุณ)")
            : el("button", {
                class: "btn btn-small btn-secondary",
                onclick: () => {
                  if (!confirm(`ลบบัญชี ${u.username}?`)) return;
                  const arr = loadUsers().filter(x => x.username !== u.username);
                  if (!arr.some(x => x.role === "admin")) {
                    alert("⚠️ ต้องเหลือ admin อย่างน้อย 1 บัญชี"); return;
                  }
                  saveUsers(arr);
                  refresh();
                },
              }, "🗑️ ลบ"),
        ),
      );
      tbody.append(tr);
    });
  }
  refresh();

  // Add user
  $("#userAddForm").onsubmit = async e => {
    e.preventDefault();
    const form = e.target;
    const fd = Object.fromEntries(new FormData(form).entries());
    const users = loadUsers();
    if (users.some(u => u.username === fd.username)) {
      alert("⚠️ ชื่อผู้ใช้นี้มีอยู่แล้ว"); return;
    }
    const hash = await hashPassword(fd.password, fd.username);
    users.push({
      username: fd.username.trim(),
      displayName: fd.displayName.trim(),
      role: fd.role,
      passwordHash: hash,
      createdAt: Date.now(),
      lastLoginAt: null,
    });
    saveUsers(users);
    form.reset();
    refresh();
    alert(`✅ เพิ่มบัญชี ${fd.username} (${fd.role}) สำเร็จ`);
  };

  // Change own password
  $("#userPwdForm").onsubmit = async e => {
    e.preventDefault();
    const form = e.target;
    const fd = Object.fromEntries(new FormData(form).entries());
    if (fd.newPassword !== fd.newPasswordConfirm) {
      alert("⚠️ รหัสผ่านใหม่ไม่ตรงกัน"); return;
    }
    const users = loadUsers();
    const u = users.find(x => x.username === me.username);
    if (!u) { alert("ไม่พบบัญชี"); return; }
    const oldHash = await hashPassword(fd.oldPassword, me.username);
    if (oldHash !== u.passwordHash) { alert("❌ รหัสผ่านเดิมไม่ถูกต้อง"); return; }
    u.passwordHash = await hashPassword(fd.newPassword, me.username);
    saveUsers(users);
    form.reset();
    alert("✅ เปลี่ยนรหัสผ่านสำเร็จ");
  };
}

/* ════════════════════════════════════════════════════════════
   📦 LOTS — Purchase lot traceability
   เมื่อรับซื้อยางจากหลายแปลงรวมเป็นล็อต → สร้างเลขล็อต → ค้นย้อนได้
   ════════════════════════════════════════════════════════════ */

function calcLotTotals(lot) {
  const drcPct = (Number(lot.drcPercent) || 0) / 100;
  const totalWeightKg = (lot.sources || []).reduce((s, x) => s + (Number(x.weightKg) || 0), 0);
  const totalDrcKg = totalWeightKg * drcPct;
  return { totalWeightKg, totalDrcKg, plotCount: (lot.sources || []).length };
}

/* ── Lots list ── */
function renderLots() {
  const tbody = $("#lotsTable tbody");
  const search = $("#lotSearch");
  const filterMonth = $("#lotFilterMonth");
  const filterStatus = $("#lotFilterStatus");

  function refresh() {
    const lots = loadLots();
    $("#lotCount").textContent = `${lots.length} ล็อต`;

    // populate month filter
    const months = [...new Set(lots.map(l => l.lotId && l.lotId.slice(4, 10)).filter(Boolean))].sort().reverse();
    filterMonth.innerHTML = `<option value="">ทุกเดือน</option>`;
    months.forEach(m => filterMonth.append(el("option", { value: m }, `${m.slice(0, 4)}-${m.slice(4)}`)));

    // KPI tiles
    const totalWeight = lots.reduce((s, l) => s + calcLotTotals(l).totalWeightKg, 0);
    const totalDry = lots.reduce((s, l) => s + calcLotTotals(l).totalDrcKg, 0);
    const totalPlots = new Set();
    lots.forEach(l => (l.sources || []).forEach(s => totalPlots.add(s.plot)));
    const openCount = lots.filter(l => l.status === "Open").length;
    const stats = $("#lotStats");
    if (stats) {
      stats.innerHTML = "";
      [
        { icon: "📦", label: "จำนวนล็อตทั้งหมด", value: lots.length + " ล็อต", cls: "qt-orange" },
        { icon: "⚖️", label: "น้ำหนักรวม", value: fmtNum(totalWeight, 0) + " กก.", cls: "qt-green" },
        { icon: "💧", label: "ยางแห้งรวม (DRC)", value: fmtNum(totalDry, 0) + " กก.", cls: "qt-teal" },
        { icon: "🌱", label: "แปลงต้นทาง (รวม)", value: totalPlots.size + " แปลง", cls: "qt-blue" },
        { icon: "🔓", label: "ล็อตเปิดอยู่", value: openCount + " ล็อต", cls: "qt-yellow" },
      ].forEach(t => stats.append(el("div", { class: "quota-tile " + t.cls },
        el("div", { class: "qt-icon" }, t.icon),
        el("div", { class: "qt-body" },
          el("div", { class: "qt-label" }, t.label),
          el("div", { class: "qt-value" }, t.value),
        ),
      )));
    }

    // table rows
    const q = (search.value || "").trim().toLowerCase();
    const fM = filterMonth.value;
    const fS = filterStatus.value;
    tbody.innerHTML = "";
    let shown = 0;
    lots.forEach(l => {
      if (fM && !(l.lotId || "").includes(`-${fM}-`)) return;
      if (fS && l.status !== fS) return;
      if (q) {
        const blob = [l.lotId, l.hub, l.productForm, l.fscClaim, l.buyer, l.transferDocNo,
          ...(l.sources || []).map(s => `${s.fmu} ${s.plot} ${s.nameTh}`)].join(" ").toLowerCase();
        if (!blob.includes(q)) return;
      }
      shown++;
      const t = calcLotTotals(l);
      const tr = el("tr", { onclick: () => location.hash = `#/lot/${encodeURIComponent(l.lotId)}` },
        el("td", null, el("b", null, l.lotId)),
        el("td", null, l.purchaseDate || "-"),
        el("td", null, safe(l.hub)),
        el("td", null, safe(l.productForm)),
        el("td", null, el("span", { class: "tr-badge tr-badge-green" }, safe(l.fscClaim))),
        el("td", null, fmtNum(t.totalWeightKg, 0)),
        el("td", null, fmtNum(t.totalDrcKg, 0)),
        el("td", null, `${t.plotCount} แปลง`),
        el("td", null, el("span", { class: "tr-badge " + (l.status === "Open" ? "tr-badge-green" : l.status === "Shipped" ? "tr-badge-gray" : "tr-badge-red") }, safe(l.status))),
        el("td", null, "▸"),
      );
      tbody.append(tr);
    });

    if (shown === 0) {
      tbody.append(el("tr", null, el("td", { colspan: 10, class: "muted", style: "text-align:center;padding:24px" },
        lots.length === 0 ? "ยังไม่มีล็อต — กด \"➕ สร้างล็อตใหม่\" เพื่อเริ่ม" : "ไม่พบล็อตตามเงื่อนไข")));
    }
  }

  search.addEventListener("input", refresh);
  filterMonth.addEventListener("change", refresh);
  filterStatus.addEventListener("change", refresh);
  refresh();

  // Export
  $("#lotExportBtn").onclick = () => {
    const lots = loadLots();
    const content = `/* FSC Lots — Exported ${new Date().toLocaleString("th-TH")} */\nwindow.LOTS = ${JSON.stringify(lots, null, 2)};\n`;
    const blob = new Blob([content], { type: "text/javascript;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "lots.js";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 100);
  };
  $("#lotImportBtn").onclick = () => $("#lotImportFile").click();
  $("#lotImportFile").onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        let txt = reader.result.toString();
        // Strip wrapper if user uploaded .js file
        const m = txt.match(/=\s*(\[[\s\S]*\])\s*;?/);
        if (m) txt = m[1];
        const arr = JSON.parse(txt);
        if (!Array.isArray(arr)) throw new Error("ไม่ใช่ array");
        if (!confirm(`Import ${arr.length} ล็อต? (จะรวมกับของเดิม โดยถ้าซ้ำ id ของใหม่จะแทนที่)`)) return;
        const map = new Map();
        loadLots().forEach(l => map.set(l.lotId, l));
        arr.forEach(l => map.set(l.lotId, l));
        saveLots([...map.values()]);
        refresh();
      } catch (err) {
        alert("❌ Import ไม่สำเร็จ: " + err.message);
      }
    };
    reader.readAsText(f, "utf-8");
  };
}

/* ── Lot form (create/edit) ── */
function renderLotForm(params) {
  const editId = params && params[0] ? decodeURIComponent(params[0]) : null;
  const editing = editId ? getLot(editId) : null;
  const form = $("#lotForm");

  // populate HUBs from members
  const hubs = [...new Set(getAllRecords().map(m => m.hub).filter(Boolean))].sort();
  hubs.forEach(h => $("#hubList").append(el("option", { value: h })));

  // determine lot id (new vs edit)
  const lotId = editing ? editing.lotId : nextLotId();
  $("#lotIdPreview").textContent = lotId;
  if (editing) $("#lotFormTitle").textContent = `✏️ แก้ไขล็อต ${lotId}`;

  // default date = today
  form.elements.purchaseDate.value = (editing && editing.purchaseDate) || new Date().toISOString().slice(0, 10);

  // prefill if editing
  if (editing) {
    ["hub", "buyer", "productForm", "fscClaim", "drcPercent", "transferDocNo", "status", "note"].forEach(k => {
      if (form.elements[k] != null && editing[k] != null) form.elements[k].value = editing[k];
    });
  }

  // ── Source plots manager ──
  const allRecs = getAllRecords();
  let sources = (editing && editing.sources) ? editing.sources.map(s => ({ ...s })) : [];

  function renderSources() {
    const tbody = $("#srcPlotRows");
    tbody.innerHTML = "";
    const drcPct = (Number(form.elements.drcPercent.value) || 65) / 100;
    let totalW = 0, totalD = 0;
    sources.forEach((s, i) => {
      const weight = Number(s.weightKg) || 0;
      const dry = weight * drcPct;
      totalW += weight; totalD += dry;
      const tr = el("tr", null,
        el("td", null, el("b", null, safe(s.fmu)), el("br"), el("span", { class: "muted" }, safe(s.plot))),
        el("td", null, safe(s.nameTh)),
        el("td", null, el("input", {
          type: "number", step: "0.01", value: s.weightKg || "",
          style: "width:100px",
          oninput: e => { s.weightKg = e.target.value; renderSources(); },
        })),
        el("td", null, el("input", {
          type: "text", value: s.weighSlipNo || "",
          placeholder: "เลขใบชั่ง/รอบ",
          style: "width:140px",
          oninput: e => { s.weighSlipNo = e.target.value; },
        })),
        el("td", null, fmtNum(dry, 2)),
        el("td", null, el("button", {
          type: "button", class: "btn btn-small btn-secondary",
          onclick: () => { sources.splice(i, 1); renderSources(); },
        }, "🗑️")),
      );
      tbody.append(tr);
    });
    $("#srcTotalWeight").textContent = fmtNum(totalW, 2);
    $("#srcTotalDry").textContent = fmtNum(totalD, 2);
    $("#srcPlotCount").textContent = `${sources.length} แปลง`;
    $("#srcEmptyMsg").style.display = sources.length ? "none" : "";
  }
  renderSources();

  // Recalc dry when DRC % changes
  form.elements.drcPercent.addEventListener("input", renderSources);

  // ── Plot search & add ──
  const sInput = $("#srcPlotSearch");
  const sugBox = $("#srcPlotSuggest");
  sInput.addEventListener("input", () => {
    const q = sInput.value.trim().toLowerCase();
    sugBox.innerHTML = "";
    if (!q) { sugBox.style.display = "none"; return; }
    const matches = allRecs.filter(m => {
      const blob = `${m.fmu} ${m.plot} ${m.memberId} ${m.nameTh} ${m.nameEn}`.toLowerCase();
      return blob.includes(q);
    }).slice(0, 12);
    if (!matches.length) {
      sugBox.style.display = "block";
      sugBox.append(el("div", { class: "src-sug-empty muted" }, "ไม่พบแปลงที่ตรงคำค้น"));
      return;
    }
    sugBox.style.display = "block";
    matches.forEach(m => {
      const exists = sources.some(s => s.plot === m.plot);
      const row = el("div", { class: "src-sug-row" + (exists ? " is-added" : "") },
        el("div", { class: "src-sug-main" },
          el("b", null, safe(m.plot)), " · ", safe(m.nameTh),
        ),
        el("div", { class: "src-sug-meta muted" },
          `${safe(m.fmu)} · ${safe(m.subdistrict)}/${safe(m.district)} · ${fmtNum(m.areaRai,2)} ไร่`,
        ),
        exists ? el("span", { class: "src-sug-tag" }, "✓ เพิ่มแล้ว") : el("button", {
          type: "button", class: "btn btn-small btn-primary",
          onclick: e => {
            e.preventDefault();
            sources.push({
              memberId: m.memberId || "",
              plot: m.plot || "",
              fmu: m.fmu || "",
              nameTh: m.nameTh || "",
              hub: m.hub || "",
              weightKg: "",
              weighSlipNo: "",
              fscArea: m.fscArea || 0,
            });
            renderSources();
            sInput.value = "";
            sugBox.style.display = "none";
            sInput.focus();
          },
        }, "➕ เพิ่ม"),
      );
      sugBox.append(row);
    });
  });
  document.addEventListener("click", e => {
    if (!sInput.contains(e.target) && !sugBox.contains(e.target)) sugBox.style.display = "none";
  });

  // ── Save ──
  form.onsubmit = e => {
    e.preventDefault();
    if (sources.length === 0) {
      alert("⚠️ กรุณาเพิ่มแปลงต้นทางอย่างน้อย 1 แปลง");
      return;
    }
    const data = Object.fromEntries(new FormData(form).entries());
    const lot = {
      lotId,
      purchaseDate: data.purchaseDate,
      hub: data.hub,
      buyer: data.buyer,
      productForm: data.productForm,
      fscClaim: data.fscClaim,
      drcPercent: Number(data.drcPercent) || 65,
      transferDocNo: data.transferDocNo || "",
      status: data.status || "Open",
      note: data.note || "",
      sources: sources.map(s => ({
        memberId: s.memberId, plot: s.plot, fmu: s.fmu, nameTh: s.nameTh, hub: s.hub,
        weightKg: Number(s.weightKg) || 0, weighSlipNo: s.weighSlipNo || "",
        fscArea: s.fscArea || 0,
      })),
      createdAt: (editing && editing.createdAt) || Date.now(),
      updatedAt: Date.now(),
    };
    upsertLot(lot);
    location.hash = `#/lot/${encodeURIComponent(lot.lotId)}`;
  };
  $("#lotCancelBtn").onclick = () => { location.hash = "#/lots"; };
}

/* ── Lot detail ── */
function renderLotDetail(params) {
  const lotId = params && params[0] ? decodeURIComponent(params[0]) : null;
  const lot = lotId ? getLot(lotId) : null;
  if (!lot) {
    $("#view").innerHTML = `<div class="page"><a href="#/lots" class="back-link">← กลับ</a><div class="panel">ไม่พบล็อต ${safe(lotId)}</div></div>`;
    return;
  }

  const totals = calcLotTotals(lot);
  $("#lotDetailId").textContent = lot.lotId;
  $("#lotDetailMeta").textContent = `${lot.purchaseDate || "-"} · ${lot.hub || "-"} · ${lot.productForm || "-"}`;
  $("#lotDetailFsc").textContent = lot.fscClaim || "-";
  $("#lotDetailStatus").textContent = lot.status || "-";

  // KPIs
  const allRecs = getAllRecords();
  let fscAreaSum = 0, fmus = new Set();
  lot.sources.forEach(s => {
    const r = allRecs.find(x => x.plot === s.plot || x.memberId === s.memberId);
    if (r) {
      fscAreaSum += Number(r.fscArea) || 0;
      if (r.fmu) fmus.add(r.fmu);
    }
  });
  const kpi = $("#lotKpis"); kpi.innerHTML = "";
  [
    { icon: "⚖️", label: "น้ำหนักรวม (รับซื้อ)", value: fmtNum(totals.totalWeightKg, 2) + " กก.", cls: "qt-orange" },
    { icon: "💧", label: `ยางแห้ง DRC ${lot.drcPercent}%`, value: fmtNum(totals.totalDrcKg, 2) + " กก.", cls: "qt-green" },
    { icon: "🌱", label: "แปลงต้นทาง", value: totals.plotCount + " แปลง", cls: "qt-blue" },
    { icon: "📍", label: "FMU ที่เกี่ยวข้อง", value: fmus.size + " FMU", cls: "qt-teal" },
    { icon: "✅", label: "พื้นที่ FSC รวม", value: fmtNum(fscAreaSum, 2) + " ไร่", cls: "qt-purple" },
  ].forEach(t => kpi.append(el("div", { class: "quota-tile " + t.cls },
    el("div", { class: "qt-icon" }, t.icon),
    el("div", { class: "qt-body" },
      el("div", { class: "qt-label" }, t.label),
      el("div", { class: "qt-value" }, t.value),
    ),
  )));

  // Source plots table
  const tbody = $("#lotSourceTable tbody");
  tbody.innerHTML = "";
  lot.sources.forEach((s, i) => {
    const dry = (Number(s.weightKg) || 0) * (Number(lot.drcPercent) / 100);
    const pct = totals.totalWeightKg ? (Number(s.weightKg) / totals.totalWeightKg) * 100 : 0;
    const r = allRecs.find(x => x.plot === s.plot || x.memberId === s.memberId);
    const tr = el("tr", null,
      el("td", null, String(i + 1)),
      el("td", null, el("b", null, safe(s.fmu)), el("br"), el("span", { class: "muted" }, safe(s.plot))),
      el("td", null, safe(s.nameTh)),
      el("td", null, safe(s.hub || (r && r.hub))),
      el("td", null, fmtNum(s.weightKg, 2)),
      el("td", null, fmtNum(pct, 1) + "%"),
      el("td", null, fmtNum(dry, 2)),
      el("td", null, safe(s.weighSlipNo)),
      el("td", null, s.fscArea > 0 ? el("span", { class: "tr-badge tr-badge-green" }, "✓") : el("span", { class: "tr-badge tr-badge-gray" }, "-")),
      el("td", null, el("a", { class: "btn btn-small", href: `#/farmer/${encodeURIComponent(s.memberId || s.plot)}` }, "ดู →")),
    );
    tbody.append(tr);
  });

  // Detail KV
  const kv = $("#lotDetailKv");
  [
    ["เลขใบส่งของ", lot.transferDocNo],
    ["ผู้ซื้อ", lot.buyer],
    ["DRC %", lot.drcPercent + "%"],
    ["วันที่สร้าง", new Date(lot.createdAt).toLocaleString("th-TH")],
    ["แก้ไขล่าสุด", lot.updatedAt ? new Date(lot.updatedAt).toLocaleString("th-TH") : "-"],
    ["หมายเหตุ", lot.note],
  ].forEach(([k, v]) => kv.append(el("dt", null, k), el("dd", null, safe(v))));

  // Map — show all source polygons
  const map = L.map("lotMap").setView([17.4, 101.5], 12);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: "© Esri", maxZoom: 19,
  }).addTo(map);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19, opacity: 0.8,
  }).addTo(map);

  const polys = [];
  lot.sources.forEach((s, i) => {
    const p = PRODUCTIVE.find(p => p.name === s.plot);
    if (p) {
      const layer = L.polygon(p.coordinates.map(c => [c[1], c[0]]), {
        color: "#00e676", weight: 3, fillColor: "#00c853", fillOpacity: 0.55,
      }).addTo(map);
      layer.bindPopup(`<b>${p.name}</b><br>${safe(s.nameTh)}<br>น้ำหนัก: ${fmtNum(s.weightKg,2)} กก.`);
      polys.push(layer);
    } else {
      // No productive polygon — try landtitle then fallback to lat/lng
      const lt = LANDTITLES.find(p => p.name && p.name.split(",").map(x => x.trim()).includes(s.plot));
      if (lt) {
        const layer = L.polygon(lt.coordinates.map(c => [c[1], c[0]]), {
          color: "#ffd600", weight: 3, fillColor: "#fff59d", fillOpacity: 0.25, dashArray: "8,5",
        }).addTo(map);
        layer.bindPopup(`<b>${lt.name}</b><br>${safe(s.nameTh)}<br>(เอกสารสิทธิ์)`);
        polys.push(layer);
      } else {
        const r = allRecs.find(x => x.plot === s.plot || x.memberId === s.memberId);
        if (r && r.lat && r.lng) {
          const marker = L.circleMarker([r.lat, r.lng], { radius: 8, color: "#fff", weight: 2, fillColor: "#2e7d32", fillOpacity: 0.9 }).addTo(map);
          marker.bindPopup(`<b>${safe(s.plot)}</b><br>${safe(s.nameTh)}`);
          polys.push(marker);
        }
      }
    }
  });
  if (polys.length) {
    map.fitBounds(L.featureGroup(polys).getBounds(), { padding: [30, 30] });
  }
  setTimeout(() => map.invalidateSize(), 200);

  // Actions
  $("#lotEditBtn").onclick = () => { location.hash = `#/lots/new/${encodeURIComponent(lot.lotId)}`; };
  $("#lotPrintBtn").onclick = () => window.print();
  $("#lotDeleteBtn").onclick = () => {
    if (!confirm(`ลบล็อต ${lot.lotId}?\nการกระทำนี้ย้อนกลับไม่ได้`)) return;
    deleteLot(lot.lotId);
    location.hash = "#/lots";
  };
}

/* ============ Add / Edit ============ */
function prefillForm(record) {
  const form = $("#addForm");
  if (!form) return;
  for (const k in record) {
    if (form.elements[k]) form.elements[k].value = record[k] ?? "";
  }
  // Also load quota fields
  const q = getQuotaFor(record);
  ["yieldPerRai", "deliveryPerRound", "sacksReceived", "pricePerKg", "lastDeliveryDate", "quotaNote"].forEach(k => {
    if (form.elements[k]) form.elements[k].value = q[k] ?? "";
  });
  $("#addTitle").textContent = `✏️ แก้ไขข้อมูล: ${record.nameTh || record.plot}`;
  form.dataset.editKey = record.memberId || record.plot;
}

function renderAdd() {
  const form = $("#addForm");
  const customRecords = loadCustom();
  if (customRecords.length) {
    $("#customRecordsPanel").style.display = "";
    $("#customCount").textContent = customRecords.length;
    const tbody = $("#customTable tbody");
    customRecords.forEach((r, i) => {
      const tr = el("tr", null,
        el("td", null, safe(r.fmu)),
        el("td", null, safe(r.nameTh)),
        el("td", null, fmtNum(r.areaRai, 2) + " ไร่"),
        el("td", null, new Date(r._savedAt).toLocaleString("th-TH")),
        el("td", null, el("button", { class: "btn btn-small", onclick: () => {
          if (confirm("ลบรายการนี้?")) {
            const arr = loadCustom(); arr.splice(i, 1); saveCustom(arr); router();
          }
        } }, "🗑️ ลบ")),
      );
      tbody.append(tr);
    });
  }

  form.onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    delete data.docFile;

    // Parse coordinates
    if (data.coordinates) {
      const coords = data.coordinates.split(/\n+/).map(line => {
        const [lng, lat] = line.split(",").map(s => parseFloat(s.trim()));
        return [lng, lat];
      }).filter(c => !isNaN(c[0]) && !isNaN(c[1]));
      if (coords.length >= 3) data._polygon = coords;
    }
    delete data.coordinates;
    data._savedAt = Date.now();
    data._id = uid();
    data.no = "C" + uid().slice(-4);

    // Handle file upload
    const fileInput = form.elements.docFile;
    const fileKey = data.memberId || data.plot;
    const finalize = () => {
      // Extract quota fields and save separately (keyed by memberId/plot)
      const quotaFields = ["yieldPerRai", "deliveryPerRound", "sacksReceived", "pricePerKg", "lastDeliveryDate", "quotaNote"];
      const quotaData = {};
      quotaFields.forEach(k => {
        if (data[k] !== "" && data[k] != null) quotaData[k] = data[k];
        delete data[k]; // remove from main record so they don't pollute it
      });

      const arr = loadCustom();
      const editKey = form.dataset.editKey;
      if (editKey) {
        const idx = arr.findIndex(x => (x.memberId === editKey) || (x.plot === editKey));
        if (idx >= 0) arr[idx] = { ...arr[idx], ...data };
        else arr.push(data);
      } else {
        arr.push(data);
      }
      saveCustom(arr);

      // Save quota for this record (works for both new + existing members)
      const targetRec = { memberId: data.memberId, plot: data.plot };
      if (Object.keys(quotaData).length > 0) setQuotaFor(targetRec, quotaData);

      alert("✅ บันทึกเรียบร้อย");
      form.reset();
      delete form.dataset.editKey;
      router();
    };

    if (fileInput.files.length && fileKey) {
      const reader = new FileReader();
      reader.onload = () => {
        const files = loadFiles();
        files[fileKey] = files[fileKey] || [];
        files[fileKey].push({ name: fileInput.files[0].name, data: reader.result });
        saveFiles(files);
        finalize();
      };
      reader.readAsDataURL(fileInput.files[0]);
    } else {
      finalize();
    }
  };

  $("#exportBtn").onclick = () => {
    const data = { records: loadCustom(), files: loadFiles(), exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fsc-custom-records-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  };
}

/* ════════════ UI helpers ════════════ */
function showMapToast(html, duration) {
  let toast = document.getElementById("mapToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "mapToast";
    toast.className = "map-toast";
    document.body.appendChild(toast);
  }
  toast.innerHTML = html;
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), duration || 4000);
}

/* ════════════ Geo utilities ════════════ */
// Convert lat/lng → UTM (Zone 47/48 covers Thailand). Returns {zone, easting, northing}
function latLngToUTM(lat, lng) {
  const zone = Math.floor((lng + 180) / 6) + 1;
  const k0 = 0.9996;
  const a = 6378137.0;
  const eccSquared = 0.00669438;
  const lambda0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  const phi = lat * Math.PI / 180;
  const lambda = lng * Math.PI / 180;
  const eccPrimeSquared = eccSquared / (1 - eccSquared);
  const N = a / Math.sqrt(1 - eccSquared * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2;
  const C = eccPrimeSquared * Math.cos(phi) ** 2;
  const A = Math.cos(phi) * (lambda - lambda0);
  const M = a * ((1 - eccSquared/4 - 3*eccSquared**2/64 - 5*eccSquared**3/256) * phi
    - (3*eccSquared/8 + 3*eccSquared**2/32 + 45*eccSquared**3/1024) * Math.sin(2*phi)
    + (15*eccSquared**2/256 + 45*eccSquared**3/1024) * Math.sin(4*phi)
    - (35*eccSquared**3/3072) * Math.sin(6*phi));
  const easting = k0 * N * (A + (1 - T + C) * A**3 / 6
    + (5 - 18*T + T*T + 72*C - 58*eccPrimeSquared) * A**5 / 120) + 500000;
  const northing = k0 * (M + N * Math.tan(phi) * (A*A/2
    + (5 - T + 9*C + 4*C*C) * A**4 / 24
    + (61 - 58*T + T*T + 600*C - 330*eccPrimeSquared) * A**6 / 720));
  return { zone, easting: Math.round(easting), northing: Math.round(northing) };
}

function fmtLatLng(lat, lng) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(5)}°${ns}, ${Math.abs(lng).toFixed(5)}°${ew}`;
}
function fmtUTM(lat, lng) {
  const u = latLngToUTM(lat, lng);
  return `${u.easting.toLocaleString("en-US")} E · ${u.northing.toLocaleString("en-US")} N (Z${u.zone})`;
}

// Compute centroid of a polygon (array of [lng,lat])
function polyCentroid(coords) {
  let sumLat = 0, sumLng = 0;
  coords.forEach(c => { sumLng += c[0]; sumLat += c[1]; });
  return [sumLat / coords.length, sumLng / coords.length];
}

/* ════════════ Batch PDF Export ════════════ */
function launchBatchPDF() {
  const w = window.open(
    "batch-map.html",
    "_blank",
    "width=1000,height=800,scrollbars=yes,resizable=yes"
  );
  if (!w) {
    alert("ไม่สามารถเปิดหน้าต่างใหม่ได้\nกรุณาอนุญาต popup ในเบราว์เซอร์ แล้วลองอีกครั้ง");
  }
}

/* ════════════ Land Title Fix tool ════════════ */
const LS_LT_FIX = "fsc_lt_fix_mapping"; // { [fileFmuNum]: actualFmuNum }
// ไฟล์ทั้งหมดถูกเปลี่ยนชื่อบนดิสก์เรียบร้อยแล้ว (2026-05-14)
// FMU{xxx}.pdf ตรงกับ FMU{xxx} เจ้าของจริง ไม่ต้องใช้ mapping อีก
const LT_FIX_DEFAULTS = {};
const LT_FIX_VERSION = "v3-2026-05-14-renamed";  // bump when LT_FIX_DEFAULTS changes
function loadLtFix() {
  try {
    const stored = JSON.parse(localStorage.getItem(LS_LT_FIX) || "null");
    const version = localStorage.getItem(LS_LT_FIX + "_version");
    // If version matches and user has stored data, use it
    if (stored !== null && version === LT_FIX_VERSION) return stored;
  } catch {}
  // First-time or new version: use defaults
  localStorage.setItem(LS_LT_FIX + "_version", LT_FIX_VERSION);
  localStorage.setItem(LS_LT_FIX, JSON.stringify(LT_FIX_DEFAULTS));
  return { ...LT_FIX_DEFAULTS };
}
function saveLtFix(o) {
  localStorage.setItem(LS_LT_FIX, JSON.stringify(o));
  localStorage.setItem(LS_LT_FIX + "_version", LT_FIX_VERSION);
}

// Get the actual PDF path for a given FMU (using mapping if set)
function landTitlePdfForFmu(fmuNum) {
  const mapping = loadLtFix();
  // mapping = { fileNumber: actualFmuNumber }
  // We need the reverse: which file holds this FMU's doc
  // Default: file numbered same as FMU
  let fileNum = fmuNum;
  for (const [file, actual] of Object.entries(mapping)) {
    if (parseInt(actual, 10) === fmuNum) {
      fileNum = parseInt(file, 10);
      break;
    }
  }
  return fmuPdfPath(fileNum);
}

function renderLtFix() {
  const grid = $("#ltfixGrid");
  const count = $("#ltfixCount");
  const onlyMismatched = $("#ltfixOnlyMismatched");
  const exportBtn = $("#ltfixExport");
  const resetBtn = $("#ltfixReset");
  if (!grid) return;

  // Build FMU → owner lookup
  const fmuOwners = {};
  getAllRecords().forEach(m => {
    const match = (m.fmu || "").match(/FMU\s*(\d+)/i);
    if (!match) return;
    const num = parseInt(match[1], 10);
    if (!fmuOwners[num]) {
      fmuOwners[num] = { doc: m.docOwnerTh, member: m.nameTh };
    }
  });

  let showOnlyMismatched = false;
  function render() {
    const mapping = loadLtFix();
    grid.innerHTML = "";
    const numbers = Array.from({ length: 75 }, (_, i) => i + 1);
    let nMismatched = 0;
    numbers.forEach(fileNum => {
      const fileNumStr = String(fileNum).padStart(3, "0");
      const path = `documents/landtitles/FMU${fileNumStr}.pdf`;
      const assigned = mapping[fileNum] ? parseInt(mapping[fileNum], 10) : fileNum;
      const isMismatched = mapping[fileNum] && parseInt(mapping[fileNum], 10) !== fileNum;
      if (isMismatched) nMismatched++;
      if (showOnlyMismatched && !isMismatched) return;

      const owner = fmuOwners[assigned] || {};
      const card = el("div", { class: "ltfix-card" + (isMismatched ? " ltfix-mismatched" : "") },
        el("div", { class: "ltfix-header" },
          el("strong", null, `FMU${fileNumStr}.pdf`),
          isMismatched ? el("span", { class: "ltfix-badge" }, "แก้ไขแล้ว") : null,
        ),
        el("button", {
          class: "btn btn-small btn-primary", style: "width:100%;margin:6px 0",
          onclick: () => openWatermarkedPdf(path, null, `FMU${fileNumStr}`),
        }, "🔍 เปิดดู PDF"),
        el("div", { class: "ltfix-form" },
          el("label", null, "FMU จริงที่อยู่ในไฟล์นี้:"),
          (() => {
            const sel = el("select", { class: "ltfix-select" });
            sel.append(el("option", { value: "" }, "— ไม่ระบุ (ตรงกับชื่อไฟล์) —"));
            for (let i = 1; i <= 75; i++) {
              const opt = el("option", { value: String(i) }, `FMU${i} ${fmuOwners[i] ? "— " + (fmuOwners[i].doc || fmuOwners[i].member) : ""}`);
              if (mapping[fileNum] === String(i) || (!mapping[fileNum] && i === fileNum)) opt.selected = true;
              sel.append(opt);
            }
            sel.onchange = () => {
              const v = sel.value;
              const m = loadLtFix();
              if (!v || parseInt(v, 10) === fileNum) delete m[fileNum];
              else m[fileNum] = v;
              saveLtFix(m);
              render();
            };
            return sel;
          })(),
        ),
        el("div", { class: "ltfix-owner muted" },
          owner.doc ? `เจ้าของเอกสาร: ${owner.doc}` : "—",
          el("br"),
          owner.member ? `สมาชิก: ${owner.member}` : "",
        ),
      );
      grid.append(card);
    });
    count.textContent = `${numbers.length} ไฟล์ · แก้ไขแล้ว ${nMismatched}`;
  }
  render();

  onlyMismatched.onclick = () => {
    showOnlyMismatched = !showOnlyMismatched;
    onlyMismatched.textContent = showOnlyMismatched ? "⬜ ดูทั้งหมด" : "⚠️ ดูเฉพาะที่แก้ไขแล้ว";
    render();
  };
  exportBtn.onclick = () => {
    const data = loadLtFix();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `landtitle-mapping-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  };
  resetBtn.onclick = () => {
    if (!confirm("ลบ mapping ทั้งหมด? ระบบจะกลับมาใช้ชื่อไฟล์ตามเดิม")) return;
    saveLtFix({});
    render();
  };
}

/* ════════════ HCVF Report map ════════════ */
function renderReport(params) {
  // If a plot key is passed, render a single-plot report instead of the full picture
  const plotKey = params && params[0] ? decodeURIComponent(params[0]) : null;
  const allRecs = getAllRecords();
  let focusRec = null, focusProd = null, focusLT = null;
  // FMU-level focus: plotKey = "fmu:3" → focusFmuNum = 3
  let focusFmuNum = null, fmuRecs = [], fmuPlotNames = new Set();
  if (plotKey && plotKey.startsWith("fmu:")) {
    focusFmuNum = parseInt(plotKey.slice(4), 10);
    if (!isNaN(focusFmuNum)) {
      fmuRecs = allRecs.filter(r => {
        const mm = (r.fmu || "").match(/FMU\s*(\d+)/i);
        return mm && parseInt(mm[1], 10) === focusFmuNum;
      });
      fmuRecs.forEach(r => { if (r.plot) fmuPlotNames.add(r.plot); });
    }
  } else if (plotKey) {
    focusRec = allRecs.find(x => x.memberId === plotKey || x.plot === plotKey);
    if (focusRec) {
      focusProd = PRODUCTIVE.find(p => p.name === focusRec.plot);
      focusLT = LANDTITLES.find(p => p.name && p.name.split(",").map(s => s.trim()).includes(focusRec.plot));
    }
  }

  // Stats — for whole co-op, a single FMU, or a focused plot
  let rmus, fmus, totalArea, plots, summaryDefault;
  if (focusFmuNum !== null) {
    const fmuLabel = `FMU${String(focusFmuNum).padStart(3, "0")}`;
    rmus = [...new Set(fmuRecs.map(m => m.rmu).filter(Boolean))];
    fmus = [fmuLabel];
    totalArea = fmuRecs.reduce((s, m) => s + (Number(m.areaRai) || 0), 0);
    plots = fmuRecs.length;
    summaryDefault = `${fmuLabel}  ·  ${plots} แปลง  ·  เนื้อที่ ${fmtNum(totalArea, 2)} ไร่`;
    $("#rpTitle").value = `แผนที่แปลงปลูกยางพารา ${fmuLabel}`;
    const firstRec = fmuRecs[0];
    if (firstRec) {
      const addrParts = [];
      if (firstRec.moo) addrParts.push(`หมู่ที่ ${firstRec.moo}`);
      if (firstRec.subdistrict) addrParts.push(`ตำบล${firstRec.subdistrict}`);
      if (firstRec.district) addrParts.push(`อำเภอ${firstRec.district}`);
      if (firstRec.province) addrParts.push(`จังหวัด${firstRec.province}`);
      if (addrParts.length) $("#rpAddress").value = addrParts.join(" ");
    }
  } else if (focusRec) {
    rmus = [focusRec.rmu]; fmus = [focusRec.fmu];
    totalArea = Number(focusRec.areaRai) || 0;
    plots = 1;
    summaryDefault = `${focusRec.fmu} แปลง ${focusRec.plot}  ·  ${safe(focusRec.nameTh)}  ·  เนื้อที่ ${fmtNum(totalArea, 2)} ไร่`;
    // หัวเรื่องเฉพาะแปลง — ตัด "FSC Traceability" ออก
    $("#rpTitle").value = `แผนที่แปลงปลูกยางพารา  ${focusRec.fmu} แปลง ${focusRec.plot}`;
    // บรรทัดที่อยู่ — ดึงจากที่ตั้งของ FMU (หมู่ที่ ตำบล อำเภอ จังหวัด)
    const addrParts = [];
    if (focusRec.moo) addrParts.push(`หมู่ที่ ${focusRec.moo}`);
    if (focusRec.subdistrict) addrParts.push(`ตำบล${focusRec.subdistrict}`);
    if (focusRec.district) addrParts.push(`อำเภอ${focusRec.district}`);
    if (focusRec.province) addrParts.push(`จังหวัด${focusRec.province}`);
    if (addrParts.length) $("#rpAddress").value = addrParts.join(" ");
  } else {
    rmus = [...new Set(allRecs.map(m => m.rmu).filter(Boolean))];
    fmus = [...new Set(allRecs.map(m => m.fmu).filter(Boolean))];
    totalArea = allRecs.reduce((s, m) => s + (Number(m.areaRai) || 0), 0);
    plots = allRecs.length;
    summaryDefault = `จำนวน ${rmus.length} RMU  ${fmus.length} ราย (FMU)  ${plots} แปลงย่อย (Plots)  เนื้อที่ ${fmtNum(totalArea, 2)} ไร่`;
  }
  $("#rpSummary").value = summaryDefault;

  // Populate plot picker
  const sel = $("#rpScope");
  if (sel) {
    // ── optgroup: รายFMU ──
    const fmuNums = [...new Set(allRecs.map(r => {
      const mm = (r.fmu || "").match(/FMU\s*(\d+)/i);
      return mm ? parseInt(mm[1], 10) : null;
    }).filter(n => n !== null))].sort((a, b) => a - b);
    if (fmuNums.length) {
      const grp = document.createElement("optgroup");
      grp.label = "แผนที่รายFMU";
      fmuNums.forEach(n => {
        const fmuLabel = `FMU${String(n).padStart(3, "0")}`;
        const cnt = allRecs.filter(r => {
          const mm2 = (r.fmu || "").match(/FMU\s*(\d+)/i);
          return mm2 && parseInt(mm2[1], 10) === n;
        }).length;
        grp.append(el("option", { value: `fmu:${n}` }, `${fmuLabel} — ${cnt} แปลง`));
      });
      sel.append(grp);
    }
    // ── optgroup: รายแปลง ──
    const plotGrp = document.createElement("optgroup");
    plotGrp.label = "รายแปลง (เดี่ยว)";
    allRecs.forEach(r => {
      if (!r.plot) return;
      plotGrp.append(el("option", { value: r.memberId || r.plot }, `${r.plot} — ${safe(r.nameTh)}`));
    });
    sel.append(plotGrp);

    sel.value = (focusFmuNum !== null ? `fmu:${focusFmuNum}` : plotKey) || "all";
    sel.addEventListener("change", e => {
      const v = e.target.value;
      if (v === "all") location.hash = "#/report";
      else location.hash = `#/report/${encodeURIComponent(v)}`;
    });
  }

  function syncText() {
    $("#rpTitleOut").textContent = $("#rpTitle").value;
    $("#rpAddressOut").textContent = $("#rpAddress").value;
    $("#rpSummaryOut").textContent = $("#rpSummary").value;
    $("#rpNoteOut").textContent = $("#rpNote").value;
    $("#rpCompanyOut").textContent = $("#rpCompany").value;
    $("#lgArea").textContent = `พื้นที่ ${fmtNum(totalArea, 2)} ไร่`;
  }
  syncText();
  ["rpTitle", "rpAddress", "rpSummary", "rpNote", "rpCompany"].forEach(id => {
    $("#" + id).addEventListener("input", syncText);
  });

  // Target print scale — ภาพรวมทุกแปลง 1:1,000,000 · รายแปลง 1:10,000
  // (FMU mode ใช้ fitBounds → zoom ขึ้นกับขนาดแปลงจริง ไม่มี fixed TARGET_SCALE)
  const TARGET_SCALE = focusRec ? 10000 : 1000000;

  // Scale label elements
  const scaleText = $("#scaleText");
  const scaleL1   = $("#scaleL1");
  const scaleL2   = $("#scaleL2");
  const scaleL3   = $("#scaleL3");

  // Compute Leaflet zoom for a given map scale at a latitude (96 dpi assumed)
  function zoomForScale(scale, lat) {
    const dpi = 96;
    const inchesPerMeter = 39.3701;
    const metersPerPixel = scale / dpi / inchesPerMeter;
    const earthCircumference = 40075016.686;
    const cosLat = Math.cos((lat || 17.4) * Math.PI / 180);
    return Math.log2(earthCircumference * cosLat / (256 * metersPerPixel));
  }

  // Update scale label + bar from actual map zoom (called after every fitMain / zoom event)
  function updateScaleDisplay() {
    if (!scaleText) return;
    const zoom = map.getZoom();
    const lat  = map.getCenter().lat;
    const dpi  = 96, inchesPerMeter = 39.3701, earthCirc = 40075016.686;
    const mpp  = earthCirc * Math.cos(lat * Math.PI / 180) / (256 * Math.pow(2, zoom));
    const actualScale = mpp * dpi * inchesPerMeter;

    // Round to nearest "nice" scale
    const niceScales = [500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2000000];
    const rounded = niceScales.reduce((p, c) => Math.abs(c - actualScale) < Math.abs(p - actualScale) ? c : p);

    scaleText.textContent = `มาตราส่วน 1:${rounded.toLocaleString("en-US")}`;

    // Scale bar: 4 segments × 8mm ≈ 32mm total on paper
    const totalM = 0.032 * rounded; // meters represented by the full 32mm bar
    if (totalM >= 1000) {
      const km = totalM / 1000;
      const fmt = v => v >= 10 ? Math.round(v) : +v.toFixed(1);
      if (scaleL1) scaleL1.textContent = fmt(km / 4);
      if (scaleL2) scaleL2.textContent = fmt(km / 2);
      if (scaleL3) scaleL3.textContent = `${fmt(km)} กม.`;
    } else {
      if (scaleL1) scaleL1.textContent = Math.round(totalM / 4);
      if (scaleL2) scaleL2.textContent = Math.round(totalM / 2);
      if (scaleL3) scaleL3.textContent = `${Math.round(totalM)} ม.`;
    }
  }

  // Build map — allow fractional zoom so 1:10,000 is precise
  // ใช้ SVG renderer ที่มี padding ใหญ่ (2.0 = ขยาย SVG bound 200% รอบ viewport)
  // เพื่อป้องกัน polygon ถูกตัดตอนพิมพ์ (map container ขยายจาก screen → A4)
  const map = L.map("hcvfMap", {
    zoomControl: true,
    attributionControl: false,
    zoomSnap: 0.1,
    zoomDelta: 0.5,
    renderer: L.svg({ padding: 2.0 }),
  }).setView([17.4, 101.5], 11);

  // ── Satellite basemap (สลับปีได้ ผ่าน dropdown ใน controls) ──
  let baseLayer = createBasemapLayer(getSelectedBasemapKey()).addTo(map);
  const rpYSel = $("#rpBasemapYear");
  if (rpYSel) {
    rpYSel.value = getSelectedBasemapKey();
    rpYSel.addEventListener("change", e => {
      const key = e.target.value;
      setSelectedBasemapKey(key);
      map.removeLayer(baseLayer);
      baseLayer = createBasemapLayer(key).addTo(map);
      baseLayer.bringToBack();
      showBasemapWarning(key);
    });
    showBasemapWarning(rpYSel.value);
  }

  // Coordinate readout (top-right of map)
  const CoordControl = L.Control.extend({
    options: { position: "topright" },
    onAdd: function() {
      const div = L.DomUtil.create("div", "coord-readout");
      div.innerHTML = `<div class="coord-line coord-utm">— · —</div><div class="coord-line coord-ll">— · —</div>`;
      this._el = div;
      return div;
    },
    update: function(lat, lng) {
      this._el.querySelector(".coord-utm").textContent = fmtUTM(lat, lng);
      this._el.querySelector(".coord-ll").textContent = fmtLatLng(lat, lng);
    },
  });
  const coordControl = new CoordControl();
  coordControl.addTo(map);
  map.on("mousemove", e => coordControl.update(e.latlng.lat, e.latlng.lng));
  map.on("mouseout", () => {
    coordControl._el.querySelector(".coord-utm").textContent = "— · —";
    coordControl._el.querySelector(".coord-ll").textContent = "— · —";
  });

  // North arrow + scale (bottom-right)
  L.control.scale({ position: "bottomleft", metric: true, imperial: false, maxWidth: 200 }).addTo(map);

  // ── IFL (Intact Forest Landscapes) — lazy load จาก window.IFL_THAILAND ──
  const iflLayer = L.layerGroup();
  let iflLoadedReport = false;
  async function buildIFLReport() {
    if (iflLoadedReport) return;
    if (!window.IFL_THAILAND) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "data/ifl-thailand.js";
        s.onload = resolve;
        s.onerror = () => reject(new Error("ไม่พบ data/ifl-thailand.js"));
        document.head.appendChild(s);
      });
    }
    const style = { color: "#1b5e20", weight: 1.5, fillColor: "#a5d6a7", fillOpacity: 0.45 };
    (window.IFL_THAILAND || []).forEach(f => {
      if (!f.coords || f.coords.length < 3) return;
      const poly = L.polygon(f.coords.map(c => [c[1], c[0]]), style);
      poly.bindTooltip(f.id, { sticky: true });
      iflLayer.addLayer(poly);
    });
    iflLoadedReport = true;
    console.log("[IFL Report] loaded", (window.IFL_THAILAND || []).length, "features");
  }
  // ── WDPA Thailand — โหลดจาก window.WDPA_AREAS (pre-parsed shapefile) ──
  const wdpaLayer = L.layerGroup();
  let wdpaLoadedReport = false;
  function loadWDPAReport() {
    if (wdpaLoadedReport) return;
    const data = window.WDPA_AREAS || [];
    const style = { color: "#00695c", weight: 1.5, fillColor: "#80cbc4", fillOpacity: 0.5 };
    let total = 0;
    data.forEach(f => {
      const name = f.name || "Protected Area";
      const desig = f.desig || "";
      (f.rings || []).forEach(ring => {
        if (!ring || ring.length < 3) return;
        const poly = L.polygon(ring.map(c => [c[1], c[0]]), style);
        poly.bindTooltip(`${name}${desig ? " · " + desig : ""}`);
        wdpaLayer.addLayer(poly);
        total++;
      });
    });
    wdpaLoadedReport = true;
    console.log("[WDPA Report] loaded", total, "polygons");
  }

  const lyrProd = L.layerGroup(), lyrWater = L.layerGroup(), lyrLT = L.layerGroup(), lyrBuffer = L.layerGroup(), lyrFocus = L.layerGroup();

  // Render ALL productive + water + land titles (like main map) for context
  // FMU mode: highlight FMU polygons, dim others.  Single-plot mode: existing crosshair behavior.
  PRODUCTIVE.forEach(p => {
    const isFocused = focusRec
      ? p.name === focusRec.plot
      : (focusFmuNum !== null ? fmuPlotNames.has(p.name) : false);
    if (isFocused) {
      L.polygon(p.coordinates.map(c => [c[1], c[0]]), {
        color: "#1b5e20", weight: 2.5, fillColor: "#2e7d32", fillOpacity: 0.9,
      }).bindTooltip(p.name).addTo(lyrFocus);
    } else {
      const dimmed = focusFmuNum !== null; // dim background plots in FMU mode
      L.polygon(p.coordinates.map(c => [c[1], c[0]]), {
        color: dimmed ? "#66bb6a" : "#1b5e20",
        weight: dimmed ? 0.8 : 1.2,
        fillColor: "#2e7d32",
        fillOpacity: dimmed ? 0.2 : 0.7,
      }).bindTooltip(p.name).addTo(lyrProd);
    }
  });
  WATER.forEach(p => {
    L.polygon(p.coordinates.map(c => [c[1], c[0]]), {
      color: "#01579b", weight: 1, fillColor: "#4fc3f7", fillOpacity: 0.75,
    }).bindTooltip(p.name).addTo(lyrWater);
  });
  LANDTITLES.forEach(p => {
    const isFocused = focusRec
      ? (p.name && p.name.split(",").map(s => s.trim()).includes(focusRec.plot))
      : (focusFmuNum !== null && p.name && p.name.split(",").map(s => s.trim()).some(n => fmuPlotNames.has(n)));
    L.polygon(p.coordinates.map(c => [c[1], c[0]]), {
      color: "#ffd600",
      weight: isFocused ? 3 : 1.5,
      fill: false,
      opacity: isFocused ? 1 : (focusFmuNum !== null ? 0.3 : 0.7),
    }).bindTooltip(p.name).addTo(lyrLT);
  });
  BUFFERZONES.forEach(f => {
    L.polyline(f.coordinates.map(c => [c[1], c[0]]), {
      color: "#6a1b9a", weight: 2.5, dashArray: "6,4",
    }).bindTooltip(f.name).addTo(lyrBuffer);
  });

  // Buffer zone added last so it always renders on top of every other layer
  lyrProd.addTo(map); lyrWater.addTo(map); lyrLT.addTo(map); lyrFocus.addTo(map); lyrBuffer.addTo(map);

  // Inset overview — always shows ALL productive areas for context
  const inset = L.map("hcvfInset", { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false, renderer: L.svg({ padding: 2.0 }) }).setView([17.4, 101.5], 8);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 }).addTo(inset);
  const insetPolys = [];
  PRODUCTIVE.forEach(p => {
    const poly = L.polygon(p.coordinates.map(c => [c[1], c[0]]), { color: "#1b5e20", weight: 1, fillColor: "#2e7d32", fillOpacity: 0.9 });
    poly.addTo(inset); insetPolys.push(poly);
  });
  // Inset: marker pin on focused area
  let insetCentroid = null;
  if (focusFmuNum !== null) {
    const fmuLyrs = lyrFocus.getLayers();
    if (fmuLyrs.length) {
      const c = L.featureGroup(fmuLyrs).getBounds().getCenter();
      insetCentroid = [c.lat, c.lng];
    }
  } else if (focusProd && focusProd.coordinates && focusProd.coordinates.length) {
    insetCentroid = polyCentroid(focusProd.coordinates);
  } else if (focusLT && focusLT.coordinates && focusLT.coordinates.length) {
    insetCentroid = polyCentroid(focusLT.coordinates);
  } else if (focusRec && focusRec.lat && focusRec.lng) {
    insetCentroid = [Number(focusRec.lat), Number(focusRec.lng)];
  }
  if (insetCentroid) {
    L.circleMarker(insetCentroid, {
      radius: focusFmuNum !== null ? 8 : 5, color: "#fff", weight: 2,
      fillColor: "#1b5e20", fillOpacity: 1,
    }).addTo(inset);
  }

  // ── FMU summary bar ──
  const bar = $("#plotCoordBar");
  if (focusFmuNum !== null && bar) {
    const fmuLabel = `FMU${String(focusFmuNum).padStart(3, "0")}`;
    const owners = fmuRecs.map(r => safe(r.nameTh)).filter(Boolean).join(" · ") || "—";
    const subdists = [...new Set(fmuRecs.map(r => r.subdistrict).filter(Boolean))].join(", ") || "—";
    const districts = [...new Set(fmuRecs.map(r => r.district).filter(Boolean))].join(", ") || "—";
    bar.innerHTML = `
      <div class="pcb-section"><span class="pcb-label">FMU</span><span class="pcb-value">${fmuLabel}</span></div>
      <div class="pcb-section"><span class="pcb-label">สมาชิก</span><span class="pcb-value">${fmuRecs.length} แปลง</span></div>
      <div class="pcb-section"><span class="pcb-label">พื้นที่รวม</span><span class="pcb-value">${fmtNum(totalArea, 2)} ไร่</span></div>
      <div class="pcb-section"><span class="pcb-label">ตำบล</span><span class="pcb-value">${subdists}</span></div>
      <div class="pcb-section"><span class="pcb-label">อำเภอ</span><span class="pcb-value">${districts}</span></div>
      <div class="pcb-section pcb-wide"><span class="pcb-label">เจ้าของ</span><span class="pcb-value">${owners}</span></div>`;
    bar.style.display = "";
  }

  // Add a crosshair marker at the plot center (small, doesn't obscure polygon)
  // Coordinate info itself is rendered in a strip BELOW the map (#plotCoordBar)
  // ใช้ centroid จาก polygon ผลิต > polygon เอกสารสิทธิ์ > lat/lng ของ record
  let centroidForBar = null;
  if (focusProd && focusProd.coordinates && focusProd.coordinates.length) {
    centroidForBar = polyCentroid(focusProd.coordinates);
  } else if (focusLT && focusLT.coordinates && focusLT.coordinates.length) {
    centroidForBar = polyCentroid(focusLT.coordinates);
  } else if (focusRec && focusRec.lat && focusRec.lng) {
    centroidForBar = [Number(focusRec.lat), Number(focusRec.lng)];
  }
  if (focusRec && centroidForBar) {
    const centroid = centroidForBar;
    const crosshair = L.divIcon({
      className: "plot-center-marker",
      html: `<div class="plot-center-cross"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    L.marker(centroid, { icon: crosshair, interactive: false }).addTo(map);

    // Render coord strip below the map
    if (bar) {
      bar.innerHTML = `
        <div class="pcb-section">
          <span class="pcb-label">แปลง</span>
          <span class="pcb-value">${focusRec.fmu} · ${focusRec.plot}</span>
        </div>
        <div class="pcb-section">
          <span class="pcb-label">เจ้าของ</span>
          <span class="pcb-value">${safe(focusRec.docOwnerTh || focusRec.nameTh)}</span>
        </div>
        <div class="pcb-section">
          <span class="pcb-label">พิกัด UTM (Z${latLngToUTM(centroid[0], centroid[1]).zone})</span>
          <span class="pcb-value pcb-mono">${latLngToUTM(centroid[0], centroid[1]).easting.toLocaleString("en-US")} E · ${latLngToUTM(centroid[0], centroid[1]).northing.toLocaleString("en-US")} N</span>
        </div>
        <div class="pcb-section">
          <span class="pcb-label">Lat / Lng (WGS84)</span>
          <span class="pcb-value pcb-mono">${fmtLatLng(centroid[0], centroid[1])}</span>
        </div>
        <div class="pcb-section">
          <span class="pcb-label">พื้นที่</span>
          <span class="pcb-value">${fmtNum(focusRec.areaRai, 2)} ไร่ · ${fmtNum(focusRec.areaHa, 4)} เฮกตาร์</span>
        </div>`;
      bar.style.display = "";
    }
  } else if (focusFmuNum === null) {
    if (bar) bar.style.display = "none";
  }

  // Fit main map at appropriate scale centered on the SELECTED scope
  const allLayers = [...lyrProd.getLayers(), ...lyrWater.getLayers(), ...lyrLT.getLayers(), ...lyrBuffer.getLayers(), ...lyrFocus.getLayers()];
  function fitMain() {
    if (!allLayers.length) return;
    let center, zoom;
    if (focusFmuNum !== null) {
      // FMU mode — คำนวณ bounds จาก coordinate data โดยตรง (ครอบคลุมทั้ง PRODUCTIVE + LANDTITLES)
      // เพราะ FMU1-15 มีเฉพาะใน LANDTITLES ไม่มีใน PRODUCTIVE
      const fmuCoords = [
        ...PRODUCTIVE.filter(p => fmuPlotNames.has(p.name)).flatMap(p => p.coordinates),
        ...LANDTITLES.filter(p => p.name && p.name.split(",").map(s => s.trim()).some(n => fmuPlotNames.has(n))).flatMap(p => p.coordinates),
      ];
      map.invalidateSize();
      if (fmuCoords.length) {
        const latlngs = fmuCoords.map(c => L.latLng(c[1], c[0]));
        map.fitBounds(L.latLngBounds(latlngs).pad(0.3), { animate: false });
      } else {
        map.fitBounds(L.featureGroup(allLayers).getBounds(), { animate: false });
      }
      updateScaleDisplay();
      return;
    } else if (focusRec) {
      // ลำดับความสำคัญ: polygon ผลิต → polygon เอกสารสิทธิ์ → พิกัด lat/lng ของแปลง → fallback
      // (แปลง FMU1-15 มี polygon เฉพาะใน landtitles ไม่มีใน productive)
      if (focusProd && focusProd.coordinates && focusProd.coordinates.length) {
        const c = polyCentroid(focusProd.coordinates);
        center = L.latLng(c[0], c[1]);
      } else if (focusLT && focusLT.coordinates && focusLT.coordinates.length) {
        const c = polyCentroid(focusLT.coordinates);
        center = L.latLng(c[0], c[1]);
      } else if (focusRec.lat && focusRec.lng) {
        center = L.latLng(Number(focusRec.lat), Number(focusRec.lng));
      } else if (lyrFocus.getLayers().length) {
        center = L.featureGroup(lyrFocus.getLayers()).getBounds().getCenter();
      } else {
        // ไม่มีพิกัดเลย — fit ทั้งหมด
        center = L.featureGroup(allLayers).getBounds().getCenter();
      }
      zoom = zoomForScale(TARGET_SCALE, center.lat);
    } else {
      // โหมดดูทุกแปลง — fit ทั้งหมด
      const bounds = L.featureGroup(allLayers).getBounds();
      center = bounds.getCenter();
      zoom = zoomForScale(TARGET_SCALE, center.lat);
    }
    map.invalidateSize();
    map.setView(center, zoom, { animate: false });
    updateScaleDisplay();
  }
  fitMain();
  map.on("zoomend", updateScaleDisplay);
  if (insetPolys.length) inset.fitBounds(L.featureGroup(insetPolys).getBounds().pad(0.5));

  // Buffer zone must always render above every other layer — re-assert
  // its z-order whenever another layer is (re)added to the map.
  function bringBufferToFront() { lyrBuffer.eachLayer(l => l.bringToFront && l.bringToFront()); }

  function bindToggle(id, layer, useTiles) {
    const el = $("#" + id);
    if (!el) return;
    el.addEventListener("change", e => {
      if (e.target.checked) { map.addLayer(layer); bringBufferToFront(); } else map.removeLayer(layer);
    });
  }
  // Productive toggle controls both regular + focused-highlight layers
  const togProd = $("#rpLyrProd");
  if (togProd) {
    togProd.addEventListener("change", e => {
      if (e.target.checked) { map.addLayer(lyrProd); map.addLayer(lyrFocus); bringBufferToFront(); }
      else { map.removeLayer(lyrProd); map.removeLayer(lyrFocus); }
    });
  }
  bindToggle("rpLyrWater", lyrWater);
  bindToggle("rpLyrLT", lyrLT);
  bindToggle("rpLyrBuffer", lyrBuffer);
  const togIFLRpt = $("#rpLyrIFL");
  if (togIFLRpt) {
    togIFLRpt.addEventListener("change", async e => {
      if (e.target.checked) { await buildIFLReport(); iflLayer.addTo(map); bringBufferToFront(); }
      else map.removeLayer(iflLayer);
    });
  }
  // WDPA toggle ต้องโหลด shapefile ก่อนเปิด layer (lazy)
  const togWDPA = $("#rpLyrWDPA");
  if (togWDPA) {
    togWDPA.addEventListener("change", async e => {
      if (e.target.checked) {
        await loadWDPAReport();
        map.addLayer(wdpaLayer);
        bringBufferToFront();
      } else {
        map.removeLayer(wdpaLayer);
      }
    });
  }

  $("#rpFitBtn").onclick = fitMain;

  // Auto-load IFL + WDPA เมื่อ checkbox ถูก checked by default
  if (togIFLRpt && togIFLRpt.checked) {
    buildIFLReport().then(() => { iflLayer.addTo(map); bringBufferToFront(); });
  }
  if (togWDPA && togWDPA.checked) {
    loadWDPAReport();
    map.addLayer(wdpaLayer);
    bringBufferToFront();
  }

  // Resize map ก่อนพิมพ์ — beforeprint/afterprint จะ trigger หลัง CSS @media print apply แล้ว
  // เพื่อให้ Leaflet โหลด tile ใหม่ในขนาดที่ตรงกับ A4 + force redraw polygon ทั้งหมด
  // เพราะ SVG renderer มี bound ที่ตั้งไว้ตอน screen size — ต้อง trigger pan event ให้ขยาย bound
  function forceRedrawPolygons(mapObj) {
    mapObj.invalidateSize();
    // Trigger map move event เพื่อให้ SVG re-project polygons ในขอบเขตใหม่
    mapObj.fire("moveend");
    mapObj.eachLayer(layer => {
      if (layer instanceof L.Path && typeof layer.redraw === "function") {
        try { layer.redraw(); } catch (e) { /* ignore */ }
      }
    });
  }
  const onBefore = () => {
    forceRedrawPolygons(map);
    forceRedrawPolygons(inset);
    if (typeof fitMain === "function") fitMain();
    forceRedrawPolygons(map);  // เรียกอีกครั้งหลัง fitMain
  };
  const onAfter = () => {
    setTimeout(() => {
      forceRedrawPolygons(map);
      forceRedrawPolygons(inset);
      if (typeof fitMain === "function") fitMain();
    }, 100);
  };
  window.addEventListener("beforeprint", onBefore);
  window.addEventListener("afterprint", onAfter);

  $("#rpPrintBtn").onclick = () => {
    forceRedrawPolygons(map);
    forceRedrawPolygons(inset);
    if (typeof fitMain === "function") fitMain();
    // small delay so Leaflet finishes redraw before opening print dialog
    setTimeout(() => window.print(), 500);
  };

  setTimeout(() => {
    map.invalidateSize();
    inset.invalidateSize();
    // เรียก fitMain อีกครั้งหลัง container ปรับขนาดเสร็จ — เพื่อให้ polygon ที่เลือกอยู่กึ่งกลางจริง
    fitMain();
    if (insetPolys.length) inset.fitBounds(L.featureGroup(insetPolys).getBounds().pad(0.5));
  }, 200);
}
