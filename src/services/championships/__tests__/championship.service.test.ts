import { describe, it, expect } from 'bun:test';
import { generateSchedule } from '../championsip.service';

function withMockedRandom<T>(fn: () => T): T {
  const original = Math.random;
  Math.random = () => 0.123456789;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function countPairMeetings(schedule: Array<{ home: string; away: string }>) {
  const map = new Map<string, number>();
  for (const match of schedule) {
    const key = [match.home, match.away].sort().join('|');
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

describe('Tournament Scheduler', () => {
  it('defaultban megmarad az oda-vissza (2 meccs/pár) viselkedés', () => {
    const teams = ['A', 'B', 'C', 'D'];
    const withDefault = withMockedRandom(() =>
      generateSchedule({
        teams,
        matchesPerDay: [3, 3],
        startTime: '20:00',
        matchDuration: 40,
        tables: 2,
      })
    );
    const withExplicitTwo = withMockedRandom(() =>
      generateSchedule({
        teams,
        matchesPerDay: [3, 3],
        startTime: '20:00',
        matchDuration: 40,
        tables: 2,
        matchesBetweenOpponents: 2,
      })
    );

    expect(withDefault).toEqual(withExplicitTwo);
    expect(withDefault.length).toBe(12);
  });

  it('helyes meccsszamot ad 1, 2, 3 es 4 meccs/pár esetben', () => {
    const teams = ['A', 'B', 'C', 'D'];
    const uniquePairs = (teams.length * (teams.length - 1)) / 2; // 6

    const one = withMockedRandom(() =>
      generateSchedule({
        teams,
        matchesPerDay: [3],
        startTime: '20:00',
        matchDuration: 40,
        tables: 2,
        matchesBetweenOpponents: 1,
      })
    );
    const two = withMockedRandom(() =>
      generateSchedule({
        teams,
        matchesPerDay: [3, 3],
        startTime: '20:00',
        matchDuration: 40,
        tables: 2,
        matchesBetweenOpponents: 2,
      })
    );
    const three = withMockedRandom(() =>
      generateSchedule({
        teams,
        matchesPerDay: [3, 3, 3],
        startTime: '20:00',
        matchDuration: 40,
        tables: 2,
        matchesBetweenOpponents: 3,
      })
    );
    const four = withMockedRandom(() =>
      generateSchedule({
        teams,
        matchesPerDay: [3, 3, 3, 3],
        startTime: '20:00',
        matchDuration: 40,
        tables: 2,
        matchesBetweenOpponents: 4,
      })
    );

    expect(one.length).toBe(uniquePairs * 1);
    expect(two.length).toBe(uniquePairs * 2);
    expect(three.length).toBe(uniquePairs * 3);
    expect(four.length).toBe(uniquePairs * 4);
  });

  it('minden par pontosan N-szer szerepel a schedule-ben', () => {
    const teams = ['A', 'B', 'C', 'D'];
    const meetings = 3;
    const schedule = withMockedRandom(() =>
      generateSchedule({
        teams,
        matchesPerDay: [3, 3, 3],
        startTime: '20:00',
        matchDuration: 40,
        tables: 2,
        matchesBetweenOpponents: meetings,
      })
    );

    const pairCounts = countPairMeetings(schedule);
    expect(pairCounts.size).toBe(6);
    for (const value of pairCounts.values()) {
      expect(value).toBe(meetings);
    }
  });

  it('a meccs schema idozitesi mezoi valtozatlanul kitoltodnek', () => {
    const schedule = withMockedRandom(() =>
      generateSchedule({
        teams: ['A', 'B', 'C', 'D'],
        matchesPerDay: [3, 3],
        startTime: '20:00',
        matchDuration: 40,
        tables: 2,
        matchesBetweenOpponents: 2,
      })
    );

    for (const match of schedule) {
      expect(typeof match.day).toBe('number');
      expect(typeof match.table).toBe('number');
      expect(typeof match.startTime).toBe('string');
      expect(typeof match.slot).toBe('number');
      expect(typeof match.absoluteMinutes).toBe('number');
      expect(typeof match.globalOrder).toBe('number');
      expect(typeof match.round).toBe('number');
    }
  });

  it('7 csapatnal 4-4-4 napi bontasban minden csapat pontosan 4 meccset kap naponta', () => {
    const teams = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const schedule = withMockedRandom(() =>
      generateSchedule({
        teams,
        matchesPerDay: [4, 4, 4],
        startTime: '20:00',
        matchDuration: 40,
        tables: 3,
        matchesBetweenOpponents: 2,
      })
    );

    expect(schedule.length).toBe(42); // 7 * 6

    const perDayTeamCounts = new Map<number, Map<string, number>>();
    for (const m of schedule) {
      const day = Number(m.day);
      if (!perDayTeamCounts.has(day)) perDayTeamCounts.set(day, new Map<string, number>());
      const dayMap = perDayTeamCounts.get(day)!;
      dayMap.set(m.home, (dayMap.get(m.home) || 0) + 1);
      dayMap.set(m.away, (dayMap.get(m.away) || 0) + 1);
    }

    expect(perDayTeamCounts.size).toBe(3);
    for (const day of [1, 2, 3]) {
      const dayMap = perDayTeamCounts.get(day)!;
      for (const team of teams) {
        expect(dayMap.get(team)).toBe(4);
      }
    }
  });

  it('egy koron belul ugyanaz a csapat nem szerepelhet ketszer (odd teams is)', () => {
    const teams = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const schedule = withMockedRandom(() =>
      generateSchedule({
        teams,
        matchesPerDay: [4, 4, 4],
        startTime: '20:00',
        matchDuration: 40,
        tables: 3,
        matchesBetweenOpponents: 2,
      })
    );

    const byDayRound = new Map<string, Array<{ home: string; away: string }>>();
    for (const m of schedule) {
      const key = `${m.day}-${m.round}`;
      if (!byDayRound.has(key)) byDayRound.set(key, []);
      byDayRound.get(key)!.push({ home: m.home, away: m.away });
    }

    for (const entries of byDayRound.values()) {
      const used = new Set<string>();
      for (const match of entries) {
        expect(used.has(match.home)).toBe(false);
        expect(used.has(match.away)).toBe(false);
        used.add(match.home);
        used.add(match.away);
      }
    }
  });
});
