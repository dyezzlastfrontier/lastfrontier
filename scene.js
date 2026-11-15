// Живая сцена: склады Озона и ВБ ночью, прожекторы, иногда прилетает ракета или шахед.
// Рисуется на <canvas>, без картинок и библиотек.
window.WarScene = (() => {
  const OZON = '#1f6bff', WB = '#b02bd6';
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  class Scene {
    constructor(canvas, opts = {}) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.opts = { labels: true, ...opts };
      this.parts = [];       // частицы (дым, огонь, обломки)
      this.shots = [];       // летящие ракеты/шахеды
      this.tracers = [];     // очереди ПВО
      this.flashes = [];     // вспышки
      this.scorch = [];      // подпалины на крышах
      this.shake = 0;
      this.t = 0;
      this.nextShot = 1.2;
      this.stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.55, r: Math.random() * 1.2 + 0.3, p: Math.random() * 6 }));
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
      this.c.width = Math.round(this.w * dpr);
      this.c.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.layout();
    }

    layout() {
      const { w, h } = this;
      this.ground = h * 0.86;
      const ww = Math.min(w * 0.36, 380), wh = Math.min(h * 0.38, 115);
      this.houses = [
        { name: 'ОЗОН', color: OZON, x: w * 0.06, w: ww, h: wh },
        { name: 'ВБ', color: WB, x: w * 0.94 - ww, w: ww, h: wh },
      ];
      for (const s of this.houses) { s.y = this.ground - s.h; s.hit = 0; }
      // дальний город
      this.skyline = [];
      let x = 0;
      while (x < w) { const bw = rand(18, 50); this.skyline.push({ x, w: bw, h: rand(10, h * 0.22) }); x += bw + rand(2, 8); }
    }

    // ---------------- снаряды ----------------
    spawn() {
      const target = pick(this.houses);
      const tx = target.x + rand(0.15, 0.85) * target.w;
      const ty = target.y + 4;
      const fromLeft = target === this.houses[1] ? Math.random() < 0.8 : Math.random() < 0.2;
      const type = Math.random() < 0.55 ? 'rocket' : 'shahed';
      const intercept = Math.random() < 0.25;
      if (type === 'rocket') {
        const sx = fromLeft ? -20 : this.w + 20;
        const sy = rand(this.h * 0.32, this.h * 0.45);
        this.shots.push({ type, sx, sy, tx, ty, t: 0, dur: rand(1.8, 2.6), arc: rand(20, 45), target, intercept, ix: rand(0.6, 0.78) });
      } else {
        const sx = fromLeft ? -30 : this.w + 30;
        const sy = rand(this.h * 0.36, this.h * 0.46);
        this.shots.push({ type, sx, sy, tx, ty, t: 0, dur: rand(4, 5.5), target, intercept, ix: rand(0.55, 0.72), dir: fromLeft ? 1 : -1 });
      }
    }

    shotPos(s, t) {
      const k = Math.min(1, t / s.dur);
      if (s.type === 'rocket') {
        const x = s.sx + (s.tx - s.sx) * k;
        const y = s.sy + (s.ty - s.sy) * k * k - Math.sin(k * Math.PI) * s.arc * 0.3;
        return { x, y, k };
      }
      // шахед: летит почти горизонтально, в конце пикирует
      const cruise = 0.78;
      if (k < cruise) {
        const kk = k / cruise;
        const x = s.sx + (s.tx - s.sx) * kk;
        const y = s.sy + Math.sin(this.t * 3 + s.sx) * 2;
        return { x, y, k };
      }
      const kk = (k - cruise) / (1 - cruise);
      return { x: s.tx, y: s.sy + (s.ty - s.sy) * kk * kk, k, dive: true };
    }

    explode(x, y, big, house) {
      this.flashes.push({ x, y, r: big ? 140 : 70, life: big ? 0.35 : 0.25, max: big ? 0.35 : 0.25 });
      this.shake = Math.max(this.shake, big ? 6 : 2);
      const n = big ? 60 : 25;
      for (let i = 0; i < n; i++) {
        const a = rand(Math.PI * 1.05, Math.PI * 1.95), v = rand(40, big ? 220 : 120);
        this.parts.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.4, 1.1), max: 1.1, r: rand(1, 2.4) });
      }
      for (let i = 0; i < (big ? 26 : 10); i++) {
        this.parts.push({ kind: 'fire', x: x + rand(-14, 14), y: y + rand(-6, 4), vx: rand(-15, 15), vy: rand(-50, -15), life: rand(0.5, 1.2), max: 1.2, r: rand(6, big ? 18 : 10) });
      }
      for (let i = 0; i < (big ? 18 : 8); i++) {
        this.parts.push({ kind: 'smoke', x: x + rand(-18, 18), y: y + rand(-10, 0), vx: rand(-6, 10), vy: rand(-28, -10), life: rand(3, 6), max: 6, r: rand(10, big ? 30 : 18) });
      }
      if (house) {
        house.hit = 1;
        this.scorch.push({ house, x: x - house.x, life: 18, max: 18, smokeT: 0 });
      }
    }

    // ---------------- цикл ----------------
    loop(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!document.hidden && this.w > 2) { this.update(dt); this.draw(); }
      requestAnimationFrame(this.loop);
    }

    update(dt) {
      this.t += dt;
      this.nextShot -= dt;
      if (this.nextShot <= 0) { this.spawn(); this.nextShot = rand(3.5, 7); }

      for (const s of this.shots) {
        s.t += dt;
        const p = this.shotPos(s, s.t);
        s.x = p.x; s.y = p.y; s.dive = p.dive;
        // след
        if (Math.random() < (s.type === 'rocket' ? 0.9 : 0.25))
          this.parts.push({ kind: s.type === 'rocket' ? 'trail' : 'haze', x: p.x, y: p.y, vx: rand(-4, 4), vy: rand(-6, 2), life: s.type === 'rocket' ? 1.2 : 0.6, max: 1.2, r: rand(2, 4) });
        // ПВО
        if (s.intercept && !s.firing && p.k > s.ix - 0.25) {
          s.firing = true;
          const src = s.target;
          this.tracers.push({ x: src.x + src.w * 0.5, y: src.y - 4, s, life: 0.9 });
        }
        if (s.intercept && p.k >= s.ix) { s.dead = true; this.explode(p.x, p.y, false); }
        else if (p.k >= 1) { s.dead = true; this.explode(s.tx, s.ty, true, s.target); }
      }
      this.shots = this.shots.filter(s => !s.dead);

      for (const tr of this.tracers) tr.life -= dt;
      this.tracers = this.tracers.filter(t => t.life > 0);

      for (const p of this.parts) {
        p.life -= dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.kind === 'spark') p.vy += 260 * dt;
        if (p.kind === 'smoke') { p.r += 6 * dt; p.vx += 2 * dt; }
        if (p.kind === 'fire') p.r *= 0.985;
      }
      this.parts = this.parts.filter(p => p.life > 0);
      if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);

      for (const f of this.flashes) f.life -= dt;
      this.flashes = this.flashes.filter(f => f.life > 0);

      for (const sc of this.scorch) {
        sc.life -= dt;
        sc.smokeT -= dt;
        if (sc.smokeT <= 0 && sc.life > 4) {
          sc.smokeT = rand(0.15, 0.4);
          const h = sc.house;
          this.parts.push({ kind: 'smoke', x: h.x + sc.x + rand(-6, 6), y: h.y, vx: rand(-2, 8), vy: rand(-22, -12), life: rand(3, 5), max: 5, r: rand(6, 12) });
          if (Math.random() < 0.8) this.parts.push({ kind: 'fire', x: h.x + sc.x + rand(-6, 6), y: h.y + 2, vx: rand(-4, 4), vy: rand(-34, -14), life: rand(0.4, 0.9), max: 0.9, r: rand(5, 11) * (0.4 + 0.6 * sc.life / sc.max) });
        }
      }
      this.scorch = this.scorch.filter(s => s.life > 0);
      for (const h of this.houses) h.hit = Math.max(0, h.hit - dt * 2);
      this.shake = Math.max(0, this.shake - dt * 18);
    }

    // ---------------- рисование ----------------
    draw() {
      const { ctx, w, h } = this;
      ctx.save();
      if (this.shake > 0) ctx.translate(rand(-this.shake, this.shake), rand(-this.shake, this.shake));

      // небо
      const sky = ctx.createLinearGradient(0, 0, 0, this.ground);
      sky.addColorStop(0, '#05070d');
      sky.addColorStop(1, '#161a22');
      ctx.fillStyle = sky;
      ctx.fillRect(-10, -10, w + 20, h + 20);
      // цветное зарево фракций
      for (const [x, col] of [[0, OZON], [w, WB]]) {
        const g = ctx.createRadialGradient(x, this.ground, 0, x, this.ground, w * 0.55);
        g.addColorStop(0, col + '40'); g.addColorStop(1, col + '00');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
      // звёзды
      for (const s of this.stars) {
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(this.t * 1.5 + s.p);
        ctx.fillStyle = '#fff';
        ctx.fillRect(s.x * w, s.y * h, s.r, s.r);
      }
      ctx.globalAlpha = 1;

      // дальний город
      ctx.fillStyle = '#0c0f15';
      for (const b of this.skyline) ctx.fillRect(b.x, this.ground - b.h - 6, b.w, b.h + 6);

      // прожекторы
      for (const [i, hs] of this.houses.entries()) {
        const bx = hs.x + (i === 0 ? hs.w - 14 : 14), by = hs.y - 8;
        const ang = -Math.PI / 2 + Math.sin(this.t * 0.4 + i * 2) * 0.6;
        const len = h * 1.1, spread = 0.07;
        const g = ctx.createLinearGradient(bx, by, bx + Math.cos(ang) * len, by + Math.sin(ang) * len);
        g.addColorStop(0, 'rgba(220,230,255,0.22)'); g.addColorStop(1, 'rgba(220,230,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(ang - spread) * len, by + Math.sin(ang - spread) * len);
        ctx.lineTo(bx + Math.cos(ang + spread) * len, by + Math.sin(ang + spread) * len);
        ctx.closePath(); ctx.fill();
      }

      // земля
      ctx.fillStyle = '#0a0c0f';
      ctx.fillRect(-10, this.ground, w + 20, h - this.ground + 10);
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      for (let x = 0; x < w; x += 46) ctx.fillRect(x, this.ground + (h - this.ground) * 0.55, 24, 2);

      for (const hs of this.houses) this.drawWarehouse(hs);

      // частицы позади огня: дым
      for (const p of this.parts) if (p.kind === 'smoke' || p.kind === 'haze' || p.kind === 'trail') {
        const a = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.kind === 'trail' ? `rgba(210,210,215,${0.4 * a})` : `rgba(95,98,106,${(p.kind === 'haze' ? 0.3 : 0.5) * a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }

      // трассеры ПВО
      for (const tr of this.tracers) {
        if (!tr.s) continue;
        ctx.strokeStyle = `rgba(255,190,90,${Math.min(1, tr.life * 2)})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 10]);
        ctx.lineDashOffset = -this.t * 120;
        ctx.beginPath(); ctx.moveTo(tr.x, tr.y); ctx.lineTo(tr.s.x ?? tr.x, tr.s.y ?? tr.y); ctx.stroke();
        ctx.setLineDash([]);
      }

      for (const s of this.shots) this.drawShot(s);

      // огонь и искры
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.parts) {
        const a = Math.max(0, p.life / p.max);
        if (p.kind === 'fire') {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          g.addColorStop(0, `rgba(255,230,150,${0.9 * a})`);
          g.addColorStop(0.4, `rgba(255,120,30,${0.6 * a})`);
          g.addColorStop(1, 'rgba(255,60,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        } else if (p.kind === 'spark') {
          ctx.fillStyle = `rgba(255,200,110,${a})`;
          ctx.fillRect(p.x, p.y, p.r, p.r);
        }
      }
      for (const f of this.flashes) {
        const a = f.life / f.max;
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
        g.addColorStop(0, `rgba(255,240,200,${0.9 * a})`);
        g.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // лёгкое затемнение снизу, чтобы текст поверх читался
      const v = ctx.createLinearGradient(0, h * 0.6, 0, h);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    drawWarehouse(s) {
      const { ctx } = this;
      const { x, y, w, h, color } = s;
      // корпус
      const body = ctx.createLinearGradient(0, y, 0, y + h);
      body.addColorStop(0, '#2a2f38'); body.addColorStop(1, '#1a1e25');
      ctx.fillStyle = body;
      ctx.fillRect(x, y, w, h);
      // профлист
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      for (let i = x + 4; i < x + w; i += 7) ctx.fillRect(i, y + 6, 2, h - 6);
      // крыша
      ctx.fillStyle = '#12151a';
      ctx.beginPath();
      ctx.moveTo(x - 6, y + 2); ctx.lineTo(x + w * 0.5, y - h * 0.18); ctx.lineTo(x + w + 6, y + 2); ctx.closePath();
      ctx.fill();
      // цветная полоса фракции
      ctx.fillStyle = color;
      ctx.fillRect(x, y + 6, w, 5);
      // ворота
      const gates = Math.max(3, Math.floor(w / 60));
      const gw = w / (gates * 2 + 1);
      for (let i = 0; i < gates; i++) {
        const gx = x + gw * (1 + i * 2), gy = y + h * 0.42;
        ctx.fillStyle = '#0d0f13';
        ctx.fillRect(gx, gy, gw, h * 0.58);
        // свет из ворот
        const lit = (Math.sin(this.t * 0.7 + i * 1.7 + x) > -0.6);
        if (lit) {
          const g = ctx.createLinearGradient(0, gy, 0, gy + h * 0.58);
          g.addColorStop(0, 'rgba(255,214,140,0.05)'); g.addColorStop(1, 'rgba(255,214,140,0.28)');
          ctx.fillStyle = g; ctx.fillRect(gx + 2, gy + 2, gw - 4, h * 0.58 - 2);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for (let k = gy + 5; k < y + h; k += 5) ctx.fillRect(gx, k, gw, 1);
      }
      // табличка с названием
      if (this.opts.labels) {
        const fs = Math.max(11, Math.min(18, w / 12));
        ctx.font = `800 ${fs}px Bahnschrift, Impact, sans-serif`;
        const tw = ctx.measureText(s.name).width + 18;
        const lx = x + (w - tw) / 2, ly = y + 15;
        ctx.fillStyle = color;
        ctx.fillRect(lx, ly, tw, fs + 8);
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.name, lx + 9, ly + (fs + 8) / 2 + 1);
      }
      // подпалины
      for (const sc of this.scorch) if (sc.house === s) {
        const a = sc.life / sc.max;
        const g = ctx.createRadialGradient(x + sc.x, y + 4, 0, x + sc.x, y + 4, 26);
        g.addColorStop(0, `rgba(0,0,0,${0.75 * a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + sc.x - 28, y - 10, 56, 40);
      }
      // вспышка при попадании
      if (s.hit > 0) { ctx.fillStyle = `rgba(255,170,80,${s.hit * 0.25})`; ctx.fillRect(x, y, w, h); }
      // огоньки на крыше
      if (Math.sin(this.t * 4 + x) > 0) {
        ctx.fillStyle = '#ff3b3b';
        ctx.fillRect(x + w * 0.5 - 1, y - h * 0.18 - 3, 3, 3);
      }
    }

    drawShot(s) {
      const { ctx } = this;
      if (s.x == null) return;
      const next = this.shotPos(s, s.t + 0.02);
      const ang = Math.atan2(next.y - s.y, next.x - s.x);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(ang);
      if (s.type === 'rocket') {
        // пламя
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(-10, 0, 0, -10, 0, 10);
        g.addColorStop(0, 'rgba(255,240,180,1)'); g.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(-10, 0, 10, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.scale(1.3, 1.3);
        ctx.fillStyle = '#c9ccd2';
        ctx.fillRect(-8, -1.6, 14, 3.2);
        ctx.beginPath(); ctx.moveTo(6, -1.6); ctx.lineTo(10, 0); ctx.lineTo(6, 1.6); ctx.fill();
        ctx.fillStyle = '#8a8f99';
        ctx.fillRect(-8, -3, 3, 6);
      } else {
        // шахед: треугольное крыло
        if (s.dir === -1 && !s.dive) ctx.scale(1, -1);
        ctx.scale(1.7, 1.7);
        ctx.fillStyle = '#1b1d22';
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(9, 0); ctx.lineTo(-7, -8); ctx.lineTo(-5, 0); ctx.lineTo(-7, 8); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillRect(-9, -1, 4, 2);
        if (Math.sin(this.t * 10) > 0) { ctx.fillStyle = '#ff4d4d'; ctx.fillRect(-7, -8, 2, 2); }
      }
      ctx.restore();
    }
  }

  return { Scene };
})();
