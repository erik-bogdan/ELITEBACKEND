import { db } from "../db";
import { seasons, teams, players, teamPlayers, user as userTable } from "../database/schema";
import { eq } from "drizzle-orm";
import { auth } from "../plugins/auth/auth";

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

async function ensureSingleActiveSeason(name: string, startDate: Date, endDate: Date) {
  // Deactivate all seasons, then create the target active season
  const all = await db.select().from(seasons);
  if (all.length > 0) {
    for (const s of all) {
      await db.update(seasons).set({ isActive: false }).where(eq(seasons.id, s.id));
    }
  }
  const [created] = await db
    .insert(seasons)
    .values({ name, startDate, endDate, isActive: true })
    .returning();
  return created.id;
}

async function seedTeams(names: string[]) {
  const created: Record<string, string> = {};
  for (const name of names) {
    const slug = slugify(name);
    const [row] = await db
      .insert(teams)
      .values({ name, slug, logo: `/uploads/team-logos/${slug}.png` })
      .returning();
    created[name] = row.id as string;
  }
  return created;
}

type PlayerSeed = {
  firstName: string;
  lastName: string;
  nickname?: string;
  teamName: string;
};

async function seedPlayersForSeason(playerSeeds: PlayerSeed[], teamNameToId: Record<string, string>, seasonId: string) {
  for (const p of playerSeeds) {
    const teamId = teamNameToId[p.teamName];
    if (!teamId) throw new Error(`Missing team for player ${p.firstName} ${p.lastName}: ${p.teamName}`);

    const nickname = (p.nickname || `${p.firstName} ${p.lastName}`).trim();
    const [created] = await db
      .insert(players)
      .values({
        firstName: p.firstName,
        lastName: p.lastName,
        nickname,
        teamId,
      })
      .returning();

    await db
      .insert(teamPlayers)
      .values({ teamId, playerId: created.id as string, seasonId, captain: false });
  }
}

async function main() {
  // 1) Season
  const seasonId = await ensureSingleActiveSeason(
    "2025/2026 Ősz",
    new Date("2025-10-01T00:00:00.000Z"),
    new Date("2025-12-31T00:00:00.000Z")
  );

  // 2) Teams
  const teamNames = [
    "Albertirsai BPC",
    "Amíg BEERom",
    "CraftCinya",
    "CraftCrew",
    "csicskaRóli",
    "Giants",
    "HESSZ",
    "KakiMaki",
    "DUNNO",
    "KPS-SteelCity",
    "LeVerEgyBlant",
    "Te is fiam, Shark!?",
  ];
  const teamNameToId = await seedTeams(teamNames);

  // 3) Players and assignments for the active season
  const playerSeeds: PlayerSeed[] = [
    { firstName: "Princz", lastName: "Tamás", teamName: "Albertirsai BPC" },
    { firstName: "Czirókai", lastName: "zsombor", teamName: "Albertirsai BPC" },
    { firstName: "Bogdán", lastName: "Erik", teamName: "Amíg BEERom" },
    { firstName: "Bogdán", lastName: "Krisztián", teamName: "Amíg BEERom" },
    { firstName: "Illés", lastName: "Roland", teamName: "Amíg BEERom" },
    { firstName: "Juhász", lastName: "Árpád", teamName: "KPS-SteelCity" },
    { firstName: "Antal", lastName: "Norbert", teamName: "KPS-SteelCity" },
    { firstName: "Nagy", lastName: "Benjámin", teamName: "CraftCrew" },
    { firstName: "Kőrössi", lastName: "Balázs", teamName: "CraftCrew" },
    { firstName: "Zethner", lastName: "Márk", teamName: "DUNNO" },
    { firstName: "Kassai", lastName: "Ákos", teamName: "DUNNO" },
    { firstName: "Frankó", lastName: "Balázs", teamName: "DUNNO" },
    { firstName: "Hegedűs", lastName: "Róbert", teamName: "Te is fiam, Shark!?" },
    { firstName: "Németh", lastName: "Bence", teamName: "Te is fiam, Shark!?" },
    { firstName: "Juhász", lastName: "Domonkos", teamName: "LeVerEgyBlant" },
    { firstName: "Kelemen", lastName: "Ákos", teamName: "LeVerEgyBlant" },
    { firstName: "Szabó", lastName: "Dávid", nickname: "Jack", teamName: "LeVerEgyBlant" },
    { firstName: "Vágó", lastName: "Soma", teamName: "csicskaRóli" },
    { firstName: "Deák", lastName: "Dániel", teamName: "csicskaRóli" },
    { firstName: "Bajusz", lastName: "Zoltán", teamName: "csicskaRóli" },
    { firstName: "Toldi", lastName: "Csaba", teamName: "HESSZ" },
    { firstName: "Farkas", lastName: "Bence", teamName: "HESSZ" },
    { firstName: "Bodnár", lastName: "Dániel", teamName: "HESSZ" },
    { firstName: "Németh", lastName: "Marcell", teamName: "CraftCinya" },
    { firstName: "Ács", lastName: "Máté", teamName: "CraftCinya" },
    { firstName: "Molnár", lastName: "Dániel", teamName: "CraftCinya" },
    { firstName: "Tóth", lastName: "Ádám", teamName: "Giants" },
    { firstName: "Eiler", lastName: "Bálint", teamName: "Giants" },
    { firstName: "Komán", lastName: "Huba", teamName: "Giants" },
    { firstName: "Szíjártó", lastName: "Dániel", teamName: "KakiMaki" },
    { firstName: "Bodnár", lastName: "Tamás", teamName: "KakiMaki" },
  ];

  await seedPlayersForSeason(playerSeeds, teamNameToId, seasonId);

  // 4) Ensure admin user
  try {
    await auth.api.createUser({
      body: {
        email: "admin@admin.com",
        password: "admin",
        name: "Admin",
        role: "admin",
        data: { nickname: "Admin", lang: "hu" },
      },
    } as any);
    console.log("Admin user created (admin@admin.com / admin)");
  } catch (e: any) {
    // If already exists, ensure role
    const [existing] = await db.select().from(userTable).where(eq(userTable.email, "admin@admin.com"));
    if (existing) {
      await db.update(userTable)
        .set({ role: "admin", nickname: existing.nickname ?? "Admin", name: existing.name ?? "Admin" })
        .where(eq(userTable.id, existing.id));
      console.log("Admin user already existed; role ensured.");
    } else {
      console.error("Failed to create or ensure admin user:", e?.message || e);
    }
  }

  console.log("Seed completed: season, teams, and player assignments inserted.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


