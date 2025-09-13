import { db } from "../db";
import { teams } from "../database/schema";

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const sampleNames = [
  "Elite Aces",
  "Power Pints",
  "Neon Shots",
  "Foam Fighters",
  "Cup Kings",
  "Ping Masters",
  "Barrel Rollers",
  "Draft Dynamos",
  "Hops Heroes",
  "Bounce Brigade",
];

async function main() {
  const num = Number(process.argv[2] || 10);
  for (let i = 0; i < num; i++) {
    const base = sampleNames[i % sampleNames.length] + (i >= sampleNames.length ? ` ${i + 1}` : "");
    const name = base;
    const slug = slugify(name);
    await db.insert(teams).values({ name, slug, description: null, properties: null }).onConflictDoNothing();
  }
  console.log(`Seeded ${num} teams`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


