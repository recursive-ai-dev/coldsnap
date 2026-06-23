export interface HighScore { name: string; score: number; cash: number; date: number; }

const KEY = 'coldsnap.highscores.v1';
const NAME_KEY = 'coldsnap.lastname';

export function loadScores(): HighScore[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(s => typeof s.score === 'number').slice(0, 10);
  } catch { return []; }
}

export function saveScore(s: HighScore): HighScore[] {
  const all = loadScores();
  all.push(s);
  all.sort((a, b) => b.score - a.score);
  const top = all.slice(0, 10);
  try { localStorage.setItem(KEY, JSON.stringify(top)); } catch {}
  return top;
}

export function isHighScore(score: number) {
  const all = loadScores();
  return all.length < 10 || score > (all[all.length - 1]?.score ?? 0);
}

export function getLastName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}
export function setLastName(n: string) {
  try { localStorage.setItem(NAME_KEY, n); } catch {}
}
