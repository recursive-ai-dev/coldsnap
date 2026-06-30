import { sfx } from './audio';

export type GameStatus = 'playing' | 'paused' | 'gameover';

export interface GameCallbacks {
  onScore: (score: number, cash: number) => void;
  onWarmth: (warmth: number) => void;
  onStatus: (status: GameStatus) => void;
  onCombo: (combo: number) => void;
}

interface Vec { x: number; y: number; }

interface Player extends Vec {
  vx: number; vy: number; r: number;
  facing: number; // -1 left, 1 right
  step: number; // walk cycle
  warmth: number; // 0..100
  iframes: number;
  bobbing: number;
}

type PickupKind = 'bottle' | 'can' | 'coin' | 'wallet';

interface Pickup extends Vec {
  r: number; kind: PickupKind; value: number; t: number; collected: boolean;
}

interface FireBarrel extends Vec {
  r: number; intensity: number;
}

type EnemyKind = 'cop' | 'dog';

interface Enemy extends Vec {
  vx: number; vy: number; r: number; kind: EnemyKind;
  speed: number; facing: number; step: number; cooldown: number;
}

interface Particle extends Vec {
  vx: number; vy: number; life: number; max: number; size: number;
  color: string; gravity: number; shape: 'circle' | 'square' | 'spark';
}

interface FloatText extends Vec {
  text: string; life: number; max: number; color: string; size: number;
}

interface Snowflake extends Vec {
  vy: number; vx: number; r: number;
}

interface Input {
  up: boolean; down: boolean; left: boolean; right: boolean;
  joyX: number; joyY: number; joyActive: boolean;
}

const WORLD_W = 1600;
const WORLD_H = 1000;

function rand(a: number, b: number) { return a + Math.random() * (b - a); }
function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }


export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cb: GameCallbacks;
  status: GameStatus = 'playing';

  player!: Player;
  pickups: Pickup[] = [];
  enemies: Enemy[] = [];
  barrels: FireBarrel[] = [];
  particles: Particle[] = [];
  floats: FloatText[] = [];
  snow: Snowflake[] = [];
  buildings: { x: number; y: number; w: number; h: number; color: string; windows: number[] }[] = [];

  score = 0;
  cash = 0;
  combo = 1;
  comboTimer = 0;
  time = 0;
  spawnTimer = 0;
  enemyTimer = 0;
  difficulty = 0;
  shake = 0;
  flash = 0;
  hurtFlash = 0;

  input: Input = { up: false, down: false, left: false, right: false, joyX: 0, joyY: 0, joyActive: false };

  // camera follows player
  cam = { x: 0, y: 0 };
  view = { w: 800, h: 500, scale: 1 };

  lastTime = 0;
  raf = 0;

  constructor(canvas: HTMLCanvasElement, cb: GameCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.cb = cb;
    this.reset();
    this.bindKeys();
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  bindKeys() {
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.resize);
  }

  onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup') this.input.up = true;
    if (k === 's' || k === 'arrowdown') this.input.down = true;
    if (k === 'a' || k === 'arrowleft') this.input.left = true;
    if (k === 'd' || k === 'arrowright') this.input.right = true;
    if (k === 'p' || k === 'escape') {
      if (this.status === 'playing') this.pause();
      else if (this.status === 'paused') this.resume();
    }
  };
  onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup') this.input.up = false;
    if (k === 's' || k === 'arrowdown') this.input.down = false;
    if (k === 'a' || k === 'arrowleft') this.input.left = false;
    if (k === 'd' || k === 'arrowright') this.input.right = false;
  };

  setJoystick(x: number, y: number, active: boolean) {
    this.input.joyX = x;
    this.input.joyY = y;
    this.input.joyActive = active;
  }

  resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.view.w = rect.width;
    this.view.h = rect.height;
  };

  reset() {
    this.player = {
      x: WORLD_W / 2, y: WORLD_H / 2, vx: 0, vy: 0, r: 14,
      facing: 1, step: 0, warmth: 100, iframes: 0, bobbing: 0,
    };
    this.pickups = [];
    this.enemies = [];
    this.particles = [];
    this.floats = [];
    this.barrels = [];
    this.snow = [];
    this.buildings = [];
    this.score = 0;
    this.cash = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.time = 0;
    this.spawnTimer = 0;
    this.enemyTimer = 4; // grace period
    this.difficulty = 0;
    this.shake = 0;
    this.flash = 0;
    this.hurtFlash = 0;
    this.status = 'playing';

    // Place 4 fire barrels in cardinal-ish positions
    const cx = WORLD_W / 2, cy = WORLD_H / 2;
    const ringR = 300;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      this.barrels.push({ x: cx + Math.cos(a) * ringR, y: cy + Math.sin(a) * ringR, r: 22, intensity: 1 });
    }

    // Buildings as background props
    for (let i = 0; i < 22; i++) {
      const w = rand(120, 220), h = rand(80, 160);
      const x = rand(20, WORLD_W - w - 20);
      const y = rand(20, WORLD_H - h - 20);
      // Keep clear of center
      if (Math.abs(x + w / 2 - cx) < 240 && Math.abs(y + h / 2 - cy) < 200) continue;
      const colors = ['#2a2438', '#1f2937', '#27212e', '#322a3a', '#241b2a'];
      const windows: number[] = [];
      const cols = Math.floor(w / 26), rows = Math.floor(h / 24);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) windows.push(Math.random() < 0.45 ? 1 : 0);
      this.buildings.push({ x, y, w, h, color: colors[(Math.random() * colors.length) | 0], windows });
    }

    // Initial snow
    for (let i = 0; i < 70; i++) this.snow.push({ x: rand(0, WORLD_W), y: rand(0, WORLD_H), vy: rand(20, 60), vx: rand(-10, 10), r: rand(0.8, 2.4) });

    // Initial pickups so first 10s is fun
    for (let i = 0; i < 8; i++) this.spawnPickup(true);

    this.cb.onScore(this.score, this.cash);
    this.cb.onWarmth(this.player.warmth);
    this.cb.onCombo(this.combo);
    this.cb.onStatus(this.status);
  }

  start() {
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  pause() {
    if (this.status !== 'playing') return;
    this.status = 'paused';
    this.cb.onStatus(this.status);
    cancelAnimationFrame(this.raf);
  }

  resume() {
    if (this.status !== 'paused') return;
    this.status = 'playing';
    this.cb.onStatus(this.status);
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  loop = (t: number) => {
    const dt = Math.min(0.05, (t - this.lastTime) / 1000);
    this.lastTime = t;
    if (this.status === 'playing') this.update(dt);
    this.render();
    if (this.status === 'playing') this.raf = requestAnimationFrame(this.loop);
    else if (this.status === 'gameover') this.render(); // freeze
  };

  spawnPickup(initial = false) {
    const cx = WORLD_W / 2, cy = WORLD_H / 2;
    let x = 0, y = 0;
    for (let tries = 0; tries < 8; tries++) {
      x = rand(80, WORLD_W - 80);
      y = rand(80, WORLD_H - 80);
      // not on top of player at spawn
      if (initial || Math.hypot(x - this.player.x, y - this.player.y) > 90) break;
      x = cx + rand(-200, 200); y = cy + rand(-200, 200);
    }
    const roll = Math.random();
    let kind: PickupKind, value: number, r: number;
    if (roll < 0.55) { kind = 'bottle'; value = 5; r = 10; }
    else if (roll < 0.85) { kind = 'can'; value = 10; r = 10; }
    else if (roll < 0.97) { kind = 'coin'; value = 25; r = 10; }
    else { kind = 'wallet'; value = 100; r = 12; }
    this.pickups.push({ x, y, r, kind, value, t: 0, collected: false });
  }

  spawnEnemy() {
    const side = (Math.random() * 4) | 0;
    let x = 0, y = 0;
    const margin = -40;
    if (side === 0) { x = rand(0, WORLD_W); y = margin; }
    if (side === 1) { x = rand(0, WORLD_W); y = WORLD_H - margin; }
    if (side === 2) { x = margin; y = rand(0, WORLD_H); }
    if (side === 3) { x = WORLD_W - margin; y = rand(0, WORLD_H); }
    const kind: EnemyKind = Math.random() < 0.35 ? 'dog' : 'cop';
    const speed = kind === 'dog' ? 110 + this.difficulty * 6 : 70 + this.difficulty * 5;
    this.enemies.push({ x, y, vx: 0, vy: 0, r: kind === 'dog' ? 12 : 15, kind, speed, facing: 1, step: 0, cooldown: 0 });
  }

  update(dt: number) {
    this.time += dt;
    this.difficulty = Math.min(10, this.time / 12);

    // Input → desired velocity
    let dx = 0, dy = 0;
    if (this.input.joyActive) {
      dx = this.input.joyX; dy = this.input.joyY;
    } else {
      if (this.input.left) dx -= 1;
      if (this.input.right) dx += 1;
      if (this.input.up) dy -= 1;
      if (this.input.down) dy += 1;
    }
    const mag = Math.hypot(dx, dy);
    if (mag > 1) { dx /= mag; dy /= mag; }
    const baseSpeed = 230;
    const warmthMult = 0.5 + 0.5 * (this.player.warmth / 100); // slower when cold
    const targetVx = dx * baseSpeed * warmthMult;
    const targetVy = dy * baseSpeed * warmthMult;
    const accel = 12;
    this.player.vx += (targetVx - this.player.vx) * Math.min(1, accel * dt);
    this.player.vy += (targetVy - this.player.vy) * Math.min(1, accel * dt);
    this.player.x = clamp(this.player.x + this.player.vx * dt, 20, WORLD_W - 20);
    this.player.y = clamp(this.player.y + this.player.vy * dt, 20, WORLD_H - 20);
    const moving = Math.hypot(this.player.vx, this.player.vy) > 20;
    if (moving) {
      this.player.step += dt * 10;
      this.player.bobbing = Math.sin(this.player.step) * 2;
      if (Math.abs(this.player.vx) > 10) this.player.facing = this.player.vx > 0 ? 1 : -1;
      // footprint particles occasionally
      if (Math.random() < 0.25) {
        this.particles.push({
          x: this.player.x, y: this.player.y + 12,
          vx: rand(-10, 10), vy: rand(-5, 0), life: 0, max: 0.5,
          size: rand(1, 2.4), color: 'rgba(255,255,255,0.5)', gravity: 0, shape: 'circle',
        });
      }
    } else {
      this.player.bobbing *= 0.9;
    }

    // Warmth drain
    const drain = 1.6 + this.difficulty * 0.18;
    this.player.warmth = clamp(this.player.warmth - drain * dt, 0, 100);

    // Fire barrels warm + flames + slight scoring tick
    for (const b of this.barrels) {
      b.intensity = 0.8 + Math.sin(this.time * 8 + b.x) * 0.2;
      const d = Math.hypot(this.player.x - b.x, this.player.y - b.y);
      if (d < 80) {
        const restore = (1 - d / 80) * 40 * dt;
        if (this.player.warmth < 100) {
          this.player.warmth = clamp(this.player.warmth + restore, 0, 100);
          if (Math.random() < 0.3) this.particles.push({
            x: this.player.x + rand(-8, 8), y: this.player.y - 6,
            vx: rand(-10, 10), vy: rand(-30, -10), life: 0, max: 0.6,
            size: rand(2, 4), color: '#ffb56b', gravity: -20, shape: 'circle',
          });
        }
      }
      // Embers
      if (Math.random() < 0.4) this.particles.push({
        x: b.x + rand(-6, 6), y: b.y - 12,
        vx: rand(-15, 15), vy: rand(-60, -30), life: 0, max: 1.0,
        size: rand(1.5, 3), color: Math.random() < 0.5 ? '#ffb04a' : '#ff6a2b', gravity: -10, shape: 'circle',
      });
    }
    if (this.player.warmth <= 0) this.die('Hypothermia');

    // Pickups
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = Math.max(0.35, 1.1 - this.difficulty * 0.07);
      if (this.pickups.length < 14) this.spawnPickup();
    }

    for (const p of this.pickups) {
      p.t += dt;
      if (p.collected) continue;
      // magnet when very close
      const d = Math.hypot(this.player.x - p.x, this.player.y - p.y);
      if (d < 36) {
        p.x += (this.player.x - p.x) * Math.min(1, 8 * dt);
        p.y += (this.player.y - p.y) * Math.min(1, 8 * dt);
      }
      if (d < this.player.r + p.r) {
        this.collect(p);
      }
    }
    this.pickups = this.pickups.filter(p => !p.collected);

    // Enemies
    this.enemyTimer -= dt;
    if (this.enemyTimer <= 0) {
      this.enemyTimer = Math.max(1.4, 4.5 - this.difficulty * 0.3);
      const maxEnemies = 2 + Math.floor(this.difficulty * 1.2);
      if (this.enemies.length < maxEnemies) this.spawnEnemy();
    }
    for (const e of this.enemies) {
      const ddx = this.player.x - e.x, ddy = this.player.y - e.y;
      const d = Math.hypot(ddx, ddy);
      // Dogs only chase within range; cops always
      const chase = e.kind === 'cop' ? true : d < 260;
      if (chase && d > 0.1) {
        e.vx = (ddx / d) * e.speed;
        e.vy = (ddy / d) * e.speed;
      } else {
        e.vx *= 0.9; e.vy *= 0.9;
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.step += dt * 8;
      if (Math.abs(e.vx) > 10) e.facing = e.vx > 0 ? 1 : -1;
      e.cooldown = Math.max(0, e.cooldown - dt);
      if (d < this.player.r + e.r && e.cooldown === 0 && this.player.iframes <= 0) {
        this.hit(e);
        e.cooldown = 0.8;
      }
    }

    // Particles
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= 0.98;
    }
    this.particles = this.particles.filter(p => p.life < p.max);

    for (const f of this.floats) { f.life += dt; f.y -= 30 * dt; }
    this.floats = this.floats.filter(f => f.life < f.max);

    // Snow
    for (const s of this.snow) {
      s.y += s.vy * dt;
      s.x += s.vx * dt;
      if (s.y > WORLD_H) { s.y = -5; s.x = rand(0, WORLD_W); }
    }

    // Combo decay
    this.comboTimer -= dt;
    if (this.comboTimer <= 0 && this.combo > 1) {
      this.combo = Math.max(1, this.combo - 1);
      this.cb.onCombo(this.combo);
      this.comboTimer = 1.5;
    }

    this.player.iframes = Math.max(0, this.player.iframes - dt);
    this.shake *= Math.pow(0.001, dt); // exponential decay
    this.flash = Math.max(0, this.flash - dt * 2);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);

    // Camera follows
    const targetCamX = this.player.x - this.view.w / 2;
    const targetCamY = this.player.y - this.view.h / 2;
    this.cam.x += (targetCamX - this.cam.x) * Math.min(1, 6 * dt);
    this.cam.y += (targetCamY - this.cam.y) * Math.min(1, 6 * dt);
    this.cam.x = clamp(this.cam.x, 0, WORLD_W - this.view.w);
    this.cam.y = clamp(this.cam.y, 0, WORLD_H - this.view.h);

    this.cb.onWarmth(this.player.warmth);
  }

  collect(p: Pickup) {
    p.collected = true;
    this.comboTimer = 2.5;
    const earned = p.value * this.combo;
    this.combo = Math.min(99, this.combo + 1);
    this.cash += p.value;
    this.score += earned;
    this.flash = 0.4;
    this.shake = Math.min(8, this.shake + (p.kind === 'wallet' ? 12 : 3));
    let color = '#7be37b';
    if (p.kind === 'bottle') { sfx.pickup(); color = '#9fffd2'; }
    if (p.kind === 'can') { sfx.pickup(); color = '#ffe27a'; }
    if (p.kind === 'coin') { sfx.coin(); color = '#ffd24a'; }
    if (p.kind === 'wallet') { sfx.big(); color = '#9aff6a'; }
    // burst
    for (let i = 0; i < (p.kind === 'wallet' ? 24 : 10); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(40, 180);
      this.particles.push({
        x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, max: rand(0.4, 0.8), size: rand(1.6, 3.2),
        color, gravity: 40, shape: 'spark',
      });
    }
    this.floats.push({
      x: p.x, y: p.y - 12, text: `+$${p.value}${this.combo > 1 ? ` x${this.combo}` : ''}`,
      life: 0, max: 0.9, color, size: p.kind === 'wallet' ? 22 : 16,
    });
    this.cb.onScore(this.score, this.cash);
    this.cb.onCombo(this.combo);
  }

  hit(e: Enemy) {
    sfx.hurt();
    this.shake = 16;
    this.hurtFlash = 1;
    this.player.iframes = 1.0;
    this.player.warmth = clamp(this.player.warmth - (e.kind === 'cop' ? 28 : 18), 0, 100);
    // Knockback
    const dx = this.player.x - e.x, dy = this.player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    this.player.vx += (dx / d) * 320;
    this.player.vy += (dy / d) * 320;
    this.combo = 1;
    this.cb.onCombo(this.combo);
    // Cop also takes a chunk of cash
    if (e.kind === 'cop' && this.cash > 0) {
      const lost = Math.min(this.cash, 20);
      this.cash -= lost;
      this.floats.push({ x: this.player.x, y: this.player.y - 22, text: `-$${lost}`, life: 0, max: 0.9, color: '#ff7a7a', size: 16 });
    }
    // particles
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(80, 220);
      this.particles.push({
        x: this.player.x, y: this.player.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, max: rand(0.4, 0.7), size: rand(2, 3.6),
        color: '#ff5151', gravity: 200, shape: 'square',
      });
    }
    if (this.player.warmth <= 0) this.die(e.kind === 'cop' ? 'Arrested' : 'Mauled');
  }

  die(_reason: string) {
    if (this.status !== 'playing') return;
    this.status = 'gameover';
    this.shake = 24;
    sfx.gameover();
    // explosion of snow
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(60, 260);
      this.particles.push({
        x: this.player.x, y: this.player.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, max: rand(0.6, 1.2), size: rand(1.6, 3),
        color: 'rgba(220,235,255,0.9)', gravity: 80, shape: 'circle',
      });
    }
    this.cb.onStatus(this.status);
  }

  render() {
    const ctx = this.ctx;
    const { w, h } = this.view;
    ctx.save();

    // Screen shake offset
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    ctx.translate(-this.cam.x + sx, -this.cam.y + sy);

    // Ground: snowy asphalt
    const grad = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    grad.addColorStop(0, '#15182a');
    grad.addColorStop(1, '#0c0f1c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Snow patches on ground
    ctx.fillStyle = 'rgba(220,230,255,0.06)';
    for (let i = 0; i < 80; i++) {
      const x = (i * 137) % WORLD_W;
      const y = (i * 211) % WORLD_H;
      ctx.beginPath(); ctx.arc(x, y, 40 + ((i * 13) % 30), 0, Math.PI * 2); ctx.fill();
    }

    // Cracked road grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < WORLD_W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); ctx.stroke(); }
    for (let y = 0; y < WORLD_H; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); ctx.stroke(); }

    // Calgary tower silhouette in background (far)
    this.drawSkyline(ctx);

    // Buildings
    for (const b of this.buildings) {
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      // roof line
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(b.x, b.y, b.w, 4);
      // windows
      const cols = Math.floor(b.w / 26), rows = Math.floor(b.h / 24);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (b.windows[idx]) {
          ctx.fillStyle = 'rgba(255, 210, 120, 0.35)';
          ctx.fillRect(b.x + 8 + c * 26, b.y + 10 + r * 24, 14, 12);
        }
      }
      // snow on roof
      ctx.fillStyle = 'rgba(240,250,255,0.85)';
      ctx.fillRect(b.x, b.y - 3, b.w, 4);
    }

    // Fire barrels
    for (const bb of this.barrels) this.drawBarrel(ctx, bb);

    // Pickups
    for (const p of this.pickups) this.drawPickup(ctx, p);

    // Enemies
    for (const e of this.enemies) this.drawEnemy(ctx, e);

    // Player
    this.drawPlayer(ctx);

    // Particles
    for (const p of this.particles) {
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      } else if (p.shape === 'square') {
        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      } else {
        ctx.fillRect(p.x - p.size, p.y - 0.6, p.size * 2, 1.2);
        ctx.fillRect(p.x - 0.6, p.y - p.size, 1.2, p.size * 2);
      }
    }
    ctx.globalAlpha = 1;

    // Float texts
    for (const f of this.floats) {
      const a = 1 - f.life / f.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.font = `bold ${f.size}px ui-sans-serif, system-ui`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // Snowfall (in world)
    ctx.fillStyle = 'rgba(230,240,255,0.85)';
    for (const s of this.snow) {
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();

    // Vignette (screen-space)
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // Cold tint based on warmth
    const cold = 1 - this.player.warmth / 100;
    if (cold > 0.1) {
      ctx.fillStyle = `rgba(120,180,255,${cold * 0.25})`;
      ctx.fillRect(0, 0, w, h);
    }

    // Pickup flash
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.18})`;
      ctx.fillRect(0, 0, w, h);
    }

    // Hurt flash
    if (this.hurtFlash > 0) {
      ctx.fillStyle = `rgba(255,40,40,${this.hurtFlash * 0.35})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  drawSkyline(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#0a0e1c';
    // far buildings band
    ctx.fillRect(0, 40, WORLD_W, 80);
    // Calgary tower
    const tx = WORLD_W * 0.7, ty = 30;
    ctx.fillStyle = '#0a0e1c';
    ctx.fillRect(tx - 6, ty, 12, 110); // shaft
    ctx.beginPath(); ctx.arc(tx, ty + 10, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(tx - 18, ty + 6, 36, 14); // observation
    // red light
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath(); ctx.arc(tx, ty - 4, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawBarrel(ctx: CanvasRenderingContext2D, b: FireBarrel) {
    // Glow
    const g = ctx.createRadialGradient(b.x, b.y - 6, 4, b.x, b.y - 6, 100);
    g.addColorStop(0, 'rgba(255,170,80,0.55)');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(b.x, b.y - 6, 100, 0, Math.PI * 2); ctx.fill();
    // Barrel
    ctx.fillStyle = '#3a2417';
    ctx.fillRect(b.x - 18, b.y - 6, 36, 30);
    ctx.fillStyle = '#251612';
    ctx.fillRect(b.x - 18, b.y + 8, 36, 3);
    ctx.fillRect(b.x - 18, b.y + 18, 36, 3);
    // Flames
    const t = this.time;
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * 6;
      const flick = Math.sin(t * 14 + i) * 3;
      ctx.fillStyle = i === 1 ? '#ffe27a' : '#ff7a2b';
      ctx.beginPath();
      ctx.ellipse(b.x + off, b.y - 14 + flick, 6, 12 + flick * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath(); ctx.ellipse(b.x, b.y - 12, 3, 6, 0, 0, Math.PI * 2); ctx.fill();
  }

  drawPickup(ctx: CanvasRenderingContext2D, p: Pickup) {
    const bob = Math.sin(p.t * 4 + p.x) * 2;
    ctx.save();
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 8, p.r, p.r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(p.x, p.y + bob);
    if (p.kind === 'bottle') {
      // glass bottle
      ctx.fillStyle = '#5fe6a8';
      ctx.fillRect(-3, -10, 6, 16);
      ctx.fillRect(-5, -4, 10, 10);
      ctx.fillStyle = '#a8ffd6';
      ctx.fillRect(-4, -2, 2, 8);
      ctx.fillStyle = '#1a3a2a';
      ctx.fillRect(-2, -12, 4, 3);
    } else if (p.kind === 'can') {
      ctx.fillStyle = '#e6c14a';
      ctx.fillRect(-6, -8, 12, 16);
      ctx.fillStyle = '#fff3a8';
      ctx.fillRect(-5, -7, 2, 14);
      ctx.fillStyle = '#7a5a14';
      ctx.fillRect(-6, -8, 12, 2);
      ctx.fillRect(-6, 6, 12, 2);
    } else if (p.kind === 'coin') {
      const t = Math.sin(p.t * 6) * 0.5 + 0.5;
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath(); ctx.ellipse(0, 0, 8 * (0.5 + t * 0.5), 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a8780a';
      ctx.font = 'bold 10px ui-sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 0);
    } else {
      // wallet
      ctx.fillStyle = '#3a1d10';
      ctx.fillRect(-12, -8, 24, 16);
      ctx.fillStyle = '#7a3d20';
      ctx.fillRect(-12, -2, 24, 3);
      ctx.fillStyle = '#ffd24a';
      ctx.fillRect(8, -3, 4, 6);
      // shine
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(-10, -7, 4, 2);
    }
    ctx.restore();
  }

  drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy) {
    const bob = Math.sin(e.step) * 2;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(e.x, e.y + 14, e.r, e.r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(e.x, e.y + bob);
    ctx.scale(e.facing, 1);
    if (e.kind === 'cop') {
      // body
      ctx.fillStyle = '#1d3a8a';
      ctx.fillRect(-9, -6, 18, 18);
      // belt
      ctx.fillStyle = '#111';
      ctx.fillRect(-9, 4, 18, 2);
      // head
      ctx.fillStyle = '#f1c6a4';
      ctx.beginPath(); ctx.arc(0, -12, 7, 0, Math.PI * 2); ctx.fill();
      // hat
      ctx.fillStyle = '#0e1f4d';
      ctx.fillRect(-8, -18, 16, 5);
      ctx.fillRect(-10, -14, 20, 2);
      // badge
      ctx.fillStyle = '#ffd24a';
      ctx.fillRect(-2, -2, 3, 3);
      // legs
      ctx.fillStyle = '#0e1f4d';
      const lo = Math.sin(e.step) * 3;
      ctx.fillRect(-7, 12, 5, 8 + lo);
      ctx.fillRect(2, 12, 5, 8 - lo);
    } else {
      // dog
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(-12, -2, 22, 10);
      // head
      ctx.beginPath(); ctx.arc(10, -2, 6, 0, Math.PI * 2); ctx.fill();
      // ears
      ctx.beginPath(); ctx.moveTo(8, -7); ctx.lineTo(12, -12); ctx.lineTo(13, -6); ctx.closePath(); ctx.fill();
      // teeth/eye
      ctx.fillStyle = '#ff3a3a';
      ctx.fillRect(13, -3, 1.5, 1.5);
      ctx.fillStyle = '#fff';
      ctx.fillRect(14, 1, 3, 1);
      // legs
      ctx.fillStyle = '#2a2a2a';
      const lo = Math.sin(e.step) * 3;
      ctx.fillRect(-10, 8, 3, 6 + lo);
      ctx.fillRect(-3, 8, 3, 6 - lo);
      ctx.fillRect(4, 8, 3, 6 + lo);
      // tail
      ctx.fillRect(-14, -2, 4, 2);
    }
    ctx.restore();
  }

  drawPlayer(ctx: CanvasRenderingContext2D) {
    const p = this.player;
    const blink = p.iframes > 0 ? (Math.floor(p.iframes * 20) % 2 === 0 ? 0.4 : 1) : 1;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 14, p.r, p.r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(p.x, p.y + p.bobbing);
    ctx.scale(p.facing, 1);
    ctx.globalAlpha = blink;
    // legs
    const lo = Math.sin(p.step) * 3;
    ctx.fillStyle = '#3b2a1a';
    ctx.fillRect(-6, 10, 5, 8 + lo);
    ctx.fillRect(1, 10, 5, 8 - lo);
    // coat
    ctx.fillStyle = '#5b3a25';
    ctx.fillRect(-9, -4, 18, 18);
    // patch
    ctx.fillStyle = '#3a2515';
    ctx.fillRect(-3, 4, 6, 6);
    // hands (mittens)
    ctx.fillStyle = '#a13e2a';
    ctx.fillRect(-12, 2 + lo, 4, 5);
    ctx.fillRect(8, 2 - lo, 4, 5);
    // scarf
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(-8, -6, 16, 4);
    ctx.fillRect(4, -4, 4, 8);
    // head
    ctx.fillStyle = '#f1c6a4';
    ctx.beginPath(); ctx.arc(0, -12, 6.5, 0, Math.PI * 2); ctx.fill();
    // beanie
    ctx.fillStyle = '#2c7a3e';
    ctx.fillRect(-7, -19, 14, 6);
    ctx.beginPath(); ctx.arc(0, -19, 7, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#1c4d27';
    ctx.fillRect(-7, -14, 14, 2);
    // pom
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, -22, 2.5, 0, Math.PI * 2); ctx.fill();
    // eyes
    ctx.fillStyle = '#000';
    ctx.fillRect(1, -13, 1.6, 1.6);
    ctx.fillRect(-3, -13, 1.6, 1.6);
    ctx.restore();
  }
}
