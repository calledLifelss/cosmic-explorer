/* ============================================================
   PresFX — انیمیشن‌های سینمایی ارائه فصل ۱ شیمی دهم (نسخه ۳)
   پایپ‌لاین: صحنه روی canvas اصلی + بلوم نیم‌رزولوشن (تاری و جمع
   افزایشی نور) + وینیت و گرین فیلمی + لرزش دوربین هنگام برخوردها.
   در مراحل معرفی/ابرنواختر/تولد منظومه، عکس‌های واقعی تلسکوپ
   فضایی هابل (مالکیت عمومی ناسا) پس‌زمینه است و با برچسب کوچک
   «تصویر واقعی هابل» از انیمیشن شِماییشده متمایز می‌شود.
   هر صحنه dur دارد: مدتی که طول می‌کشد ضربه اصلی روایت کامل شود؛
   app.js تا پایان آن، دکمه «بعدی» را قفل می‌کند. در حالت کاهش
   حرکت فقط قاب نهایی ثابت رسم می‌شود و dur صفر گزارش می‌شود.
   ============================================================ */
const PresFX = (() => {
  const TAU = Math.PI * 2;
  const cv = document.getElementById("presFx");
  const ctx = cv.getContext("2d");
  const bloomCv = document.createElement("canvas");
  const bctx = bloomCv.getContext("2d");
  const prevCv = document.createElement("canvas"); // قاب قبلی برای ترنزیشن محو بین مراحل
  let transStart = 0;
  let W = 0, H = 0, cur = -1, raf = 0, t0 = 0, prevLt = 0, shake = 0;
  let parts = [], aux = [];
  let vgrad = null;
  const R = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeIO = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const RM = () => (typeof REDUCED_MOTION !== "undefined") && REDUCED_MOTION;
  const CX = () => W * 0.5;
  const CY = () => H * 0.58;   // صحنه آزاد: بین متن بالا و دکمه‌های پایین
  const CMY = () => H * 0.5;   // مرکز دقیق صفحه (جرم سه‌بعدی اینجاست)

  /* ---------- عکس‌های واقعی هابل (پس‌زمینه برخی صحنه‌ها) ---------- */
  const PHOTOS = {};
  function photo(key, src) {
    const P = { img: new Image(), ok: false };
    P.img.onload = () => { P.ok = true; };
    P.img.src = src;
    PHOTOS[key] = P;
  }
  photo("carina", "textures/nebula_carina.jpg"); // هابل ۲۰۱۰، ESA/Hubble، CC BY 4.0
  photo("crab", "textures/nebula_crab.jpg");     // بقایای ابرنواختر خرچنگ، هابل، مالکیت عمومی
  photo("orion", "textures/nebula_orion.jpg");   // سحابی جبار، هابل ۲۰۰۶، مالکیت عمومی
  function drawPhoto(key, alpha, t, zoom0, zoom1) {
    const P = PHOTOS[key]; if (!P || !P.ok) return false;
    const im = P.img, iw = im.width, ih = im.height;
    const z = lerp(zoom0 || 1.08, zoom1 || 1.2, clamp(t / 20, 0, 1));
    const s = Math.max(W / iw, H / ih) * z;
    const dw = iw * s, dh = ih * s;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, (W - dw) / 2 + Math.sin(t * .05) * W * .012, (H - dh) / 2 + Math.cos(t * .04) * H * .012, dw, dh);
    ctx.restore();
    return true;
  }
  function caption(s) { // برچسب کوچک صادقانه برای عکس‌های واقعی
    ctx.save();
    ctx.globalAlpha = .58;
    ctx.font = "11.5px Vazirmatn,sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#cdd8ea";
    ctx.fillText(s, 16, H - 14);
    ctx.restore();
  }

  /* ---------- ابزار رسم ---------- */
  function resize() {
    // سقف رزولوشن بوم بر اساس فرمانرو کیفیت صحنه سه‌بعدی
    const q = (typeof window.__CE_QUALITY === "number") ? window.__CE_QUALITY : 1;
    const DPR = Math.min(q >= 1 ? 2 : q >= 0.7 ? 1.25 : 1, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    bloomCv.width = Math.max(2, W >> 1); bloomCv.height = Math.max(2, H >> 1);
    vgrad = ctx.createRadialGradient(CX(), H * .5, Math.min(W, H) * .42, CX(), H * .5, Math.max(W, H) * .78);
    vgrad.addColorStop(0, "rgba(0,0,0,0)"); vgrad.addColorStop(1, "rgba(2,4,10,.52)");
  }
  const _spr = {};
  function hexRGB(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function spr(c) {
    if (_spr[c]) return _spr[c];
    const s = document.createElement("canvas"); s.width = s.height = 64;
    const g = s.getContext("2d");
    const [r, gg, b] = hexRGB(c);
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, "rgba(255,255,255,1)");
    rg.addColorStop(.22, `rgba(${r},${gg},${b},.9)`);
    rg.addColorStop(.6, `rgba(${r},${gg},${b},.28)`);
    rg.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    return _spr[c] = s;
  }
  function dot(x, y, r, c, a) {
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.drawImage(spr(c), x - r, y - r, r * 2, r * 2);
  }
  function txt(s, x, y, color, size, mono) {
    ctx.font = `700 ${size || 13}px ${mono ? "ui-monospace,monospace" : "Vazirmatn,sans-serif"}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = color; ctx.fillText(s, x, y);
  }
  function lite() { ctx.globalCompositeOperation = "lighter"; }
  function norm() { ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; }

  /* ---------- گرین فیلمی (۴ کاشی نویز ثابت) ---------- */
  const grainPats = [];
  function makeGrain() {
    if (grainPats.length) return;
    for (let k = 0; k < 4; k++) {
      const g = document.createElement("canvas"); g.width = g.height = 128;
      const g2 = g.getContext("2d");
      const id = g2.createImageData(128, 128);
      for (let i = 0; i < id.data.length; i += 4) {
        const v = Math.random() * 255 | 0;
        id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255;
      }
      g2.putImageData(id, 0, 0);
      grainPats.push(ctx.createPattern(g, "repeat"));
    }
  }

  /* ---------- پس‌پردازش: بلوم + وینیت + گرین ---------- */
  let grainTick = 0;
  function post() {
    if ("filter" in ctx && ((typeof window.__CE_QUALITY !== "number") || window.__CE_QUALITY > 0.5)) {
      bctx.clearRect(0, 0, bloomCv.width, bloomCv.height);
      bctx.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, bloomCv.width, bloomCv.height);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = .45;
      ctx.filter = "blur(7px)";
      ctx.drawImage(bloomCv, 0, 0, bloomCv.width, bloomCv.height, 0, 0, W, H);
      ctx.filter = "none";
      ctx.restore();
    }
    ctx.save();
    ctx.fillStyle = vgrad; ctx.fillRect(0, 0, W, H);
    if (grainPats.length) {
      ctx.globalAlpha = .035;
      ctx.translate(R(0, 128), R(0, 128));
      ctx.fillStyle = grainPats[(grainTick++) % grainPats.length];
      ctx.fillRect(-128, -128, W + 256, H + 256);
    }
    ctx.restore();
    norm();
  }

  /* ---------- ۰) آغاز: سحابی واقعی کارینا + آسمان زنده ---------- */
  const intro = { loop: 0, T: 4, dur: 4,
    init() {
      parts = []; aux = [];
      for (let i = 0; i < 380; i++) parts.push({ x: R(0, W), y: R(0, H), r: R(.4, 1.9), ph: R(0, TAU), sp: R(.3, 1.4), deep: Math.random() < .6 });
      for (let i = 0; i < 3; i++) aux.push({ neb: 1, x: [.2, .8, .55][i], y: [.28, .55, .82][i], r: [.34, .28, .24][i], c: ["#6a5acd", "#2e5f9e", "#2e8f84"][i], sp: R(.04, .08), ph: i * 2.1 });
    },
    draw(t, dt) {
      const hasPhoto = drawPhoto("carina", .52, t, 1.06, 1.2);
      lite();
      if (!hasPhoto) for (const a of aux) {
        if (!a.neb) continue;
        const nx = (a.x + Math.sin(t * a.sp + a.ph) * .03) * W, ny = (a.y + Math.cos(t * a.sp * .8 + a.ph) * .02) * H;
        dot(nx, ny, a.r * Math.min(W, H), a.c, .05);
      }
      for (const p of parts) { // حرکت شعاعی به‌بیرون: حس پرواز در فضا + پارالاکس
        const dx = p.x - CX(), dy = p.y - H * .5, d = Math.hypot(dx, dy) || 1;
        const sp = p.deep ? 4 : 13;
        p.x += dx / d * sp * dt; p.y += dy / d * sp * dt;
        if (p.x < -8 || p.x > W + 8 || p.y < -8 || p.y > H + 8) {
          const a = R(0, TAU), rr = R(10, Math.min(W, H) * .2);
          p.x = CX() + Math.cos(a) * rr; p.y = H * .5 + Math.sin(a) * rr;
        }
        const a = (p.deep ? .1 : .18) + (p.deep ? .3 : .5) * Math.abs(Math.sin(t * p.sp + p.ph));
        dot(p.x, p.y, p.r * 2.2, "#dce6ff", a);
      }
      if (Math.random() < dt * .5) aux.push({ sh: 1, x: R(W * .1, W * .9), y: R(0, H * .3), vx: R(-340, -190), vy: R(140, 250), life: 1 });
      for (const s of aux) {
        if (!s.sh) continue;
        s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * .95;
        const L = clamp(s.life, 0, 1);
        ctx.strokeStyle = `rgba(255,240,210,${(L * .5).toFixed(3)})`; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * .18, s.y - s.vy * .18); ctx.stroke();
        dot(s.x, s.y, 4, "#fff2d8", L * .9);
      }
      aux = aux.filter(a => a.neb || (a.sh && a.life > 0));
      norm();
      if (hasPhoto) caption("پس‌زمینه: سحابی کارینا — تصویر واقعی تلسکوپ فضایی هابل");
    } };

  /* ---------- ۱) انفجار بزرگ ---------- */
  const bang = { loop: 9.5, T: 7.6, dur: 9.2,
    init() {
      parts = []; aux = [];
      // سردشدن کیهان: هر ذره سه توقف رنگی دارد (پلاسمای داغ ← نارنجی ← قرمز تیره)
      const PALS = [["#ffffff", "#ffd98a", "#c96a4a"], ["#dbe7ff", "#ffb340", "#8d5a3a"], ["#cfe0ff", "#ff8a50", "#a04828"]];
      for (let i = 0; i < 620; i++) {
        const a = R(0, TAU), sp = R(50, 470);
        parts.push({ x: CX(), y: CY(), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          cs: PALS[i % PALS.length], r: R(1.4, 4.2), stag: R(0, 1.2), role: "dust",
          turb: R(0, TAU), streak: i % 12 === 0 });
      }
      for (let i = 0; i < 70; i++) { // جمره‌های بزرگ کند
        const a = R(0, TAU), sp = R(24, 90);
        aux.push({ x: CX(), y: CY(), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: R(5, 11), turb: R(0, TAU) });
      }
      parts.forEach((p, i) => {
        if (i < 14) { const a = R(0, TAU), rr = R(2, 13); p.tx = CX() - 95 + Math.cos(a) * rr; p.ty = CY() + Math.sin(a) * rr; p.role = "core"; }
        else if (i < 54) { p.role = "orbit"; p.ax = CX() - 95; p.ay = CY(); p.arr = 1; p.orb = (i - 14) / 40 * TAU; }
        else if (i < 63) { const a = R(0, TAU), rr = R(2, 9); p.tx = CX() + 135 + Math.cos(a) * rr; p.ty = CY() + 34 + Math.sin(a) * rr; p.role = "core"; }
        else if (i < 85) { p.role = "orbit"; p.ax = CX() + 135; p.ay = CY() + 34; p.arr = .6; p.orb = (i - 63) / 22 * TAU; }
      });
    },
    draw(t, dt) {
      const cx = CX(), cy = CY();
      if (t < 1.1) {
        ctx.fillStyle = `rgba(255,252,240,${clamp(1 - t * 1.1, 0, 1).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }
      lite();
      if (t < 2.2) {
        const fr = 60 + t * 320;
        dot(cx, cy, fr * .5, "#eef4ff", clamp(.9 - t * .4, 0, .9));
        dot(cx, cy, fr, "#ffb060", clamp(.55 - t * .24, 0, .55));
        dot(cx, cy, fr * 1.5, "#ff7040", clamp(.3 - t * .13, 0, .3));
      }
      for (let k = 0; k < 3; k++) { // حلقه‌های شوک با لبه رنگی‌گسسته (پراکندگی نور)
        const rt = t - .15 - k * .25;
        if (rt > 0 && rt < 2.8) {
          const rr = rt * (300 + k * 70), a = clamp(.5 - rt * .2, 0, .5);
          const ch = ["rgba(255,90,90,", "rgba(140,255,190,", "rgba(130,170,255,"];
          for (let c = 0; c < 3; c++) {
            ctx.strokeStyle = ch[c] + (a * .7).toFixed(3) + ")";
            ctx.lineWidth = 3.5 - k;
            ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, rr + (c - 1) * 3.5), 0, TAU); ctx.stroke();
          }
        }
      }
      for (const e of aux) { // جمره‌ها
        e.turb += dt; e.x += e.vx * dt; e.y += e.vy * dt;
        e.vx *= (1 - .2 * dt); e.vy *= (1 - .2 * dt);
        const fl = .6 + .4 * Math.sin(t * 5 + e.turb * 4);
        dot(e.x, e.y, e.r * fl, "#ff9a50", t > 4.6 ? clamp(1 - (t - 4.6), 0, 1) * .5 : .5);
      }
      const conv = t > 4.2, fin = t > 8.7 ? clamp(1 - (t - 8.7) / .7, 0, 1) : 1;
      if (t > 2.8 && t < 6.5) { // تابش زمینه باقی‌مانده: کیهان سرد می‌شود
        const w = clamp(.07 - (t - 2.8) * .02, 0, .07);
        ctx.fillStyle = `rgba(255,150,80,${w.toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }
      const ci = t < 2.2 ? 0 : t < 4.2 ? 1 : 2; // توقف رنگی فعلی
      for (const p of parts) {
        if (!conv) {
          p.turb += dt * 2;
          p.vx += Math.sin(p.y * .012 + p.turb) * 26 * dt;
          p.vy += Math.cos(p.x * .012 + p.turb) * 26 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vx *= (1 - .45 * dt); p.vy *= (1 - .45 * dt);
        } else {
          const kk = easeIO(clamp((t - 4.2 - p.stag) / 1.5, 0, 1));
          if (kk > 0 && p.role !== "dust") {
            let txp = p.tx, typ = p.ty;
            if (p.role === "orbit") {
              const rot = -0.44, rx = Math.min(150, W * .17) * p.arr, ry = rx * .38, a = p.orb;
              txp = p.ax + Math.cos(a) * rx * Math.cos(rot) - Math.sin(a) * ry * Math.sin(rot);
              typ = p.ay + Math.cos(a) * rx * Math.sin(rot) + Math.sin(a) * ry * Math.cos(rot);
            }
            p.x = lerp(p.x, txp, .06 + .1 * kk); p.y = lerp(p.y, typ, .06 + .1 * kk);
          }
        }
        const fade = (p.role === "dust" && conv) ? clamp(1 - (t - 4.2 - p.stag) / 1.2, 0, 1) : 1;
        p.c = p.cs[p.role === "dust" ? ci : 0];
        if (p.streak && !conv) {
          ctx.strokeStyle = p.c; ctx.globalAlpha = fade * fin * .5;
          ctx.lineWidth = p.r * .6;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * .08, p.y - p.vy * .08); ctx.stroke();
        } else dot(p.x, p.y, p.r * 2, p.c, fade * fin * .85);
      }
      ctx.globalAlpha = 1; norm();
      if (t > 5.4 && t < 9.1) {
        const k = clamp((t - 5.4) / .8, 0, 1) * fin;
        const rot = -0.44;
        const atom = (ax, ay, rr, sym, fa, ne) => {
          const rx = Math.min(150, W * .17) * rr, ry = rx * .38;
          lite();
          for (let band = 0; band < 3; band++) {
            ctx.strokeStyle = `rgba(110,168,255,${(.1 - band * .028) * k})`;
            ctx.lineWidth = 9 - band * 2.5;
            ctx.beginPath(); ctx.ellipse(ax, ay, rx, ry, rot, 0, TAU); ctx.stroke();
          }
          dot(ax, ay, 15 * rr + 6, "#ff8a70", .8 * k);
          for (let e = 0; e < ne; e++) {
            const a = t * 2.2 + e * Math.PI;
            dot(ax + Math.cos(a) * rx * Math.cos(rot) - Math.sin(a) * ry * Math.sin(rot),
                ay + Math.cos(a) * rx * Math.sin(rot) + Math.sin(a) * ry * Math.cos(rot), 7, "#8fc4ff", .95 * k);
          }
          norm();
          txt(sym, ax, ay + 1, "#fff", 13 * rr + 4, true);
          txt(fa, ax, ay + ry + 26, "#9fd0ff", 13.5);
        };
        atom(cx - 95, cy, 1, "H", "هیدروژن", 1);
        atom(cx + 135, cy + 34, .6, "He", "هلیوم", 2);
      }
    } };

  /* ---------- ۲) همجوشی در خورشید واقعی ---------- */
  const fusion = { loop: 5.4, T: 3.4, dur: 5.2, mid: 1,
    init() {
      parts = []; aux = [];
      for (let i = 0; i < 4; i++) parts.push({ a0: Math.PI / 4 + i * Math.PI / 2, trail: [] });
      for (let i = 0; i < 34; i++) { const a = R(0, TAU); aux.push({ a, sp: R(250, 430) }); }
    },
    draw(t) {
      const cx = CX(), cy = CMY(), R0 = Math.min(240, W * .24), Rsun = Math.min(W, H) * .17;
      lite();
      for (let i = 0; i < 7; i++) { // قوس‌های تاج خورشید
        const a0 = t * .35 + i * TAU / 7, seg = .5 + .3 * Math.sin(t * 2 + i * 3);
        ctx.strokeStyle = `rgba(255,200,110,${(.1 + .08 * Math.sin(t * 3 + i * 2)).toFixed(3)})`;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(cx, cy, Rsun * (1.04 + .03 * Math.sin(t + i)), a0, a0 + seg); ctx.stroke();
      }
      if (t < 2.3) {
        const k = t / 2.3, rr = lerp(R0, Rsun * 1.05, easeIO(k));
        for (const p of parts) {
          const a = p.a0 + k * 3.8;
          const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
          p.trail.push([x, y]); if (p.trail.length > 14) p.trail.shift();
          for (let j = 1; j < p.trail.length; j++) {
            ctx.strokeStyle = `rgba(120,210,255,${(j / p.trail.length * .55).toFixed(3)})`;
            ctx.lineWidth = 2.6;
            ctx.beginPath(); ctx.moveTo(p.trail[j - 1][0], p.trail[j - 1][1]); ctx.lineTo(p.trail[j][0], p.trail[j][1]); ctx.stroke();
          }
          dot(x, y, 9, "#7fd4ff", .95);
        }
        norm();
        txt("H", cx + Math.cos(Math.PI / 4 + easeIO(k) * 3.8) * rr, cy + Math.sin(Math.PI / 4 + easeIO(k) * 3.8) * rr - 18, "#bfe6ff", 13, true);
        lite();
        dot(cx, cy, Rsun * (1 + k * .25), "#ffd080", k * .5);
      } else {
        const pt = t - 2.3;
        // فلر آناهورفی لحظه انفجار همجوشی
        const fl = clamp(1 - Math.abs(pt - .3) / 1.1, 0, 1);
        if (fl > 0) {
          const g2 = ctx.createLinearGradient(cx - Rsun * 3.4, cy, cx + Rsun * 3.4, cy);
          g2.addColorStop(0, "rgba(140,190,255,0)");
          g2.addColorStop(.5, `rgba(220,235,255,${(.55 * fl).toFixed(3)})`);
          g2.addColorStop(1, "rgba(140,190,255,0)");
          ctx.fillStyle = g2;
          ctx.fillRect(cx - Rsun * 3.4, cy - 2, Rsun * 6.8, 4);
        }
        for (const s of aux) {
          const d = Rsun * .6 + pt * s.sp;
          dot(cx + Math.cos(s.a) * d, cy + Math.sin(s.a) * d, 3, "#ffe9a8", clamp(.85 - pt * .5, 0, .85));
        }
        for (let k = 0; k < 4; k++) {
          const rt = pt - k * .38;
          if (rt > 0 && rt < 1.9) {
            ctx.strokeStyle = `rgba(255,214,90,${clamp(.7 - rt * .4, 0, .7).toFixed(3)})`;
            ctx.lineWidth = 3 - k * .5;
            ctx.beginPath(); ctx.arc(cx, cy, Rsun + rt * 150, 0, TAU); ctx.stroke();
          }
        }
        for (let i = 0; i < 16; i++) {
          const a = i * TAU / 16 + .3, d = Rsun + 8 + pt * 280;
          ctx.strokeStyle = `rgba(255,232,160,${clamp(.85 - pt * .4, 0, .85).toFixed(3)})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
          ctx.lineTo(cx + Math.cos(a) * (d + 18), cy + Math.sin(a) * (d + 18)); ctx.stroke();
        }
        dot(cx, cy, Rsun * .5 * (1 + .06 * Math.sin(t * 6)), "#fff0c8", .5);
        norm();
        txt("He", cx, cy + Rsun + 30, "#d5c2ff", 15, true);
        txt("هلیوم + انرژی", cx, cy + Rsun + 52, "#d5c2ff", 14);
      }
      norm();
    } };

  /* ---------- ۳) ابرنواختر + بقایای واقعی خرچنگ ---------- */
  const nova = { loop: 8.5, T: 5.6, dur: 8.3,
    init() {
      parts = []; aux = [];
      const heavy = [["Fe", "#e07a3f"], ["Si", "#d9b382"], ["O", "#ff6b6b"], ["C", "#8d99ae"],
        ["S", "#ffd43b"], ["Ca", "#ffa94d"], ["Mg", "#69db7c"], ["Ne", "#f783ac"],
        ["Au", "#ffe066"], ["Pt", "#e9ecef"], ["U", "#99e9f2"], ["Ni", "#63e6be"]];
      const lobes = [R(0, TAU), R(0, TAU), R(0, TAU)];
      for (let i = 0; i < 560; i++) {
        const lb = Math.random() < .65 ? lobes[i % 3] + R(-.7, .7) : R(0, TAU);
        const sp = R(60, 420), h = heavy[i % heavy.length];
        parts.push({ x: CX(), y: CY(), vx: Math.cos(lb) * sp, vy: Math.sin(lb) * sp,
          c: h[1], r: R(1.2, 4), sym: i % 16 === 0 ? h[0] : null, streak: i % 13 === 0,
          turb: R(0, TAU) });
      }
      for (let i = 0; i < 30; i++) aux.push({ a: R(0, TAU), rr: R(38, 78) });
    },
    draw(t, dt) {
      const cx = CX(), cy = CY();
      let crabShown = false;
      if (t > 3.4) crabShown = drawPhoto("crab", clamp((t - 3.4) / 3, 0, .38), t, 1.16, 1.04);
      lite();
      if (t < 2.9) {
        const k = t < 2.4 ? 0 : (t - 2.4) / .5;
        const r = 17 * (1 - k) + 4 + Math.sin(t * 6) * 2 * (1 - k);
        dot(cx, cy, r * 4.6, "#ffd68c", .5 - k * .3);
        dot(cx, cy, r * 1.8, "#fff3d8", .95);
        for (let gI = 0; gI < 12; gI++) {
          const a = gI * 1.7 + t * .4, rr = r * (.5 + (gI % 3) * .25);
          dot(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 3, "#ffedc0", .5 * (1 - k));
        }
        for (const o of aux) {
          o.a += dt * 1.4; const rr = o.rr * (1 - k * .8);
          dot(cx + Math.cos(o.a) * rr, cy + Math.sin(o.a) * rr, 2.4, "#ffdcaa", .7 * (1 - k));
        }
      } else {
        const pt = t - 2.9, fin = t > 7.7 ? clamp(1 - (t - 7.7) / .7, 0, 1) : 1;
        if (pt < .6) { dot(cx, cy, 70 + pt * 900, "#fff6e1", clamp(.85 - pt * 1.4, 0, .85)); shake = Math.min(1.1, shake + dt * 8 * (1 - pt / .6)); }
        dot(cx, cy, pt * 210 + 30, "#ff8a50", clamp(.16 - pt * .02, 0, .16) * fin);
        ctx.strokeStyle = `rgba(255,160,100,${(clamp(.45 - pt * .07, 0, .45) * fin).toFixed(3)})`;
        ctx.lineWidth = 16;
        ctx.beginPath(); ctx.arc(cx, cy, pt * 200, 0, TAU); ctx.stroke();
        ctx.strokeStyle = `rgba(255,228,170,${(clamp(.55 - pt * .1, 0, .55) * fin).toFixed(3)})`;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(cx, cy, pt * 145, 0, TAU); ctx.stroke();
        if (pt > 1.05 && pt < 3.1) { // شوک بازگشتی: موج برگشتی به‌سوی هسته + فلش ثانویه
          const rt2 = pt - 1.05;
          const rr2 = Math.max(6, 165 - rt2 * 62);
          ctx.strokeStyle = `rgba(150,190,255,${(clamp(.55 - rt2 * .3, 0, .55) * fin).toFixed(3)})`;
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(cx, cy, rr2, 0, TAU); ctx.stroke();
          if (rt2 < .5) dot(cx, cy, 40 + rt2 * 260, "#cfe0ff", (.4 - rt2 * .8) * fin);
        }
        for (const p of parts) {
          p.turb += dt * 2;
          p.vx += Math.sin(p.y * .01 + p.turb) * 30 * dt;
          p.vy += Math.cos(p.x * .01 + p.turb) * 30 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vx *= (1 - .32 * dt); p.vy *= (1 - .32 * dt);
          if (p.streak) {
            ctx.strokeStyle = p.c; ctx.globalAlpha = fin * .45;
            ctx.lineWidth = p.r * .6;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * .12, p.y - p.vy * .12); ctx.stroke();
          } else dot(p.x, p.y, p.r * 2, p.c, fin * .9);
        }
        ctx.globalAlpha = 1; norm();
        for (const p of parts) if (p.sym) txt(p.sym, p.x, p.y - 12, p.c, 11, true);
        lite();
        for (const s of [0, Math.PI]) {
          const a = t * 2.6 + s;
          ctx.strokeStyle = `rgba(160,200,255,${(.26 * fin).toFixed(3)})`; ctx.lineWidth = 9;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 140, cy + Math.sin(a) * 140); ctx.stroke();
        }
        dot(cx, cy, 8 + Math.sin(t * 9) * 2.5, "#bcd6ff", .95 * fin);
        norm();
        txt("ستاره نوترونی", cx, cy + 28, "#bcd6ff", 11.5);
      }
      norm();
      if (crabShown) caption("پس‌زمینه: بقایای ابرنواختر خرچنگ — تصویر واقعی تلسکوپ فضایی هابل");
    } };

  /* ---------- ۴) تولد منظومه در دل سحابی واقعی جبار ---------- */
  const accrete = { loop: 12.5, T: 11.6, dur: 11.8,
    init() {
      parts = []; aux = [];
      const RR = Math.min(W, H) * .52;
      for (let i = 0; i < 760; i++) {
        const rr = R(RR * .1, RR * .47);
        const inner = rr < RR * .2;
        parts.push({ rr, a: R(0, TAU), sp: 2.6 / Math.sqrt(rr / 60), s: R(.8, 2.4),
          c: inner ? "#ffcf90" : (Math.random() < .55 ? "#c9b291" : (Math.random() < .5 ? "#8d99ae" : "#a08d76")),
          inner });
      }
      const bcols = ["#6ea8ff", "#d9b382", "#e07a3f", "#b0bec5", "#c97b4a"];
      for (let i = 0; i < 5; i++) aux.push({ blob: 1, rr: RR * (.15 + i * .066), a: R(0, TAU), c: bcols[i], trail: [] });
    },
    draw(t, dt) {
      const cx = CX(), cy = CY(), tilt = .3, RR = Math.min(W, H) * .52;
      const orionShown = drawPhoto("orion", .3, t, 1.14, 1.04);
      const fin = t > 11 ? clamp(1 - (t - 11) / 1.3, 0, 1) : 1;
      lite();
      ctx.strokeStyle = `rgba(255,220,170,${(.08 * fin).toFixed(3)})`; ctx.lineWidth = 26;
      for (let arm = 0; arm < 2; arm++) {
        ctx.beginPath();
        for (let u = 0; u < 1; u += .03) {
          const a = u * 4.4 + arm * Math.PI + t * .25, rr = (0.14 + u * .3) * RR;
          const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * tilt;
          u === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      const dustA = (t < 9.5 ? .75 : .75 * clamp(1 - (t - 9.5) / 1.6, .08, 1)) * fin;
      for (const p of parts) {
        p.a += p.sp * dt;
        const x = cx + Math.cos(p.a) * p.rr, y = cy + Math.sin(p.a) * p.rr * tilt + Math.sin(p.a * 3 + t) * 2;
        dot(x, y, p.s * (p.inner ? 2.6 : 1.8), p.c, dustA * (p.inner ? 1 : .8));
      }
      norm(); // لانه تاریک میانه دیسک: سایه غبار متراکم در صفحه میانی (ویژگی واقعی دیسک‌ها)
      ctx.fillStyle = `rgba(3,5,12,${(.3 * fin).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(cx, cy, RR * .47, RR * .05, 0, 0, TAU); ctx.fill();
      lite();
      const jetA = (.18 + .1 * Math.sin(t * 3)) * fin;
      for (const s of [-1, 1]) {
        const g = ctx.createLinearGradient(cx, cy, cx, cy + s * H * .3);
        g.addColorStop(0, `rgba(150,190,255,${jetA.toFixed(3)})`);
        g.addColorStop(1, "rgba(150,190,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx - 4, cy); ctx.lineTo(cx + 4, cy);
        ctx.lineTo(cx + 13, cy + s * H * .3); ctx.lineTo(cx - 13, cy + s * H * .3);
        ctx.closePath(); ctx.fill();
      }
      dot(cx, cy, 46 + Math.sin(t * 7) * 5, "#ffc860", .95 * fin);
      dot(cx, cy, 130, "#ffb340", .16 * fin);
      for (const b of aux) {
        if (!b.blob) continue;
        b.a += 2.6 / Math.sqrt(b.rr / 60) * dt;
        const x = cx + Math.cos(b.a) * b.rr, y = cy + Math.sin(b.a) * b.rr * tilt;
        b.trail.push([x, y]); if (b.trail.length > 30) b.trail.shift();
        ctx.strokeStyle = b.c + "50"; ctx.lineWidth = 2;
        ctx.beginPath();
        b.trail.forEach(([tx, ty], j) => j ? ctx.lineTo(tx, ty) : ctx.moveTo(tx, ty));
        ctx.stroke();
        const grow = (3 + 9 * clamp(t / 11, 0, 1)) * fin;
        dot(x, y, grow * 2.4, "#ffffff", .12 * fin);
        dot(x, y, grow, b.c, .9 * fin);
      }
      if (Math.random() < dt * 6) {
        const a = R(0, TAU), rr = R(60, RR * .46);
        dot(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * tilt, 7, "#fff8ea", .5);
      }
      norm();
      if (orionShown) caption("پس‌زمینه: سحابی جبار، زایشگاه ستاره‌ها — تصویر واقعی تلسکوپ فضایی هابل");
    } };

  /* ---------- ۵) بارش شهاب‌سنگ روی زمین واقعی (با لرزش دوربین) ---------- */
  const earth = { loop: 8, T: 6.6, dur: 7.4, mid: 1,
    init() {
      parts = []; aux = [];
      const cx = CX(), cy = CMY(), Rp = Math.min(W, H) * .155;
      const cols = [["Fe", "#e07a3f", .3], ["O", "#ff6b6b", .22], ["Si", "#d9b382", .28], ["Mg", "#69db7c", .2]];
      for (let i = 0; i < 300; i++) {
        let r = Math.random(), li = 0;
        for (let j = 0; j < cols.length; j++) { if (r < cols[j][2]) { li = j; break; } r -= cols[j][2]; }
        const ang = R(0, TAU);
        parts.push({ x: R(W * .06, W * .94), y: R(-H * .55, -20),
          tx: cx + Math.cos(ang) * Rp * R(.55, .95), ty: cy + Math.sin(ang) * Rp * R(.55, .95),
          c: cols[li][1], s: R(2, 5), vy: R(190, 340), landed: false, sym: i % 24 === 0 ? cols[li][0] : null });
      }
    },
    draw(t, dt) {
      const cx = CX(), cy = CMY(), Rp = Math.min(W, H) * .155;
      const fin = t > 7.2 ? clamp(1 - (t - 7.2) / .7, 0, 1) : 1;
      lite();
      for (const p of parts) {
        if (p.landed) continue;
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy) || 1;
        p.vy += 60 * dt;
        p.x += (dx / d * p.vy * 1.1) * dt; p.y += (dy / d * p.vy) * dt;
        const dd = Math.hypot(p.tx - p.x, p.ty - p.y);
        if (dd < 9) {
          p.landed = true; aux.push({ x: p.tx, y: p.ty, t0: t });
          shake = Math.min(1.2, shake + .16); // لرزش دوربین هنگام برخورد
          continue;
        }
        ctx.strokeStyle = p.c; ctx.globalAlpha = .5 * fin; ctx.lineWidth = p.s * .5;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - dx / d * 26, p.y - dy / d * 26); ctx.stroke();
        ctx.globalAlpha = 1;
        dot(p.x, p.y, p.s * 1.7, p.c, .95 * fin);
      }
      aux = aux.filter(f => t - f.t0 < .7);
      for (const f of aux) {
        const k = (t - f.t0) / .7;
        dot(f.x, f.y, 8 + k * 26, "#fff2cc", .8 * (1 - k) * fin);
        ctx.strokeStyle = `rgba(255,240,200,${(.6 * (1 - k) * fin).toFixed(3)})`; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(f.x, f.y, 3 + k * 15, 0, TAU); ctx.stroke();
      }
      if (t > 3.6) { // سیاره مذاب داغ که به‌تدریج سرد می‌شود (پیش از ظهور جو)
        const kc = clamp((t - 3.6) / 2.6, 0, 1);
        dot(cx, cy, Rp * 1.04, "#ff7a40", .4 * (1 - kc) * fin);
        dot(cx, cy, Rp * 1.12, "#ff5a30", .16 * (1 - kc) * fin);
      }
      if (t > 4.4) {
        const k = clamp((t - 4.4) / .8, 0, 1) * fin;
        dot(cx, cy, Rp * 1.16, "#6ea8ff", .14 * k);
        ctx.strokeStyle = `rgba(140,190,255,${(.5 * k).toFixed(3)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, Rp * 1.08 + Math.sin(t * 2) * 1.5, 0, TAU); ctx.stroke();
        norm();
        ctx.globalAlpha = k * fin;
        ctx.strokeStyle = "rgba(255,255,255,.3)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx + Rp * 1.35, cy - Rp * .8); ctx.lineTo(cx + Rp * .7, cy - Rp * .3); ctx.stroke();
        txt("Fe · Si · O", cx + Rp * 1.65, cy - Rp * .95, "#ffd0a8", 13, true);
        ctx.globalAlpha = 1;
      }
      norm();
    } };

  /* ---------- ۶) مشتری واقعی: بخارهای H/He + اروپا + صاعقه ---------- */
  const jupiter = { loop: 0, T: 3, dur: 5, mid: 1,
    init() {
      parts = []; aux = [];
      for (let i = 0; i < 150; i++) parts.push({ x: R(0, W), y0: R(-.8, .8), sp: R(30, 80), ph: R(0, TAU),
        c: ["#5ac8fa", "#b388ff", "#e8ddc8"][i % 3] });
    },
    draw(t, dt) {
      const cx = CX(), cy = CMY(), Rp = Math.min(W, H) * .21;
      lite();
      for (const p of parts) {
        p.x += p.sp * dt; if (p.x > W + 30) p.x = -30;
        const y = cy + p.y0 * Rp * 1.7 + Math.sin(p.x * .008 + p.ph + t * .4) * 16;
        const d = Math.hypot(p.x - cx, y - cy);
        dot(p.x, y, 7, p.c, (d < Rp * 1.02 ? .16 : .07));
      }
      if (Math.random() < dt * .9) { // صاعقه در لبه تاریک
        const a = R(Math.PI * .55, Math.PI * 1.45);
        aux.push({ bolt: 1, x: cx + Math.cos(a) * Rp * R(.55, .92), y: cy + Math.sin(a) * Rp * R(.55, .92), ttl: .18 });
      }
      aux = aux.filter(b => (b.ttl -= dt) > 0);
      for (const b of aux) dot(b.x, b.y, 6 + R(0, 5), "#eaf2ff", clamp(b.ttl / .18, 0, 1) * .9);
      for (const s of [-1, 1]) { // شفق‌های قطبی مشتری (پدیده واقعی UV)
        ctx.save();
        ctx.translate(cx, cy - s * Rp * .84);
        ctx.scale(1, .32);
        dot(0, 0, Rp * .42, s < 0 ? "#59f2d6" : "#b48cff", .1 + .06 * Math.sin(t * 2.3 + s));
        ctx.restore();
      }
      const ea = t * .22;
      const ex = cx + Math.cos(ea) * Rp * 1.6, ey = cy + Math.sin(ea) * Rp * .34;
      if (Math.abs(ex - cx) < Rp) dot(ex - 10, ey + 6, 4, "#0a0e18", .5);
      dot(ex, ey, 4.4, "#dfe8ee", .9);
      norm();
      txt("H / He", cx + Rp * 1.35, cy - Rp * .8, "#9fd0ff", 14, true);
    } };

  /* ---------- ۷) پایان: مارپیچ حیات + بوکه عمق ---------- */
  const helix = { loop: 0, T: 4.8, dur: 7,
    init() {
      parts = []; aux = [];
      for (let i = 0; i < 340; i++) {
        const u = i / 340, strand = i % 2;
        parts.push({ x: R(0, W), y: R(0, H), u, strand, stag: R(0, 1.4),
          c: Math.random() < .7 ? "#ffd98a" : "#ffb340", r: R(1.2, 3) });
      }
      for (let i = 0; i < 16; i++) aux.push({ x: R(0, W), y: R(H * .5, H), vy: R(-26, -12), ph: R(0, TAU) });
      for (let i = 0; i < 22; i++) aux.push({ bok: 1, x: R(0, W), y: R(0, H), r: R(9, 26), vy: R(-9, -3), ph: R(0, TAU) });
    },
    draw(t) {
      const cx = CX(), cy = CY(), ph = t > 3.4 ? (t - 3.4) * .5 : 0;
      lite();
      for (const b of aux) { // بوکه پیش‌زمینه
        if (!b.bok) continue;
        b.y += b.vy * .016; if (b.y < -30) { b.y = H + 30; b.x = R(0, W); }
        dot(b.x + Math.sin(t * .3 + b.ph) * 14, b.y, b.r, "#ffca70", .05 + .03 * Math.sin(t + b.ph));
      }
      dot(cx, cy, 250, "#ffb340", .05 + .02 * Math.sin(t));
      for (const s of aux) {
        if (s.bok) continue;
        s.y += s.vy * .016; if (s.y < -10) s.y = H + 10;
        dot(s.x, s.y, 3, "#ffdc96", .25 + .3 * Math.abs(Math.sin(t * 2 + s.ph)));
      }
      for (const p of parts) {
        const k = easeIO(clamp((t - p.stag) / 2, 0, 1));
        const y = cy - 140 + p.u * 280;
        const txp = cx + Math.sin(p.u * 3 * Math.PI + ph + p.strand * Math.PI) * 62;
        dot(lerp(p.x, txp, k), lerp(p.y, y, k), p.r * 1.9, p.c, .3 + .65 * k);
      }
      norm();
      let u = 0;
      while (u <= 1) {
        const y = cy - 140 + u * 280;
        const x1 = cx + Math.sin(u * 3 * Math.PI + ph) * 62;
        const x2 = cx + Math.sin(u * 3 * Math.PI + ph + Math.PI) * 62;
        ctx.strokeStyle = (Math.round(u * 20) % 2) ? "rgba(255,217,138,.3)" : "rgba(77,214,193,.3)";
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
        u += .05;
      }
      if (t > 3) {
        const k = clamp((t - 3) / .8, 0, 1);
        ctx.globalAlpha = k;
        const els = [["C", "#8d99ae", -130, -130], ["O", "#ff6b6b", 130, -60], ["H", "#5ac8fa", -118, 100], ["N", "#4dabf7", 124, 140]];
        for (const [s, c, dx, dy] of els) {
          const bob = Math.sin(t * 1.6 + dx) * 5;
          ctx.fillStyle = c + "2e";
          ctx.beginPath(); ctx.arc(cx + dx, cy + dy + bob, 15, 0, TAU); ctx.fill();
          txt(s, cx + dx, cy + dy + bob, c, 14, true);
        }
        ctx.globalAlpha = 1;
      }
    } };

  const AN = [intro, bang, fusion, nova, accrete, earth, jupiter, helix];

  function frame(now) {
    const t = (now - t0) / 1000;
    const A = AN[cur];
    const lt = A.loop ? t % A.loop : t;
    if (A.loop && lt < prevLt) A.init();
    prevLt = lt;
    const dt = Math.min(.05, (frame._l ? (now - frame._l) / 1000 : .016));
    frame._l = now;
    ctx.clearRect(0, 0, W, H);
    if (shake > 0) { // لرزش دوربین
      ctx.save();
      ctx.translate(R(-1, 1) * shake * 7, R(-1, 1) * shake * 7);
      A.draw(lt, dt);
      ctx.restore();
      shake = Math.max(0, shake - dt * 2.4);
    } else A.draw(lt, dt);
    post();
    // ترنزیشن سینمایی: قاب مرحله قبلی ۰٫۸ ثانیه روی صحنه جدید محو می‌شود
    if (transStart) {
      const k = (now - transStart) / 800;
      if (k >= 1) transStart = 0;
      else {
        ctx.save();
        ctx.globalAlpha = 1 - easeIO(k);
        ctx.drawImage(prevCv, 0, 0, prevCv.width, prevCv.height, 0, 0, W, H);
        ctx.restore();
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function play(i) {
    if (!cv || !AN[i]) return;
    cancelAnimationFrame(raf);
    // قبل از پاک شدن قاب فعلی، از آن اسنپ‌شات می‌گیریم برای محو تدریجی
    if (cur >= 0 && !RM()) {
      prevCv.width = cv.width; prevCv.height = cv.height;
      prevCv.getContext("2d").drawImage(cv, 0, 0);
      transStart = performance.now();
    } else transStart = 0;
    cur = i; prevLt = 0; frame._l = 0; shake = 0;
    resize(); makeGrain();
    AN[i].init();
    if (RM()) {
      ctx.clearRect(0, 0, W, H);
      AN[cur].draw(AN[i].T, .016);
      post();
      raf = 0;
      return;
    }
    t0 = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    cancelAnimationFrame(raf); raf = 0; cur = -1; shake = 0;
    if (cv) ctx.clearRect(0, 0, W, H);
  }
  function getState() { return { cur, running: !!raf, parts: parts.length }; }
  function dur(i) { return RM() ? 0 : (AN[i] && AN[i].dur) || 0; }
  addEventListener("resize", () => { if (cur >= 0) { resize(); AN[cur].init(); if (RM()) { ctx.clearRect(0, 0, W, H); AN[cur].draw(AN[cur].T, .016); post(); } } });

  return { play, stop, getState, dur };
})();
