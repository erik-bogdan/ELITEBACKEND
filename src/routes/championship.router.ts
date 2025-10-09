import { Elysia } from 'elysia';
import {
  generateSchedule,
  getLeagueTeams,
  addTeamToLeague,
  removeTeamFromLeague,

  createChampionship,
  getChampionship,
  getAllChampionships,
  updateChampionship,
  archiveChampionship,
  getAvailableTeamsForLeague,
  computeStandings,
  computeGameDayMvps,
  computeRankSeries
} from '../services/championships/championsip.service';
import { db } from '../db';
import { leagueTeams, matches, leagues, seasons, teams, teamPlayers, players, playerInvitations } from '../database/schema';
import { eq, sql, and } from 'drizzle-orm';
import TeamInviteEmail from '../emails/invite';
import { EmailService } from '../services/email.service';
import { nanoid } from 'nanoid';
import { LoggingService } from '../services/logging.service';
import { auth } from '../plugins/auth/auth';

export const championshipRouter = new Elysia({ prefix: '/api/championship' })
  .post('/', async ({ body, set, request }) => {
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      const result = await createChampionship(body as any);

      // Log championship creation
      if (session && result && result.name) {
        await LoggingService.logChampionshipCreate(session.user.id, result.name);
      }

      return result;
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  })
  .get('/:id/standings/gameday/:gameDay/image', async ({ params: { id, gameDay }, query, set }) => {
    try {
      const gd = Number(gameDay);
      if (!Number.isFinite(gd) || gd < 1) throw new Error('Invalid gameDay');
      const mvpPlayerId = (query as any)?.mvpPlayerId as string | undefined;
      const { computeStandings } = await import('../services/championships/championsip.service');
      const cur = await computeStandings(id, { uptoGameDay: gd });
      const prev = gd > 1 ? await computeStandings(id, { uptoGameDay: gd - 1 }) : [];
      const prevRank = new Map<string, number>();
      for (const r of prev as any[]) prevRank.set(r.teamId, r.rank);
      // Compose SVG (no native deps)
      const { readFile } = await import('node:fs/promises');
      const path = await import('node:path');
      const templatePath = path.resolve(process.cwd(), 'uploads', 'template.png');
      // Try to embed Bebas Neue font directly to ensure consistent rendering in resvg
      async function resolveExistingPath(paths: string[]): Promise<string | null> {
        for (const p of paths) {
          try { await readFile(p); return p; } catch { }
        }
        return null;
      }
      async function loadFont(paths: string[]): Promise<{ dataUri: string; mime: string } | null> {
        const p = await resolveExistingPath(paths);
        if (!p) return null;
        const buf = await readFile(p);
        const mime = p.endsWith('.woff2') ? 'font/woff2' : 'font/ttf';
        return { dataUri: `data:${mime};base64,${buf.toString('base64')}`, mime };
      }
      const fontRegular = await loadFont([
        path.resolve(process.cwd(), 'uploads', 'fonts', 'BebasNeue-Regular.woff2'),
        path.resolve(process.cwd(), 'uploads', 'BebasNeue-Regular.woff2'),
        path.resolve(process.cwd(), 'uploads', 'fonts', 'BebasNeue-Regular.ttf'),
        path.resolve(process.cwd(), 'uploads', 'BebasNeue-Regular.ttf'),
      ]);
      const fontBold = await loadFont([
        path.resolve(process.cwd(), 'uploads', 'fonts', 'BebasNeue-Bold.woff2'),
        path.resolve(process.cwd(), 'uploads', 'BebasNeue-Bold.woff2'),
        path.resolve(process.cwd(), 'uploads', 'fonts', 'BebasNeue-Bold.ttf'),
        path.resolve(process.cwd(), 'uploads', 'BebasNeue-Bold.ttf'),
      ]);
      let bgDataUri = '';
      try {
        const buf = await readFile(templatePath);
        bgDataUri = `data:image/png;base64,${buf.toString('base64')}`;
      } catch { }
      // Load marker icons (optional)
      async function readPngDataUri(p: string): Promise<string | null> {
        try { const b = await readFile(p); return `data:image/png;base64,${b.toString('base64')}`; } catch { return null; }
      }
      const upIcon = await readPngDataUri(path.resolve(process.cwd(), 'uploads', 'up.png'));
      const downIcon = await readPngDataUri(path.resolve(process.cwd(), 'uploads', 'down.png'));
      const nullIcon = await readPngDataUri(path.resolve(process.cwd(), 'uploads', 'null.png'));
      const seasonLogo = await readPngDataUri(path.resolve(process.cwd(), 'uploads', 'seasonlogo.png'));
      // Render at 2x for sharper downscale
      const W = 1920, H = 1080, SCALE = 2;
      const width = W * SCALE; const height = H * SCALE;
      const startX = 120 * SCALE; const startY = 260 * SCALE; const lineH = 62 * SCALE;
      const showDelta = gd > 1;
      const rankFont = 48 * SCALE; const nameFont = 48 * SCALE; const arrowFont = 36 * SCALE;
      const nameOffsetX = 110 * SCALE;
      // Rough text measurement for Bebas Neue uppercase to place markers tight
      function measureBebasWidth(text: string, fontSize: number): number {
        const coeff: Record<string, number> = {
          ' ': 0.34, '-': 0.38, '.': 0.20, ',': 0.24, "'": 0.20, '!': 0.28, '?': 0.56, ':': 0.22,
          'A': 0.78, 'Á': 0.78, 'B': 0.74, 'C': 0.74, 'D': 0.78, 'E': 0.62, 'É': 0.62, 'F': 0.62,
          'G': 0.78, 'H': 0.74, 'I': 0.38, 'Í': 0.38, 'J': 0.52, 'K': 0.70, 'L': 0.50, 'M': 0.98,
          'N': 0.86, 'O': 0.82, 'Ó': 0.82, 'Ö': 0.82, 'Ő': 0.82, 'P': 0.70, 'Q': 0.86, 'R': 0.78,
          'S': 0.66, 'T': 0.62, 'U': 0.78, 'Ú': 0.78, 'Ü': 0.78, 'Ű': 0.78, 'V': 0.82, 'W': 1.02,
          'X': 0.78, 'Y': 0.78, 'Z': 0.74,
          '0': 0.70, '1': 0.48, '2': 0.70, '3': 0.70, '4': 0.70, '5': 0.70, '6': 0.70, '7': 0.66,
          '8': 0.72, '9': 0.70
        };
        let total = 0;
        for (const ch of text) total += (coeff[ch] ?? 0.72);
        return Math.round(total * fontSize);
      }
      // Preload team logos to data URIs (when local) to ensure rendering
      const logosMap = new Map<string, string>();
      try {
        for (const r of cur as any[]) {
          const rawLogo = (r.logo || '') as string;
          if (!rawLogo) continue;
          let dataHref: string | null = null;
          try {
            let localPath: string | null = null;
            if (/^https?:\/\//i.test(rawLogo)) {
              try {
                const u = new URL(rawLogo);
                if (u.pathname.startsWith('/uploads')) {
                  localPath = path.resolve(process.cwd(), '.' + u.pathname);
                }
              } catch { }
            } else if (rawLogo.startsWith('/uploads')) {
              localPath = path.resolve(process.cwd(), '.' + rawLogo);
            } else if (rawLogo.startsWith('uploads')) {
              localPath = path.resolve(process.cwd(), rawLogo);
            } else {
              localPath = path.resolve(process.cwd(), 'uploads', rawLogo);
            }
            if (localPath) {
              const fileBuf = await readFile(localPath);
              const lower = localPath.toLowerCase();
              const mime = lower.endsWith('.webp') ? 'image/webp' : (lower.endsWith('.svg') ? 'image/svg+xml' : 'image/png');
              dataHref = `data:${mime};base64,${fileBuf.toString('base64')}`;
            }
          } catch { }
          if (!dataHref && /^https?:\/\//i.test(rawLogo)) dataHref = rawLogo;
          if (dataHref) logosMap.set(r.teamId as string, dataHref);
        }
      } catch { }

      const rowsSvg = (cur as any[]).map((row: any, idx: number) => {
        const y = startY + idx * lineH;
        const delta = prevRank.has(row.teamId) ? (prevRank.get(row.teamId)! - row.rank) : 0;
        const upper = (row.name || '').toUpperCase();
        const drawChange = showDelta && delta !== 0;
        // Use calibrated average width for tight placement next to name
        const nameWidth = Math.round(upper.length * nameFont * 0.40);
        // Team logo before name (from preloaded map)
        const logoW = 40 * SCALE; const logoH = 40 * SCALE; const logoGap = 12 * SCALE;
        const logoX = startX + nameOffsetX - (logoW + logoGap);
        const logoY = y - logoH;
        const logoHref = logosMap.get(row.teamId as string) || '';
        const logoEl = logoHref ? `<image 
  href="${logoHref}" 
  x="${logoX}" 
  y="${logoY}" 
  width="${logoW}" 
  height="${logoH}" 
  preserveAspectRatio="xMidYMid meet"
/>` : '';
        const color = drawChange ? (delta > 0 ? '#18c945' : '#ff2b2b') : '#bfbfbf';
        const iconData = drawChange ? (delta > 0 ? upIcon : downIcon) : nullIcon;
        const iconW = 20 * SCALE; const iconH = 20 * SCALE; const iconY = y - 20 * SCALE; // align to text baseline
        const iconX = startX + nameOffsetX + nameWidth + 6 * SCALE;
        const deltaText = drawChange ? (delta > 0 ? `(+${delta})` : `(${delta})`) : '';
        const imgEl = iconData ? `<image href="${iconData}" x="${iconX}" y="${iconY}" width="${iconW}" height="${iconH}" image-rendering="optimizeQuality" />` : `<rect x="${iconX}" y="${y - 8}" width="18" height="4" rx="2" ry="2" fill="#bfbfbf" />`;
        const deltaEl = drawChange ? `<text x="${iconX + iconW + 6}" y="${y}" fill="${color}" font-family="BebasNeueEmbed, Bebas Neue" font-size="${arrowFont}" font-weight="700">${deltaText}</text>` : '';
        return `<g>
          <text x="${startX}" y="${y}" fill="#ffffff" font-family="BebasNeueEmbed, Bebas Neue" font-size="${rankFont}" font-weight="700">${idx + 1}.</text>
          ${logoEl}
          <text x="${startX + nameOffsetX}" y="${y}" fill="#ffffff" font-family="BebasNeueEmbed, Bebas Neue" font-size="${nameFont}" font-weight="700">${upper}</text>
          ${imgEl}
          ${deltaEl}
        </g>`;
      }).join('');
      const fontFace = `${fontRegular ? `@font-face{font-family:'BebasNeueEmbed';src:url('${fontRegular.dataUri}') format('${fontRegular.mime === 'font/woff2' ? 'woff2' : 'truetype'}');font-weight:400;font-style:normal;}` : ''}
        ${fontBold ? `@font-face{font-family:'BebasNeueEmbed';src:url('${fontBold.dataUri}') format('${fontBold.mime === 'font/woff2' ? 'woff2' : 'truetype'}');font-weight:700;font-style:normal;}` : (fontRegular ? `@font-face{font-family:'BebasNeueEmbed';src:url('${fontRegular.dataUri}') format('${fontRegular.mime === 'font/woff2' ? 'woff2' : 'truetype'}');font-weight:700;font-style:normal;}` : '')}`;
      const rightMargin = 80 * SCALE;
      const titleX = width - rightMargin;
      const titleY = 300 * SCALE;
      const titleFont = 96 * SCALE;
      const seasonW = 520 * SCALE;
      const seasonH = 180 * SCALE;
      const seasonX = width / 2 - seasonW / 2;
      const seasonY = 40 * SCALE;
      // Optional MVP overlays
      let mvpName: string | null = null;
      let mvpTeamLogo: string | null = null;
      let mvpImage: { dataUri: string; w: number; h: number } | null = null;
      let showNoPlayer = false;
      if (mvpPlayerId === 'no-player') {
        showNoPlayer = true;
      } else if (mvpPlayerId) {
        try {
          const [pl] = await db.select().from(players).where(eq(players.id, mvpPlayerId));
          if (pl) {
            mvpName = `${pl.lastName || ''} ${pl.firstName || ''}`.trim() || (pl.nickname || '');
            // Find team in this championship season
            const [lg] = await db.select().from(leagues).where(eq(leagues.id, id));
            const [tp] = await db.select().from(teamPlayers).where(and(eq(teamPlayers.playerId, pl.id as string), eq(teamPlayers.seasonId, lg.seasonId)));
            if (tp) {
              const [tm] = await db.select().from(teams).where(eq(teams.id, tp.teamId));
              const logoUrl = (tm as any)?.logo as string | undefined;
              if (logoUrl) {
                let loc: string | null = null; let href: string | null = null;
                if (/^https?:\/\//i.test(logoUrl)) {
                  try { const u = new URL(logoUrl); if (u.pathname.startsWith('/uploads')) loc = path.resolve(process.cwd(), '.' + u.pathname); } catch {}
                } else if (logoUrl.startsWith('/uploads')) loc = path.resolve(process.cwd(), '.' + logoUrl);
                else if (logoUrl.startsWith('uploads')) loc = path.resolve(process.cwd(), logoUrl);
                else loc = path.resolve(process.cwd(), 'uploads', logoUrl);
                try { if (loc) { const b = await readFile(loc); const mime = loc.toLowerCase().endsWith('.webp') ? 'image/webp' : (loc.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'image/png'); href = `data:${mime};base64,${b.toString('base64')}`; } } catch {}
                if (!href && /^https?:\/\//i.test(logoUrl)) href = logoUrl;
                mvpTeamLogo = href;
              }
            }
            if (pl.image) {
              let p = pl.image as any as string; let loc: string | null = null;
              if (/^https?:\/\//i.test(p)) { try { const u = new URL(p); if (u.pathname.startsWith('/uploads')) loc = path.resolve(process.cwd(), '.' + u.pathname); } catch {} }
              else if (p.startsWith('/uploads')) loc = path.resolve(process.cwd(), '.' + p);
              else if (p.startsWith('uploads')) loc = path.resolve(process.cwd(), p);
              else loc = path.resolve(process.cwd(), 'uploads', p);
              try {
                const buf = await readFile(loc!);
                const mime = loc!.toLowerCase().endsWith('.webp') ? 'image/webp' : (loc!.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'image/png');
                // Use original size; if too big, it will overflow intentionally as requested
                const sharpInst = (await import('sharp')).default(buf);
                const meta = await sharpInst.metadata();
                const w = (meta.width || 300) * SCALE; const h = (meta.height || 300) * SCALE;
                mvpImage = { dataUri: `data:${mime};base64,${buf.toString('base64')}`, w, h };
              } catch {}
            }
          }
        } catch {}
      }

      const svg = `<?xml version="1.0" encoding="UTF-8"?>
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="bg"><feGaussianBlur stdDeviation="0"/></filter>
          <filter id="blur"><feGaussianBlur stdDeviation="8"/></filter>
        </defs>
        <style>
          ${fontFace}
        </style>
        <image href="${bgDataUri}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>
        ${seasonLogo ? `<image href="${seasonLogo}" x="${seasonX}" y="${seasonY}" width="${seasonW}" height="${seasonH}" preserveAspectRatio="xMidYMid meet" />` : ''}
        <text x="${titleX}" y="${titleY}" text-anchor="end" fill="#ffffff" font-family="BebasNeueEmbed, Bebas Neue" font-size="${titleFont}" font-weight="700">GAMEDAY MVP</text>
        ${rowsSvg}
        ${mvpImage ? `<image href="${mvpImage.dataUri}" x="${width - mvpImage.w}" y="${height - mvpImage.h}" width="${mvpImage.w}" height="${mvpImage.h}" preserveAspectRatio="xMidYMid meet" />` : ''}
        ${(() => {
          if (showNoPlayer) {
            // Large question mark centered relative to GAMEDAY MVP title
            const questionSize = 200 * SCALE;
            const questionX = titleX - 350;
            const questionY = titleY + 350 * SCALE;
            return `<text x="${questionX}" y="${questionY}" text-anchor="end" fill="#ffffff" font-family="BebasNeueEmbed, Bebas Neue" font-size="${questionSize}" font-weight="700" opacity="0.8">?</text>`;
          }
          if (!mvpName) return '';
          const n = (mvpName || '').toUpperCase();
          const nameFontPx = 48 * SCALE;
          const w = measureBebasWidth(n, nameFontPx);
          const gap = 16 * SCALE;
          const lW = 60 * SCALE, lH = 60 * SCALE;
          const margin = 40 * SCALE;
          const padding = 20 * SCALE;
          const bgW = w + lW + gap + (padding * 2);
          const bgH = Math.max(lH, nameFontPx) + (padding * 2);
          const bgX = width - margin - bgW;
          const bgY = height - margin - bgH;
          const nameY = bgY + (bgH / 2) + (nameFontPx / 3);
          const nameX = bgX + (bgW / 2);
          const lX = nameX - (w / 2) - gap - (lW / 2);
          const lY = bgY + (bgH / 2) - (lH / 2);
          const logoPart = mvpTeamLogo ? `<image href="${mvpTeamLogo}" x="${lX}" y="${lY}" width="${lW}" height="${lH}" preserveAspectRatio="xMidYMid meet" />` : '';
          const namePart = `<text x="${nameX}" y="${nameY}" text-anchor="middle" fill="#ffffff" font-family="BebasNeueEmbed, Bebas Neue" font-size="${nameFontPx}" font-weight="700">${n}</text>`;
          const bgPart = `<rect x="${bgX}" y="${bgY}" width="${bgW}" height="${bgH}" fill="#000000" opacity="0.6" filter="url(#blur)" rx="8"/>`;
          return bgPart + logoPart + namePart;
        })()}
      </svg>`;
      // Dynamic import without static type resolution to avoid lints
      const { Resvg } = await (new Function('p', 'return import(p)'))('@resvg/resvg-js');
      const resvg = new Resvg(svg, { background: 'transparent' });
      const png2x = resvg.render().asPng();
      const sharp = (await import('sharp')).default;
      const finalPng = await sharp(png2x)
        .resize(1920, 1080, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
        .png()
        .toBuffer();
      set.headers['Content-Type'] = 'image/png';
      return new Response(finalPng as any);
    } catch (error) {
      console.error('Render gameday image error', error);
      set.status = 500;
      return { error: true, message: 'Failed to render image' };
    }
  })
  .get('/:id/rank-series/:teamId', async ({ params: { id, teamId }, set }) => {
    try {
      const series = await computeRankSeries(id, teamId);
      return { series };
    } catch (error) {
      set.status = 400;
      return { error: true, message: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  })
  .get('/:id/standings', async ({ params: { id }, set }) => {
    try {
      const standings = await computeStandings(id);
      return { standings };
    } catch (error) {
      set.status = 400;
      return { error: true, message: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  })
  .get('/:id/standings/upto/:gameDay', async ({ params: { id, gameDay }, set }) => {
    try {
      const gd = Number(gameDay);
      if (!Number.isFinite(gd) || gd < 1) throw new Error('Invalid gameDay');
      const standings = await computeStandings(id, { uptoGameDay: gd });
      return { standings };
    } catch (error) {
      set.status = 400;
      return { error: true, message: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  })
  .get('/:id/standings/upto-round/:round', async ({ params: { id, round }, set }) => {
    try {
      const rd = Number(round);
      if (!Number.isFinite(rd) || rd < 1) throw new Error('Invalid round');
      const standings = await computeStandings(id, { uptoRound: rd });
      return { standings };
    } catch (error) {
      set.status = 400;
      return { error: true, message: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  })
  .get('/:id/standings/day/:date', async ({ params: { id, date }, set }) => {
    try {
      const standings = await computeStandings(id, { date });
      return { standings };
    } catch (error) {
      set.status = 400;
      return { error: true, message: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  })
  .get('/:id/standings/gameday/:gameDay/with-delta', async ({ params: { id, gameDay }, set }) => {
    try {
      const gd = Number(gameDay);
      if (!Number.isFinite(gd) || gd < 1) throw new Error('Invalid gameDay');
      const { computeStandings } = await import('../services/championships/championsip.service');
      const cur = await computeStandings(id, { uptoGameDay: gd });
      const prev = gd > 1 ? await computeStandings(id, { uptoGameDay: gd - 1 }) : [];
      const prevRank = new Map<string, number>();
      for (const r of prev as any[]) prevRank.set(r.teamId, r.rank);
      const enriched = (cur as any[]).map(r => ({
        ...r,
        delta: prevRank.has(r.teamId) ? (prevRank.get(r.teamId)! - r.rank) : 0
      }));
      return { standings: enriched };
    } catch (error) {
      set.status = 400;
      return { error: true, message: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  })
  .get('/:id/mvps', async ({ params: { id }, set }) => {
    try {
      const mvps = await computeGameDayMvps(id);
      return { mvps };
    } catch (error) {
      set.status = 400;
      return { error: true, message: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  })
  .get('/', async () => {
    return await getAllChampionships();
  })
  .get('/:id', async ({ params: { id }, set }) => {
    try {
      const championship = await getChampionship(id);
      if (!championship) {
        set.status = 404;
        return {
          error: true,
          message: 'Championship not found'
        };
      }
      return championship;
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  })
  .put('/:id', async ({ params: { id }, body, set, request }) => {
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      const championship = await updateChampionship(id, body as any);
      if (!championship) {
        set.status = 404;
        return {
          error: true,
          message: 'Championship not found'
        };
      }

      // Log championship update
      if (session && championship.name) {
        await LoggingService.logChampionshipUpdate(session.user.id, championship.name);
      }

      return championship;
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  })
  .delete('/:id', async ({ params: { id }, set }) => {
    try {
      const success = await archiveChampionship(id);
      if (!success) {
        set.status = 404;
        return {
          error: true,
          message: 'Championship not found'
        };
      }
      return { success: true };
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  })
  .get('/matches', ({ query, set }) => {
    if (!query.matchesPerDay || typeof query.matchesPerDay !== 'string') {
      set.status = 400;
      return {
        error: true,
        message: 'A matchesPerDay paraméter megadása kötelező. Példa: ?matchesPerDay=4-5-4-5-4'
      };
    }

    const matchesPerDay = query.matchesPerDay.split('-').map(num => {
      const parsed = Number(num);
      if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('Invalid number');
      }
      return parsed;
    });

    try {
      return generateSchedule({
        teams: [], // This will be populated from the database
        matchesPerDay,
        startTime: query.startTime as string || "08:00",
        matchDuration: Number(query.matchDuration) || 40,
        tables: Number(query.tables) || 6
      });
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: 'A matchesPerDay paraméter csak pozitív egész számokat tartalmazhat, kötőjellel elválasztva'
      };
    }
  })
  .get('/teams/:leagueId', async ({ params: { leagueId }, set }) => {
    try {
      return await getLeagueTeams(leagueId);
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  })
  .get('/teams/:leagueId/available', async ({ params: { leagueId }, set }) => {
    try {
      return await getAvailableTeamsForLeague(leagueId);
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  })
  .post('/teams/:leagueId/:teamId', async ({ params: { leagueId, teamId }, set }) => {
    try {
      await addTeamToLeague(leagueId, teamId);
      return { success: true };
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  })
  .delete('/teams/:leagueId/:teamId', async ({ params: { leagueId, teamId }, set }) => {
    try {
      await removeTeamFromLeague(leagueId, teamId);
      return { success: true };
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  })
  .post('/teams/invite/:leagueTeamId', async ({ params: { leagueTeamId }, set }) => {
    try {
      // Lookup league-team relation
      const [rel] = await db.select().from(leagueTeams).where(eq(leagueTeams.id, leagueTeamId));
      if (!rel) throw new Error('LeagueTeam not found');
      const [league] = await db.select().from(leagues).where(eq(leagues.id, rel.leagueId));
      if (!league) throw new Error('League not found');
      const [team] = await db.select().from(teams).where(eq(teams.id, rel.teamId));
      if (!team) throw new Error('Team not found');
      const [season] = await db.select().from(seasons).where(eq(seasons.id, league.seasonId));
      if (!season) throw new Error('Season not found');

      // Find captain for this team in this season
      const capRel = (await db.select().from(teamPlayers)
        .where(eq(teamPlayers.teamId, rel.teamId)))
        .find(r => r.seasonId === league.seasonId && r.captain === true);
      if (!capRel) throw new Error('Még nincs csapatkapitány beállítva a csapatban');
      const [cap] = await db.select().from(players).where(eq(players.id, capRel.playerId));
      if (!cap?.email || !String(cap.email).trim()) throw new Error('A csapatkapitánynak nincs e-mail címe');

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      // Create a player_invitation token for this captain so /api/players/link-invite can validate it
      const inviteToken = nanoid(48);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(playerInvitations).values({
        playerId: cap.id,
        email: cap.email,
        token: inviteToken,
        expiresAt,
        status: 'pending'
      });

      // Send direct email with invite link (no magic link)
      const frontendUrlForEmail = process.env.FRONTEND_URL || 'http://localhost:3001';
      const inviteUrl = `${frontendUrlForEmail}/auth/accept-invite?token=${encodeURIComponent(inviteToken)}`;

      try {
        const { EmailService } = await import('../services/email.service');
        const TeamInviteEmail = (await import('../emails/invite')).default;

        const championshipName = `${league.name}${league.subName ? ' ' + league.subName : ''}`;
        await EmailService.send({
          to: cap.email,
          subject: `${championshipName} - Meghívó${team.name ? ` (${team.name})` : ''}`,
          react: TeamInviteEmail({
            championshipName,
            teamName: team.name || '',
            inviteUrl,
            recipientName: cap.firstName || cap.nickname,
            expiresAt: expiresAt.toLocaleDateString('hu-HU'),
            inviterName: 'ELITE Beerpong',
            supportEmail: 'sorpingpong@gmail.com',
          } as any)
        });

        // Mark invite sent
        await db.update(leagueTeams)
          .set({ inviteSent: true, inviteSentDate: new Date(), updatedAt: new Date() })
          .where(eq(leagueTeams.id, leagueTeamId));

        return { success: true };
      } catch (err) {
        console.error('Failed to send league team invite email', {
          to: cap.email,
          leagueTeamId,
          smtp: { host: process.env.SMTP_HOST, port: process.env.SMTP_PORT, secure: process.env.SMTP_SECURE }
        }, err);
        set.status = 400;
        return { error: true, message: 'Failed to send invite email' };
      }
    } catch (error) {
      set.status = 400;
      return { error: true, message: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  })
  .post('/:id/generate-schedule', async ({ params: { id }, body, set }) => {
    try {
      const { teams, matchesPerDay, startTime, matchDuration, tables, dayDates } = body as any;
      if (!Array.isArray(teams) || teams.length < 2) throw new Error('Minimum 2 csapat kell');
      if (!Array.isArray(matchesPerDay) || matchesPerDay.length === 0) throw new Error('matchesPerDay szükséges');
      const schedule = generateSchedule({ teams, matchesPerDay, startTime, matchDuration, tables });
      const scheduleWithDates = Array.isArray(dayDates)
        ? schedule.map((m: any) => ({ ...m, date: dayDates[m.day - 1] || null }))
        : schedule;
      return { schedule: scheduleWithDates };
    } catch (error) {
      set.status = 400;
      return { error: true, message: (error as any)?.message || 'Invalid input' };
    }
  })

  // Persist generated schedule into matches table
  .post('/:id/save-schedule', async ({ params: { id }, body, set }) => {
    try {
      const { schedule, dayDates } = body as any;
      if (!Array.isArray(schedule) || schedule.length === 0) throw new Error('schedule required');
      // Here we only persist structure; mapping team names->leagueTeamIds must be handled on FE or an additional lookup
      // Assuming schedule items contain: home, away, table, day, startTime
      // Find league team mapping by team name (attached to league)
      const attached = await getLeagueTeams(id);
      const nameToTeam = new Map(attached.map((t: any) => [t.name, t]));
      const rows: any[] = [];
      // Ensure continuity if there are already saved matches for this league
      const maxRoundRows = await db
        .select({ maxRound: sql<number>`COALESCE(MAX(${matches.matchRound}), 0)` })
        .from(matches)
        .where(eq(matches.leagueId, id));
      const baseRoundOffset = Number(maxRoundRows?.[0]?.maxRound ?? 0);
      for (const m of schedule) {
        const home = nameToTeam.get(m.home);
        const away = nameToTeam.get(m.away);
        if (!home || !away) continue;
        const dateStr = (Array.isArray(dayDates) && m.day ? dayDates[m.day - 1] : m.date) || new Date().toISOString().slice(0, 10);
        const dateTimeISO = `${dateStr}T${(m.startTime || '00:00')}:00`;
        rows.push({
          leagueId: id,
          teamId: home.id,
          homeTeamId: home.id,
          awayTeamId: away.id,
          homeLeagueTeamId: home._leagueTeamId,
          awayLeagueTeamId: away._leagueTeamId,
          homeTeamScore: 0,
          awayTeamScore: 0,
          matchAt: new Date(dateTimeISO),
          matchDate: new Date(dateStr),
          matchTime: new Date(dateTimeISO),
          matchStatus: 'scheduled',
          matchType: 'regular',
          matchRound: baseRoundOffset + (typeof m.round === 'number' ? m.round : (typeof m.slot === 'number' ? m.slot + 1 : 1)),
          gameDay: m.day || 1,
          matchTable: m.table || 1,
        });
      }
      if (rows.length === 0) throw new Error('No rows to save');
      await db.insert(matches as any).values(rows as any);
      // After saving, set league started
      await db.update(leagues)
        .set({ isStarted: true, phase: 'regular', regularRound: 1, updatedAt: new Date() as any })
        .where(eq(leagues.id, id));
      return { success: true, saved: rows.length };
    } catch (error) {
      set.status = 400;
      return { error: true, message: (error as any)?.message || 'Invalid input' };
    }
  })
  .get('/stats', async ({ set }) => {
    try {
      // Get all active championships
      const activeChampionships = await db.select()
        .from(leagues)
        .where(eq(leagues.isArchived, false))
        .orderBy(leagues.createdAt);

      const stats = await Promise.all(
        activeChampionships.map(async (championship) => {
          // Get teams count for this championship
          const teamCount = await db.select({ count: sql<number>`count(*)` })
            .from(leagueTeams)
            .where(eq(leagueTeams.leagueId, championship.id));

          // Get total matches count
          const totalMatches = await db.select({ count: sql<number>`count(*)` })
            .from(matches)
            .where(eq(matches.leagueId, championship.id));

          // Get completed matches count
          const completedMatches = await db.select({ count: sql<number>`count(*)` })
            .from(matches)
            .where(and(
              eq(matches.leagueId, championship.id),
              eq(matches.matchStatus, 'completed')
            ));

          return {
            id: championship.id,
            name: championship.name,
            subName: championship.subName,
            logo: championship.logo,
            createdAt: championship.createdAt,
            teams: Number(teamCount[0]?.count || 0),
            totalMatches: Number(totalMatches[0]?.count || 0),
            completedMatches: Number(completedMatches[0]?.count || 0),
            status: Number(completedMatches[0]?.count || 0) === 0 ? 'upcoming' :
              Number(completedMatches[0]?.count || 0) === Number(totalMatches[0]?.count || 0) ? 'completed' : 'ongoing'
          };
        })
      );

      return { championships: stats };
    } catch (error) {
      set.status = 500;
      return { error: true, message: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  });

// Export championship as Excel with multiple sheets
championshipRouter.get('/:id/export/xlsx', async ({ params: { id }, set }) => {
  try {
    const ExcelJS = await import('exceljs');
    const { getMatchesByLeague } = await import('../services/matches/match.service');
    const league = await getChampionship(id);
    if (!league) { set.status = 404; return { error: true, message: 'Championship not found' }; }
    const rows = await getMatchesByLeague(id);
    const wb = new (ExcelJS as any).Workbook();
    const title = `${league.name}${league.subName ? ' ' + league.subName : ''}`;
    wb.created = new Date();
    wb.modified = new Date();

    // Helper: format HH:mm UTC
    const fmtTime = (d: any) => {
      if (!d) return '';
      const dt = new Date(d);
      return dt.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false });
    };
    const fmtDateKey = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : '');

    // Build original gameday buckets (ALWAYS use original date/round/table)
    const buckets = new Map<string, any[]>();
    for (const r of rows as any[]) {
      const m = r.match;
      const key = fmtDateKey(m.matchAt || m.matchDate);
      if (!key) continue;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push({
        orderKey: new Date(m.matchTime || m.matchAt).getTime(),
        num: (buckets.get(key)!.length + 1),
        table: m.matchTable,
        start: fmtTime(m.matchTime || m.matchAt),
        home: r.homeTeam?.name || m.homeTeamId,
        away: r.awayTeam?.name || m.awayTeamId,
        hs: m.homeTeamScore,
        as: m.awayTeamScore,
        ot: (Math.max(Number(m.homeTeamScore || 0), Number(m.awayTeamScore || 0)) > 10 && Math.min(Number(m.homeTeamScore || 0), Number(m.awayTeamScore || 0)) >= 10) ? '1' : '',
        round: m.matchRound,
        gameDay: m.gameDay,
      });
    }

    // Sort keys by date asc
    const dayKeys = Array.from(buckets.keys()).sort();

    // For each gameday, sheet with match list
    dayKeys.forEach((key, idx) => {
      const ws = wb.addWorksheet(`${idx + 1}. gameday`);
      ws.addRow(['m.sz.', 'a.sz.', 'Start', 'Csapat #01', 'Csapat #02', 'Eredmény', 'h.', '']);
      // Align headers
      ws.getRow(1).font = { bold: true } as any;
      const items = buckets.get(key)!.sort((a, b) => a.orderKey - b.orderKey || a.table - b.table);
      for (const it of items) {
        ws.addRow([
          it.num,
          it.table,
          it.start,
          it.home,
          it.away,
          Number.isFinite(Number(it.hs)) ? Number(it.hs) : '',
          Number.isFinite(Number(it.as)) ? Number(it.as) : '',
          it.ot,
        ]);
      }
      ws.columns = [
        { width: 6 }, { width: 6 }, { width: 8 }, { width: 24 }, { width: 24 }, { width: 10 }, { width: 4 }, { width: 8 }
      ] as any;
    });

    // Overall standings sheet
    const { computeStandings } = await import('../services/championships/championsip.service');
    const overall = await computeStandings(id);
    const wsOverall = wb.addWorksheet('Összesített tabella');
    wsOverall.addRow(['#', 'Csapat', 'Meccs', 'GY', 'V', 'Győzelem', 'Győzelem (h)', 'Vereség (h)', 'Vereség', 'PK', 'Pont']);
    wsOverall.getRow(1).font = { bold: true } as any;
    overall.forEach((s: any) => {
      wsOverall.addRow([
        s.rank,
        s.name,
        s.games,
        s.winsTotal,
        s.lossesTotal,
        s.winsRegular,
        s.winsOT,
        s.lossesOT,
        s.lossesRegular,
        s.cupDiff,
        s.points,
      ]);
    });
    wsOverall.columns = [
      { width: 4 }, { width: 28 }, { width: 8 }, { width: 6 }, { width: 6 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 8 }, { width: 8 }
    ] as any;

    // Per gameday standings sheets (based on ORIGINAL gameday key order)
    for (let i = 0; i < dayKeys.length; i++) {
      const ws = wb.addWorksheet(`${i + 1}. gameday tabella`);
      ws.addRow(['#', 'Csapat', 'Meccs', 'GY', 'V', 'Győzelem', 'Győzelem (h)', 'Vereség (h)', 'Vereség', 'PK', 'Pont']);
      ws.getRow(1).font = { bold: true } as any;
      // We map day index to actual gameDay number from any item bucket (original gameday stored on rows)
      const anyItem = buckets.get(dayKeys[i])?.[0];
      const gd = anyItem?.gameDay as number | undefined;
      const daily = gd ? await computeStandings(id, { gameDay: gd }) : await computeStandings(id, { date: dayKeys[i] });
      daily.forEach((s: any) => {
        ws.addRow([s.rank, s.name, s.games, s.winsTotal, s.lossesTotal, s.winsRegular, s.winsOT, s.lossesOT, s.lossesRegular, s.cupDiff, s.points]);
      });
      ws.columns = [
        { width: 4 }, { width: 28 }, { width: 8 }, { width: 6 }, { width: 6 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 8 }, { width: 8 }
      ] as any;
    }

    // Send as binary
    set.headers['Content-Type'] = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    set.headers['Content-Disposition'] = `attachment; filename="${title.replace(/[^\w\s\-_.]/g, '')}.xlsx"`;
    const buf = await wb.xlsx.writeBuffer();
    return new Response(buf as any);
  } catch (error) {
    console.error('Export error', error);
    set.status = 500;
    return { error: true, message: 'Failed to generate export' };
  }
});
export default championshipRouter;