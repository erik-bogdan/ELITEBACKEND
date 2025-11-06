import { Elysia, t } from 'elysia';
import { auth } from '../plugins/auth/auth';
import {
  createLiveMatchGroup,
  getAllLiveMatchGroups,
  updateLiveMatchGroup,
  deleteLiveMatchGroup,
  getLiveMatchGroupWithMatches,
  addMatchToGroup,
  removeMatchFromGroup,
  getGroupsForMatch,
  activateLiveMatchGroup,
  createPoll,
  getPollByGroupMatchId,
  updatePoll,
  deletePoll,
  voteOnPoll,
  getUserVote,
  getActiveLiveMatchGroup
} from '../services/live-matches/live-matches.service';

export const liveMatchesRouter = new Elysia({ prefix: '/api/live-matches' })
  // Public: Get active live match group with matches and polls
  .get('/active', async () => {
    return await getActiveLiveMatchGroup();
  }, {
    detail: {
      summary: 'Get active live match group with matches and polls (public)',
      tags: ['LiveMatches']
    }
  })

  // Get all groups
  .get('/groups', async ({ request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return { error: true, message: 'Unauthorized' };
    }
    return await getAllLiveMatchGroups();
  }, {
    detail: {
      summary: 'Get all live match groups',
      tags: ['LiveMatches']
    }
  })

  // Get a group with its matches
  .get('/groups/:groupId', async ({ params, request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return { error: true, message: 'Unauthorized' };
    }
    return await getLiveMatchGroupWithMatches(params.groupId);
  }, {
    params: t.Object({
      groupId: t.String()
    }),
    detail: {
      summary: 'Get a live match group with its matches',
      tags: ['LiveMatches']
    }
  })

  // Create a new group
  .post('/groups', async ({ body, request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return { error: true, message: 'Unauthorized' };
    }
    return await createLiveMatchGroup(body);
  }, {
    body: t.Object({
      name: t.String()
    }),
    detail: {
      summary: 'Create a new live match group',
      tags: ['LiveMatches']
    }
  })

  // Update a group
  .put('/groups/:groupId', async ({ params, body, request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return { error: true, message: 'Unauthorized' };
    }
    return await updateLiveMatchGroup(params.groupId, body.name);
  }, {
    params: t.Object({
      groupId: t.String()
    }),
    body: t.Object({
      name: t.String()
    }),
    detail: {
      summary: 'Update a live match group name',
      tags: ['LiveMatches']
    }
  })

  // Delete a group
  .delete('/groups/:groupId', async ({ params, request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return { error: true, message: 'Unauthorized' };
    }
    return await deleteLiveMatchGroup(params.groupId);
  }, {
    params: t.Object({
      groupId: t.String()
    }),
    detail: {
      summary: 'Delete a live match group',
      tags: ['LiveMatches']
    }
  })

  // Add match to group
  .post('/groups/:groupId/matches', async ({ params, body, request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return { error: true, message: 'Unauthorized' };
    }
    return await addMatchToGroup({
      groupId: params.groupId,
      matchId: body.matchId
    });
  }, {
    params: t.Object({
      groupId: t.String()
    }),
    body: t.Object({
      matchId: t.String()
    }),
    detail: {
      summary: 'Add a match to a group',
      tags: ['LiveMatches']
    }
  })

  // Get groups for a match
  .get('/matches/:matchId/groups', async ({ params, request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return { error: true, message: 'Unauthorized' };
    }
    return await getGroupsForMatch(params.matchId);
  }, {
    params: t.Object({
      matchId: t.String()
    }),
    detail: {
      summary: 'Get all groups that contain a specific match',
      tags: ['LiveMatches']
    }
  })

  // Remove match from group
  .delete('/groups/:groupId/matches/:matchId', async ({ params, request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return { error: true, message: 'Unauthorized' };
    }
    return await removeMatchFromGroup(params.groupId, params.matchId);
  }, {
    params: t.Object({
      groupId: t.String(),
      matchId: t.String()
    }),
    detail: {
      summary: 'Remove a match from a group',
      tags: ['LiveMatches']
    }
  })

  // Activate a group (deactivates all others)
  .post('/groups/:groupId/activate', async ({ params, request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return { error: true, message: 'Unauthorized' };
    }
    return await activateLiveMatchGroup(params.groupId);
  }, {
    params: t.Object({
      groupId: t.String()
    }),
    detail: {
      summary: 'Activate a live match group (deactivates all others)',
      tags: ['LiveMatches']
    }
  })

  // Poll endpoints
  .post('/polls', async ({ body, request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return { error: true, message: 'Unauthorized' };
    }
    return await createPoll(body);
  }, {
    body: t.Object({
      groupMatchId: t.String(),
      question: t.String(),
      options: t.Array(t.String())
    }),
    detail: {
      summary: 'Create a poll for a group match',
      tags: ['LiveMatches']
    }
  })

  .get('/group-matches/:groupMatchId/poll', async ({ params, request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return { error: true, message: 'Unauthorized' };
    }
    return await getPollByGroupMatchId(params.groupMatchId);
  }, {
    params: t.Object({
      groupMatchId: t.String()
    }),
    detail: {
      summary: 'Get poll for a group match',
      tags: ['LiveMatches']
    }
  })

  .put('/polls/:pollId', async ({ params, body, request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return { error: true, message: 'Unauthorized' };
    }
    return await updatePoll(params.pollId, body);
  }, {
    params: t.Object({
      pollId: t.String()
    }),
    body: t.Object({
      question: t.Optional(t.String()),
      options: t.Optional(t.Array(t.Object({
        id: t.Optional(t.String()),
        text: t.String(),
        order: t.Number()
      })))
    }),
    detail: {
      summary: 'Update a poll',
      tags: ['LiveMatches']
    }
  })

  .delete('/polls/:pollId', async ({ params, request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return { error: true, message: 'Unauthorized' };
    }
    return await deletePoll(params.pollId);
  }, {
    params: t.Object({
      pollId: t.String()
    }),
    detail: {
      summary: 'Delete a poll',
      tags: ['LiveMatches']
    }
  })

  .post('/polls/:pollId/vote', async ({ params, body, request }) => {
    // Vote: uses anonymousUserId from cookie (no authentication required)
    return await voteOnPoll({
      pollId: params.pollId,
      optionId: body.optionId,
      anonymousUserId: body.anonymousUserId
    });
  }, {
    params: t.Object({
      pollId: t.String()
    }),
    body: t.Object({
      optionId: t.String(),
      anonymousUserId: t.String()
    }),
    detail: {
      summary: 'Vote on a poll',
      tags: ['LiveMatches']
    }
  })
  .get('/polls/:pollId/my-vote', async ({ params, query }) => {
    // Get user's vote: uses anonymousUserId from query (public, no authentication required)
    const vote = await getUserVote(params.pollId, query.anonymousUserId);
    // Always return JSON, even if vote is null
    return vote || { optionId: null };
  }, {
    params: t.Object({
      pollId: t.String()
    }),
    query: t.Object({
      anonymousUserId: t.String()
    }),
    detail: {
      summary: 'Get user vote for a poll',
      tags: ['LiveMatches']
    }
  })

  // Generate image for a live match group
  .get('/groups/:groupId/image', async ({ params, request, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      set.status = 401;
      return { error: true, message: 'Unauthorized' };
    }

    try {
      const group = await getLiveMatchGroupWithMatches(params.groupId);
      if (!group || !group.matches || group.matches.length === 0) {
        set.status = 404;
        return { error: true, message: 'Group not found or has no matches' };
      }

      // Helper to get effective match date/time (prioritize delayed)
      const getEffectiveMatchAt = (match: any): Date => {
        if (match.isDelayed && match.delayedDate && match.delayedTime) {
          const delayedDate = new Date(match.delayedDate);
          const delayedTime = new Date(match.delayedTime);
          const combined = new Date(delayedDate);
          combined.setUTCHours(delayedTime.getUTCHours(), delayedTime.getUTCMinutes(), 0, 0);
          return combined;
        }
        return new Date(match.matchAt);
      };

      // Sort matches by effective time
      const sortedMatches = [...group.matches].sort((a, b) => {
        const timeA = getEffectiveMatchAt(a.match).getTime();
        const timeB = getEffectiveMatchAt(b.match).getTime();
        return timeA - timeB;
      });

      // Render dimensions
      const W = 1540, H = 1136, SCALE = 2;
      const width = W * SCALE;
      const height = H * SCALE;

      // Load and pre-process background image to exactly fit SVG dimensions
      const { readFile } = await import('node:fs/promises');
      const path = await import('node:path');
      const bgPath = path.resolve(process.cwd(), 'uploads', 'livematches-bg.png');
      let bgDataUri = '';
      try {
        const buf = await readFile(bgPath);
        // Pre-process background image with sharp to exactly match SVG dimensions
        // This ensures no transparent bars on the sides
        const sharp = (await import('sharp')).default;
        const processedBg = await sharp(buf)
          .resize(width, height, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
          .png()
          .toBuffer();
        bgDataUri = `data:image/png;base64,${processedBg.toString('base64')}`;
      } catch {
        set.status = 500;
        return { error: true, message: 'Background image not found' };
      }

      // Calculate match start position to center vertically
      const matchCount = sortedMatches.length;
      const centerMatchIndex = Math.floor((matchCount - 1) / 2); // 0-based index of center match

      // Dynamically adjust sizes based on number of matches
      // Base sizes for 3 matches, scale down for more matches
      const baseMatchCount = 3;
      const maxMatchCount = 6;
      let sizeScale = 1.0;
      
      if (matchCount > baseMatchCount) {
        // Scale down proportionally, but not too aggressively
        // For 4 matches: ~0.9, for 5: ~0.8, for 6: ~0.7
        sizeScale = Math.max(0.65, 1.0 - ((matchCount - baseMatchCount) * 0.1));
      }
      
      // Match layout parameters (scaled based on match count)
      const matchSpacing = 180 * SCALE * sizeScale;
      const timeFontSize = Math.round(36 * SCALE * sizeScale);
      const teamNameFontSize = Math.round(72 * SCALE * sizeScale);
      const logoSize = Math.round(100 * SCALE * sizeScale);
      const centerX = width / 2;
      const teamNameGap = 80 * SCALE; // Distance between team names (keep same)
      const logoTeamGap = 0; // No gap - logos directly adjacent to text
      const maxAwayLogoX = width - 200 * SCALE; // Maximum X position for away logo (keep away from edge)
      
      // Calculate matchStartY to center the matches vertically
      // Center match should be at height/2, so start from center minus (centerMatchIndex * spacing)
      const matchStartY = height / 2 - (centerMatchIndex * matchSpacing);

      // Load team logos
      const logosMap = new Map<string, string>();
      for (const matchItem of sortedMatches) {
        for (const team of [matchItem.homeTeam, matchItem.awayTeam]) {
          if (!team?.logo) continue;
          const rawLogo = team.logo;
          if (logosMap.has(rawLogo)) continue;

          let dataHref: string | null = null;
          try {
            let localPath: string | null = null;
            if (/^https?:\/\//i.test(rawLogo)) {
              try {
                const u = new URL(rawLogo);
                if (u.pathname.startsWith('/uploads')) {
                  localPath = path.resolve(process.cwd(), '.' + u.pathname);
                }
              } catch {}
            } else if (rawLogo.startsWith('/uploads')) {
              localPath = path.resolve(process.cwd(), '.' + rawLogo);
            } else if (rawLogo.startsWith('uploads')) {
              localPath = path.resolve(process.cwd(), rawLogo);
            }

            if (localPath) {
              try {
                const logoBuf = await readFile(localPath);
                dataHref = `data:image/png;base64,${logoBuf.toString('base64')}`;
              } catch {}
            }
          } catch {}
          if (dataHref) logosMap.set(rawLogo, dataHref);
        }
      }

      // Font paths
      const fontDir = path.resolve(process.cwd(), 'uploads', 'fonts');
      const regularPath = path.join(fontDir, 'BebasNeue-Regular.ttf');
      const boldPath = path.join(fontDir, 'BebasNeue-Bold.ttf');

      // Build SVG
      let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <style>
            @font-face {
              font-family: 'Bebas Neue';
              font-style: normal;
              font-weight: 400;
              src: url('file://${regularPath}');
            }
            @font-face {
              font-family: 'Bebas Neue';
              font-style: normal;
              font-weight: 700;
              src: url('file://${boldPath}');
            }
          </style>
        </defs>
        <!-- Background - pre-sized to exactly match SVG dimensions -->
        <image href="${bgDataUri}" x="0" y="0" width="${width}" height="${height}"/>
        
        <!-- Matches -->
`;

      sortedMatches.forEach((matchItem, idx) => {
        const match = matchItem.match;
        const homeTeam = matchItem.homeTeam;
        const awayTeam = matchItem.awayTeam;
        const matchY = matchStartY + (idx * matchSpacing);
        const effectiveTime = getEffectiveMatchAt(match);

        // Format time
        const timeStr = effectiveTime.toLocaleTimeString('hu-HU', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'UTC'
        });

        // Time above teams (smaller, higher up)
        svg += `        <!-- Match ${idx + 1} -->
        <text x="${centerX}" y="${matchY - 50 * SCALE}" font-family="Bebas Neue" font-size="${timeFontSize}" font-weight="700" fill="#FFFFFF" text-anchor="middle">${timeStr}</text>
`;

        // New layout: Logos in center, team names left/right of logos
        const homeTeamName = escapeXml(homeTeam?.name || 'Hazai');
        const awayTeamName = escapeXml(awayTeam?.name || 'Vendég');
        const homeLogo = homeTeam?.logo ? logosMap.get(homeTeam.logo) : null;
        const awayLogo = awayTeam?.logo ? logosMap.get(awayTeam.logo) : null;

        // Calculate positions: logos centered, names on left/right
        // Logo positioning: both logos centered, with much larger gap between them for separator
        const logoGap = 120 * SCALE * sizeScale; // Much larger gap between home and away logos
        const logoCenterX = centerX;
        
        // Calculate logo positions relative to center
        // When both logos exist, position them symmetrically around center
        let homeLogoX = logoCenterX;
        let awayLogoX = logoCenterX;
        
        if (homeLogo && awayLogo) {
          // Both logos: position symmetrically around center with gap for separator
          // For perfect symmetry:
          // - Home logo right edge at (centerX - logoGap/2)
          // - Away logo left edge at (centerX + logoGap/2)
          // This ensures separator at centerX is perfectly centered
          homeLogoX = logoCenterX - logoGap / 2 - logoSize;
          awayLogoX = logoCenterX + logoGap / 2;
        } else if (homeLogo) {
          // Only home logo: center it
          homeLogoX = logoCenterX - logoSize / 2;
        } else if (awayLogo) {
          // Only away logo: center it
          awayLogoX = logoCenterX - logoSize / 2;
        }

        // Text positioning: names positioned relative to logos
        // Gap between logo and text - should be consistent and visually balanced
        const logoTextGap = 40 * SCALE * sizeScale; // Slightly increased for better spacing

        // Home team name (right-aligned, ends just before home logo or center)
        const homeNameEndX = homeLogo ? (homeLogoX - logoTextGap) : (centerX - logoTextGap);
        svg += `        <text x="${homeNameEndX}" y="${matchY + teamNameFontSize / 3}" font-family="Bebas Neue" font-size="${teamNameFontSize}" font-weight="700" fill="#FFFFFF" text-anchor="end">${homeTeamName}</text>
`;

        // Home logo (left side of center, or centered if no away logo)
        if (homeLogo) {
          svg += `        <image href="${homeLogo}" x="${homeLogoX}" y="${matchY - logoSize / 2}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>
`;
        }

        // Separator "-" between logos (centered)
        if (homeLogo && awayLogo) {
          svg += `        <text x="${logoCenterX}" y="${matchY + teamNameFontSize / 3}" font-family="Bebas Neue" font-size="${teamNameFontSize}" font-weight="700" fill="#FFFFFF" text-anchor="middle">-</text>
`;
        }

        // Away logo (right side of center, or centered if no home logo)
        if (awayLogo) {
          svg += `        <image href="${awayLogo}" x="${awayLogoX}" y="${matchY - logoSize / 2}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>
`;
        }

        // Away team name (left-aligned, starts just after away logo or center)
        const awayNameStartX = awayLogo ? (awayLogoX + logoSize + logoTextGap) : (centerX + logoTextGap);
        svg += `        <text x="${awayNameStartX}" y="${matchY + teamNameFontSize / 3}" font-family="Bebas Neue" font-size="${teamNameFontSize}" font-weight="700" fill="#FFFFFF" text-anchor="start">${awayTeamName}</text>
`;
      });

      svg += `      </svg>`;

      // Convert SVG to PNG
      const { Resvg } = await (new Function('p', 'return import(p)'))('@resvg/resvg-js');
      const fontFiles: string[] = [];
      const { access } = await import('node:fs/promises');
      try {
        await access(regularPath);
        fontFiles.push(regularPath);
      } catch {}
      try {
        await access(boldPath);
        fontFiles.push(boldPath);
      } catch {}

      const resvg = new Resvg(svg, {
        background: 'transparent',
        font: {
          loadSystemFonts: false,
          defaultFontFamily: 'Bebas Neue',
          fontFiles: fontFiles
        }
      });
      const png2x = resvg.render().asPng();
      const sharp = (await import('sharp')).default;
      // Resize to exact dimensions without cropping/padding to ensure perfect 1920x1080 output
      const finalPng = await sharp(png2x)
        .resize(W, H, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
        .png()
        .toBuffer();

      set.headers['Content-Type'] = 'image/png';
      return new Response(finalPng as any);
    } catch (error) {
      console.error('Generate live match group image error', error);
      set.status = 500;
      return { error: true, message: 'Failed to generate image' };
    }

    function escapeXml(str: string): string {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    }

    // Approximate text width for Bebas Neue font
    function measureTextWidth(text: string, fontSize: number): number {
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
      for (const ch of text.toUpperCase()) {
        total += (coeff[ch] ?? 0.72);
      }
      return Math.round(total * fontSize);
    }
  }, {
    params: t.Object({
      groupId: t.String()
    }),
    detail: {
      summary: 'Generate image for a live match group',
      tags: ['LiveMatches']
    }
  });

