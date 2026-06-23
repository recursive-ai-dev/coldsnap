import { useEffect, useRef } from 'react';

interface Props {
  onMove: (x: number, y: number, active: boolean) => void;
}

export default function Joystick({ onMove }: Props) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ touchId: -1, cx: 0, cy: 0, active: false });

  useEffect(() => {
    const base = baseRef.current!;
    const knob = knobRef.current!;
    const R = 56; // radius in px

    const start = (e: TouchEvent) => {
      if (stateRef.current.active) return;
      const t = e.changedTouches[0];
      const rect = base.getBoundingClientRect();
      stateRef.current.cx = rect.left + rect.width / 2;
      stateRef.current.cy = rect.top + rect.height / 2;
      stateRef.current.touchId = t.identifier;
      stateRef.current.active = true;
      base.style.opacity = '1';
      move(t.clientX, t.clientY);
      e.preventDefault();
    };
    const move = (x: number, y: number) => {
      const dx = x - stateRef.current.cx;
      const dy = y - stateRef.current.cy;
      const d = Math.hypot(dx, dy);
      const cl = Math.min(d, R);
      const nx = d > 0 ? (dx / d) * cl : 0;
      const ny = d > 0 ? (dy / d) * cl : 0;
      knob.style.transform = `translate(${nx}px, ${ny}px)`;
      // Deadzone
      const mag = d / R;
      if (mag < 0.18) onMove(0, 0, true);
      else onMove(dx / Math.max(d, 1), dy / Math.max(d, 1), true);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!stateRef.current.active) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === stateRef.current.touchId) {
          move(t.clientX, t.clientY);
          e.preventDefault();
          break;
        }
      }
    };
    const end = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === stateRef.current.touchId) {
          stateRef.current.touchId = -1;
          stateRef.current.active = false;
          knob.style.transform = 'translate(0,0)';
          base.style.opacity = '0.6';
          onMove(0, 0, false);
          break;
        }
      }
    };

    base.addEventListener('touchstart', start, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    return () => {
      base.removeEventListener('touchstart', start);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
  }, [onMove]);

  return (
    <div
      ref={baseRef}
      className="pointer-events-auto absolute bottom-6 left-6 h-32 w-32 rounded-full border-2 border-white/30 bg-white/5 backdrop-blur-sm transition-opacity"
      style={{ opacity: 0.6, touchAction: 'none' }}
    >
      <div
        ref={knobRef}
        className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40 shadow-lg shadow-black/40"
        style={{ touchAction: 'none' }}
      />
    </div>
  );
}
