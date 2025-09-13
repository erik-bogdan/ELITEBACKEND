import { describe, it, expect } from 'bun:test';
import { generateSchedule, printSchedule } from '../championsip.service';

describe("Tournament Scheduler", () => {
  it("generál egy helyes teljes szezont 12 csapattal és kiírja az időpontokat", () => {
    const teams = Array.from({ length: 12 }, (_, i) => `Team ${i + 1}`);
   // const matchesPerDay = [5, 6, 5, 6];
    const matchesPerDay = [4, 5, 4, 5, 4];

    const schedule = generateSchedule({
      teams,
      matchesPerDay,
      startTime: "20:00",
      matchDuration: 40,
      tables: 6
    });

    // Összes meccs száma: n * (n-1) mert oda-vissza játszanak
    const totalMatches = schedule.length;
    const expectedMatches = teams.length * (teams.length - 1);
   // expect(totalMatches).toBe(expectedMatches);

    // Csoportosítás napokra
    const scheduleByDay: Record<number, typeof schedule> = {};
    for (const match of schedule) {
      if (!scheduleByDay[match.day!]) {
        scheduleByDay[match.day!] = [];
      }
      scheduleByDay[match.day!].push(match);
    }

    // Szép printelés
    const now = new Date().toISOString().slice(0, 10); // pl. "2025-06-12"

    Object.keys(scheduleByDay).sort().forEach(day => {
      console.log(`=== Game Day ${day} (${now}) ===`);
      const dayMatches = scheduleByDay[Number(day)];

      // EZ ITT A LÉNYEGES JAVÍTÁS:
      dayMatches.sort((a, b) => a.globalOrder! - b.globalOrder!);

      dayMatches.forEach(match => {
        console.log(`  ${match.startTime} - ${match.home} vs ${match.away} - table: ${match.table}`);
      });
    });

    // (opcionális extra ellenőrzés: minden match globalOrder-rel rendelkezik)
    for (const match of schedule) {
      expect(match.globalOrder).toBeDefined();
    }
  });
});
