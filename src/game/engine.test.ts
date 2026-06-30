import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Game } from './engine';

describe('Game Engine', () => {
  let callbacks: any;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    callbacks = {
      onScore: vi.fn(),
      onWarmth: vi.fn(),
      onStatus: vi.fn(),
      onCombo: vi.fn(),
    };
  });

  it('initializes correctly', () => {
    const game = new Game(canvas, callbacks);
    expect(game.status).toBe('playing');
    expect(game.score).toBe(0);
    expect(game.cash).toBe(0);
    expect(game.combo).toBe(1);
    expect(game.player.warmth).toBe(100);
  });

  it('player loses warmth over time', () => {
    const game = new Game(canvas, callbacks);
    game.lastTime = 0;

    // Simulate some time passing to drain warmth
    game.update(0.5); // 0.5 seconds

    expect(game.player.warmth).toBeLessThan(100);
  });

  it('collecting items gives score and cash', () => {
    const game = new Game(canvas, callbacks);

    const initialScore = game.score;
    const initialCash = game.cash;

    const pickup = { x: game.player.x, y: game.player.y, r: 10, kind: 'coin' as const, value: 25, t: 0, collected: false };
    game.collect(pickup);

    expect(game.cash).toBe(initialCash + 25);
    expect(game.score).toBeGreaterThan(initialScore);
    expect(game.combo).toBe(2);
  });

  it('warmth restores near fire barrels', () => {
    const game = new Game(canvas, callbacks);

    // Reduce warmth manually
    game.player.warmth = 50;

    // Move player exactly on top of a fire barrel
    const barrel = game.barrels[0];
    game.player.x = barrel.x;
    game.player.y = barrel.y;

    // Update game to process warming
    game.update(0.1);

    expect(game.player.warmth).toBeGreaterThan(50);
  });

  it('cops reduce warmth', () => {
    const game = new Game(canvas, callbacks);

    const initialWarmth = game.player.warmth;

    const cop = { x: game.player.x, y: game.player.y, vx: 0, vy: 0, r: 15, kind: 'cop' as const, speed: 100, facing: 1, step: 0, cooldown: 0 };
    game.hit(cop);

    expect(game.player.warmth).toBeLessThan(initialWarmth);
    expect(game.player.iframes).toBeGreaterThan(0);
  });

  it('dies when warmth reaches 0', () => {
    const game = new Game(canvas, callbacks);

    game.player.warmth = 0;
    const dog = { x: game.player.x, y: game.player.y, vx: 0, vy: 0, r: 12, kind: 'dog' as const, speed: 100, facing: 1, step: 0, cooldown: 0 };

    game.hit(dog);

    expect(game.status).toBe('gameover');
    expect(callbacks.onStatus).toHaveBeenCalledWith('gameover');
  });

  it('enemies spawn over time', () => {
    const game = new Game(canvas, callbacks);
    const initialEnemiesCount = game.enemies.length;

    // Simulate game time passing to spawn enemies
    game.update(10); // 10 seconds, should pass enemyTimer (4)

    expect(game.enemies.length).toBeGreaterThan(initialEnemiesCount);
  });

  it('score multiplier logic (combos) works correctly', () => {
    const canvas = document.createElement("canvas");
    const callbacks = {
      onScore: vi.fn(),
      onWarmth: vi.fn(),
      onStatus: vi.fn(),
      onCombo: vi.fn(),
    };
    const game = new Game(canvas, callbacks);

    const initialScore = game.score;

    // Pickup 1
    const pickup1 = { x: game.player.x, y: game.player.y, r: 10, kind: 'coin' as const, value: 25, t: 0, collected: false };
    game.collect(pickup1);
    const scoreAfter1 = game.score;
    expect(scoreAfter1).toBe(initialScore + 25);
    expect(game.combo).toBe(2);

    // Pickup 2
    const pickup2 = { x: game.player.x, y: game.player.y, r: 10, kind: 'coin' as const, value: 25, t: 0, collected: false };
    game.collect(pickup2);
    const scoreAfter2 = game.score;

    // With combo=2, the score earned should be 25 * 2 = 50
    expect(scoreAfter2).toBe(scoreAfter1 + 50);
    expect(game.combo).toBe(3);
  });

  it('combo resets after time passes', () => {
    const game = new Game(canvas, callbacks);

    const pickup = { x: game.player.x, y: game.player.y, r: 10, kind: 'coin' as const, value: 25, t: 0, collected: false };
    game.collect(pickup);

    expect(game.combo).toBe(2);

    // Time passes longer than comboTimer (2.5s)
    game.update(3);

    expect(game.combo).toBe(1);
  });

  it('game bounds limit player movement', () => {
    const game = new Game(canvas, callbacks);

    // Try to move player way outside world bounds
    game.player.x = -1000;
    game.player.y = -1000;

    game.update(0.1);

    expect(game.player.x).toBeGreaterThanOrEqual(10);
    expect(game.player.y).toBeGreaterThanOrEqual(10);
  });

  it('calculates score based on multiplier logic exactly', () => {
    const canvas = document.createElement("canvas");
    const callbacks = {
      onScore: vi.fn(),
      onWarmth: vi.fn(),
      onStatus: vi.fn(),
      onCombo: vi.fn(),
    };
    const game = new Game(canvas, callbacks);

    // Pickups mapping:
    // bottle: 5
    // can: 10
    // coin: 25
    // wallet: 100

    game.collect({ x: 0, y: 0, r: 10, kind: 'bottle', value: 5, t: 0, collected: false }); // combo=2, score=5*1=5
    expect(game.score).toBe(5);

    game.collect({ x: 0, y: 0, r: 10, kind: 'can', value: 10, t: 0, collected: false }); // combo=3, score=5+10*2=25
    expect(game.score).toBe(25);

    game.collect({ x: 0, y: 0, r: 10, kind: 'coin', value: 25, t: 0, collected: false }); // combo=4, score=25+25*3=100
    expect(game.score).toBe(100);

    game.collect({ x: 0, y: 0, r: 10, kind: 'wallet', value: 100, t: 0, collected: false }); // combo=5, score=100+100*4=500
    expect(game.score).toBe(500);

    expect(game.cash).toBe(5 + 10 + 25 + 100);
  });

  it('caps combo at 99', () => {
    const canvas = document.createElement("canvas");
    const callbacks = {
      onScore: vi.fn(),
      onWarmth: vi.fn(),
      onStatus: vi.fn(),
      onCombo: vi.fn(),
    };
    const game = new Game(canvas, callbacks);
    game.combo = 98;
    game.collect({ x: 0, y: 0, r: 10, kind: 'bottle', value: 5, t: 0, collected: false }); // combo becomes 99
    expect(game.combo).toBe(99);

    game.collect({ x: 0, y: 0, r: 10, kind: 'bottle', value: 5, t: 0, collected: false }); // combo should stay 99
    expect(game.combo).toBe(99);
  });

  it('checks math of distance correctly for collections', () => {
    const canvas = document.createElement("canvas");
    const callbacks = {
      onScore: vi.fn(),
      onWarmth: vi.fn(),
      onStatus: vi.fn(),
      onCombo: vi.fn(),
    };
    const game = new Game(canvas, callbacks);

    // Clear initial spawned pickups to be sure
    game.pickups = [];

    // Player is at cx, cy (800, 500)
    game.player.x = 800;
    game.player.y = 500;
    game.player.r = 14;

    // Pickup exactly at edge: distance 14 + 10 = 24
    const pickup = { x: 800 + 23, y: 500, r: 10, kind: 'bottle' as const, value: 5, t: 0, collected: false };
    game.pickups.push(pickup);

    // Magnet triggers < 36, so pickup moves closer.
    // Wait for the pickup to be moved and processed in update()
    for (let i = 0; i < 20; i++) {
        // Disable spawn so more don't spawn
        game.spawnTimer = 100;
        game.update(0.1);
    }

    expect(game.pickups.length).toBe(0);
  });

  it('limits camera within world bounds', () => {
    const canvas = document.createElement("canvas");
    const callbacks = {
      onScore: vi.fn(),
      onWarmth: vi.fn(),
      onStatus: vi.fn(),
      onCombo: vi.fn(),
    };
    const game = new Game(canvas, callbacks);

    // Move player very close to edge
    game.player.x = 10;
    game.player.y = 10;

    game.update(0.1);

    // view is 800x600, center is 400x300
    // If player is at 10,10, camera ideally would be at -390, -290
    // But it should clamp to 0..WORLD_W-view.w (1600-800=800) and 0..WORLD_H-view.h (1000-600=400)
    expect(game.cam.x).toBeGreaterThanOrEqual(0);
    expect(game.cam.y).toBeGreaterThanOrEqual(0);
  });

  it('updates spawn logic correctly for difficulty scaling', () => {
    const canvas = document.createElement("canvas");
    const callbacks = {
      onScore: vi.fn(),
      onWarmth: vi.fn(),
      onStatus: vi.fn(),
      onCombo: vi.fn(),
    };
    const game = new Game(canvas, callbacks);

    // Initial difficulty
    expect(game.difficulty).toBe(0);

    // Advance time past 12 seconds to increase difficulty to 1
    game.update(12);

    // difficulty increments based on time: Math.min(10, time / 12)
    expect(game.difficulty).toBe(1);
  });

  it('correctly updates player movement and bounds handling based on input state', () => {
    const canvas = document.createElement("canvas");
    const callbacks = {
      onScore: vi.fn(),
      onWarmth: vi.fn(),
      onStatus: vi.fn(),
      onCombo: vi.fn(),
    };
    const game = new Game(canvas, callbacks);

    // Place player at center
    game.player.x = 800;
    game.player.y = 500;

    // Apply input
    game.input.right = true;
    game.input.up = true;

    game.update(0.1); // time delta

    // speed is 180. dx, dy normalized if both pressed.
    // 180 * 0.1 = 18. Normalized diagonal is ~0.707
    // So 18 * 0.707 = 12.726

    expect(game.player.x).toBeGreaterThan(800);
    expect(game.player.y).toBeLessThan(500);
    expect(game.player.facing).toBe(1); // facing right
  });
});
