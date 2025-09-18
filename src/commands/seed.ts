import { db } from "../db";
import { seasons, teams, players, teamPlayers, user as userTable, leagues, leagueTeams } from "../database/schema";
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

async function seedEliteChampionship(seasonId: string, teamNameToId: Record<string, string>) {
  const name = 'ELITE';
  const slug = slugify(name);
  const properties: any = {
    type: 'league',
    rounds: 2,
    teamCount: 12,
    relegations: 2,
    registrationClose: new Date('2025-09-22T21:59:59Z'),
    regfee: '87.000 Ft/csapat',
    regfeeDueDate: '2025-10-10',
    nyeremeny_text: 'Az elite nyertese tárgynyereményeken túl pénznyereményben részesül.',
    nyeremeny_value: '(230.000 Ft)',
    masodik_nyeremeny_text: 'A második helyezett csapat pénznyereményben részesül',
    masodik_nyeremeny_value: '(45.000 Ft)',
    hasPlayoff: true,
    gameDays: [
      { name: 'Qualification', date: '2025-09-26', gameday: false },
      { name: 'PRESEASON', date: '2025-10-03', gameday: false },
      { name: 'Gameday #1', date: '2025-10-10', gameday: true },
      { name: 'Gameday #2', date: '2025-10-24', gameday: true },
      { name: 'Gameday #3', date: '2025-11-07', gameday: true },
      { name: 'Gameday #4', date: '2025-11-21', gameday: true },
    ]
  };

  const [leagueRow] = await db.insert(leagues).values({
    seasonId,
    name,
    slug,
    properties,
    isActive: true,
    isArchived: false,
    phase: 'regular',
  }).returning();

  const leagueId = leagueRow.id as string;
  
  // Add only ELITE teams (exclude ELITE 2 teams)
  const eliteTeamNames = [
    "Albertirsai BPC", "Amíg BEERom", "CraftCinya", "CraftCrew", "csicskaRóli", 
    "Giants", "HESSZ", "KakiMaki", "DUNNO", "KPS-SteelCity", 
    "LeVerEgyBlant", "Te is fiam, Shark!?", "Memento Mori"
  ];
  
  for (const teamName of eliteTeamNames) {
    const teamId = teamNameToId[teamName];
    if (teamId) {
      await db.insert(leagueTeams).values({ leagueId, teamId, status: 'pending' });
    }
  }

  return leagueId;
}

async function seedElite2Championship(seasonId: string, teamNameToId: Record<string, string>) {
  const name = 'ELITE 2';
  const slug = slugify(name);
  const properties: any = {
    type: 'league',
    rounds: 2,
    teamCount: 8,
    relegations: 2,
    registrationClose: new Date('2025-09-22T21:59:59Z'),
    regfee: '60.000 Ft/csapat',
    regfeeDueDate: '2025-10-10',
    nyeremeny_text: 'Az ELITE 2 nyertese',
    nyeremeny_value: 'Indulási jogot szerez az ELITE-be.',
    masodik_nyeremeny_text: 'A második helyezett csapat osztályozót játszik az ELITE 11. helyezettjével.',
    masodik_nyeremeny_value: '',
    hasPlayoff: false,
    gameDays: [
      { name: 'Qualification', date: '2025-09-26', gameday: false },
      { name: 'PRESEASON', date: '2025-10-03', gameday: false },
      { name: 'Gameday #1', date: '2025-10-10', gameday: true },
      { name: 'Gameday #2', date: '2025-10-24', gameday: true },
      { name: 'Gameday #3', date: '2025-11-07', gameday: true },
      { name: 'Gameday #4', date: '2025-11-21', gameday: true },
    ]
  };

  const [leagueRow] = await db.insert(leagues).values({
    seasonId,
    name,
    slug,
    properties,
    isActive: true,
    isArchived: false,
    phase: 'regular',
  }).returning();

  const leagueId = leagueRow.id as string;
  
  // Add ELITE 2 teams
  const elite2TeamNames = ["Midgets", "Frodóért!", "Dinoco", "Bing Bong"];
  for (const teamName of elite2TeamNames) {
    const teamId = teamNameToId[teamName];
    if (teamId) {
      await db.insert(leagueTeams).values({ leagueId, teamId, status: 'pending' });
    }
  }

  return leagueId;
}

type PlayerSeed = {
  firstName: string;
  lastName: string;
  nickname?: string;
  teamName: string;
  email?: string;
  captain?: boolean;
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
        email: p.email || null,
        teamId,
      })
      .returning();

    await db
      .insert(teamPlayers)
      .values({ teamId, playerId: created.id as string, seasonId, captain: !!p.captain });
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
    "Memento Mori",
    "Midgets",
    "Frodóért!",
    "Dinoco",
    "Bing Bong"
  ];
  const teamNameToId = await seedTeams(teamNames);

  // 3) Players and assignments for the active season
  const playerSeeds: PlayerSeed[] = [
    { lastName: "Princz", firstName: "Tamás", teamName: "Albertirsai BPC" },
    { lastName: "Czirókai", firstName: "Zsombor", teamName: "Albertirsai BPC", email: "czformal@gmail.com", captain: true },
    { lastName: "Bogdán", firstName: "Erik", teamName: "Amíg BEERom", email: "erik.bogdan@gmail.com", captain: true },
    { lastName: "Bogdán", firstName: "Krisztián", teamName: "Amíg BEERom" },
    { lastName: "Illés", firstName: "Roland", teamName: "Amíg BEERom" },
    { lastName: "Juhász", firstName: "Árpád", teamName: "KPS-SteelCity", email: "kpsa@outlook.hu", captain: true },
    { lastName: "Antal", firstName: "Norbert", teamName: "KPS-SteelCity" },
    { lastName: "Nagy", firstName: "Benjámin", teamName: "CraftCrew", email: "nagy.benjamin@gtkhk.bme.hu", captain: true },
    { lastName: "Kőrössi", firstName: "Balázs", teamName: "CraftCrew" },
    { lastName: "Zethner", firstName: "Márk", teamName: "DUNNO" },
    { lastName: "Kassai", firstName: "Ákos", teamName: "DUNNO", email: "kassaiakos91@gmail.com", captain: true },
    { lastName: "Frankó", firstName: "Balázs", teamName: "DUNNO" },
    { lastName: "Hegedűs", firstName: "Róbert", teamName: "Te is fiam, Shark!?", email: "hegedusroberthr@gmail.com", captain: true },
    { lastName: "Németh", firstName: "Bence", teamName: "Te is fiam, Shark!?" },
    { lastName: "Juhász", firstName: "Domonkos", teamName: "LeVerEgyBlant", email: "juhaszddomi@gmail.com", captain: true },
    { lastName: "Kelemen", firstName: "Ákos", teamName: "LeVerEgyBlant" },
    { lastName: "Szabó", firstName: "Dávid", nickname: "Jack", teamName: "LeVerEgyBlant" },
    { lastName: "Vágó", firstName: "Soma", teamName: "csicskaRóli" },
    { lastName: "Deák", firstName: "Dániel", teamName: "csicskaRóli", email: "deak.dani22@gmail.com", captain: true },
    { lastName: "Bajusz", firstName: "Zoltán", teamName: "csicskaRóli" },
    { lastName: "Toldy", firstName: "Csaba", teamName: "HESSZ", email: "csaba.toldy03@gmail.com", captain: true },
    { lastName: "Farkas", firstName: "Bence", teamName: "HESSZ" },
    { lastName: "Bodnár", firstName: "Dániel", teamName: "HESSZ" },
    { lastName: "Németh", firstName: "Marcell", teamName: "CraftCinya" },
    { lastName: "Ács", firstName: "Máté", teamName: "CraftCinya", email: "szinyusz@gmail.com", captain: true },
    { lastName: "Molnár", firstName: "Dániel", teamName: "CraftCinya" },
    { lastName: "Tóth", firstName: "Ádám", teamName: "Giants", email: "adam.toth28@gmail.com", captain: true },
    { lastName: "Eiler", firstName: "Bálint", teamName: "Giants" },
    { lastName: "Komán", firstName: "Huba", teamName: "Giants" },
    { lastName: "Szíjártó", firstName: "Dániel", teamName: "KakiMaki" },
    { lastName: "Bodnár", firstName: "Tamás", teamName: "KakiMaki", email: "tamasattila.bodnar@gmail.com", captain: true },
    { lastName: "Kuti", firstName: "Barnabás", teamName: "Memento Mori", email: "kuti.barnabas95@gmail.com", captain: true },
    { lastName: "Szabó", firstName: "Tamás", teamName: "Memento Mori" },
    { lastName: "Fodor", firstName: "Bence", teamName: "Memento Mori" },
    // ELITE 2 teams
    { lastName: "Szilágyi", firstName: "Tas", teamName: "Midgets", captain: true, email: "tas.szilagyi@gmail.com" },
    { lastName: "Tóth", firstName: "Benjamin", teamName: "Midgets" },
    { lastName: "Sárkány", firstName: "Zsolt", teamName: "Midgets" },
    { lastName: "Devecser", firstName: "Zsolt", teamName: "Frodóért!", captain: true, email: "zsdevecser@gmail.com" },
    { lastName: "Karászi", firstName: "Gergely", teamName: "Frodóért!" },
    { lastName: "Griszbacher", firstName: "Norbert", teamName: "Frodóért!" },
    { lastName: "Pék", firstName: "Norbert", teamName: "Dinoco", captain: true, email: "norbeepekd@gmail.com" },
    { lastName: "Orgován", firstName: "Patrik", teamName: "Dinoco" },
    { lastName: "Molnár", firstName: "Zoltán József", teamName: "Dinoco" },
    { lastName: "Pál", firstName: "Zsófia", teamName: "Bing Bong", email: "11palzsofi@gmail.com", captain: true },
    { lastName: "Vitéz", firstName: "Benedek", teamName: "Bing Bong" },
  ];

  await seedPlayersForSeason(playerSeeds, teamNameToId, seasonId);

  // 3/b) Create ELITE championship and attach teams
  await seedEliteChampionship(seasonId, teamNameToId);

  // 3/c) Create ELITE 2 championship and attach teams
  await seedElite2Championship(seasonId, teamNameToId);

  // 4) Ensure admin user
  try {
    await auth.api.createUser({
      body: {
        email: "info@sorpingpong.hu",
        password: "HashtagRolo89",
        name: "Admin",
        role: "admin",
        data: { nickname: "Admin", lang: "hu" },
      },
    } as any);
    console.log("Admin user created");
  } catch (e: any) {
    // If already exists, ensure role
    const [existing] = await db.select().from(userTable).where(eq(userTable.email, "info@sorpingpong.hu"));
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


