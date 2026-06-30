import { describe, it, expect, beforeEach } from 'vitest';
import { loadScores, saveScore, isHighScore, getLastName, setLastName } from './highscores';

describe('Highscores', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads empty array if no scores', () => {
    expect(loadScores()).toEqual([]);
  });

  it('saves and loads a score', () => {
    const score = { name: 'Player1', score: 100, cash: 50, date: Date.now() };
    saveScore(score);

    const loaded = loadScores();
    expect(loaded.length).toBe(1);
    expect(loaded[0].name).toBe('Player1');
    expect(loaded[0].score).toBe(100);
  });

  it('sorts scores descending and limits to 10', () => {
    for (let i = 0; i < 15; i++) {
      saveScore({ name: `P${i}`, score: i * 10, cash: 0, date: Date.now() });
    }

    const loaded = loadScores();
    expect(loaded.length).toBe(10);
    expect(loaded[0].score).toBe(140);
    expect(loaded[9].score).toBe(50);
  });

  it('checks if high score correctly', () => {
    expect(isHighScore(10)).toBe(true); // empty list

    for (let i = 0; i < 10; i++) {
      saveScore({ name: `P${i}`, score: (i + 1) * 10, cash: 0, date: Date.now() });
    }

    // lowest is 10
    expect(isHighScore(5)).toBe(false);
    expect(isHighScore(15)).toBe(true);
  });

  it('handles last name persistence', () => {
    expect(getLastName()).toBe('');
    setLastName('NewName');
    expect(getLastName()).toBe('NewName');
  });
});
