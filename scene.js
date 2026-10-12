/* ============================================================
   کاوشگر کیهانی — موتور گرافیکی سه‌بعدی (Three.js r128 محلی)
   - بافت‌های واقعی 2K (NASA/SolarSystemScope) به‌صورت محلی در textures/
   - زمین چندلایه (شیدر روز/شب + ابر مستقل + اتمسفر فرنل + ماه واقعی)
   - خورشید با شیدر پلاسمای چندمقیاسی + کرونا
   - حلقه زحل با بافت واقعی + سایه واقعی روی سیاره
   - ستاره‌های چندلایه با تنوع رنگ/روشنایی/اندازه
   - در صورت نبود بافت (file:// یا خطا) بازگشت خودکار به بافت رویه‌ای
   API عمومی بدون تغییر باقی مانده است.
   ============================================================ */
"use strict";
/* global THREE, BODIES */

const Scene3D = (() => {
  let renderer, scene, camera, raycaster, pointer, sunLight;
  let bodies = {};      // id -> {group, mesh, label, angle, speed, dist}
  let starCount = 0;
  // فرمانرو کیفیت تطبیقی: رزولوشن رندر را بر اساس نرخ فریم واقعی تنظیم می‌کند
  let maxDpr = 1, dpr = 1, govT = 0, emaFps = 60;
  let orbits = {};      // id -> line
  let labelsOn = true, orbitsOn = true, shadowsOn = true;
  let simSpeed = 1, paused = false, simDays = 0;
  let sizeScale = 1, distScale = 1, dwarfsOn = false;
  let selected = null, travelCb = null;
  let hovered = null, onSelect = null, onHover = null;
  let time = 0, reduceMotion = false, maxAniso = 4;
  const animated = [];  // {update(t, dt)}
  const BASE_DIST = {}, BASE_SIZE = {};
  const BASE_SPEED = { mercury: 1.6, venus: 1.1, earth: 0.85, mars: 0.68, jupiter: 0.4, saturn: 0.3, uranus: 0.22, neptune: 0.17, pluto: 0.12, ceres: 0.75, eris: 0.07, haumea: 0.1, makemake: 0.09 };
  const INITIAL_ANGLE = { mercury: -0.75, venus: -0.35, earth: 0.05, mars: 0.45, jupiter: 0.85, saturn: 1.25, uranus: 1.65, neptune: 2.0 };
  const HOME = { theta: 0.6, phi: 1.08, radius: 132 };
  /* ============ وضعیت دوربین — «تعقیب انتقالی» ============
     اصل طراحی: حرکت مداری سیاره هرگز جهت دوربین را تغییر نمی‌دهد.
     هنگام تعقیب، فقط بردار انتقال جرم به نقطه نگاه و موقعیت دوربین
     اعمال می‌شود؛ جهت‌گیری (theta/phi) همیشه در اختیار کاربر است.
     تنها یک سیستم در هر فریم مالک دوربین است: پرواز (anim) یا تعقیب. */
  const camS = {
    theta: HOME.theta, phi: HOME.phi, radius: HOME.radius,
    target: new THREE.Vector3(),   // نقطه نگاه (فضای جهانی)
    pan: new THREE.Vector3(),      // انحراف دستی کاربر از مرکز جرم
    followId: null,                // جرم تحت تعقیب
    followOn: true,                // حالت تعقیب روشن/آزاد
    anim: null,                    // پرواز جاری (دارای مدت محدود)
    panelT: 0, panelCur: 0         // شیفت نگاه هنگام بازبودن پنل
  };
  /* WebGL روی پروتکل file:// اجازه آپلود تصویر به بافت را نمی‌دهد (CORS)؛
     در آن حالت از ابتدا بافت رویه‌ای استفاده می‌شود تا صحنه هرگز خراب نشود. */
  const TEX_OK = (typeof location !== "undefined") && location.protocol.indexOf("http") === 0;

  BODIES.forEach(b => { BASE_DIST[b.id] = b.distScene || 0; BASE_SIZE[b.id] = b.radiusScene || 1; });

  /* داده‌های فیزیکی برای چیدمان و چرخش (منبع: برگه‌های اطلاعات ناسا) */
  const AXIAL_TILT = { // درجه؛ زاویه محور نسبت به مدار
    sun: 7.25, mercury: 0.03, venus: 177.4, earth: 23.44, mars: 25.19,
    jupiter: 3.13, saturn: 26.73, uranus: 97.77, neptune: 28.32,
    pluto: 122.53, ceres: 4, eris: 78, haumea: 0, makemake: 0
  };
  const DAY_HOURS = { // طول روز استوایی؛ منفی = چرخش وارونه
    mercury: 1407.6, venus: -5832.5, earth: 23.93, mars: 24.62,
    jupiter: 9.93, saturn: 10.66, uranus: -17.24, neptune: 16.11,
    pluto: -153.3, ceres: 9.07, eris: 25.9, haumea: 3.92, makemake: 22.5
  };
  const SUN_SPIN = 0.0126; // نسبت واقعی ~۱/۲۵ روز زمین نسبت به چرخش زمین
  const SPIN_REF = 0.31;   // سرعت زاویه‌ای چرخش زمین (نمایشی، نسبت‌ها واقعی)

  /* حالت «مقیاس علمی»: قطرها با فشرده‌سازی ریشه سوم و فاصله‌ها لگاریتمی */
  const REAL_EARTH = 2.4;              // اندازه مرجع زمین
  const REAL_SUN_REL = 109.2;          // قطر خورشید / زمین
  const REAL_AU = { mercury: 0.387, venus: 0.723, earth: 1, mars: 1.524, ceres: 2.77,
    jupiter: 5.203, saturn: 9.537, uranus: 19.19, neptune: 30.07, pluto: 39.48,
    haumea: 43.1, makemake: 45.7, eris: 67.8 };
  const REAL_REL = { mercury: 0.383, venus: 0.949, earth: 1, mars: 0.532, ceres: 0.074,
    jupiter: 10.97, saturn: 9.14, uranus: 3.98, neptune: 3.86, pluto: 0.186,
    eris: 0.182, haumea: 0.12, makemake: 0.112 };

  /* نقشه بافت واقعی هر جرم (null = رویه‌ای) */
  const REAL_TEX = {
    sun: "textures/2k_sun.jpg",                    // SDO-برپایه (SSS)
    mercury: "textures/mercury_messenger_4k.jpg",  // MESSENGER MDIS Enhanced Color (ناسا، مالکیت عمومی)
    venus: "textures/4k_venus_atmosphere.jpg",     // ماژلان/وِنرا-برپایه (SSS)
    earth: "textures/earth_day_bmng_4k.jpg",       // Blue Marble Next Generation (ناسا، مالکیت عمومی)
    mars: "textures/mars_viking_4k.jpg",           // Viking MDIM2.1 (ناسا/USGS، مالکیت عمومی)
    jupiter: "textures/jupiter_cassini_4k.jpg",    // کاسینی PIA07782 (ناسا، مالکیت عمومی)
    saturn: "textures/saturn_cassini_4k.jpg",      // کاسینی-برپایه (SSS، CC BY 4.0)
    uranus: "textures/2k_uranus.jpg",              // وویجر۲-برپایه (SSS)
    neptune: "textures/2k_neptune.jpg",            // وویجر۲-برپایه (SSS)
    pluto: "textures/pluto_nh_4k.jpg",             // New Horizons موزاییک رنگی (ناسا، مالکیت عمومی)
    ceres: "textures/ceres_dawn_2k.jpg"            // Dawn HAMO PIA20354 (ناسا، مالکیت عمومی) — بازتابش از مرکاتور
  };
  const texCache = {};
  const texLoader = (typeof THREE !== "undefined") ? new THREE.TextureLoader() : null;
  function realTex(url, srgb, cb) {
    if (!TEX_OK || !texLoader) return null;
    const key = url + (srgb ? "|s" : "|l");
    if (texCache[key]) { const t = texCache[key]; if (t.image && cb) cb(t); else if (cb) t._cbs.push(cb); return t; }
    const t = texLoader.load(url,
      () => { (t._cbs.splice(0)).forEach(f => { try { f(t); } catch (e) {} }); },
      undefined,
      () => { t._failed = true; (t._cbs.splice(0)).forEach(f => { try { f(null); } catch (e) {} }); });
    t._cbs = cb ? [cb] : [];
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = maxAniso;
    texCache[key] = t;
    return t;
  }
  /* جایگزینی نقشه ماده با بافت واقعی پس از بارگذاری (ماده از قبل با جایگزین ساخته شده) */
  function upgradeMap(mat, prop, url, srgb) {
    if (!TEX_OK) return;
    realTex(url, srgb, (t) => { if (t && !t._failed && t.image) { mat[prop] = t; mat.needsUpdate = true; } });
  }

  /* ============ نویز قطعی جاوااسکریپت (برای بافت‌های رویه‌ای) ============ */
  function makeRnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  function fbm2(rnd, nx, ny, x, y, oct) {
    // مقداردهی شبکه گرادیانی ساده و قطعی
    let v = 0, amp = 0.5, fx = x * nx, fy = y * ny;
    for (let o = 0; o < oct; o++) {
      const xi = Math.floor(fx), yi = Math.floor(fy), xf = fx - xi, yf = fy - yi;
      const h = (a, b) => { const n = Math.sin(a * 127.1 + b * 311.7 + o * 74.7) * 43758.5453; return n - Math.floor(n); };
      const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
      v += amp * (h(xi, yi) * (1 - u) * (1 - w) + h(xi + 1, yi) * u * (1 - w) + h(xi, yi + 1) * (1 - u) * w + h(xi + 1, yi + 1) * u * w);
      amp *= 0.5; fx *= 2.03; fy *= 2.01;
    }
    return v;
  }

  /* ============ بافت رویه‌ای جایگزین (۵۱۲×۲۵۶) ============ */
  function makeTexture(id) {
    const W = 512, H = 256;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    const rnd = makeRnd(id.length * 12345 + 7);
    const base = {
      sun: ["#ffd76e", "#ff9d2e"], mercury: ["#a89c8e", "#6e6459"], venus: ["#f2d894", "#c99a4a"],
      earth: ["#2f7fe0", "#1c4f9e"], mars: ["#d1602e", "#8a2f16"], jupiter: ["#e0b183", "#a06a3c"],
      saturn: ["#e8d9a8", "#b89c5e"], uranus: ["#a8e6e3", "#5fb8b5"], neptune: ["#5a7fe8", "#20398f"],
      pluto: ["#c9b696", "#7d6a52"], ceres: ["#9a9a9a", "#5f5f5f"], eris: ["#eef3f5", "#aebfc6"],
      haumea: ["#dce4e8", "#9fb0b8"], makemake: ["#dcae7e", "#8a5f36"]
    }[id] || ["#aaa", "#555"];
    // گرادیان پایه + نویز چندمقیاسی (جلوگیری از تخت‌بودن)
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, base[0]); g.addColorStop(0.5, base[1]); g.addColorStop(1, base[0]);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const ov = x.getImageData(0, 0, W, H), d = ov.data;
    for (let j = 0; j < H; j += 1) for (let i = 0; i < W; i += 1) {
      const n = fbm2(rnd, 10, 5, i / W, j / H, 4) - 0.5;
      const k = (j * W + i) * 4, f = 1 + n * 0.55;
      d[k] = Math.max(0, Math.min(255, d[k] * f));
      d[k + 1] = Math.max(0, Math.min(255, d[k + 1] * f));
      d[k + 2] = Math.max(0, Math.min(255, d[k + 2] * f));
    }
    x.putImageData(ov, 0, 0);
    const R = (a, b) => a + rnd() * (b - a);
    if (id === "sun") {
      for (let i = 0; i < 420; i++) {
        x.fillStyle = `rgba(255,${120 + rnd() * 120 | 0},20,${0.10 + rnd() * 0.22})`;
        const r = 1 + rnd() * 5; x.beginPath(); x.arc(rnd() * W, rnd() * H, r, 0, 7); x.fill();
      }
      for (let i = 0; i < 14; i++) {
        x.fillStyle = "rgba(150,60,10,.35)";
        x.beginPath(); x.ellipse(rnd() * W, 60 + rnd() * 136, 3 + rnd() * 6, 2 + rnd() * 4, 0, 0, 7); x.fill();
      }
      const limb = x.createLinearGradient(0, 0, 0, H);
      limb.addColorStop(0, "rgba(180,60,0,.45)"); limb.addColorStop(0.18, "rgba(180,60,0,0)");
      limb.addColorStop(0.82, "rgba(180,60,0,0)"); limb.addColorStop(1, "rgba(180,60,0,.45)");
      x.fillStyle = limb; x.fillRect(0, 0, W, H);
    } else if (id === "jupiter" || id === "saturn") {
      for (let j = 0; j < 14; j++) {
        x.fillStyle = j % 2 ? "rgba(255,240,220,.32)" : "rgba(120,70,30,.28)";
        for (let px = 0; px < W; px += 4) {
          const h = 6 + rnd() * 4, yy = j * 19 + Math.sin(px * 0.08 + j * 1.7) * 3;
          x.fillRect(px, yy, 4, h);
        }
      }
      if (id === "saturn") { x.fillStyle = "rgba(190,150,80,.35)"; x.fillRect(0, 0, W, 24); x.fillRect(0, H - 24, W, 24); }
      if (id === "jupiter") {
        x.fillStyle = "rgba(200,70,40,.85)"; x.beginPath(); x.ellipse(360, 164, 52, 26, 0, 0, 7); x.fill();
        x.fillStyle = "rgba(240,150,110,.7)"; x.beginPath(); x.ellipse(360, 164, 30, 14, 0, 0, 7); x.fill();
      }
    } else if (id === "earth") {
      x.fillStyle = "#3da35d";
      for (let i = 0; i < 9; i++) {
        x.beginPath(); x.ellipse(40 + rnd() * 432, 50 + rnd() * 156, 24 + rnd() * 44, 16 + rnd() * 28, rnd() * 3, 0, 7); x.fill();
      }
      x.fillStyle = "rgba(255,255,255,.75)";
      for (let i = 0; i < 26; i++) { x.beginPath(); x.ellipse(rnd() * W, rnd() * H, 16 + rnd() * 32, 4 + rnd() * 8, 0, 0, 7); x.fill(); }
      x.fillStyle = "rgba(255,255,255,.9)"; x.fillRect(0, 0, W, 14); x.fillRect(0, H - 14, W, 14);
    } else if (id === "mars") {
      x.fillStyle = "rgba(70,25,12,.4)";
      for (let i = 0; i < 6; i++) { x.beginPath(); x.ellipse(rnd() * W, 80 + rnd() * 100, 30 + rnd() * 50, 12 + rnd() * 20, rnd(), 0, 7); x.fill(); }
      x.fillStyle = "rgba(230,180,150,.35)";
      x.beginPath(); x.ellipse(380, 190, 56, 24, 0, 0, 7); x.fill();
      for (let i = 0; i < 70; i++) {
        x.strokeStyle = "rgba(90,30,15,.5)"; x.beginPath(); x.arc(rnd() * W, rnd() * H, 1 + rnd() * 4, 0, 7); x.stroke();
      }
      x.fillStyle = "rgba(255,240,230,.9)"; x.fillRect(0, 0, W, 12); x.fillRect(0, H - 12, W, 12);
    } else if (id === "mercury" || id === "ceres") {
      for (let i = 0; i < 110; i++) {
        x.fillStyle = rnd() > 0.5 ? "rgba(60,55,50,.4)" : "rgba(200,190,175,.35)";
        x.beginPath(); x.arc(rnd() * W, rnd() * H, 1 + rnd() * 5, 0, 7); x.fill();
      }
      for (let i = 0; i < 8; i++) {
        const cx = rnd() * W, cy = rnd() * H;
        x.strokeStyle = "rgba(225,215,200,.4)";
        for (let r = 0; r < 6; r++) { x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + (rnd() - 0.5) * 30, cy + (rnd() - 0.5) * 30); x.stroke(); }
        x.fillStyle = "rgba(230,220,205,.5)"; x.beginPath(); x.arc(cx, cy, 2.5, 0, 7); x.fill();
      }
      if (id === "ceres") { // نقاط روشن اوکاتور
        x.fillStyle = "rgba(255,255,255,.85)";
        for (let i = 0; i < 7; i++) { x.beginPath(); x.arc(200 + rnd() * 120, 100 + rnd() * 60, 2 + rnd() * 4, 0, 7); x.fill(); }
      }
    } else if (id === "venus") {
      for (let i = 0; i < 20; i++) {
        x.fillStyle = "rgba(255,250,230,.25)"; x.beginPath(); x.ellipse(rnd() * W, rnd() * H, 40 + rnd() * 60, 8 + rnd() * 14, 0.2, 0, 7); x.fill();
      }
      x.strokeStyle = "rgba(170,130,70,.35)"; x.lineWidth = 5;
      for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(80 + i * 90, 128, 44, -0.8, 0.8); x.stroke(); }
    } else if (id === "uranus" || id === "neptune") {
      for (let i = 0; i < 12; i++) {
        x.fillStyle = "rgba(255,255,255,.14)"; x.fillRect(0, rnd() * H, W, 6 + rnd() * 10);
      }
      if (id === "neptune") {
        x.fillStyle = "rgba(20,40,120,.5)"; x.beginPath(); x.ellipse(180, 140, 40, 18, 0, 0, 7); x.fill();
        x.fillStyle = "rgba(255,255,255,.55)";
        for (let i = 0; i < 8; i++) { x.beginPath(); x.ellipse(rnd() * W, rnd() * H, 12 + rnd() * 24, 3, 0, 0, 7); x.fill(); }
      }
    } else if (id === "pluto") {
      x.fillStyle = "rgba(60,45,35,.45)"; // نواحی تیره
      for (let i = 0; i < 7; i++) { x.beginPath(); x.ellipse(rnd() * W, rnd() * H, 30 + rnd() * 60, 20 + rnd() * 40, rnd(), 0, 7); x.fill(); }
      x.fillStyle = "rgba(255,244,228,.8)"; // قلب یخی اسپوتنیک
      x.beginPath(); x.ellipse(240, 140, 68, 48, 0, 0, 7); x.fill();
      x.fillStyle = "rgba(255,255,255,.5)";
      for (let i = 0; i < 40; i++) { x.beginPath(); x.arc(rnd() * W, rnd() * H, 1 + rnd() * 3, 0, 7); x.fill(); }
    } else if (id === "haumea") {
      x.fillStyle = "rgba(170,80,60,.28)"; // لکه سرخ هائومیا
      x.beginPath(); x.ellipse(330, 120, 60, 26, 0.3, 0, 7); x.fill();
    } else if (id === "makemake") {
      x.fillStyle = "rgba(90,50,25,.3)";
      for (let i = 0; i < 10; i++) { x.beginPath(); x.ellipse(rnd() * W, rnd() * H, 25 + rnd() * 50, 15 + rnd() * 30, rnd(), 0, 7); x.fill(); }
    } else if (id === "eris") {
      x.fillStyle = "rgba(255,255,255,.35)";
      for (let i = 0; i < 12; i++) { x.beginPath(); x.ellipse(rnd() * W, rnd() * H, 30 + rnd() * 60, 6 + rnd() * 12, 0.1, 0, 7); x.fill(); }
    } else {
      for (let i = 0; i < 50; i++) {
        x.fillStyle = `rgba(255,255,255,${rnd() * 0.25})`;
        x.beginPath(); x.arc(rnd() * W, rnd() * H, 1 + rnd() * 4, 0, 7); x.fill();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding; t.anisotropy = maxAniso;
    return t;
  }

  /* نقشه برجستگی رویه‌ای ظریف (کمک سایه‌زنی؛ گویای ارتفاع واقعی نیست) */
  function makeBumpTexture(id, strength) {
    const W = 256, H = 128;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    const rnd = makeRnd(id.length * 999 + 31);
    x.fillStyle = "#808080"; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) {
      const v = 90 + rnd() * 90 | 0;
      x.fillStyle = `rgba(${v},${v},${v},.5)`;
      x.beginPath(); x.arc(rnd() * W, rnd() * H, (0.5 + rnd() * 3) * (strength || 1), 0, 7); x.fill();
    }
    if (id === "mercury" || id === "moon") { // دهانه‌های تیزتر
      for (let i = 0; i < 120; i++) {
        const cx = rnd() * W, cy = rnd() * H, r = 1 + rnd() * 4;
        x.strokeStyle = "rgba(40,40,40,.7)"; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke();
        x.fillStyle = "rgba(200,200,200,.5)"; x.beginPath(); x.arc(cx - r * 0.25, cy - r * 0.25, r * 0.5, 0, 7); x.fill();
      }
    }
    return new THREE.CanvasTexture(c);
  }

  /* ============ شیدرها ============ */
  const NOISE_GLSL = `
    float hash21(vec2 p){ p = fract(p*vec2(234.34,435.345)); p += dot(p,p+34.23); return fract(p.x*p.y); }
    float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
      float a=hash21(i), b=hash21(i+vec2(1.,0.)), c=hash21(i+vec2(0.,1.)), d=hash21(i+vec2(1.,1.));
      return mix(mix(a,b,u.x), mix(c,d,u.x), u.y); }
    float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*vnoise(p); p=p*2.03+vec2(17.3,9.1); a*=0.5; } return v; }
  `;

  function makeSunMaterial(baseTex) {
    const uniforms = { uTime: { value: 0 }, uMap: { value: baseTex } };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal);
          vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz;
          gl_Position=projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `
        uniform float uTime; uniform sampler2D uMap;
        varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        ${NOISE_GLSL}
        void main(){
          vec2 p = vUv*vec2(6.0,3.0);
          float t = uTime*0.035;
          float n1 = fbm(p*1.4 + vec2(t, t*0.6));
          float n2 = fbm(p*2.8 - vec2(t*1.6, t*0.5) + n1*1.2);
          float gran = fbm(p*8.0 + vec2(-t*2.2, t*1.3) + n2*1.6);
          float m = clamp(n1*0.55 + n2*0.30 + gran*0.38, 0.0, 1.2);
          // بافت sRGB است؛ برای خط لینیار→sRGB درست باید اینجا دیکد شود
          vec3 base = pow(texture2D(uMap, vUv).rgb, vec3(2.2));
          vec3 col = mix(vec3(0.85,0.25,0.02), vec3(1.0,0.55,0.08), smoothstep(0.12,0.5,m));
          col = mix(col, vec3(1.0,0.85,0.45), smoothstep(0.5,0.82,m));
          col = mix(col, vec3(1.0,0.98,0.9), smoothstep(0.82,1.08,m));
          col = mix(col, base*1.15, 0.35); // پیوند با نقشه پایه واقعی
          vec3 V = normalize(cameraPosition - vW);
          float limb = max(dot(normalize(vN), V), 0.0);
          col *= 0.5 + 0.5*pow(limb, 0.55); // تیرگی لبه
          col *= 1.0 + 0.035*sin(uTime*0.9 + m*7.0); // تپش ظریف
          gl_FragColor = vec4(col*1.35, 1.0);
          #include <encodings_fragment>
        }`
    });
    animated.push({ update: (t) => { uniforms.uTime.value = t; } });
    upgradeMapShader(mat, "uMap", REAL_TEX.sun);
    return mat;
  }
  function upgradeMapShader(mat, prop, url) {
    if (!TEX_OK || !url) return;
    realTex(url, true, (t) => { if (t && !t._failed && t.image) { mat.uniforms[prop].value = t; } });
  }

  function makeEarthMaterial() {
    const blank = () => new THREE.CanvasTexture(document.createElement("canvas"));
    const uniforms = {
      uDay: { value: makeTexture("earth") },
      uNight: { value: blank() },
      uNormal: { value: blank() },
      uSpec: { value: blank() }
    };
    if (TEX_OK) {
      realTex(REAL_TEX.earth, true, (t) => { if (t && t.image) uniforms.uDay.value = t; });
      realTex("textures/earth_lights_2048.png", true, (t) => { if (t && t.image) uniforms.uNight.value = t; });
      realTex("textures/earth_normal_2048.jpg", false, (t) => { if (t && t.image) uniforms.uNormal.value = t; });
      realTex("textures/earth_specular_2048.jpg", false, (t) => { if (t && t.image) uniforms.uSpec.value = t; });
    }
    const mat = new THREE.ShaderMaterial({
      uniforms,
      extensions: { derivatives: true },
      vertexShader: `
        varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal);
          vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz;
          gl_Position=projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `
        uniform sampler2D uDay, uNight, uNormal, uSpec;
        varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        ${NOISE_GLSL}
        vec3 pertN(vec3 N){
          vec3 q0=dFdx(vW), q1=dFdy(vW); vec2 st0=dFdx(vUv), st1=dFdy(vUv);
          vec3 T=normalize(q0*st1.t - q1*st0.t);
          vec3 B=normalize(-q0*st1.s + q1*st0.s);
          vec3 mn = texture2D(uNormal, vUv).xyz*2.0-1.0;
          return normalize(mat3(T,B,N)*mn);
        }
        void main(){
          vec3 N = normalize(vN);
          #ifdef USE_NORMALMAP
            N = pertN(N);
          #endif
          vec3 V = normalize(cameraPosition - vW);
          vec3 L = normalize(-vW); // خورشید در مرکز صحنه است
          float ndl = dot(N, L);
          float dayAmt = smoothstep(-0.06, 0.3, ndl);
          vec3 dayCol = pow(texture2D(uDay, vUv).rgb, vec3(2.2));
          vec3 col = dayCol * (0.015 + 1.1*clamp(ndl, 0.0, 1.0));
          // جزئیات ظریف روی خشکی‌ها (اقیانوس با ماسک بازتاب جدا می‌شود)
          float specM = texture2D(uSpec, vUv).r;
          float det = fbm(vUv*vec2(240.0,120.0));
          col *= 0.92 + 0.16*det*(1.0-specM);
          vec3 H = normalize(L + V);
          float spec = pow(max(dot(N,H),0.0), 48.0) * specM * dayAmt;
          col += vec3(0.30,0.40,0.50)*spec;
          float nightAmt = smoothstep(0.03, -0.2, ndl);
          col += pow(texture2D(uNight, vUv).rgb, vec3(2.2)) * vec3(1.0,0.88,0.62) * nightAmt * 2.4; // نورهای شهری (داده واقعی ناسا)
          float rim = pow(1.0 - max(dot(N,V),0.0), 3.0);
          col += vec3(0.10,0.28,0.65) * rim * (0.08 + 0.7*dayAmt);
          gl_FragColor = vec4(col, 1.0);
          #include <encodings_fragment>
        }`
    });
    // نقشه نرمال ممکن است دیرتر برسد؛ با تعریف روشن/خاموش می‌شود
    mat.defines = mat.defines || {};
    if (TEX_OK) realTex("textures/earth_normal_2048.jpg", false, () => { mat.defines.USE_NORMALMAP = ""; mat.needsUpdate = true; });
    return mat;
  }

  /* پوسته اتمسفر فرنل (نیمه‌شفاف، سمت روز پررنگ‌تر) */
  function makeAtmosphere(colorHex, intensity, scale, exp) {
    const mat = new THREE.ShaderMaterial({
      // رنگ sRGB → خطی تا خروجی sRGB درست باشد
      uniforms: { uColor: { value: new THREE.Color(colorHex).convertSRGBToLinear() }, uInt: { value: intensity }, uExp: { value: exp || 3.0 } },
      vertexShader: `
        varying vec3 vN; varying vec3 vW;
        void main(){ vN=normalize(mat3(modelMatrix)*normal);
          vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz;
          gl_Position=projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uInt, uExp;
        varying vec3 vN; varying vec3 vW;
        void main(){
          vec3 V = normalize(cameraPosition - vW);
          vec3 L = normalize(-vW);
          float rim = pow(1.0 - abs(dot(normalize(vN), V)), uExp);
          float day = smoothstep(-0.4, 0.45, dot(normalize(vN), L));
          vec3 col = uColor * rim * (0.12 + 0.88*day) * uInt;
          gl_FragColor = vec4(col, 1.0);
          #include <encodings_fragment>
        }`,
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), mat);
    m.scale.setScalar(scale);
    m.renderOrder = 4;
    return m;
  }

  function glowTexture(inner, mid) {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(64, 64, 6, 64, 64, 64);
    g.addColorStop(0, inner); g.addColorStop(0.35, mid); g.addColorStop(1, "rgba(255,140,40,0)");
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function makeLabelTexture(text) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 64;
    const x = c.getContext("2d");
    x.font = "bold 30px Vazirmatn, Tahoma, sans-serif"; x.textAlign = "center";
    x.shadowColor = "#000"; x.shadowBlur = 8;
    x.fillStyle = "#fff"; x.fillText(text, 128, 40);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function makeLabelSprite(text) {
    const t = makeLabelTexture(text);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: true, depthWrite: false }));
    s.scale.set(7, 1.75, 1); s.renderOrder = 5; return s;
  }
  /* وقتی فونت فارسی محلی آماده شد، برچسب‌ها با کیفیت واقعی بازسازی می‌شوند */
  function refreshLabels() {
    if (typeof document === "undefined" || !document.fonts || !document.fonts.ready) return;
    document.fonts.ready.then(() => {
      Object.values(bodies).forEach(o => {
        const old = o.label.material.map;
        const t = makeLabelTexture(o.def.fa);
        o.label.material.map = t; o.label.material.needsUpdate = true;
        if (old) old.dispose();
      });
    }).catch(() => {});
  }

  /* ============ صحنه ============ */
  function init(container, opts) {
    onSelect = opts.onSelect; onHover = opts.onHover;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // Keep high-density phones from rendering four times as many pixels.
    maxDpr = Math.min(matchMedia("(pointer: coarse)").matches ? 1.5 : 2, devicePixelRatio || 1);
    dpr = maxDpr;
    renderer.setPixelRatio(dpr);
    window.__CE_QUALITY = 1;
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    container.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05070f, 0.0011);
    camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 6000);
    camera.position.set(96, 62, 66);
    // نور محیط کم (تفاوت واقعی روز/شب) + نور نقطه‌ای خورشید با سایه
    scene.add(new THREE.AmbientLight(0x8899bb, 0.14));
    sunLight = new THREE.PointLight(0xfff2dd, 2.0, 0);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.near = 4; sunLight.shadow.camera.far = 130;
    sunLight.shadow.bias = -0.002;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);
    buildStars();
    raycaster = new THREE.Raycaster(); pointer = new THREE.Vector2();
    buildBodies();
    refreshLabels();
    bindInput(renderer.domElement);
    addEventListener("resize", () => {
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
    requestAnimationFrame(loop);
  }

  /* ---- ستاره‌های چندلایه ---- */
  function buildStars() {
    const palette = [
      [0.62, 0.74, 1.0], [0.75, 0.83, 1.0], [1.0, 1.0, 1.0],
      [1.0, 0.93, 0.80], [1.0, 0.80, 0.58], [1.0, 0.68, 0.45]
    ];
    const layers = [
      { n: 2200, size: 1.5, op: 0.75 },
      { n: 1100, size: 2.3, op: 0.9 },
      { n: 320, size: 3.4, op: 1.0 }
    ];
    layers.forEach(L => {
      starCount += L.n;
      const pos = new Float32Array(L.n * 3), col = new Float32Array(L.n * 3);
      for (let i = 0; i < L.n; i++) {
        const r = 1000 + Math.random() * 1400, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = r * Math.cos(ph); pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
        const p = palette[Math.random() < 0.55 ? (Math.random() * 3 | 0) : (3 + Math.random() * 3 | 0)];
        const b = 0.45 + Math.random() * 0.55;
        const sc = new THREE.Color(p[0] * b, p[1] * b, p[2] * b).convertSRGBToLinear();
        col[i * 3] = sc.r; col[i * 3 + 1] = sc.g; col[i * 3 + 2] = sc.b;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const m = new THREE.PointsMaterial({ size: L.size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: L.op, fog: false, depthWrite: false });
      const pts = new THREE.Points(g, m); pts.renderOrder = -10;
      scene.add(pts);
    });
    // کمربند کهکشان راه شیری: لایه متراکمِ کم‌رمق روی صفحه کهکشانی، با میل ۶۲٫۹° نسبت به دائرةالبروج
    {
      const n = 2600, tilt = 62.9 * Math.PI / 180;
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 1250 + Math.random() * 900;
        const off = gauss() * 0.10 * r; // ضخامت کمربند
        const x = Math.cos(a) * r, y = off, z = Math.sin(a) * r;
        const y2 = y * Math.cos(tilt) - z * Math.sin(tilt);
        const z2 = y * Math.sin(tilt) + z * Math.cos(tilt);
        pos[i * 3] = x; pos[i * 3 + 1] = y2; pos[i * 3 + 2] = z2;
        const p = Math.random() < 0.6 ? [1, 0.88, 0.7] : [0.78, 0.84, 1];
        const b = 0.25 + Math.random() * 0.45;
        const sc = new THREE.Color(p[0] * b, p[1] * b, p[2] * b).convertSRGBToLinear();
        col[i * 3] = sc.r; col[i * 3 + 1] = sc.g; col[i * 3 + 2] = sc.b;
      }
      starCount += n;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const m = new THREE.PointsMaterial({ size: 1.15, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.5, fog: false, depthWrite: false });
      const pts = new THREE.Points(g, m); pts.renderOrder = -10;
      scene.add(pts);
    }
    // چند ستاره درخشان با هاله ظریف
    const gc = document.createElement("canvas"); gc.width = gc.height = 64;
    const gx = gc.getContext("2d");
    const gg = gx.createRadialGradient(32, 32, 1, 32, 32, 32);
    gg.addColorStop(0, "rgba(255,255,255,1)"); gg.addColorStop(0.25, "rgba(220,230,255,.5)"); gg.addColorStop(1, "rgba(200,220,255,0)");
    gx.fillStyle = gg; gx.fillRect(0, 0, 64, 64);
    const gt = new THREE.CanvasTexture(gc);
    gt.encoding = THREE.sRGBEncoding;
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, transparent: true, opacity: 0.5 + Math.random() * 0.4, fog: false, depthWrite: false }));
      const r = 1100 + Math.random() * 900, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      s.position.set(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th));
      const sc = 5 + Math.random() * 7; s.scale.set(sc, sc, 1);
      scene.add(s);
    }
    // مه کهکشانی بسیار ظریف
    const neb = new THREE.Mesh(new THREE.SphereGeometry(2400, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x1a2a55, transparent: true, opacity: 0.05, side: THREE.BackSide, fog: false, depthWrite: false }));
    scene.add(neb);
  }

  /* ---- ساخت اجرام ---- */
  function buildBodies() {
    BODIES.forEach((b, i) => {
      const grp = new THREE.Group(); scene.add(grp);
      /* همه اجرم حول محور واقعی خود می‌چرخند: حلقه‌ها/ابری‌ها/بافت در tiltGrp */
      const tiltGrp = new THREE.Group();
      tiltGrp.rotation.z = -THREE.MathUtils.degToRad(AXIAL_TILT[b.id] || 0);
      grp.add(tiltGrp);
      const SEG = 56;
      let mesh;
      const ringMeshes = [];
      if (b.id === "sun") {
        mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), makeSunMaterial(makeTexture("sun")));
        tiltGrp.add(mesh);
        const cor1 = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTexture("rgba(255,225,160,.95)", "rgba(255,160,60,.32)"),
          transparent: true, opacity: 0.5, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false
        }));
        cor1.material.fog = false;
        const cor2 = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTexture("rgba(255,200,120,.5)", "rgba(255,140,50,.14)"),
          transparent: true, opacity: 0.35, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false
        }));
        cor2.material.fog = false;
        grp.add(cor1); grp.add(cor2);
        grp.userData.corona = [cor1, cor2];
        animated.push({
          update: (t) => {
            cor1.material.opacity = 0.48 + 0.05 * Math.sin(t * 0.9);
            cor2.material.opacity = 0.33 + 0.05 * Math.sin(t * 0.7 + 2);
          }
        });
      } else if (b.id === "earth") {
        mesh = new THREE.Mesh(new THREE.SphereGeometry(1, SEG, SEG), makeEarthMaterial());
        tiltGrp.add(mesh);
        // ابرهای مستقل
        const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.018, 48, 48),
          new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(document.createElement("canvas")), transparent: true, opacity: 0.75, depthWrite: false }));
        clouds.renderOrder = 1;
        tiltGrp.add(clouds);
        grp.userData.clouds = clouds;
        if (TEX_OK) realTex("textures/earth_clouds_1024.png", true, (t) => {
          if (t && t.image) { clouds.material.map = t; clouds.material.needsUpdate = true; }
        });
        animated.push({ update: (t, dt) => { clouds.rotation.y += dt * 0.025; } });
        // اتمسفر آبی
        const earthAtmo = makeAtmosphere(0x3f8cff, 1.15, 1.035, 3.2);
        grp.add(earthAtmo); grp.userData.atmo = earthAtmo; grp.userData.atmoK = 1.035;
        // ماه واقعی
        const moonPivot = new THREE.Group(); grp.add(moonPivot);
        const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32),
          new THREE.MeshPhongMaterial({ map: makeTexture("moon"), shininess: 4 }));
        upgradeMap(moonMesh.material, "map", "textures/moon_lroc_4k.jpg", true);
        moonMesh.material.bumpMap = makeBumpTexture("moon", 0.9);
        moonMesh.material.bumpScale = 0.035;
        moonPivot.add(moonMesh);
        grp.userData.moonPivot = moonPivot; grp.userData.moonMesh = moonMesh;
        const mOrbPts = [];
        for (let a = 0; a <= 96; a++) { const t2 = a / 96 * Math.PI * 2; mOrbPts.push(new THREE.Vector3(Math.cos(t2), 0, Math.sin(t2))); }
        const mOrb = new THREE.Line(new THREE.BufferGeometry().setFromPoints(mOrbPts),
          new THREE.LineBasicMaterial({ color: 0x8fa3c7, transparent: true, opacity: 0.3 }));
        mOrb.rotation.x = 0.09;
        grp.add(mOrb);
        grp.userData.moonOrbit = mOrb;
        // قفل کشندی: فرزند ثابتِ پیوت چرخان همیشه یک رو به زمین دارد
        animated.push({ update: (t, dt) => { moonPivot.rotation.y += dt * 0.9; } });
      } else {
        const rocky = ["mercury", "mars", "ceres", "pluto", "eris", "haumea", "makemake", "moon"].includes(b.id);
        const mat = new THREE.MeshPhongMaterial({
          map: makeTexture(b.id),
          shininess: rocky ? 4 : 18,
          specular: new THREE.Color(rocky ? 0x0a0a0a : 0x222222)
        });
        if (REAL_TEX[b.id]) upgradeMap(mat, "map", REAL_TEX[b.id], true);
        if (rocky) { mat.bumpMap = makeBumpTexture(b.id, 1); mat.bumpScale = 0.05; }
        if (b.id === "venus") { mat.shininess = 30; } // ابرهای براق
        mesh = new THREE.Mesh(new THREE.SphereGeometry(1, SEG, SEG), mat);
        tiltGrp.add(mesh);
        // اتمسفرهای ظریف (مرجع ذخیره می‌شود تا layout مقیاس بزند)
        const atmoCfg = { venus: [0xf2d8a0, 0.9, 1.03], mars: [0xd89060, 0.35, 1.02], jupiter: [0xd8a878, 0.4, 1.02], saturn: [0xe3cf9e, 0.35, 1.02], uranus: [0x8fd6d4, 0.55, 1.025], neptune: [0x4f74ff, 0.6, 1.025] }[b.id];
        if (atmoCfg) { const am = makeAtmosphere(atmoCfg[0], atmoCfg[1], atmoCfg[2], 3.2); grp.add(am); grp.userData.atmo = am; grp.userData.atmoK = atmoCfg[2]; }
      }
      mesh.userData.id = b.id;
      // حلقه‌ها
      if (b.id === "saturn") {
        const inner = 1.24, outer = 2.35;
        const rg = new THREE.RingGeometry(inner, outer, 128, 1);
        radialUV(rg, inner, outer);
        const fallRing = makeRingTexture();
        // ماده Lambert تا حلقه نور بگیرد و «سایه سیاره روی حلقه» واقعی بیفتد
        const rmat = new THREE.MeshLambertMaterial({ map: fallRing, transparent: true, side: THREE.DoubleSide, depthWrite: false, emissive: new THREE.Color(0x14110c) });
        const ringMesh = new THREE.Mesh(rg, rmat);
        ringMesh.rotation.x = -Math.PI / 2; // در صفحه استوایی؛ tilt گروه زاویه واقعی را می‌دهد
        ringMesh.castShadow = true;   // سایه حلقه روی سیاره
        ringMesh.receiveShadow = true; // سایه سیاره روی حلقه
        ringMesh.renderOrder = 2;
        ringMesh.customDepthMaterial = new THREE.MeshDepthMaterial({
          depthPacking: THREE.RGBADepthPacking, map: fallRing, alphaTest: 0.4
        });
        // سایه نقطه‌ای خورشید: شکاف کاسینی در سایه حلقه روی سیاره حفظ می‌شود
        ringMesh.customDistanceMaterial = new THREE.MeshDistanceMaterial({ map: fallRing, alphaTest: 0.4 });
        if (TEX_OK) realTex("textures/8k_saturn_ring_alpha.png", true, (t) => {
          if (t && t.image) {
            rmat.map = t; rmat.needsUpdate = true;
            ringMesh.customDepthMaterial.map = t; ringMesh.customDepthMaterial.needsUpdate = true;
            ringMesh.customDistanceMaterial.map = t; ringMesh.customDistanceMaterial.needsUpdate = true;
          }
        });
        tiltGrp.add(ringMesh);
        ringMeshes.push(ringMesh);
        mesh.castShadow = true; mesh.receiveShadow = true;
      } else if (b.rings === "faint" || b.id === "haumea") {
        const inner = b.id === "haumea" ? 2.3 : 1.6, outer = b.id === "haumea" ? 2.5 : 2.0;
        const rg = new THREE.RingGeometry(inner, outer, 128, 1);
        radialUV(rg, inner, outer);
        const rc = document.createElement("canvas"); rc.width = 128; rc.height = 8;
        const rx = rc.getContext("2d");
        for (let k = 0; k < 128; k++) { rx.fillStyle = `rgba(200,215,220,${0.06 + (k % 7) / 22})`; rx.fillRect(k, 0, 1, 8); }
        const rmat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(rc), transparent: true, side: THREE.DoubleSide, opacity: 0.55, depthWrite: false });
        const ringMesh = new THREE.Mesh(rg, rmat);
        ringMesh.rotation.x = -Math.PI / 2;
        ringMesh.renderOrder = 2;
        tiltGrp.add(ringMesh);
        ringMeshes.push(ringMesh);
      }
      // نشانگر انتخاب
      const sel = new THREE.Mesh(new THREE.RingGeometry(1.35, 1.45, 64),
        new THREE.MeshBasicMaterial({ color: 0x39d0d8, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false, fog: false }));
      sel.rotation.x = -Math.PI / 2; sel.visible = false; grp.add(sel);
      const label = makeLabelSprite(b.fa); grp.add(label);
      if (b.id !== "sun") {
        const pts = [];
        for (let a = 0; a <= 128; a++) { const t = a / 128 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t) * 1, 0, Math.sin(t) * 1)); }
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0x5a7fc0, transparent: true, opacity: 0.35 }));
        scene.add(line); orbits[b.id] = line;
      }
      const dayH = DAY_HOURS[b.id];
      const spin = dayH ? (SPIN_REF * 23.93 / Math.abs(dayH)) * Math.sign(dayH) : SPIN_REF;
      bodies[b.id] = { def: b, group: grp, mesh, tiltGrp, label, sel, ringMeshes, angle: (INITIAL_ANGLE[b.id] !== undefined ? INITIAL_ANGLE[b.id] : Math.random() * Math.PI * 2), speed: BASE_SPEED[b.id] || 0.2, spin, lift: ((b.id.charCodeAt(0) + b.id.length) % 2) * 1.5 };
      if (b.dwarf) grp.visible = false;
    });
    layout();
    updateOrbitVis();
    applyShadowFlag();
  }
  function makeRingTexture() {
    const c = document.createElement("canvas"); c.width = 512; c.height = 8;
    const x = c.getContext("2d");
    const rnd = makeRnd(777);
    for (let k = 0; k < 512; k++) {
      const u = k / 512;
      let a = 0.25 + 0.6 * Math.abs(Math.sin(u * 40 + Math.sin(u * 13) * 2));
      if (u > 0.62 && u < 0.68) a = 0.03; // شکاف کاسینی
      if (u < 0.08) a *= 0.3; // حلقه C کم‌نور
      const l = 150 + rnd() * 70 | 0;
      x.fillStyle = `rgba(${l},${l - 20},${l - 50},${Math.min(1, a)})`;
      x.fillRect(k, 0, 1, 8);
    }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    return t;
  }
  /* نگاشت شعاعی UV برای بافت حلقه */
  function radialUV(geo, inner, outer) {
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
    }
    uv.needsUpdate = true;
  }

  /* چیدمان با دو حالت مقیاس */
  let mode = "show";
  function layout() {
    const sunSize = (mode === "real" ? REAL_EARTH * Math.cbrt(REAL_SUN_REL) : BASE_SIZE.sun) * sizeScale;
    Object.values(bodies).forEach(o => {
      const id = o.def.id;
      let d = BASE_DIST[id] * distScale, s = BASE_SIZE[id] * sizeScale;
      if (id === "sun") {
        o.dist = 0; o.size = sunSize;
        o.group.position.set(0, 0, 0); o.mesh.scale.setScalar(o.size);
        o.label.position.set(0, o.size + 3, 0); o.sel.scale.setScalar(o.size);
        const cor = o.group.userData.corona;
        if (cor) { cor[0].scale.set(o.size * 3.1, o.size * 3.1, 1); cor[1].scale.set(o.size * 5.4, o.size * 5.4, 1); }
        o.group.userData.corBase = cor ? cor.map(c => c.scale.x) : null;
        return;
      }
      if (mode === "real") {
        /* نسبت قطرها واقعی (فشرده‌سازی ریشه سوم)؛ فاصله‌ها لگاریتمی فشرده.
           فاصله واقعی (خطی) چند برابر بزرگ‌تر است و در رابط کاربری اعلام شده. */
        const au = REAL_AU[id] || 1, rel = REAL_REL[id] || 0.5;
        s = REAL_EARTH * Math.cbrt(rel) * sizeScale;
        const d0 = sunSize + 4 + 30 * Math.log10(au / 0.387);
        d = Math.max(d0, sunSize + s + 1.5) * distScale;
      } else {
        /* نمای نمایشی: بزرگ‌نمایی برای دیده‌شدن؛ فقط از هم‌پوشانی جلوگیری می‌شود */
        d = Math.max(d, sunSize + s + 1.2);
      }
      o.dist = d; o.size = s;
      if (o.def.elongated) o.mesh.scale.set(s * 1.3, s * 0.72, s * 0.9); // هائومیا کشیده
      else o.mesh.scale.setScalar(s);
      o.label.position.set(0, s + 2.2 + (o.lift || 0), 0);
      o.sel.scale.setScalar(s);
      if (o.group.userData.clouds) o.group.userData.clouds.scale.setScalar(s);
      if (o.group.userData.moonPivot) {
        /* نسبت قطر ماه/زمین واقعی (۰٫۲۷۳)؛ فاصله برای دیده‌شدن فشرده شده است */
        const mm = o.group.userData.moonMesh;
        if (mm) { mm.scale.setScalar(Math.max(0.08, s * 0.273)); mm.position.set(s * 3.2, 0, 0); }
      }
      if (o.group.userData.moonOrbit) o.group.userData.moonOrbit.scale.setScalar(s * 3.2);
      if (o.group.userData.atmo) o.group.userData.atmo.scale.setScalar(s * (o.group.userData.atmoK || 1.02));
      if (o.ringMeshes) o.ringMeshes.forEach(rm => rm.scale.setScalar(s));
      if (orbits[id]) orbits[id].scale.set(d, 1, d);
      positionBody(o);
    });
  }
  function positionBody(o) {
    o.group.position.set(Math.cos(o.angle) * o.dist, 0, Math.sin(o.angle) * o.dist);
  }

  /* ============ دوربین: تعقیب انتقالی + پرواز هموار ============ */
  const _w = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _lk = new THREE.Vector3();
  function bodyWorld(id, out) {
    const o = bodies[id];
    if (!o) return out.set(0, 0, 0);
    return o.group.getWorldPosition(out); // مختصات جهانی واقعی (با احتساب والدین)
  }
  function minRadiusFor(id) {
    if (id && bodies[id]) return Math.max(2.2, bodies[id].size * 2.4 + 0.4);
    return 12;
  }
  function camMinRadius() { return minRadiusFor(camS.anim ? camS.anim.id : (camS.followOn ? camS.followId : null)); }
  function easeInOutCubic(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  /* پرواز به سمت جرم: مقصد هر فریم از موقعیت «فعلی» جرم خوانده می‌شود
     (هدف متحرکِ پایدار)، مدت محدود، بدون هیچ تغییری در جهت‌گیری دوربین.
     شروع پرواز جدید، پرواز قبلی را تمیز جایگزین می‌کند. */
  function flyTo(id, opts) {
    opts = opts || {};
    const o = bodies[id]; if (!o) return;
    const toRdef = Math.max(6, o.size * 6);
    // زوم کاربر حفظ می‌شود اگر در بازه معقول جرم مقصد است
    const keepZoom = !opts.forceZoom && camS.radius >= minRadiusFor(id) + 0.5 && camS.radius <= Math.max(30, o.size * 16);
    const toR = opts.radius || (keepZoom ? camS.radius : toRdef);
    if (reduceMotion) { // در حالت کاهش حرکت: بدون پرواز، بی‌درنگ
      bodyWorld(id, _w); camS.target.copy(_w); camS.radius = toR; camS.pan.set(0, 0, 0);
      camS.anim = null; camS.followId = id;
      if (opts.onDone) opts.onDone();
      return;
    }
    bodyWorld(id, _w);
    const dist = camS.target.distanceTo(_w);
    camS.anim = {
      id, t: 0, kind: opts.kind || "fly",
      dur: opts.dur || Math.min(1.5, 0.5 + dist * 0.006),
      from: camS.target.clone(), fromR: camS.radius, toR,
      boost: Math.min(110, dist * 0.55), // برآمدگی میان‌مسیر: پرواز از میان خورشید رد نمی‌شود
      onDone: opts.onDone || null
    };
    camS.followId = id; // هدف فعال از همین لحظه جرم جدید است (پرواز قبلی باطل)
  }
  /* ورودی دستی کاربر، پرواز را بدون پرش لغو می‌کند (تعقیب از همین‌جا ادامه می‌یابد) */
  function userInterrupt() {
    if (!camS.anim) return;
    const wasTravel = camS.anim.kind === "travel";
    camS.anim = null;
    if (wasTravel) { travelCb = null; const el2 = document.getElementById("travel"); if (el2) el2.classList.remove("open"); }
    if (camS.followOn && camS.followId && bodies[camS.followId]) {
      bodyWorld(camS.followId, _w);
      camS.pan.copy(camS.target).sub(_w); // حفظ دقیق نمای فعلی
    } else camS.followId = null;
  }
  /* به‌روزرسانی دوربین — یک‌بار در هر فریم با دلتای واقعیِ محدودشده */
  function updateCamera(rdt) {
    if (camS.anim) {
      const a = camS.anim;
      a.t += rdt / a.dur;
      const k = Math.min(1, a.t), e = easeInOutCubic(k);
      bodyWorld(a.id, _w);
      camS.target.copy(a.from).lerp(_w, e);
      camS.radius = a.fromR + (a.toR - a.fromR) * e + Math.sin(Math.PI * e) * a.boost;
      if (k >= 1) {
        const done = a.onDone; camS.anim = null; camS.pan.set(0, 0, 0);
        if (camS.followOn) camS.followId = a.id;
        if (done) done();
      }
    } else if (camS.followOn && camS.followId && bodies[camS.followId]) {
      // تعقیب انتقالی دقیق: بدون تأخیر، بدون چرخش — جرم همیشه در مرکز نگاه است
      bodyWorld(camS.followId, _w).add(camS.pan);
      camS.target.copy(_w);
    }
    camS.phi = Math.max(0.12, Math.min(1.5, camS.phi));
    camS.radius = Math.max(camMinRadius(), Math.min(420, camS.radius));
    camera.position.set(
      camS.target.x + camS.radius * Math.sin(camS.phi) * Math.cos(camS.theta),
      camS.target.y + camS.radius * Math.cos(camS.phi),
      camS.target.z + camS.radius * Math.sin(camS.phi) * Math.sin(camS.theta));
    camera.lookAt(camS.target);
    // شیفت ظریف نگاه برای کنارپنل‌نشاندن جرم (بدون تغییر در منطق تعقیب)
    camS.panelCur += (camS.panelT - camS.panelCur) * Math.min(1, rdt * 7);
    if (camS.panelCur < 0.001 && !camS.panelT) camS.panelCur = 0;
    if (camS.panelCur > 0.01 && innerWidth > 760) {
      _f.subVectors(camS.target, camera.position).normalize();
      _r.crossVectors(_f, camera.up).normalize();
      _lk.copy(camS.target).addScaledVector(_r, -camS.radius * 0.20 * camS.panelCur);
      camera.lookAt(_lk);
    }
  }

  /* ---- ورودی: چرخش/زوم/پن + لمس + کلیک ---- */
  function bindInput(el) {
    let drag = false, lx = 0, ly = 0, moved = 0, pinch = 0, downBtn = 0;
    const pointers = new Set();
    /* سازگاری با ابزارهای راستی‌آزمایی: نوشتن مستقیم = ورودی دستی کاربر */
    Scene3D.cam = {
      get theta() { return camS.theta; }, set theta(v) { userInterrupt(); camS.theta = v; },
      get phi() { return camS.phi; }, set phi(v) { userInterrupt(); camS.phi = v; },
      get radius() { return camS.radius; }, set radius(v) { userInterrupt(); camS.radius = v; },
      get target() { return camS.target; }, set target(v) { camS.target.copy(v); }
    };
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", e => {
      pointers.add(e.pointerId);
      drag = true; lx = e.clientX; ly = e.clientY; moved = 0; downBtn = e.button;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", e => {
      updateHover(e);
      if (!drag || pointers.size > 1) return; // دو انگشت = زوم، نه چرخش
      const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      userInterrupt(); // درگ کاربر، پرواز جاری را تمیز لغو می‌کند
      if (e.shiftKey || (e.buttons & 2)) {
        const s = camS.radius / 600;
        const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
        const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
        // پن هنگام تعقیب به‌صورت انحراف پایدار از جرم اعمال می‌شود (پاسخ‌گو و بدون جنگ)
        if (camS.followOn && camS.followId) { camS.pan.addScaledVector(right, -dx * s * 2); camS.pan.y += dy * s * 2; }
        else { camS.target.addScaledVector(right, -dx * s * 2); camS.target.y += dy * s * 2; }
      } else { camS.theta -= dx * 0.005; camS.phi -= dy * 0.004; }
    });
    el.addEventListener("pointerup", e => {
      const wasMulti = pointers.size > 1;
      pointers.delete(e.pointerId);
      drag = pointers.size > 0;
      // فقط کلیک اصلیِ واقعی انتخاب می‌کند: نه درگ (آستانه ۶px)، نه راست‌کلیک، نه پینچ
      if (downBtn === 0 && moved < 6 && !wasMulti) pick(e);
    });
    el.addEventListener("pointercancel", e => { pointers.delete(e.pointerId); drag = pointers.size > 0; });
    el.addEventListener("wheel", e => { e.preventDefault(); userInterrupt(); camS.radius *= (1 + Math.sign(e.deltaY) * 0.1); }, { passive: false });
    el.addEventListener("touchmove", e => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (pinch) { userInterrupt(); camS.radius *= (1 - (d - pinch) * 0.003); }
        pinch = d;
      }
    }, { passive: false });
    el.addEventListener("touchend", () => pinch = 0);
    el.addEventListener("contextmenu", e => e.preventDefault());
    addEventListener("keydown", e => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (e.key === "Escape") { onSelect && onSelect(null); }
      else if (e.key === " ") { e.preventDefault(); togglePause(); }
      else if (e.key === "ArrowLeft") { userInterrupt(); camS.theta += 0.12; }
      else if (e.key === "ArrowRight") { userInterrupt(); camS.theta -= 0.12; }
      else if (e.key === "ArrowUp") { userInterrupt(); camS.phi -= 0.08; }
      else if (e.key === "ArrowDown") { userInterrupt(); camS.phi += 0.08; }
      else if (e.key === "+" || e.key === "=") { userInterrupt(); camS.radius *= 0.9; }
      else if (e.key === "-") { userInterrupt(); camS.radius *= 1.1; }
      else if (e.key.toLowerCase() === "h" || e.key === "۰") resetView();
    });
    function updateHover(e) {
      pointer.x = (e.clientX / innerWidth) * 2 - 1; pointer.y = -(e.clientY / innerHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(Object.values(bodies).filter(o => o.group.visible).map(o => o.mesh));
      const id = hits.length ? hits[0].object.userData.id : null;
      if (id !== hovered) { hovered = id; el.style.cursor = id ? "pointer" : "grab"; onHover && onHover(id, e.clientX, e.clientY); }
      else if (id) onHover && onHover(id, e.clientX, e.clientY);
    }
    function pick(e) {
      pointer.x = (e.clientX / innerWidth) * 2 - 1; pointer.y = -(e.clientY / innerHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(Object.values(bodies).filter(o => o.group.visible).map(o => o.mesh));
      onSelect && onSelect(hits.length ? hits[0].object.userData.id : null);
    }
  }

  let lastNow = 0;
  function loop() {
    requestAnimationFrame(loop);
    // دلتای واقعی فریم با سقف ۵۰ms: برگشت از تب پس‌زمینه باعث پرش دوربین نمی‌شود
    const now = performance.now();
    const realDt = lastNow ? (now - lastNow) / 1000 : 0.016; // دلتای خام برای سنجش نرخ فریم
    let rdt = Math.min(0.05, Math.max(0.0005, realDt));
    lastNow = now;
    // فرمانرو کیفیت: هر ~۲٫۲ ثانیه بر اساس میانگین نرم نرخ فریم تصمیم می‌گیرد
    emaFps = emaFps * 0.9 + (1 / Math.max(realDt, 1e-4)) * 0.1;
    govT += realDt;
    if (govT > 2.2) {
      govT = 0;
      const fps = (typeof window.__CE_forceFps === "number") ? window.__CE_forceFps : emaFps;
      let nd = dpr;
      if (fps < 27 && dpr > 0.5) nd = Math.max(0.5, dpr - 0.25);
      else if (fps > 52 && dpr < maxDpr) nd = Math.min(maxDpr, dpr + 0.25);
      if (nd !== dpr) { dpr = nd; renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight); }
      window.__CE_QUALITY = dpr >= maxDpr - 0.01 ? 1 : (dpr >= 0.74 ? 0.75 : 0.5);
    }
    time += 0.016;
    const dt = paused ? 0 : 0.016 * simSpeed; // فیزیک مدارها — جدا از دوربین و دست‌نخورده
    animated.forEach(a => { try { a.update(time, dt); } catch (e) {} });
    Object.values(bodies).forEach(o => {
      if (o.def.id === "sun") {
        o.mesh.rotation.y += dt * SUN_SPIN;
        // تپش بسیار ظریف تاج خورشیدی
        const cb = o.group.userData.corBase, cor = o.group.userData.corona;
        if (cb && cor && !reduceMotion) cor.forEach((c, i) => c.scale.setScalar(cb[i] * (1 + Math.sin(time * 1.7 + i * 2.1) * 0.02 + Math.sin(time * 0.55 + i) * 0.012)));
        return;
      }
      o.angle += dt * o.speed * 0.25;
      positionBody(o);
      o.mesh.rotation.y += dt * o.spin; // سرعت و جهت چرخش واقعی (نسبی)
    });
    if (!paused) simDays += dt * 12;
    updateCamera(rdt); // تنها نقطه به‌روزرسانی دوربین؛ با زمان واقعی، نه سرعت شبیه‌سازی
    if (selPulse > 0.002) {
      selPulse *= Math.pow(0.94, rdt * 60);
      Object.values(bodies).forEach(o => {
        if (o.sel.visible) {
          o.sel.scale.setScalar(o.size * (1 + selPulse * 0.22));
          o.sel.material.opacity = 0.6 + 0.3 * (1 - selPulse);
        }
      });
    }
    Object.values(bodies).forEach(o => {
      const d = camera.position.distanceTo(o.group.position);
      const s = Math.max(2.4, Math.min(8, d * 0.055));
      o.label.scale.set(s, s * 0.25, 1);
      o.label.visible = labelsOn && o.group.visible && d < 500;
      o.label.material.opacity = (selected && selected !== o.def.id && d > 60) ? 0.55 : 0.95;
    });
    renderer.render(scene, camera);
  }

  /* ---- API (بدون تغییر) ---- */
  let selPulse = 0;
  function select(id, opts) {
    selected = id;
    Object.values(bodies).forEach(o => o.sel.visible = (o.def.id === id));
    if (id && bodies[id]) {
      if (!opts || !opts.nofly) flyTo(id); // پرواز هموار؛ جایگزینی تمیز پرواز قبلی
      else camS.followId = id;
      if (!reduceMotion) selPulse = 1;   // پالس ظریف نشانگر انتخاب
    } else { camS.followId = null; camS.anim = null; }
  }
  function resetView() {
    camS.anim = null; travelCb = null; camS.followId = null; camS.pan.set(0, 0, 0);
    selected = null;
    Object.values(bodies).forEach(o => o.sel.visible = false);
    camS.target.set(0, 0, 0); camS.theta = HOME.theta; camS.phi = HOME.phi; camS.radius = HOME.radius;
    const el2 = document.getElementById("travel"); if (el2) el2.classList.remove("open");
    onSelect && onSelect(null, true);
  }
  function focusSelected() { if (selected && bodies[selected]) flyTo(selected, {}); }
  function togglePause() { paused = !paused; return paused; }
  function isPaused() { return paused; }
  function setSpeed(v) { simSpeed = v; }
  function getSpeed() { return simSpeed; }
  function getDays() { return simDays; }
  function setLabels(v) { labelsOn = v; }
  function updateOrbitVis() {
    Object.entries(orbits).forEach(([id, l]) => {
      const dwarf = bodies[id] && bodies[id].def.dwarf;
      l.visible = orbitsOn && (dwarfsOn || !dwarf);
    });
  }
  function setOrbits(v) { orbitsOn = v; updateOrbitVis(); }
  function setSizeScale(v) { sizeScale = v; layout(); }
  function setDistScale(v) { distScale = v; layout(); }
  function setMode(m) { mode = m; layout(); }
  function getMode() { return mode; }
  function setDwarfs(v) {
    dwarfsOn = v;
    Object.values(bodies).forEach(o => { if (o.def.dwarf) o.group.visible = v; });
    updateOrbitVis();
  }
  function setReduceMotion(v) { reduceMotion = v; if (v) simSpeed = Math.min(simSpeed, 1); }
  function setShadows(v) {
    shadowsOn = v;
    if (renderer) renderer.shadowMap.enabled = v;
    if (sunLight) sunLight.castShadow = v;
    if (scene) scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }
  function applyShadowFlag() { if (renderer && !shadowsOn) { renderer.shadowMap.enabled = false; sunLight.castShadow = false; } }
  function visibleIds() { return Object.values(bodies).filter(o => o.group.visible).map(o => o.def.id); }

  /* سفر کیهانی: همان پرواز هموار با مدت طولانی‌تر و گزارش پیشرفت */
  function travelTo(id, cb) {
    if (!bodies[id]) return;
    const o = bodies[id];
    if (o.def.dwarf && !dwarfsOn) setDwarfs(true);
    travelCb = cb || null;
    select(id, { nofly: true }); // انتخاب/هایلایت فوری؛ پرواز فقط یک‌بار از اینجا شروع می‌شود
    flyTo(id, {
      dur: 2.4, forceZoom: true, radius: Math.max(6, o.size * 5), kind: "travel",
      onDone: () => { const f = travelCb; travelCb = null; if (f) f(); }
    });
  }
  function cancelTravel() {
    if (camS.anim && camS.anim.kind === "travel") {
      camS.anim = null; travelCb = null; camS.followId = null; // توقف کامل؛ دوربین آزاد می‌ماند
    }
    const e = document.getElementById("travel"); if (e) e.classList.remove("open");
  }
  function isTraveling() { return !!(camS.anim && camS.anim.kind === "travel"); }
  function travelProgress() { return (camS.anim && camS.anim.kind === "travel") ? Math.min(1, camS.anim.t) : 0; }
  /* حالت تعقیب: روشن = دوربین انتقال مداری جرم را دنبال می‌کند (بدون چرخش)؛
     خاموش = دوربین آزاد. تعویض حالت هرگز نمای فعلی را ریست نمی‌کند. */
  function setFollow(v) {
    camS.followOn = !!v;
    if (camS.followOn && selected && bodies[selected]) {
      camS.followId = selected;
      bodyWorld(selected, _w);
      camS.pan.copy(camS.target).sub(_w); // حفظ دقیق نمای فعلی
    } else if (!camS.followOn) camS.followId = null;
  }
  function getFollow() { return camS.followOn; }
  function setPanelOpen(v) { camS.panelT = v ? 1 : 0; }
  /* وضعیت دوربین برای راستی‌آزمایی (فقط خواندنی) */
  function getCamInfo() {
    return {
      theta: +camS.theta.toFixed(4), phi: +camS.phi.toFixed(4), radius: +camS.radius.toFixed(3),
      target: [+camS.target.x.toFixed(3), +camS.target.y.toFixed(3), +camS.target.z.toFixed(3)],
      pos: camera ? camera.position.toArray().map(v => +v.toFixed(3)) : null,
      followId: camS.followId, followOn: camS.followOn, anim: camS.anim ? camS.anim.kind : null,
      quat: camera ? camera.quaternion.toArray().map(v => +v.toFixed(5)) : null
    };
  }
  /* خواندن چیدمان فعلی برای راستی‌آزمایی و شفافیت مقیاس */
  function getLayoutInfo() {
    const out = { mode };
    Object.values(bodies).forEach(o => { out[o.def.id] = { size: +o.size.toFixed(2), dist: +o.dist.toFixed(2), angle: +o.angle.toFixed(3) }; });
    return out;
  }
  /* وضعیت بارگذاری بافت‌ها برای راستی‌آزمایی (فقط خواندنی) */
  function getTextureStatus() {
    const out = {};
    Object.values(bodies).forEach(o => {
      const m = o.mesh.material, info = {};
      const img = (t) => t && t.image ? (t.image.width || 0) + "x" + (t.image.height || 0) : (t ? "pending" : "none");
      if (m.uniforms) { Object.keys(m.uniforms).forEach(k => { const v = m.uniforms[k].value; if (v && v.isTexture) info[k] = img(v); }); }
      else info.map = img(m.map);
      if (o.group.userData.clouds) info.clouds = img(o.group.userData.clouds.material.map);
      out[o.def.id] = info;
    });
    return out;
  }
  /* مختصات صفحه‌ای جرم برای راستی‌آزمایی هم‌ترازی دوربین/پنل (فقط خواندنی) */
  function getScreenPos(id) {
    if (!camera || !bodies[id]) return null;
    const v = new THREE.Vector3();
    bodies[id].mesh.getWorldPosition(v);
    v.project(camera);
    return { x: +v.x.toFixed(3), y: +v.y.toFixed(3) };
  }
  /* ری‌کست در مختصات NDC برای راستی‌آزمایی مسیر انتخاب (فقط خواندنی) */
  function dbgHit(nx, ny) {
    if (!camera || !raycaster) return null;
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const hits = raycaster.intersectObjects(Object.values(bodies).filter(o => o.group.visible).map(o => o.mesh));
    return hits.length ? hits[0].object.userData.id : null;
  }

  function getPixelRatio() { return dpr; }
  function getCounts() {
    const cor = bodies.sun && bodies.sun.group.userData.corona;
    return { bodies: Object.keys(bodies).length, stars: starCount, coronaScale: cor ? +cor[0].scale.x.toFixed(5) : 0, dpr };
  }
  return { init, select, resetView, focusSelected, togglePause, isPaused, setSpeed, getSpeed, getDays, setLabels, setOrbits, setSizeScale, setDistScale, setMode, getMode, setDwarfs, setReduceMotion, setShadows, visibleIds, travelTo, cancelTravel, isTraveling, travelProgress, setFollow, getFollow, setPanelOpen, getCamInfo, getLayoutInfo, getTextureStatus, getScreenPos, dbgHit, getPixelRatio, getCounts };
})();
