// Живая сцена «Зона»: заброшенный город в тумане, колесо обозрения, станция с трубой на горизонте,
// ржавый забор, знак радиации, вороньё, электрическая аномалия в поле, редкий «выброс» и сигнальные ракеты.
// Рисуется на <canvas> без картинок. Интерфейс прежний: new WarScene.Scene(canvas), window.WarScenePaused.
window.WarScene = (() => {
  const rand = (a, b) => a + Math.random() * (b - a);
  const RED = [255, 80, 50], GREEN = [120, 255, 90];

  // детерминированный ГСЧ: город не «перестраивается» при изменении размера
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  class Scene {
    constructor(canvas, opts = {}) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.opts = opts;
      this.t = 0;
      this.crows = [];
      this.flares = [];
      this.sparks = [];
      this.dust = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), s: rand(.4, 1.6), v: rand(.004, .018), p: rand(0, 6) }));
      this.clouds = Array.from({ length: 9 }, (_, i) => ({ x: Math.random(), y: rand(.02, .32), w: rand(.25, .55), h: rand(.06, .14), v: rand(.002, .006) * (i % 2 ? 1 : .7), a: rand(.18, .35) }));
      this.nextCrow = 1; this.nextFlare = 2.5; this.nextArc = 1.5; this.emission = 0; this.nextEmission = rand(18, 35);
      this.arc = null;
      this.resize = this.resize.bind(this);
      this.loop = this.loop.bind(this);
      new ResizeObserver(this.resize).observe(canvas);
      this.resize();
      this.last = performance.now();
      requestAnimationFrame(this.loop);
    }

    resize() {
      const r = this.c.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = Math.max(1, r.width);
      this.h = Math.max(1, r.height);
      this.dpr = dpr;
      this.c.width = Math.round(this.w * dpr);
      this.c.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.layout();
    }

    // статичные слои рисуем один раз в отдельные холсты
    layer(draw) {
      const cv = document.createElement('canvas');
      cv.width = this.c.width; cv.height = this.c.height;
      const g = cv.getContext('2d');
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      draw(g, this.w, this.h);
      return cv;
    }

    layout() {
      const W = this.w, H = this.h;
      this.horizon = H * 0.66;
      this.far = this.layer((g) => this.drawFar(g, W, H));
      this.city = this.layer((g) => this.drawCity(g, W, H));
      this.near = this.layer((g) => this.drawNear(g, W, H));
      this.wheel = { x: W * 0.69, y: this.horizon - H * 0.2, r: Math.min(W * 0.075, H * 0.2) };
    }

    // ---------- дальний план: станция и радар ----------
    drawFar(g, W, H) {
      const hz = this.horizon, base = '#4a4a3e';
      g.fillStyle = base;
      // корпус станции
      const sx = W * 0.12;
      g.fillRect(sx, hz - H * 0.15, W * 0.13, H * 0.15);
      g.fillRect(sx + W * 0.03, hz - H * 0.19, W * 0.05, H * 0.05);
      g.fillRect(sx + W * 0.13, hz - H * 0.1, W * 0.07, H * 0.1);
      g.fillStyle = 'rgba(0,0,0,.12)';
      for (let k = 0; k < 9; k++) g.fillRect(sx + 4 + k * W * 0.014, hz - H * 0.14, 2, H * 0.12);
      g.fillStyle = base;
      // вентиляционная труба в полоску
      const tx = sx + W * 0.095, tw = Math.max(4, W * 0.009), th = H * 0.36;
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#6a5a4a' : '#585346';
        g.fillRect(tx - tw / 2, hz - H * 0.19 - th * (i + 1) / 8, tw, th / 8 + 0.5);
      }
      g.strokeStyle = base; g.lineWidth = 0.7;
      for (let i = 0; i < 4; i++) {   // растяжки фермы трубы
        g.beginPath(); g.moveTo(tx - tw * 1.6, hz - H * 0.19 - th * i / 4); g.lineTo(tx + tw * 1.6, hz - H * 0.19 - th * (i + 1) / 4); g.stroke();
        g.beginPath(); g.moveTo(tx + tw * 1.6, hz - H * 0.19 - th * i / 4); g.lineTo(tx - tw * 1.6, hz - H * 0.19 - th * (i + 1) / 4); g.stroke();
      }
      // линии электропередачи
      g.strokeStyle = 'rgba(60,60,50,.8)'; g.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        const px = W * (0.3 + k * 0.18), ph = H * 0.12;
        g.beginPath(); g.moveTo(px, hz); g.lineTo(px - 6, hz - ph); g.moveTo(px, hz); g.lineTo(px + 6, hz - ph);
        g.moveTo(px - 12, hz - ph + 3); g.lineTo(px + 12, hz - ph + 3); g.stroke();
        if (k < 3) { g.beginPath(); g.moveTo(px + 12, hz - ph + 3); g.quadraticCurveTo(px + W * 0.09, hz - ph + 14, px + W * 0.18 - 12, hz - ph + 3); g.stroke(); }
      }
      // антенное поле на горизонте справа
      g.strokeStyle = 'rgba(70,70,58,.85)'; g.lineWidth = 0.8;
      const ax = W * 0.84, aw = W * 0.15, ah = H * 0.16;
      for (let i = 0; i <= 14; i++) { const x = ax + aw * i / 14; g.beginPath(); g.moveTo(x, hz); g.lineTo(x, hz - ah * (0.55 + 0.45 * Math.sin(i / 14 * Math.PI))); g.stroke(); }
      for (let j = 1; j < 6; j++) { g.beginPath(); g.moveTo(ax, hz - ah * 0.5 * j / 6); g.lineTo(ax + aw, hz - ah * 0.5 * j / 6); g.stroke(); }
    }

    // ---------- город: панельки с пустыми окнами ----------
    drawCity(g, W, H) {
      const r = rng(1986), hz = this.horizon;
      let x = -10;
      while (x < W + 10) {
        const tall = r() < 0.45;
        const w = tall ? rand2(r, 34, 60) : rand2(r, 50, 110);
        let h = tall ? rand2(r, H * 0.3, H * 0.44) : rand2(r, H * 0.14, H * 0.24);
        if (x + w > W * 0.06 && x < W * 0.32) h = Math.min(h, H * 0.1);   // здесь видна станция
        const near = r() < 0.5;
        const col = near ? '#2b2c24' : '#37372d';
        const y = hz - h + (near ? H * 0.04 : 0);
        g.fillStyle = col; g.fillRect(x, y, w, h + H * 0.1);
        // швы панелей
        g.fillStyle = 'rgba(0,0,0,.18)';
        for (let fy = y + 6; fy < hz; fy += 7) g.fillRect(x, fy, w, 1);
        // окна: тёмные, иногда выбитые, единичные огоньки
        for (let fy = y + 3; fy < hz + H * 0.04 - 4; fy += 7) {
          for (let fx = x + 3; fx < x + w - 4; fx += 6) {
            const v = r();
            g.fillStyle = v < 0.012 ? 'rgba(214,170,90,.75)' : v < 0.35 ? 'rgba(10,10,8,.75)' : 'rgba(20,20,16,.45)';
            g.fillRect(fx, fy, 3, 3);
          }
        }
        // рамка-надпись на крыше высотки
        if (tall && r() < 0.5) {
          g.strokeStyle = col; g.lineWidth = 1;
          const lw = w * 0.8, lx = x + w * 0.1, ly = y - 9;
          g.strokeRect(lx, ly, lw, 7);
          for (let i = 0; i < 6; i++) g.fillRect(lx + 2 + i * lw / 6, ly + 1, lw / 9, 5);
        }
        x += w + rand2(r, -6, 10);
      }
      // деревья, которые заросли город
      for (let i = 0; i < 70; i++) {
        const tx = r() * W, th = rand2(r, H * 0.04, H * 0.12);
        g.fillStyle = r() < 0.5 ? '#1f241a' : '#262a1e';
        g.beginPath(); g.ellipse(tx, hz + H * 0.03, th * 0.55, th, 0, 0, Math.PI * 2); g.fill();
      }
    }

    // ---------- передний план: земля, забор, знак ----------
    drawNear(g, W, H) {
      const hz = this.horizon, r = rng(404);
      const grd = g.createLinearGradient(0, hz, 0, H);
      grd.addColorStop(0, '#2a2a1f'); grd.addColorStop(1, '#14140f');
      g.fillStyle = grd; g.fillRect(0, hz + H * 0.05, W, H);
      // трава
      g.strokeStyle = 'rgba(80,78,52,.8)'; g.lineWidth = 1;
      for (let i = 0; i < W * 0.8; i++) {
        const gx = r() * W, gy = hz + H * 0.07 + r() * H * 0.3, gh = rand2(r, 3, 10);
        g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + rand2(r, -2, 2), gy - gh); g.stroke();
      }
      // ржавый забор с колючкой
      const fy = H * 0.86;
      g.fillStyle = '#18150f';
      for (let px = -5; px < W + 20; px += Math.max(48, W / 16)) g.fillRect(px, fy - H * 0.2, 3, H * 0.25);
      g.strokeStyle = 'rgba(70,52,34,.85)'; g.lineWidth = 0.8;
      for (let i = 0; i < 26; i++) { const x0 = i * W / 22 - 20; g.beginPath(); g.moveTo(x0, fy - H * 0.19); g.lineTo(x0 + W / 22, fy + H * 0.02); g.moveTo(x0 + W / 22, fy - H * 0.19); g.lineTo(x0, fy + H * 0.02); g.stroke(); }
      g.strokeStyle = '#120f0b'; g.lineWidth = 1.2;
      for (const off of [0.2, 0.17]) { g.beginPath(); for (let x2 = 0; x2 <= W; x2 += 8) g.lineTo(x2, fy - H * off + Math.sin(x2 * 0.3) * 1.2); g.stroke(); }
      for (let x2 = 4; x2 < W; x2 += 9) { g.beginPath(); g.moveTo(x2 - 2, fy - H * 0.2 - 2); g.lineTo(x2 + 2, fy - H * 0.2 + 2); g.moveTo(x2 + 2, fy - H * 0.2 - 2); g.lineTo(x2 - 2, fy - H * 0.2 + 2); g.stroke(); }
      // знак радиации на столбе
      const sx = W * 0.9, sy = fy - H * 0.3, s = Math.min(26, H * 0.11);
      g.fillStyle = '#16120c'; g.fillRect(sx - 1.5, sy, 3, H * 0.42);
      g.save(); g.translate(sx, sy); g.rotate(-0.08);
      g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 1.05, s * 0.75); g.lineTo(-s * 1.05, s * 0.75); g.closePath();
      g.fillStyle = '#b8901f'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#1a140a'; g.stroke();
      g.fillStyle = '#1a140a';
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + k * Math.PI * 2 / 3 + Math.PI;
        g.beginPath(); g.moveTo(0, s * 0.2); g.arc(0, s * 0.2, s * 0.48, a - 0.5, a + 0.5); g.closePath(); g.fill();
      }
      g.fillStyle = '#b8901f'; g.beginPath(); g.arc(0, s * 0.2, s * 0.12, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1a140a'; g.beginPath(); g.arc(0, s * 0.2, s * 0.08, 0, Math.PI * 2); g.fill();
      // ржавые потёки
      g.fillStyle = 'rgba(90,45,15,.55)';
      for (let k = 0; k < 6; k++) g.fillRect(-s * 0.7 + k * s * 0.26, s * 0.4, 1.5, s * rand2(r, 0.15, 0.4));
      g.restore();
    }

    loop(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!document.hidden && !window.WarScenePaused && this.w > 2) { this.update(dt); this.draw(); }
      requestAnimationFrame(this.loop);
    }

    update(dt) {
      this.t += dt;
      const W = this.w, H = this.h;
      for (const c of this.clouds) { c.x += c.v * dt * 6; if (c.x - c.w > 1.1) c.x = -c.w; }
      for (const d of this.dust) { d.x += d.v * dt * 3; d.y += Math.sin(this.t * 0.5 + d.p) * 0.0006; if (d.x > 1.02) d.x = -0.02; }
      // вороньё
      if ((this.nextCrow -= dt) <= 0) {
        this.nextCrow = rand(4, 9);
        const n = 3 + Math.floor(Math.random() * 5), dir = Math.random() < 0.5 ? 1 : -1, y = rand(0.12, 0.42) * H;
        for (let i = 0; i < n; i++) this.crows.push({ x: dir > 0 ? -20 - i * rand(8, 20) : W + 20 + i * rand(8, 20), y: y + rand(-14, 14), v: dir * rand(28, 42), p: rand(0, 6), s: rand(0.8, 1.3) });
      }
      for (const c of this.crows) { c.x += c.v * dt; c.p += dt * 8; c.y += Math.sin(this.t + c.p * 0.1) * 0.15; }
      this.crows = this.crows.filter(c => c.x > -60 && c.x < W + 60);
      // сигнальные ракеты: красные и зелёные
      if ((this.nextFlare -= dt) <= 0) {
        this.nextFlare = rand(3, 7);
        const left = Math.random() < 0.5;
        this.flares.push({ x: left ? rand(0.05, 0.35) * W : rand(0.65, 0.95) * W, y: this.horizon + 4, vx: (left ? 1 : -1) * rand(4, 14), vy: -rand(H * 0.55, H * 0.75), col: Math.random() < 0.6 ? RED : GREEN, life: 0, trail: [] });
      }
      for (const f of this.flares) {
        f.life += dt; f.trail.push([f.x, f.y]); if (f.trail.length > 40) f.trail.shift();
        f.x += f.vx * dt; f.y += f.vy * dt; f.vy += H * 0.55 * dt;
        if (f.vy > 0) f.vy = Math.min(f.vy, H * 0.05);   // повисла на парашюте
      }
      this.flares = this.flares.filter(f => f.life < 7);
      // электрическая аномалия в поле
      if ((this.nextArc -= dt) <= 0) {
        this.nextArc = rand(1.2, 3.5);
        this.arc = { x: W * rand(0.35, 0.6), y: this.horizon + H * rand(0.08, 0.16), life: 0.35 };
        for (let i = 0; i < 10; i++) this.sparks.push({ x: this.arc.x, y: this.arc.y, vx: rand(-60, 60), vy: rand(-80, -10), life: rand(0.3, 0.7) });
      }
      if (this.arc && (this.arc.life -= dt) <= 0) this.arc = null;
      for (const s of this.sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 160 * dt; s.life -= dt; }
      this.sparks = this.sparks.filter(s => s.life > 0);
      // выброс: небо наливается красным и вспыхивает
      if ((this.nextEmission -= dt) <= 0) { this.emission = 6; this.nextEmission = rand(28, 50); }
      if (this.emission > 0) this.emission -= dt;
    }

    draw() {
      const g = this.ctx, W = this.w, H = this.h, hz = this.horizon, t = this.t;
      const em = this.emission > 0 ? Math.sin(Math.min(1, (6 - this.emission) / 6) * Math.PI) : 0;
      // небо
      const sky = g.createLinearGradient(0, 0, 0, hz);
      sky.addColorStop(0, mix([46, 46, 36], [70, 22, 16], em));
      sky.addColorStop(0.6, mix([92, 86, 64], [150, 50, 26], em));
      sky.addColorStop(1, mix([150, 132, 92], [200, 90, 40], em));
      g.fillStyle = sky; g.fillRect(0, 0, W, hz + 2);
      // облака
      for (const c of this.clouds) {
        const cx = c.x * W, cy = c.y * H, cw = c.w * W, ch = c.h * H;
        const rg = g.createRadialGradient(cx, cy, 0, cx, cy, cw / 2);
        rg.addColorStop(0, `rgba(${em > 0.3 ? '110,40,30' : '40,40,32'},${c.a})`); rg.addColorStop(1, 'rgba(40,40,32,0)');
        g.fillStyle = rg; g.save(); g.translate(cx, cy); g.scale(1, ch / cw * 2); g.translate(-cx, -cy);
        g.beginPath(); g.arc(cx, cy, cw / 2, 0, Math.PI * 2); g.fill(); g.restore();
      }
      // вспышки молний во время выброса
      if (em > 0.4 && Math.random() < 0.06) { g.fillStyle = `rgba(255,220,190,${rand(0.15, 0.35)})`; g.fillRect(0, 0, W, hz); }
      // тусклое солнце в дымке
      const sun = g.createRadialGradient(W * 0.42, hz * 0.55, 0, W * 0.42, hz * 0.55, H * 0.35);
      sun.addColorStop(0, 'rgba(255,230,170,.22)'); sun.addColorStop(1, 'rgba(255,230,170,0)');
      g.fillStyle = sun; g.fillRect(0, 0, W, hz);
      g.drawImage(this.far, 0, 0, W, H);
      // дымка между планами
      const haze = g.createLinearGradient(0, hz - H * 0.25, 0, hz);
      haze.addColorStop(0, 'rgba(140,128,96,0)'); haze.addColorStop(1, 'rgba(140,128,96,.45)');
      g.fillStyle = haze; g.fillRect(0, hz - H * 0.25, W, H * 0.25);
      this.drawWheel(g);
      g.drawImage(this.city, 0, 0, W, H);
      // туман стелется над городом
      for (let i = 0; i < 3; i++) {
        const fy = hz + H * (0.02 + i * 0.035), off = (t * (6 + i * 4)) % W;
        const fg = g.createLinearGradient(0, fy - 12, 0, fy + 12);
        fg.addColorStop(0, 'rgba(120,115,90,0)'); fg.addColorStop(0.5, `rgba(120,115,90,${0.22 - i * 0.05})`); fg.addColorStop(1, 'rgba(120,115,90,0)');
        g.fillStyle = fg;
        for (let k = -1; k < 2; k++) g.fillRect(k * W + off, fy - 12, W * 0.7, 24);
      }
      // сигнальные ракеты
      for (const f of this.flares) {
        const a = Math.max(0, 1 - f.life / 7);
        g.strokeStyle = `rgba(200,200,190,${0.25 * a})`; g.lineWidth = 2; g.beginPath();
        f.trail.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        const glow = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, 26);
        glow.addColorStop(0, `rgba(${f.col},${0.9 * a})`); glow.addColorStop(1, `rgba(${f.col},0)`);
        g.fillStyle = glow; g.beginPath(); g.arc(f.x, f.y, 26, 0, Math.PI * 2); g.fill();
        g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(f.x - 1.5, f.y - 1.5, 3, 3);
      }
      // вороньё
      g.strokeStyle = '#141410'; g.lineWidth = 1.4;
      for (const c of this.crows) {
        const wy = Math.sin(c.p) * 3 * c.s, s = 5 * c.s;
        g.beginPath(); g.moveTo(c.x - s, c.y - wy); g.lineTo(c.x, c.y); g.lineTo(c.x + s, c.y - wy); g.stroke();
      }
      g.drawImage(this.near, 0, 0, W, H);
      // аномалия
      if (this.arc) {
        const { x, y } = this.arc;
        const ag = g.createRadialGradient(x, y, 0, x, y, 40);
        ag.addColorStop(0, 'rgba(180,210,255,.55)'); ag.addColorStop(1, 'rgba(180,210,255,0)');
        g.fillStyle = ag; g.beginPath(); g.arc(x, y, 40, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(225,240,255,.9)'; g.lineWidth = 1.2;
        for (let k = 0; k < 3; k++) {
          g.beginPath(); let px = x, py = y; g.moveTo(px, py);
          for (let s = 0; s < 6; s++) { px += rand(-9, 9); py -= rand(2, 8); g.lineTo(px, py); }
          g.stroke();
        }
      }
      g.fillStyle = 'rgba(210,230,255,.9)';
      for (const s of this.sparks) g.fillRect(s.x, s.y, 1.5, 1.5);
      // пыль и пепел
      for (const d of this.dust) {
        g.fillStyle = `rgba(210,200,170,${0.25 + 0.2 * Math.sin(t * 2 + d.p)})`;
        g.fillRect(d.x * W, d.y * H, d.s, d.s);
      }
      // красная пелена выброса и виньетка
      if (em > 0) { g.fillStyle = `rgba(150,30,10,${0.18 * em})`; g.fillRect(0, 0, W, H); }
      const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
    }

    // колесо обозрения: стоит, кабинки чуть качаются на ветру
    drawWheel(g) {
      const { x, y, r } = this.wheel, t = this.t, col = '#3c3b31';
      g.strokeStyle = col; g.lineWidth = 1.6;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 0.9; g.beginPath(); g.arc(x, y, r * 0.93, 0, Math.PI * 2); g.stroke();
      const n = 20;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke();
      }
      g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - r * 0.55, this.horizon + 2); g.moveTo(x, y); g.lineTo(x + r * 0.55, this.horizon + 2); g.stroke();
      g.fillStyle = col;
      for (let i = 0; i < n; i += 2) {
        const a = i / n * Math.PI * 2, cx = x + Math.cos(a) * r, cy = y + Math.sin(a) * r;
        const sw = Math.sin(t * 0.9 + i) * 0.12;
        g.save(); g.translate(cx, cy); g.rotate(sw);
        g.fillRect(-r * 0.06, 2, r * 0.12, r * 0.1);
        g.fillStyle = '#c9a032'; g.globalAlpha = 0.35; g.fillRect(-r * 0.06, 2, r * 0.12, r * 0.03); g.globalAlpha = 1; g.fillStyle = col;
        g.restore();
      }
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    }
  }

  function rand2(r, a, b) { return a + r() * (b - a); }
  function mix(a, b, k) { return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`; }

  return { Scene };
})();
