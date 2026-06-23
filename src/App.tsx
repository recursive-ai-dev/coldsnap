import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Game, type GameStatus } from './game/engine';
import { sfx, unlockAudio, setMuted, isMuted } from './game/audio';
import { getLastName, isHighScore, loadScores, saveScore, setLastName, type HighScore } from './game/highscores';
import Joystick from './components/Joystick';

type Screen = 'start' | 'playing' | 'paused' | 'gameover' | 'scores';

function detectTouch() {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [screen, setScreen] = useState<Screen>('start');
  const [score, setScore] = useState(0);
  const [cash, setCash] = useState(0);
  const [warmth, setWarmth] = useState(100);
  const [combo, setCombo] = useState(1);
  const [scores, setScores] = useState<HighScore[]>(() => loadScores());
  const [name, setName] = useState(() => getLastName());
  const [muted, setMutedState] = useState(() => isMuted());
  const [savedThisRun, setSavedThisRun] = useState(false);
  const isTouch = useMemo(() => detectTouch(), []);

  // Initialize game once when entering playing screen
  const startGame = useCallback(() => {
    unlockAudio();
    sfx.start();
    setSavedThisRun(false);
    setScreen('playing');
    // Defer to ensure canvas is mounted
    requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      gameRef.current?.destroy();
      const g = new Game(canvas, {
        onScore: (s, c) => { setScore(s); setCash(c); },
        onWarmth: (w) => setWarmth(w),
        onCombo: (c) => setCombo(c),
        onStatus: (st: GameStatus) => {
          if (st === 'gameover') setScreen('gameover');
          else if (st === 'paused') setScreen('paused');
          else if (st === 'playing') setScreen('playing');
        },
      });
      gameRef.current = g;
      g.start();
    });
  }, []);

  // Save high score when entering gameover
  useEffect(() => {
    if (screen === 'gameover' && !savedThisRun && score > 0) {
      const entry: HighScore = {
        name: (name.trim() || 'Anon').slice(0, 12),
        score, cash, date: Date.now(),
      };
      const top = saveScore(entry);
      setScores(top);
      setSavedThisRun(true);
    }
  }, [screen, savedThisRun, score, cash, name]);

  useEffect(() => () => gameRef.current?.destroy(), []);

  // Resize the canvas on mount/orientation change
  useEffect(() => {
    if (screen === 'playing' || screen === 'paused' || screen === 'gameover') {
      const t = setTimeout(() => gameRef.current?.resize(), 50);
      return () => clearTimeout(t);
    }
  }, [screen]);

  const handlePauseToggle = () => {
    if (!gameRef.current) return;
    if (gameRef.current.status === 'playing') gameRef.current.pause();
    else if (gameRef.current.status === 'paused') gameRef.current.resume();
  };

  const handleRestart = () => {
    sfx.click();
    startGame();
  };

  const handleQuit = () => {
    sfx.click();
    gameRef.current?.destroy();
    gameRef.current = null;
    setScreen('start');
  };

  const handleJoy = useCallback((x: number, y: number, active: boolean) => {
    gameRef.current?.setJoystick(x, y, active);
  }, []);

  const toggleMute = () => {
    const nm = !muted;
    setMuted(nm);
    setMutedState(nm);
  };

  const inGame = screen === 'playing' || screen === 'paused' || screen === 'gameover';

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#05070d] text-white select-none" style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system' }}>
      {/* Snowy ambient background for menus */}
      <BackgroundAurora />

      {/* Canvas */}
      {inGame && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ imageRendering: 'auto', touchAction: 'none' }}
        />
      )}

      {/* HUD */}
      {inGame && (
        <Hud
          score={score}
          cash={cash}
          warmth={warmth}
          combo={combo}
          onPause={handlePauseToggle}
          onMute={toggleMute}
          muted={muted}
          paused={screen === 'paused'}
        />
      )}

      {/* Touch joystick */}
      {inGame && isTouch && screen === 'playing' && <Joystick onMove={handleJoy} />}

      {/* Start screen */}
      {screen === 'start' && (
        <StartScreen
          name={name}
          setName={(n) => { setName(n); setLastName(n); }}
          onStart={startGame}
          onScores={() => { sfx.click(); setScreen('scores'); }}
          scores={scores}
          isTouch={isTouch}
        />
      )}

      {/* Pause overlay */}
      {screen === 'paused' && (
        <Overlay>
          <Panel>
            <h2 className="text-4xl font-black tracking-tight text-amber-200">PAUSED</h2>
            <p className="text-white/60">Take a breath. The cold will wait.</p>
            <div className="mt-4 flex flex-col gap-2">
              <button onClick={handlePauseToggle} className={btnPrimary}>Resume</button>
              <button onClick={handleRestart} className={btnGhost}>Restart</button>
              <button onClick={handleQuit} className={btnGhost}>Quit</button>
            </div>
          </Panel>
        </Overlay>
      )}

      {/* Game over overlay */}
      {screen === 'gameover' && (
        <Overlay>
          <Panel>
            <h2 className="text-4xl font-black tracking-tight text-red-300">GAME OVER</h2>
            <p className="text-sm text-white/60">The chinook didn't come in time.</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-left">
              <Stat label="Score" value={score.toLocaleString()} accent="text-amber-300" />
              <Stat label="Cash earned" value={`$${cash}`} accent="text-emerald-300" />
            </div>
            {isHighScore(score) && score > 0 && (
              <div className="mt-3 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
                ⭐ New high score!
              </div>
            )}
            <MiniScoreboard scores={scores} highlightScore={score} />
            <div className="mt-4 flex flex-col gap-2">
              <button onClick={handleRestart} className={btnPrimary}>Play Again</button>
              <button onClick={handleQuit} className={btnGhost}>Main Menu</button>
            </div>
            <p className="mt-3 text-xs text-white/40">Press <Kbd>R</Kbd> to restart instantly</p>
          </Panel>
        </Overlay>
      )}

      {/* Scores screen */}
      {screen === 'scores' && (
        <Overlay>
          <Panel wide>
            <h2 className="text-3xl font-black tracking-tight text-amber-200">High Scores</h2>
            <FullScoreboard scores={scores} />
            <div className="mt-4 flex gap-2">
              <button onClick={() => { sfx.click(); setScreen('start'); }} className={btnGhost}>Back</button>
              <button onClick={startGame} className={btnPrimary}>Play</button>
            </div>
          </Panel>
        </Overlay>
      )}

      {/* Instant-restart hotkey */}
      <HotkeyHandler
        onRestart={() => { if (screen === 'gameover') handleRestart(); }}
      />
    </div>
  );
}

const btnPrimary = "px-4 py-2.5 rounded-md font-bold tracking-wide bg-gradient-to-b from-amber-300 to-amber-500 text-black shadow-lg shadow-amber-900/40 hover:from-amber-200 hover:to-amber-400 active:translate-y-px transition";
const btnGhost = "px-4 py-2 rounded-md font-semibold text-white/90 bg-white/5 hover:bg-white/10 border border-white/10 transition";

function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="inline-block px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-xs font-mono">{children}</span>;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-md bg-white/5 p-3">
      <div className="text-[10px] uppercase tracking-widest text-white/50">{label}</div>
      <div className={`text-xl font-black ${accent ?? 'text-white'}`}>{value}</div>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4 animate-[fadeIn_.2s_ease-out]">
      {children}
    </div>
  );
}

function Panel({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`relative w-full ${wide ? 'max-w-md' : 'max-w-sm'} rounded-2xl border border-white/10 bg-gradient-to-b from-[#101627]/95 to-[#070a14]/95 p-6 text-center shadow-2xl shadow-black/60 animate-[popIn_.25s_cubic-bezier(.2,1.4,.4,1)]`}>
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/5" />
      <div className="relative">{children}</div>
    </div>
  );
}

function Hud({ score, cash, warmth, combo, paused, onPause, onMute, muted }: {
  score: number; cash: number; warmth: number; combo: number; paused: boolean;
  onPause: () => void; onMute: () => void; muted: boolean;
}) {
  const warmthColor = warmth > 60 ? 'from-orange-400 to-amber-300' : warmth > 30 ? 'from-yellow-400 to-orange-400' : 'from-sky-300 to-blue-500';
  return (
    <>
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex items-start justify-between p-3 sm:p-4">
        <div className="flex flex-col gap-2 pointer-events-auto">
          <div className="rounded-xl bg-black/60 px-4 py-2 backdrop-blur border border-white/10 shadow-lg">
            <div className="text-[10px] uppercase tracking-widest text-white/50">Score</div>
            <div className="text-2xl font-black tabular-nums text-amber-200 leading-none">{score.toLocaleString()}</div>
          </div>
          <div className="rounded-xl bg-black/60 px-3 py-1.5 backdrop-blur border border-white/10 text-sm">
            <span className="text-emerald-300 font-bold tabular-nums">${cash}</span>
            <span className="text-white/40 text-xs ml-2">cash</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 pointer-events-auto">
          <div className="flex gap-2">
            <button onClick={onMute} aria-label="Mute" className="h-10 w-10 rounded-xl bg-black/60 backdrop-blur border border-white/10 text-lg hover:bg-black/80 transition">{muted ? '🔇' : '🔊'}</button>
            <button onClick={onPause} aria-label="Pause" className="h-10 w-10 rounded-xl bg-black/60 backdrop-blur border border-white/10 text-lg hover:bg-black/80 transition">{paused ? '▶' : '❚❚'}</button>
          </div>
          {combo > 1 && (
            <div className="rounded-xl bg-amber-500/20 border border-amber-300/40 px-3 py-1 text-amber-200 font-black text-sm shadow shadow-amber-900/40 animate-[pulse_1s_ease-in-out_infinite]">
              x{combo} COMBO
            </div>
          )}
        </div>
      </div>

      {/* Warmth bar bottom */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 w-[min(90vw,420px)] -translate-x-1/2 px-3">
        <div className="rounded-xl bg-black/60 px-3 py-2 backdrop-blur border border-white/10 shadow-lg">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-white/60 mb-1">
            <span>🔥 Warmth</span>
            <span className="tabular-nums">{Math.ceil(warmth)}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${warmthColor} transition-[width] duration-150`}
              style={{ width: `${warmth}%` }}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function StartScreen({ name, setName, onStart, onScores, scores, isTouch }: {
  name: string; setName: (n: string) => void;
  onStart: () => void; onScores: () => void;
  scores: HighScore[]; isTouch: boolean;
}) {
  const top = scores[0];
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto p-4">
      <div className="w-full max-w-lg animate-[popIn_.4s_cubic-bezier(.2,1.4,.4,1)]">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#0e1426]/95 to-[#050810]/95 p-6 sm:p-8 shadow-2xl shadow-black/70 backdrop-blur">
          <div className="text-center">
            <div className="inline-block text-[10px] uppercase tracking-[0.3em] text-sky-300/80 mb-2">A Calgary Survival Tale</div>
            <h1 className="text-5xl sm:text-6xl font-black tracking-tight bg-gradient-to-b from-white via-sky-100 to-sky-300 bg-clip-text text-transparent drop-shadow">
              COLD SNAP
            </h1>
            <p className="mt-2 text-white/60 text-sm">Scrape together cash. Stay warm. Outrun the cold and the cops.</p>
          </div>

          {/* Mini preview art */}
          <div className="my-5 grid grid-cols-3 gap-2 text-xs text-white/70">
            <Tile emoji="🍾" label="Bottles +$5" />
            <Tile emoji="🥫" label="Cans +$10" />
            <Tile emoji="🪙" label="Coins +$25" />
            <Tile emoji="👛" label="Wallet +$100" />
            <Tile emoji="🔥" label="Warm up" />
            <Tile emoji="🚔" label="Avoid" />
          </div>

          <div className="mb-4">
            <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-1">Your name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value.slice(0, 12))}
              placeholder="Anon"
              maxLength={12}
              className="w-full rounded-md bg-white/5 border border-white/15 px-3 py-2 text-white outline-none focus:border-amber-300/60 focus:bg-white/10"
            />
          </div>

          <button onClick={onStart} className={`${btnPrimary} w-full text-lg`}>
            ▶ START
          </button>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={onScores} className={btnGhost}>🏆 High Scores</button>
            <a href="#" onClick={(e) => { e.preventDefault(); onStart(); }} className={`${btnGhost} text-center`}>
              How to Play
            </a>
          </div>

          <div className="mt-5 rounded-xl bg-black/40 border border-white/10 p-3 text-xs text-white/70">
            <div className="font-bold text-white/90 mb-1">Controls</div>
            {isTouch ? (
              <div>Use the on-screen joystick to move. Tap <span className="font-mono">❚❚</span> to pause.</div>
            ) : (
              <div className="space-y-0.5">
                <div><Kbd>WASD</Kbd> / <Kbd>Arrows</Kbd> — Move</div>
                <div><Kbd>P</Kbd> / <Kbd>Esc</Kbd> — Pause • <Kbd>R</Kbd> — Restart (on Game Over)</div>
              </div>
            )}
          </div>

          {top && (
            <div className="mt-4 text-center text-xs text-white/50">
              Top score: <span className="text-amber-300 font-bold tabular-nums">{top.score.toLocaleString()}</span> by <span className="text-white/80">{top.name}</span>
            </div>
          )}
        </div>
        <p className="mt-3 text-center text-[11px] text-white/30">A respectful arcade tribute. Stay warm out there.</p>
      </div>
    </div>
  );
}

function Tile({ emoji, label }: { emoji: string; label: string }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 p-2 text-center">
      <div className="text-2xl">{emoji}</div>
      <div className="text-[10px] mt-0.5">{label}</div>
    </div>
  );
}

function MiniScoreboard({ scores, highlightScore }: { scores: HighScore[]; highlightScore: number }) {
  if (!scores.length) return null;
  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-black/40 p-2">
      <div className="text-[10px] uppercase tracking-widest text-white/50 mb-1 px-1">Top Scores</div>
      <ol className="space-y-0.5 text-sm">
        {scores.slice(0, 5).map((s, i) => {
          const me = s.score === highlightScore;
          return (
            <li key={i} className={`flex justify-between items-baseline px-2 py-1 rounded ${me ? 'bg-amber-400/15 text-amber-200' : ''}`}>
              <span className="text-white/40 w-5">{i + 1}.</span>
              <span className={`flex-1 truncate ${me ? 'font-bold' : ''}`}>{s.name}</span>
              <span className="tabular-nums font-bold">{s.score.toLocaleString()}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function FullScoreboard({ scores }: { scores: HighScore[] }) {
  if (!scores.length) return <p className="text-white/50 my-6">No scores yet. Be the first!</p>;
  return (
    <ol className="mt-4 max-h-80 overflow-y-auto rounded-lg border border-white/10 bg-black/40">
      {scores.map((s, i) => (
        <li key={i} className="flex items-baseline gap-2 border-b border-white/5 px-3 py-2 last:border-0">
          <span className={`w-6 text-right tabular-nums ${i === 0 ? 'text-amber-300 font-black' : 'text-white/40'}`}>{i + 1}</span>
          <span className="flex-1 truncate text-left">{s.name}</span>
          <span className="text-emerald-300/80 text-xs tabular-nums">${s.cash}</span>
          <span className="w-20 text-right tabular-nums font-bold text-amber-200">{s.score.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}

function HotkeyHandler({ onRestart }: { onRestart: () => void }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'r') onRestart();
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onRestart]);
  return null;
}

function BackgroundAurora() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-sky-500/20 blur-3xl" />
      <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
      <div className="absolute top-1/3 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-amber-400/10 blur-3xl" />
      {/* Snow particles */}
      <SnowOverlay />
    </div>
  );
}

function SnowOverlay() {
  const flakes = useMemo(() => Array.from({ length: 40 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 12,
    duration: 8 + Math.random() * 10,
    size: 2 + Math.random() * 3,
    opacity: 0.3 + Math.random() * 0.5,
  })), []);
  return (
    <div className="absolute inset-0">
      {flakes.map(f => (
        <span
          key={f.id}
          className="absolute top-[-10px] block rounded-full bg-white"
          style={{
            left: `${f.left}%`,
            width: f.size, height: f.size,
            opacity: f.opacity,
            animation: `snowfall ${f.duration}s linear ${f.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
