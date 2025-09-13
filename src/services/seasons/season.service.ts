import { db } from '../../db';
import { seasons } from '../../database/schema';
import { eq, ne } from 'drizzle-orm';

export async function createSeason(data: {
  name: string;
  startDate?: string;
  endDate?: string;
}): Promise<typeof seasons.$inferSelect> {
  const [season] = await db.insert(seasons)
    .values({
      name: data.name,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined
    })
    .returning();

  return season;
}

export async function getSeason(id: string): Promise<typeof seasons.$inferSelect | null> {
  const [season] = await db.select()
    .from(seasons)
    .where(eq(seasons.id, id));
  
  return season || null;
}

export async function getAllSeasons(): Promise<typeof seasons.$inferSelect[]> {
  return await db.select()
    .from(seasons)
    .orderBy(seasons.createdAt);
}

export async function updateSeason(id: string, data: Partial<typeof seasons.$inferSelect>): Promise<typeof seasons.$inferSelect | null> {
  // If isActive is set to true, set all others to false
  if (data.isActive === true) {
    await db.update(seasons)
      .set({ isActive: false, updatedAt: new Date() })
      .where(ne(seasons.id, id));
  }

  const [season] = await db.update(seasons)
    .set({
      ...data,
      startDate: (data as any).startDate ? new Date((data as any).startDate as any) : (data as any).startDate,
      endDate: (data as any).endDate ? new Date((data as any).endDate as any) : (data as any).endDate,
      updatedAt: new Date()
    })
    .where(eq(seasons.id, id))
    .returning();

  return season || null;
}

export async function deleteSeason(id: string): Promise<boolean> {
  const [season] = await db.delete(seasons)
    .where(eq(seasons.id, id))
    .returning();

  return !!season;
} 