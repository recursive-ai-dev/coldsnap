import '`@testing-library/jest-dom/vitest`';
import { vi } from 'vitest';

HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  ellipse: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  fillText: vi.fn(),
  strokeText: vi.fn(),
})) as any;

HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => ({
  width: 800,
  height: 600,
  top: 0,
  left: 0,
  right: 800,
  bottom: 600,
  x: 0,
  y: 0,
  toJSON: () => {}
})) as any;

class MockAudioContext {
  destination = {};
  currentTime = 0;
  state = 'running';
  sampleRate = 44100;

  createGain() {
    return {
      gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
  }
  createOscillator() {
    return {
      type: 'square',
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      start: vi.fn(),
      stop: vi.fn(),
      connect: vi.fn().mockReturnThis(),
    };
  }
  createBuffer() {
    return {
      getChannelData: vi.fn(() => new Float32Array(100))
    };
  }
  createBufferSource() {
    return {
      buffer: null,
      connect: vi.fn().mockReturnThis(),
      start: vi.fn()
    };
  }
  createBiquadFilter() {
    return {
      type: 'lowpass',
      frequency: { value: 0 },
      connect: vi.fn().mockReturnThis(),
    };
  }
  resume() {
    return Promise.resolve();
  }
}

(window as any).AudioContext = MockAudioContext;
(window as any).webkitAudioContext = MockAudioContext;
