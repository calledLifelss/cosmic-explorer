/* کاوشگر کیهانی — منطق رابط کاربری */
"use strict";
/* global BODIES, ORBIT_INFO, QUIZ, DATA_REVIEW, DATA_SOURCES, ELEMENT_COLORS, ELEMENT_INFO, Scene3D */

const $ = (s) => document.querySelector(s);
// ارقام فارسی:
const faD = (x) => String(x).replace(/\./g, "٫").replace(/0/g, "۰").replace(/1/g, "۱").replace(/2/g, "۲").replace(/3/g, "۳").replace(/4/g, "۴").replace(/5/g, "۵").replace(/6/g, "۶").replace(/7/g, "۷").replace(/8/g, "۸").replace(/9/g, "۹");

const store = {
  load() { try { return JSON.parse(localStorage.getItem("cosmic-explorer") || "{}"); } catch { return {}; } },
  save(s) { try { localStorage.setItem("cosmic-explorer", JSON.stringify(s)); } catch { } }
};
let S = Object.assign({ favs: [], last: null, sizeS: 1, distS: 1, mode: "show", orbits: true, labels: true, dwarfs: false, speed: 1, shadow: true, follow: true }, store.load());
const persist = () => store.save(S);

let current = null, currentEl = null;
let currentTab = "overview", factIdx = 0, chemBodyId = null;
const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;

function toast(msg) {
  const d = document.createElement("div"); d.className = "toastmsg"; d.textContent = msg;
  $("#toast").appendChild(d); setTimeout(() => d.remove(), 3400);
}
function bodyById(id) { return BODIES.find(b => b.id === id); }
function elColor(s) { return ELEMENT_COLORS[s] || "#8d99ae"; }
function elFa(s) { return (ELEMENT_INFO[s] || {}).fa || s; }
function elN(s) { return (ELEMENT_INFO[s] || {}).n ?? "—"; }

/* ---------- نوار اجرام ---------- */
function buildBar() {
  const bar = $("#bodyBar"); bar.innerHTML = "";
  [{ id: null, fa: "کل", c: "#5aa2ff" }].concat(BODIES.map(b => ({ id: b.id, fa: b.fa, c: "#" + b.color.toString(16).padStart(6, "0"), dwarf: b.dwarf }))).forEach(it => {
    if (it.dwarf && !S.dwarfs) return;
    const btn = document.createElement("button");
    btn.dataset.id = it.id || "";
    btn.title = it.id ? bodyById(it.id).fa : "نمای کلی";
    btn.innerHTML = `<span class="pdot" style="--pc:${it.c}"></span><small>${it.fa}</small>`;
    if (it.id && S.favs.includes(it.id)) btn.classList.add("fav");
    btn.onclick = () => { if (!it.id) { Scene3D.resetView(); } else selectBody(it.id); };
    bar.appendChild(btn);
  });
}
function markBar() {
  document.querySelectorAll("#bodyBar button").forEach(b => b.classList.toggle("sel", b.dataset.id === current));
}

/* ---------- انتخاب جرم ---------- */
function selectBody(id, silent) {
  current = id; currentEl = null;
  const b = id ? bodyById(id) : null;
  if (b && b.dwarf && !S.dwarfs) { // انتخاب از جست‌وجو/علاقه‌مندی نباید جرم نامرئی باشد
    S.dwarfs = true; Scene3D.setDwarfs(true); $("#tglDwarfs").checked = true; buildBar();
  }
  Scene3D.select(id);
  markBar();
  const p = $("#infoPanel");
  if (!id) { p.classList.remove("open"); Scene3D.setPanelOpen(false); S.last = null; persist(); return; }
  S.last = id; persist();
  const wasOpen = p.classList.contains("open");
  renderPanel(b);
  if (!wasOpen) { p.classList.add("open"); Scene3D.setPanelOpen(true); }
  else swapContent();
  if (innerWidth < 760) p.scrollTop = 0;
  // اگر کاربر داخل تب شیمی است، نمودار جرم جدید با همان انیمیشن بازسازی شود
  if (currentTab === "chem") renderChem(b, null);
}

function updateScaleNote() {
  const n = $("#scaleNote");
  if (!n) return;
  n.textContent = S.mode === "real"
    ? "مقیاس علمی: نسبت قطرها واقعی (فشرده‌سازی ریشه سوم)؛ فاصله‌ها لگاریتمی فشرده — فاصله واقعی بسیار بزرگ‌تر است."
    : "نمای نمایشی: اندازه‌ها و فاصله‌ها برای دیده‌شدن بزرگ‌نمایی شده‌اند (نمایشی، نه مقیاس واقعی).";
}

function renderPanel(b) {
  $("#ipTitle").textContent = b.fa;
  $("#ipEn").textContent = b.en;
  $("#ipType").innerHTML = `<span class="badge">${b.type}</span>` + (b.chemEstimated ? ` <span class="badge warn">بخشی از داده‌ها برآورد مدل‌محور است</span>` : "");
  $("#ipHook").textContent = b.hook || (b.desc.split("؛")[0] + "؛");
  $("#ipStats").innerHTML = (b.stats || []).map(s =>
    `<div class="stat"><span class="s-ic"><svg class="ic" aria-hidden="true"><use href="#i-${s.icon}"/></svg></span><div class="sc"><small>${s.label}</small><b>${s.value}</b>${s.note ? `<small class="sn">${s.note}</small>` : ""}</div></div>`).join("");
  // در هر بار بازکردن، یک حقیقت تازه برای حس کشف
  const qf = b.quickFacts || b.facts.map(f => f[1]);
  factIdx = Math.floor(Math.random() * qf.length) % qf.length;
  renderFact(b);
  // تب «مشخصات کامل»: همه اطلاعات تخصصی حفظ می‌شوند
  $("#ipDesc").textContent = b.desc;
  $("#btnFavTxt").textContent = S.favs.includes(b.id) ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها";
  $("#ipTable").innerHTML = b.info.map(r => `<div class="kv"><b>${r[0]}</b><span>${r[1]}</span></div>`).join("");
  $("#ipFacts").innerHTML = b.facts.map(f => `<div class="kv"><b>${f[0]}</b><span>${f[1]}</span></div>`).join("");
  const oi = ORBIT_INFO[b.id];
  $("#orbitRow").innerHTML = oi ? `<div class="kv"><b>دوره مداری</b><span>${oi.period}</span></div><div class="kv"><b>فاصله (واحد نجومی)</b><span>${faD(oi.au)}</span></div>` : "";
  // نمودار شیمی با بازشدن تب ساخته می‌شود تا انیمیشن رشد میله‌ها دیده شود
  chemBodyId = null;
  $("#chemBasis").innerHTML = `<b>مبنای داده:</b> ${b.chemBasis}`;
  $("#chemNote").textContent = b.chemNote || "";
  $("#elCard").innerHTML = "";
}

function swapContent() {
  const c = $("#ipContent");
  c.classList.remove("swap"); void c.offsetWidth; c.classList.add("swap");
}

function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll("#infoPanel .tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  $("#tabOverview").classList.toggle("active", tab === "overview");
  $("#tabChem").classList.toggle("active", tab === "chem");
  $("#tabFull").classList.toggle("active", tab === "full");
  if (tab === "chem" && current && chemBodyId !== current) renderChem(bodyById(current), null);
}

function renderFact(b) {
  const qf = b.quickFacts || b.facts.map(f => f[1]);
  $("#factText").textContent = qf[factIdx % qf.length];
}

function elValText(e) {
  if (e.pct === null || e.pct === undefined) return e.rank ? `رتبه ${faD(e.rank)}` : "داده دقیق در دسترس نیست";
  return `${faD(e.pct)}٪`;
}

/* ---------- بخش شیمی — تجربه تعاملی ---------- */
function renderChem(b, selSym) {
  currentEl = selSym;
  if (chemBodyId !== b.id) {          // ساخت اولیه با انیمیشن ورود
    buildBars(b, selSym);
    buildDonut(b, selSym);
    chemBodyId = b.id;
  } else updateChemSel(b, selSym);    // فقط برجسته‌سازی، بدون بازیافت انیمیشن
  renderElCard(b, selSym);
}

function buildBars(b, selSym) {
  // مرتب‌سازی بر پایه مقدار معتبر: درصد نزولی، سپس رتبه صعودی
  const els = [...b.elements].sort((x, y) => {
    const xv = x.pct ?? null, yv = y.pct ?? null;
    if (xv !== null && yv !== null) return yv - xv;
    if (xv !== null) return -1;
    if (yv !== null) return 1;
    return (x.rank || 99) - (y.rank || 99);
  });
  const withPct = els.filter(e => e.pct !== null && e.pct !== undefined);
  const max = Math.max(1, ...withPct.map(e => e.pct));
  const list = $("#barList"); list.innerHTML = "";
  els.forEach((e, i) => {
    const d = document.createElement("button");
    d.type = "button";
    d.className = "bar" + (selSym === e.s ? " sel" : "") + (selSym && selSym !== e.s ? " dim" : "");
    d.dataset.s = e.s;
    d.style.setProperty("--elc", elColor(e.s));
    d.style.animationDelay = (i * 55) + "ms";
    const hasVal = e.pct !== null && e.pct !== undefined;
    const w = hasVal ? Math.max(4, (e.pct / max) * 100) : Math.max(28, 100 - ((e.rank || 8) - 1) * 11);
    const est = /مدل|برآورد|Estimat/i.test(e.src || "");
    d.innerHTML = `<span class="sym">${e.s}</span>
      <span class="b-name">${elFa(e.s)}<small>عدد اتمی ${faD(elN(e.s))}${e.unit ? " — " + e.unit : ""}</small>${est ? ' <span class="est">برآورد مدل</span>' : ""}</span>
      <span class="val"></span>
      <span class="track"><span class="fill"></span></span>`;
    d.onclick = () => renderChem(b, selSym === e.s ? null : e.s);
    list.appendChild(d);
    const fill = d.querySelector(".fill"), val = d.querySelector(".val");
    if (REDUCED_MOTION) { fill.style.width = w + "%"; val.textContent = elValText(e); }
    else requestAnimationFrame(() => requestAnimationFrame(() => {
      fill.style.transitionDelay = (i * 60) + "ms";
      fill.style.width = w + "%";
    }));
    if (hasVal) countUp(val, e.pct, i); else val.textContent = elValText(e);
  });
}

/* شمارش هماهنگ با رشد میله (ease-out cubic) */
function countUp(el, target, idx) {
  if (REDUCED_MOTION || !target) { el.textContent = `${faD(target)}٪`; return; }
  const dur = 700, t0 = performance.now() + idx * 60;
  const step = (t) => {
    const k = Math.min(1, Math.max(0, (t - t0) / dur));
    const v = target * (1 - Math.pow(1 - k, 3));
    el.textContent = `${faD(k >= 1 ? target : Math.round(v * 100) / 100)}٪`;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function updateChemSel(b, selSym) {
  document.querySelectorAll("#barList .bar").forEach(d => {
    const sym = d.dataset.s;
    d.classList.toggle("sel", sym === selSym);
    d.classList.toggle("dim", !!selSym && sym !== selSym);
  });
  $("#donutSvg").querySelectorAll("circle[data-s]").forEach(c => {
    const on = !selSym || c.dataset.s === selSym;
    c.setAttribute("opacity", on ? "1" : "0.3");
    c.setAttribute("stroke-width", on ? "15" : "9");
  });
  $("#legend").querySelectorAll("div[data-s]").forEach(d => d.classList.toggle("sel", d.dataset.s === selSym));
}

function buildDonut(b, selSym) {
  const svg = $("#donutSvg"), R = 52, C = 2 * Math.PI * R;
  const vals = b.elements.filter(e => e.pct !== null && e.pct !== undefined);
  const wrap = $("#donutWrap"), cap = $("#donutCap");
  if (vals.length < 3) {              // داده رتبه‌ای برای نمودار حلقه‌ای گمراه‌کننده است
    wrap.style.display = "none"; cap.style.display = "block";
    cap.textContent = "داده عددی کافی برای نمودار حلقه‌ای نیست؛ نمودار میله‌ای (رتبه‌ای) نمایش اصلی است.";
    svg.innerHTML = ""; $("#legend").innerHTML = ""; $("#donutTotal").innerHTML = "";
    return;
  }
  wrap.style.display = "flex"; cap.style.display = "block";
  const tot = vals.reduce((a, e) => a + e.pct, 0);
  $("#donutTotal").innerHTML = `<b>${faD(Math.round(tot * 10) / 10)}٪</b>مجموع عناصر<br>نمایش‌داده‌شده`;
  let acc = 0, html = "";
  vals.forEach((e, i) => {
    const frac = e.pct / tot, len = frac * C;
    html += `<circle cx="65" cy="65" r="${R}" fill="none" stroke="${elColor(e.s)}"
      stroke-width="${selSym && selSym !== e.s ? 9 : 15}" stroke-dasharray="0 ${C}" data-final="${len} ${C - len}"
      stroke-dashoffset="${-acc * C}" opacity="${selSym && selSym !== e.s ? 0.3 : 1}"
      transform="rotate(-90 65 65)" style="cursor:pointer;transition-delay:${i * 70}ms" data-s="${e.s}"><title>${elFa(e.s)} ${faD(e.pct)}٪</title></circle>`;
    acc += frac;
  });
  svg.innerHTML = html;
  const circles = svg.querySelectorAll("circle[data-s]");
  if (REDUCED_MOTION) circles.forEach(c => c.setAttribute("stroke-dasharray", c.dataset.final));
  else requestAnimationFrame(() => requestAnimationFrame(() =>
    circles.forEach(c => c.setAttribute("stroke-dasharray", c.dataset.final))));
  circles.forEach(c => c.onclick = () => renderChem(b, selSym === c.dataset.s ? null : c.dataset.s));
  cap.textContent = "نمودار حلقه‌ای: سهم هر عنصر از مجموع عناصر نمایش‌داده‌شده — نه لزوماً ۱۰۰٪ کل ترکیب جرم.";
  $("#legend").innerHTML = vals.map(e => `<div data-s="${e.s}" class="${selSym === e.s ? "sel" : ""}"><i style="background:${elColor(e.s)}"></i>${elFa(e.s)} — ${elValText(e)}</div>`).join("");
  $("#legend").querySelectorAll("div[data-s]").forEach(d => d.onclick = () => renderChem(b, selSym === d.dataset.s ? null : d.dataset.s));
}

function renderElCard(b, sym) {
  const box = $("#elCard");
  if (!sym) { box.innerHTML = `<p class="src">برای دیدن جزئیات، روی یک عنصر در نمودار کلیک کنید. رنگ هر عنصر در کل برنامه ثابت است.</p>`; return; }
  const e = b.elements.find(x => x.s === sym);
  box.innerHTML = `<div class="elcard" style="--elc:${elColor(sym)}">
    <div class="el-head">
      <div class="el-sym">${sym}</div>
      <div><b style="font-size:15.5px">${elFa(sym)} در ${b.fa}</b><br><small class="src">عدد اتمی ${faD(elN(sym))}</small></div>
      <div class="el-val"><b>${elValText(e)}</b>${e.unit ? `<small>${e.unit}</small>` : ""}</div>
    </div>
    <p style="font-size:13px;line-height:1.95;margin:8px 0 4px">${e.note}</p>
    <p class="src">مبنا: ${b.chemBasis}<br>منبع: ${e.src || "—"}</p>
    <div class="rowbtns"><button class="btn" id="elBack">→ بازگشت به نمودار</button></div>
  </div>`;
  $("#elBack").onclick = () => renderChem(b, null);
}

/* ---------- مقایسه ---------- */
function fillCmpSelects() {
  const opts = BODIES.map(b => `<option value="${b.id}">${b.fa}</option>`).join("");
  ["#cmpA", "#cmpB", "#cmpC"].forEach((s, i) => {
    $(s).innerHTML = (i === 2 ? `<option value="">—</option>` : "") + opts;
  });
  $("#cmpA").value = "earth"; $("#cmpB").value = "mars";
  const els = [...new Set(BODIES.flatMap(b => b.elements.map(e => e.s)))];
  $("#cmpEl").innerHTML = els.map(s => `<option value="${s}">${elFa(s)} (${s})</option>`).join("");
  $("#cmpEl").value = "Fe";
}
function runCompare() {
  const ids = [$("#cmpA").value, $("#cmpB").value, $("#cmpC").value].filter(Boolean).slice(0, 3);
  const bs = ids.map(bodyById);
  const rows = [["نوع", b => b.type], ["قطر", b => (b.info.find(r => r[0].includes("قطر")) || ["", "—"])[1]],
    ["جرم", b => (b.info.find(r => r[0].includes("جرم")) || ["", "—"])[1]],
    ["چگالی", b => (b.info.find(r => r[0].includes("چگالی")) || ["", "—"])[1]],
    ["گرانش", b => (b.info.find(r => r[0].includes("گرانش")) || ["", "—"])[1]],
    ["فاصله از خورشید", b => (b.info.find(r => r[0].includes("فاصله")) || ["", "—"])[1]],
    ["سال", b => (b.info.find(r => r[0].includes("سال")) || ["", "—"])[1]],
    ["روز", b => (b.info.find(r => r[0].includes("روز")) || ["", "—"])[1]],
    ["دما", b => (b.info.find(r => r[0].includes("دما")) || ["", "—"])[1]],
    ["قمر", b => (b.info.find(r => r[0].includes("قمر")) || ["", "—"])[1]],
    ["حلقه", b => (b.info.find(r => r[0].includes("حلقه")) || ["", "—"])[1]],
    ["جو غالب", b => b.atmo]];
  let h = `<table><tr><th>ویژگی</th>${bs.map(b => `<th>${b.fa}</th>`).join("")}</tr>`;
  rows.forEach(([t, f]) => { h += `<tr><td>${t}</td>${bs.map(b => `<td>${f(b)}</td>`).join("")}</tr>`; });
  h += "</table>";
  // مقایسه عنصر
  const sym = $("#cmpEl").value;
  const bases = bs.map(b => b.chemBasis);
  const sameBasis = new Set(bases).size === 1;
  h += `<h3>مقایسه ${elFa(sym)} (${sym})</h3>`;
  if (!sameBasis) h += `<p class="src" style="color:var(--gold)">مبنای داده اجرام یکسان نیست؛ مقایسه عددی مستقیم گمراه‌کننده است. هر مقدار را با مبنای خودش بخوانید.</p>`;
  h += `<table><tr><th>جرم</th><th>مقدار</th><th>مبنا</th></tr>`;
  bs.forEach(b => {
    const e = b.elements.find(x => x.s === sym);
    h += `<tr><td>${b.fa}</td><td>${e ? elValText(e) + (e.unit ? " — " + e.unit : "") : "بدون داده"}</td><td style="font-size:11px">${b.chemBasis}</td></tr>`;
  });
  h += "</table>";
  // تفاوت‌های اصلی (خودکار ساده)
  h += `<h3>تفاوت‌های اصلی</h3><ul style="font-size:13px;line-height:2">`;
  if (bs.length >= 2) {
    const t0 = bs[0].type, t1 = bs[1].type;
    h += `<li>${bs[0].fa} از نوع «${t0}» و ${bs[1].fa} از نوع «${t1}» است.</li>`;
    h += `<li>مبنای ترکیب شیمیایی: ${bs[0].fa} ← ${bs[0].chemBasis}؛ ${bs[1].fa} ← ${bs[1].chemBasis}.</li>`;
  }
  h += "</ul>";
  $("#cmpOut").innerHTML = h;
}

/* ---------- سفر کیهانی ---------- */
let travelTimer = null;
function startTravel(id) {
  const b = bodyById(id || current);
  if (!b) { toast("اول یک جرم را انتخاب کنید."); return; }
  $("#travel").classList.add("open");
  $("#btnTravelDock").disabled = true;
  Scene3D.travelTo(b.id, () => {
    clearInterval(travelTimer);
    $("#travel").classList.remove("open");
    $("#btnTravelDock").disabled = false;
    selectBody(b.id);
    toast(`رسیدید به ${b.fa} — پنل اطلاعات باز شد.`);
  });
  clearInterval(travelTimer);
  travelTimer = setInterval(() => {
    const p = Scene3D.travelProgress();
    $("#travelBar").style.width = `${Math.round(p * 100)}%`;
    $("#travelTxt").innerHTML = `در حال سفر به <b>${b.fa}</b> … ${faD(Math.round(p * 100))}٪ — برای توقف، کلیک کنید یا لغو را بزنید`;
    if (!Scene3D.isTraveling()) { clearInterval(travelTimer); $("#travel").classList.remove("open"); $("#btnTravelDock").disabled = false; }
  }, 120);
}

/* ---------- آزمون ---------- */
let quizIdx = 0, quizScore = 0;
function openQuiz() { quizIdx = 0; quizScore = 0; $("#modalQuiz").classList.add("open"); renderQuiz(); }
function renderQuiz() {
  const box = $("#quizBox");
  if (quizIdx >= QUIZ.length) {
    box.innerHTML = `<h2>نتیجه آزمون</h2><p>امتیاز شما: <b>${faD(quizScore)}</b> از ${faD(QUIZ.length)}</p>
    <p class="src">${quizScore >= 8 ? "عالی! شما یک کاوشگر حرفه‌ای هستید." : quizScore >= 5 ? "خوب است؛ با کاوش بیشتر بهتر می‌شوید." : "پیشنهاد می‌کنم پنل‌های اطلاعات سیارات را بخوانید و دوباره تلاش کنید."}</p>
    <div class="rowbtns"><button class="btn acc" id="qAgain">تلاش دوباره</button><button class="btn" id="qClose">بستن</button></div>`;
    $("#qAgain").onclick = openQuiz; $("#qClose").onclick = () => $("#modalQuiz").classList.remove("open");
    return;
  }
  const q = QUIZ[quizIdx];
  box.innerHTML = `<h2>پرسش ${faD(quizIdx + 1)} از ${faD(QUIZ.length)} — امتیاز: ${faD(quizScore)}</h2><p style="font-size:15px">${q.q}</p>
    <div id="qOpts">${q.opts.map((o, i) => `<button class="btn quizopt" data-i="${i}">${o}</button>`).join("")}</div><p id="qWhy" class="src"></p>
    <div class="rowbtns"><button class="btn" id="qNext" disabled>پرسش بعد</button></div>`;
  box.querySelectorAll(".quizopt").forEach(btn => btn.onclick = () => {
    const i = +btn.dataset.i;
    box.querySelectorAll(".quizopt").forEach(x => x.disabled = true);
    if (i === q.a) { btn.classList.add("correct"); quizScore++; }
    else { btn.classList.add("wrong"); box.querySelector(`[data-i="${q.a}"]`).classList.add("correct"); }
    $("#qWhy").textContent = "توضیح: " + q.why;
    $("#qNext").disabled = false;
  });
  $("#qNext").onclick = () => { quizIdx++; renderQuiz(); };
}

/* ---------- جست‌وجو ---------- */
function doSearch(v) {
  const box = $("#searchRes");
  v = (v || "").trim();
  if (v.length < 1) { box.style.display = "none"; return; }
  const out = [];
  BODIES.forEach(b => { if (b.fa.includes(v) || b.en.toLowerCase().includes(v.toLowerCase())) out.push({ t: `${b.fa} — ${b.type}`, id: b.id }); });
  Object.keys(ELEMENT_INFO).forEach(s => {
    const e = ELEMENT_INFO[s];
    if (e.fa.includes(v) || s.toLowerCase() === v.toLowerCase()) {
      BODIES.filter(b => b.elements.some(x => x.s === s)).slice(0, 4).forEach(b =>
        out.push({ t: `${e.fa} (${s}) در ${b.fa}`, id: b.id, el: s }));
    }
  });
  box.innerHTML = out.slice(0, 10).map((o, i) => `<button data-i="${i}">${o.t}</button>`).join("") || `<button disabled>یافت نشد</button>`;
  box.style.display = "block";
  box.querySelectorAll("button[data-i]").forEach(btn => btn.onclick = () => {
    const o = out[+btn.dataset.i];
    box.style.display = "none"; $("#search").value = "";
    if (o.el && !bodyById(o.id).dwarf) {
      selectBody(o.id);
      setTimeout(() => { setTab("chem"); renderChem(bodyById(o.id), o.el); }, 60);
    }
    else selectBody(o.id);
  });
}

/* ---------- راهنمای تعاملی ---------- */
const TOUR = [
  "۱/۴ — با کشیدن ماوس (یا انگشت) دوربین را بچرخانید؛ با چرخ ماوس یا نیشگون لمسی زوم کنید.",
  "۲/۴ — روی هر سیاره کلیک کنید تا پنل اطلاعاتش باز شود؛ دکمه «ترکیب شیمیایی» را امتحان کنید.",
  "۳/۴ — از نوار پایین سرعت شبیه‌سازی، نمای مقیاس علمی و سیارات کوتوله را کنترل کنید.",
  "۴/۴ — با «سفر کیهانی» به سیاره پرواز کنید. کلید فاصله = توقف، Escape = بستن پنل."
];
let tourIdx = -1;
function nextTour() {
  tourIdx++;
  if (tourIdx >= TOUR.length) { $("#tour").classList.remove("open"); tourIdx = -1; return; }
  $("#tourTxt").textContent = TOUR[tourIdx];
  $("#tour").classList.add("open");
}

/* ---------- نمودار فراوانی عنصرها (فصل ۱ شیمی دهم) ---------- */
function renderAbundance() {
  const out = $("#abundOut"); out.innerHTML = "";
  ABUNDANCE.forEach(col => {
    const sec = document.createElement("section"); sec.className = "ab-col";
    const max = Math.max(...col.els.map(e => e[1]));
    sec.innerHTML = `<h3>${col.fa}<small>درصد جرمی — تقریبی</small></h3>`;
    col.els.forEach(([sym, pct], i) => {
      const r = document.createElement("div"); r.className = "ab-row";
      r.style.setProperty("--elc", elColor(sym));
      const w = Math.max(2.5, (pct / max) * 100);
      r.innerHTML = `<span class="s">${sym}</span><span class="n">${elFa(sym)}</span><span class="v">${faD(pct)}٪</span><span class="t"><span class="f"></span></span>`;
      sec.appendChild(r);
      const f = r.querySelector(".f");
      if (REDUCED_MOTION) f.style.width = w + "%";
      else requestAnimationFrame(() => requestAnimationFrame(() => {
        f.style.transitionDelay = (i * 60) + "ms";
        f.style.width = w + "%";
      }));
    });
    const src = document.createElement("div"); src.className = "ab-src";
    src.textContent = "منبع: " + col.src;
    sec.appendChild(src);
    out.appendChild(sec);
  });
}

/* ---------- ارائه فصل اول: کیهان، زادگاه الفبای مواد ----------
   صحنه سینمایی تمام‌صفحه: منظومه شمسی پشت پرده تیره پنهان است و فقط در
   مراحل دارای scene نمایش داده می‌شود؛ انیمیشن اختصاصی هر مرحله روی
   canvas (PresFX) پخش می‌شود. با پایان ارائه همه‌چیز به حالت کاوش آزاد
   برمی‌گردد. */
const PRES = [
  { t: "کیهان؛ زادگاه الفبای مواد", scene: "overview",
    x: "به منظومه شمسی نگاه کنید. هر اتمی که در این سیاره‌ها — و در بدن شما — هست، روزی در آغاز کیهان یا در دل یک ستاره ساخته شده است. این سفر، داستان زادگاه عنصرهاست." },
  { t: "انفجار بزرگ: آغاز همه چیز", scene: null,
    x: "حدود ۱۳٫۸ میلیارد سال پیش کیهان از حالتی بسیار داغ و چگال آغاز به انبساط کرد. در دقایق نخست فقط سبک‌ترین عنصرها ساخته شدند: هیدروژن (حدود ۷۴٪ جرم کیهان) و هلیوم (حدود ۲۴٪) و ردی از لیتیم." },
  { t: "خورشید: کارخانه همجوشی", scene: "sun",
    x: "در مرکز خورشید هر ثانیه حدود ۶۰۰ میلیون تن هیدروژن به هلیوم تبدیل می‌شود. جرمِ گم‌شده طبق رابطه E=mc² به انرژی بدل می‌شود — همان نور و گرمای رسانده‌شده به زمین." },
  { t: "ستاره‌های پرجرم و ابرنواخترها", scene: null,
    x: "ستاره‌های بسیار سنگین‌تر از خورشید در دل خود کربن، اکسیژن و عناصر دیگر را تا آهن می‌سازند. عناصر سنگین‌تر از آهن — مانند طلا و ید — در انفجار ابرنواخترها زاده می‌شوند." },
  { t: "تولد منظومه شمسی", scene: null,
    x: "حدود ۴٫۶ میلیارد سال پیش، ابری از گاز و غبار که با خاکِ ستاره‌های مرده غنی شده بود فرو ریخت: خورشید در مرکز پدید آمد و سیاره‌ها از باقی‌مانده‌های همان ابر." },
  { t: "زمین: انبار عناصر سنگین", scene: "earth",
    x: "در سیاره‌های سنگی، عناصر ساخته‌شده در ستاره‌ها انبار شده‌اند: آهن در هسته، اکسیژن و سیلیسیم در پوسته و گوشته. آهنِ هموگلوبین خون شما هم روزی در یک ستاره ساخته شده است." },
  { t: "مشتری: غولی از هیدروژن", scene: "jupiter",
    x: "غول‌های گازی مانند مشتری همان ترکیب ابر اولیه را حفظ کرده‌اند: عمدتاً هیدروژن و هلیوم — درست مانند خورشید و مانند خودِ کیهان." },
  { t: "پایان سفر", scene: null,
    x: "از انفجار بزرگ تا بدن شما، یک زنجیره ناگسستنی از عنصرزایی وجود دارد. به تعبیر کارل ساگان: ما از غبار ستاره‌ها ساخته شده‌ایم. حالا نوبت کاوشِ خودتان است." }
];
let presIdx = -1, presTimer = 0, presAutoOn = false, presAnimT = 0;
// مکث خودکار هر مرحله (ثانیه) در «ارائه آغازین» — کمی بیشتر از طول انیمیشن هر مرحله
const PRES_DWELL = [4.8, 10, 6, 9.1, 12.6, 8.2, 5.8, 7.8];

/* جریان دوفازی هر مرحله: اول متن کامل نمایش داده می‌شود و زمان خواندن داده
   می‌شود؛ بعد انیمیشن پخش می‌شود و متن کم‌رنگ می‌شود تا توجه به صحنه برود.
   زمان خواندن از طول متن محاسبه می‌شود (خواندن راحت فارسی، با کف و سقف). */
function presReadT(i) {
  const rk = (typeof window.__CE_READK === "number") ? window.__CE_READK : 1; // قلاب آزمون
  return Math.max(3.2, Math.min(7, 2.8 + PRES[i].x.length * 0.022)) * rk;
}
let presCueT = [];
function presClearCues() { presCueT.forEach(clearTimeout); presCueT = []; }
function presRenderText(i, onDone) {
  presClearCues();
  const box = $("#presTxt");
  const sents = (PRES[i].x.match(/[^.؟]+[.؟]?/g) || [PRES[i].x]).map(t => t.trim()).filter(Boolean);
  box.innerHTML = "";
  const rows = sents.map(t => {
    const sp = document.createElement("span");
    sp.className = "ps on";
    box.appendChild(sp);
    return { sp, chars: Array.from(t) };
  });
  // One cancellable timer, with elapsed-time progress: no timer per character.
  const duration = REDUCED_MOTION ? 0 : presReadT(i) * 1000;
  const total = rows.reduce((n, row) => n + row.chars.length, 0);
  const started = performance.now();
  function type() {
    if (presIdx !== i) return;
    let remaining = duration ? Math.min(total, Math.floor((performance.now() - started) / duration * total)) : total;
    rows.forEach(row => {
      row.sp.textContent = row.chars.slice(0, Math.max(0, remaining)).join("");
      remaining -= row.chars.length;
    });
    if (!duration || performance.now() - started >= duration) { onDone(); return; }
    presCueT = [setTimeout(type, 30)];
  }
  type();
}

/* قفل مرحله: تا انیمیشن مرحله کامل نشده، «بعدی» خاکستری/غیرفعال است
   (بازگشت به مرحله قبلی همیشه آزاد است) */
let presLockT = 0, presLocked = false;
function presLock(sec) {
  clearTimeout(presLockT);
  const nx = $("#presNext"), f = $("#presWaitFill");
  nx.disabled = false; nx.classList.remove("wait");
  if (f) { f.style.transition = "none"; f.style.width = "0"; }
  if (sec > 0.1) {
    presLocked = true; nx.disabled = true; nx.classList.add("wait");
    if (f) { void f.offsetWidth; f.style.transition = `width ${sec}s linear`; f.style.width = "100%"; }
    presLockT = setTimeout(() => {
      presLocked = false; nx.disabled = false; nx.classList.remove("wait");
      if (f) { f.style.transition = "none"; f.style.width = "0"; }
    }, sec * 1000);
  } else presLocked = false;
}

function presSchedule(afterTyping = false) {
  clearTimeout(presTimer);
  if (!presAutoOn || presIdx < 0) return;
  $("#presAuto").hidden = false;
  const dur = (typeof PresFX !== "undefined") ? PresFX.dur(presIdx) : 0;
  const delay = (afterTyping ? Math.max(dur + 1, (PRES_DWELL[presIdx] || 8) - presReadT(presIdx)) : Math.max(PRES_DWELL[presIdx] || 8, presReadT(presIdx) + dur + 1)) * 1000;
  presTimer = setTimeout(() => { if (presAutoOn && presIdx >= 0) presGo(presIdx + 1); }, delay);
  // نوار زمانِ باقی‌مانده تا مرحله بعد، زیر چیپ پخش خودکار
  const f = $("#presAutoFill");
  if (f) {
    f.style.transition = "none"; f.style.width = "0%";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (presAutoOn && presIdx >= 0) { f.style.transition = `width ${delay}ms linear`; f.style.width = "100%"; }
    }));
  }
}
function presStopAuto() {
  presAutoOn = false; clearTimeout(presTimer);
  const a = $("#presAuto"); if (a) a.hidden = true;
}

function startPres(auto) {
  document.querySelectorAll(".modal.open").forEach(m => m.classList.remove("open"));
  $("#tour").classList.remove("open"); tourIdx = -1;
  const dots = $("#presDots"); dots.innerHTML = "";
  PRES.forEach((_, i) => {
    const b = document.createElement("button"); b.type = "button";
    b.title = "مرحله " + faD(i + 1); b.setAttribute("aria-label", "مرحله " + faD(i + 1));
    b.onclick = () => { presStopAuto(); if (presLocked && i > presIdx) return; presGo(i); };
    dots.appendChild(b);
  });
  presAutoOn = !!auto;
  document.body.classList.add("pres-on");
  $("#pres").classList.add("open");
  $("#pres").hidden = false;
  presGo(0);
  toast(auto ? "ارائه آغازین — با «رد شدن» یا Esc وارد کاوش آزاد شوید" : "ارائه فصل اول — با کلیدهای جهت‌دار بین مراحل حرکت کنید");
}

function presGo(i) {
  if (i < 0) return;
  if (i >= PRES.length) { endPres(); return; }
  clearTimeout(presAnimT);
  presIdx = i;
  const s = PRES[i];
  $("#presStep").textContent = faD(i + 1) + " از " + faD(PRES.length);
  $("#presTitle").textContent = s.t;
  $("#pres").classList.remove("playing");
  $("#presPrev").disabled = i === 0;
  $("#presNextTxt").textContent = i === PRES.length - 1 ? "پایان ارائه" : "بعدی";
  document.querySelectorAll("#presDots button").forEach((d, j) => d.classList.toggle("on", j === i));
  if (typeof PresFX !== "undefined") PresFX.stop(); // صحنه در فاز خواندن تمیز می‌ماند
  // صحنه سه‌بعدی فقط در مراحل لازم از پشت پرده بیرون می‌آید
  const veil = $("#presVeil");
  if (s.scene) {
    veil.classList.remove("on");
    if (s.scene === "overview") {
      Scene3D.setOrbits(true); Scene3D.setLabels(true);
      Scene3D.resetView();
    } else {
      Scene3D.setOrbits(false); Scene3D.setLabels(false);
      Scene3D.select(s.scene);
    }
  } else veil.classList.add("on");
  // فاز ۲: پس از زمان خواندن، انیمیشن پخش و متن کم‌رنگ می‌شود
  const dur = (typeof PresFX !== "undefined") ? PresFX.dur(i) : 0;
  const rt = presReadT(i);
  presLock((REDUCED_MOTION ? 0 : rt) + dur);
  presRenderText(i, () => {
    if (presIdx !== i) return;
    if (typeof PresFX !== "undefined") PresFX.play(i);
    $("#pres").classList.add("playing");
    presLock(dur);
    presSchedule(true);
  });
}

function endPres() {
  presStopAuto();
  clearTimeout(presLockT); presLocked = false;
  presClearCues();
  clearTimeout(presAnimT);
  presIdx = -1;
  $("#pres").classList.remove("open");
  $("#pres").classList.remove("playing");
  $("#pres").hidden = true;
  document.body.classList.remove("pres-on");
  $("#presVeil").classList.remove("on");
  Scene3D.setOrbits(S.orbits); Scene3D.setLabels(S.labels);
  Scene3D.resetView();
  if (typeof PresFX !== "undefined") PresFX.stop();
  toast("پایان ارائه — کاوش آزاد");
}

/* ---------- ساعت شبیه‌سازی ---------- */
function tickClock() {
  const d = Math.floor(Scene3D.getDays());
  const y = Math.floor(d / 365), dd = d % 365;
  const paused = Scene3D.isPaused();
  $("#clock").textContent = `زمان شبیه‌سازی: ${y ? faD(y) + " سال و " : ""}${faD(dd)} روز ${paused ? "⏸ متوقف" : "▶ در حال اجرا"} — ${S.mode === "real" ? "مقیاس علمی" : "نمای نمایشی"}`;
  $("#btnPlayTxt").textContent = paused ? "اجرا" : "توقف";
  document.querySelector("#btnPlayIco use").setAttribute("href", paused ? "#i-play" : "#i-pause");
}
setInterval(tickClock, 500);

/* ---------- راه‌اندازی ---------- */
window.addEventListener("DOMContentLoaded", () => {
  /* دروازه ورود: لودینگ با پیشرفت واقعی بافت‌ها ← دکمه بزرگ «شروع ارائه».
     قلاب LoadingManager باید پیش از Scene3D.init نصب شود تا همه آیتم‌ها شمرده شوند.
     با ?nopres=1 دروازه کاملاً حذف می‌شود (آزمون‌های خودکار). */
  const ld = $("#loader"), nopres = /[?&]nopres\b/.test(location.search);
  if (ld && nopres) ld.remove();
  if (ld && !nopres) {
    const fill = $("#ldFill"), pct = $("#ldPct");
    let ldDone = false, sawStart = false;
    const setP = (k) => {
      k = Math.max(0, Math.min(1, k));
      fill.style.width = Math.round(k * 100) + "%";
      pct.textContent = "بارگذاری بافت‌های واقعی مأموریت‌های ناسا… " + faD(Math.round(k * 100)) + "٪";
    };
    const ldReady = () => {
      if (ldDone) return; ldDone = true;
      ld.classList.add("ready");
      setP(1); pct.textContent = "آماده است.";
      setTimeout(() => { $("#ldLoad").hidden = true; $("#ldGate").hidden = false; }, 400);
    };
    if (window.THREE && THREE.DefaultLoadingManager) {
      THREE.DefaultLoadingManager.onStart = () => { sawStart = true; };
      THREE.DefaultLoadingManager.onProgress = (u, l, t) => setP(t ? l / t : 0);
      THREE.DefaultLoadingManager.onLoad = ldReady;
    }
    setTimeout(() => { if (!sawStart) ldReady(); }, 2500); // بدون بافت (مثلاً file://)
    setTimeout(ldReady, 15000); // سقوط‌امن مطلق
    $("#btnStartPres").onclick = () => { ld.classList.add("off"); setTimeout(() => ld.remove(), 650); startPres(true); };
    $("#btnFreeRoam").onclick = () => {
      ld.classList.add("off"); setTimeout(() => ld.remove(), 650);
      if (!store.load().seen) { tourIdx = -1; nextTour(); store.save(Object.assign(store.load(), { seen: 1 })); }
    };
  }
  try {
    Scene3D.init($("#scene"), {
      onSelect: (id) => { if (id) selectBody(id); else { current = null; markBar(); $("#infoPanel").classList.remove("open"); Scene3D.setPanelOpen(false); } },
      onHover: (id, x, y) => {
        const tip = $("#tip");
        if (!id) { tip.style.display = "none"; return; }
        tip.textContent = bodyById(id).fa;
        tip.style.display = "block";
        tip.style.right = Math.max(8, innerWidth - x - 20) + "px";
        tip.style.top = (y + 14) + "px";
      }
    });
  } catch (err) {
    // بدون WebGL: پیام محترمانه به‌جای مرگ بی‌صداً؛ بقیه راه‌اندازی متوقف می‌شود
    const msg = "مرورگر شما WebGL را در دسترس ندارد و صحنه سه‌بعدی اجرا نمی‌شود. لطفاً شتاب سخت‌افزاری را فعال کنید یا مرورگر/درایور گرافیک را به‌روزرسانی کنید.";
    const gate = $("#ldGate");
    if (ld && !nopres) {
      ld.classList.add("ready");
      $("#ldLoad").hidden = true;
      if (gate) gate.hidden = true;
      const p = document.createElement("p");
      p.className = "ld-err"; p.textContent = msg;
      ld.querySelector(".ld-core").appendChild(p);
    } else {
      const d = document.createElement("div");
      d.style.cssText = "position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;background:#05070e;color:#f4f7ff;font:400 15px Vazirmatn,sans-serif;text-align:center;padding:30px;line-height:2";
      d.textContent = msg;
      document.body.appendChild(d);
    }
    return;
  }
  // اعمال تنظیمات ذخیره‌شده
  Scene3D.setSizeScale(S.sizeS); Scene3D.setDistScale(S.distS); Scene3D.setMode(S.mode);
  Scene3D.setOrbits(S.orbits); Scene3D.setLabels(S.labels); Scene3D.setDwarfs(S.dwarfs);
  Scene3D.setSpeed(S.speed);
  $("#sizeR").value = S.sizeS; $("#distR").value = S.distS;
  $("#scaleMode").value = S.mode; $("#speed").value = S.speed;
  $("#speedVal").textContent = "×" + faD(S.speed);
  $("#tglOrbits").checked = S.orbits; $("#tglLabels").checked = S.labels; $("#tglDwarfs").checked = S.dwarfs; $("#tglShadow").checked = S.shadow !== false; Scene3D.setShadows(S.shadow !== false);
  Scene3D.setFollow(S.follow !== false); updateFollowBtn();
  updateScaleNote();

  buildBar(); fillCmpSelects();
  // پرش سریع
  $("#bodyJump").innerHTML = `<option value="">پرش به…</option>` + BODIES.map(b => `<option value="${b.id}">${b.fa}</option>`).join("");
  $("#bodyJump").onchange = (e) => { if (e.target.value) selectBody(e.target.value); e.target.value = ""; };

  // دک‌ها
  $("#btnPlay").onclick = () => { const p = Scene3D.togglePause(); toast(p ? "شبیه‌سازی متوقف شد." : "شبیه‌سازی ادامه دارد."); };
  $("#speed").oninput = (e) => { S.speed = +e.target.value; Scene3D.setSpeed(S.speed); $("#speedVal").textContent = "×" + faD(S.speed); persist(); };
  $("#scaleMode").onchange = (e) => {
    S.mode = e.target.value; Scene3D.setMode(S.mode); persist();
    updateScaleNote();
    toast(S.mode === "real" ? "مقیاس علمی: نسبت قطرها واقعی (ریشه سوم) و فاصله‌ها لگاریتمی فشرده؛ فاصله واقعی بسیار بزرگ‌تر است." : "نمای نمایشی فعال شد؛ اندازه‌ها و فاصله‌ها نمایشی‌اند.");
  };
  $("#sizeR").oninput = (e) => { S.sizeS = +e.target.value; Scene3D.setSizeScale(S.sizeS); $("#sizeV").textContent = "×" + faD(S.sizeS); persist(); };
  $("#distR").oninput = (e) => { S.distS = +e.target.value; Scene3D.setDistScale(S.distS); $("#distV").textContent = "×" + faD(S.distS); persist(); };
  $("#tglOrbits").onchange = (e) => { S.orbits = e.target.checked; Scene3D.setOrbits(S.orbits); persist(); };
  $("#tglLabels").onchange = (e) => { S.labels = e.target.checked; Scene3D.setLabels(S.labels); persist(); };
  $("#tglShadow").onchange = (e) => { S.shadow = e.target.checked; Scene3D.setShadows(S.shadow); persist(); toast(e.target.checked ? "سایه‌های واقعی فعال شد." : "سایه‌ها خاموش شد (عملکرد بالاتر)."); };
  $("#tglDwarfs").onchange = (e) => { S.dwarfs = e.target.checked; Scene3D.setDwarfs(S.dwarfs); buildBar(); persist(); toast(e.target.checked ? "سیارات کوتوله نمایش داده شدند." : "سیارات کوتوله پنهان شدند."); };
  $("#btnBack").onclick = () => Scene3D.resetView();
  $("#btnFocus").onclick = () => Scene3D.focusSelected();
  $("#btnFollow").onclick = () => {
    S.follow = !(S.follow !== false);
    Scene3D.setFollow(S.follow);
    updateFollowBtn(); persist();
    toast(S.follow ? "تعقیب فعال است: دوربین سیاره را در مدار دنبال می‌کند (بدون چرخش اجباری)." : "دوربین آزاد است: سیاره انتخاب‌شده تعقیب نمی‌شود.");
  };
  function updateFollowBtn() { $("#btnFollow").classList.toggle("active", S.follow !== false); $("#btnFollow").setAttribute("aria-pressed", S.follow !== false ? "true" : "false"); }
  $("#btnTravelDock").onclick = () => startTravel(current);
  $("#travelCancel").onclick = () => { Scene3D.cancelTravel(); clearInterval(travelTimer); $("#travel").classList.remove("open"); $("#btnTravelDock").disabled = false; };
  $("#btnCompare").onclick = () => { runCompare(); $("#modalCompare").classList.add("open"); };
  $("#btnAbund").onclick = () => { renderAbundance(); $("#modalAbund").classList.add("open"); };
  $("#btnPres").onclick = () => startPres(false);
  $("#presNext").onclick = () => { if (presLocked) return; presStopAuto(); presGo(presIdx + 1); };
  $("#presPrev").onclick = () => { presStopAuto(); presGo(presIdx - 1); };
  $("#presExit").onclick = endPres;
  $("#presSkip").onclick = endPres;
  $("#presAuto").onclick = presStopAuto;
  // کلیدها در حالت ارائه: ← بعدی، → قبلی (راست‌به‌چپ)، Escape خروج — با capture تا صحنه آن‌ها را نگیرد
  window.addEventListener("keydown", (e) => {
    if (presIdx < 0) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); presStopAuto(); if (presLocked) return; presGo(presIdx + 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); presStopAuto(); presGo(presIdx - 1); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); endPres(); }
  }, true);
  ["#cmpA", "#cmpB", "#cmpC", "#cmpEl"].forEach(s => $(s).onchange = runCompare);
  $("#cmpClose").onclick = () => $("#modalCompare").classList.remove("open");
  $("#btnQuiz").onclick = openQuiz;
  $("#quizClose").onclick = () => $("#modalQuiz").classList.remove("open");
  $("#btnFavList").onclick = () => {
    $("#favBox").innerHTML = S.favs.length ? "" : "<p>هنوز علاقه‌مندی ندارید. از پنل هر سیاره دکمه «علاقه‌مندی» را بزنید.</p>";
    S.favs.forEach(id => {
      const b = bodyById(id);
      const btn = document.createElement("button");
      btn.className = "btn quizopt"; btn.textContent = b.fa;
      btn.onclick = () => { $("#modalFav").classList.remove("open"); selectBody(id); };
      $("#favBox").appendChild(btn);
    });
    $("#modalFav").classList.add("open");
  };
  $("#favClose").onclick = () => $("#modalFav").classList.remove("open");
  $("#btnCine").onclick = () => {
    document.body.classList.toggle("cinema");
    toast(document.body.classList.contains("cinema") ? "حالت سینمایی: برای خروج دوباره بزنید." : "حالت سینمایی خاموش شد.");
  };
  $("#btnHelp").onclick = () => $("#modalHelp").classList.add("open");
  $("#helpClose").onclick = () => $("#modalHelp").classList.remove("open");
  $("#btnAbout").onclick = () => {
    $("#srcList").innerHTML = DATA_SOURCES.map(s => `<li><a href="${s.url}" target="_blank" rel="noopener">${s.name}</a></li>`).join("");
    $("#dataReview").textContent = DATA_REVIEW;
    $("#modalAbout").classList.add("open");
  };
  $("#aboutClose").onclick = () => $("#modalAbout").classList.remove("open");
  document.querySelectorAll(".modal").forEach(m => m.addEventListener("click", e => { if (e.target === m) m.classList.remove("open"); }));
  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => document.getElementById(b.dataset.close).classList.remove("open")));
  // پنل
  $("#ipClose").onclick = () => Scene3D.resetView();
  document.querySelectorAll("#infoPanel .tab").forEach(t => t.onclick = () => setTab(t.dataset.tab));
  $("#factNext").onclick = () => {
    const b = current && bodyById(current); if (!b) return;
    factIdx++;
    renderFact(b);
    const fc = $("#factCard");
    fc.classList.remove("pop"); void fc.offsetWidth; fc.classList.add("pop");
  };
  $("#ipMini").onclick = () => {
    const p = $("#infoPanel"); p.classList.toggle("mini");
    $("#ipMini").classList.toggle("flip", p.classList.contains("mini"));
  };
  $("#btnTravel").onclick = () => startTravel(current);
  $("#btnFocus2").onclick = () => Scene3D.focusSelected();
  $("#btnFav").onclick = () => {
    if (!current) return;
    const i = S.favs.indexOf(current);
    if (i >= 0) S.favs.splice(i, 1); else S.favs.push(current);
    persist(); buildBar(); markBar();
    $("#btnFavTxt").textContent = S.favs.includes(current) ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها";
  };
  // جست‌وجو
  $("#search").addEventListener("input", (e) => doSearch(e.target.value));
  document.addEventListener("click", (e) => { if (!e.target.closest(".searchbox")) $("#searchRes").style.display = "none"; });
  // راهنما
  $("#btnTour").onclick = () => { tourIdx = -1; nextTour(); };
  $("#tourNext").onclick = nextTour;
  $("#tourSkip").onclick = () => { $("#tour").classList.remove("open"); tourIdx = -1; };
  // جریان ورود توسط دروازه لودینگ (ابتدای همین بلوک) مدیریت می‌شود: دکمه «شروع ارائه»
  // ارائه را با پخش خودکار آغاز می‌کند و «ورود مستقیم» وارد کاوش آزاد می‌شود.
  // کاهش حرکت
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) Scene3D.setReduceMotion(true);
  // بازیابی آخرین مشاهده
  if (S.last && bodyById(S.last)) { if (bodyById(S.last).dwarf && !S.dwarfs) { S.dwarfs = true; Scene3D.setDwarfs(true); buildBar(); } selectBody(S.last); }
});
