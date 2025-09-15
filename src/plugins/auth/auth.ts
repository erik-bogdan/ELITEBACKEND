import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../../db";
import * as schema from "./../../database/schema"; // Importáld a séma objektumot
import { admin, magicLink } from "better-auth/plugins"
import { playerInvitations } from "../../database/schema";
import { eq } from "drizzle-orm";
import TeamInviteEmail from "../../emails/invite";
import PlayerInviteEmail from "../../emails/player-invite";
import { EmailService } from "../../services/email.service";

export const auth = betterAuth({
    trustedOrigins: ['http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003', 'https://elite-fe-five.vercel.app', 'https://elitebeerpong.hu', 'https://elite.sorpingpong.hu'],
    database: drizzleAdapter(db, {
        schema,
        provider: "pg",
    }),
    emailAndPassword: {
        enabled: true,
    },
    plugins: [
        admin(),
        magicLink({
            async sendMagicLink({ email, url, token }) {
                const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
                let inviteToken: string | null = null;
                let champName: string | undefined;
                let teamName: string | undefined;
                let recipientName: string | undefined;
                try {
                    const u = new URL(url);
                    const cb = u.searchParams.get('callbackURL');
                    if (cb) {
                        const cbu = new URL(cb);
                        inviteToken = cbu.searchParams.get('token');
                        champName = cbu.searchParams.get('champ');
                        teamName = cbu.searchParams.get('team');
                    }
                } catch {}
                // If we have an invite token, try to resolve recipient name from player
                if (inviteToken) {
                    try {
                        const invites = await db.select().from(playerInvitations).where(eq(playerInvitations.token, inviteToken));
                        const inv = invites?.[0];
                        if (inv) {
                            const players = await db.select().from(schema.players).where(eq(schema.players.id, inv.playerId));
                            const pl: any = players?.[0];
                            if (pl) {
                                const first = (pl.firstName ?? '').toString().trim();
                                if (first) recipientName = first;
                                else if (pl.nickname) recipientName = String(pl.nickname).split(' ')[0];
                                else recipientName = undefined;
                            }
                        }
                    } catch {}
                }

                const frontendInvite = inviteToken
                    ? `${frontendUrl}/auth/accept-invite?ba=${encodeURIComponent(token)}&invite=${encodeURIComponent(inviteToken)}`
                    : `${frontendUrl}/auth/accept-invite?ba=${encodeURIComponent(token)}`;
                try {
                    const isTeamFlow = Boolean(champName || teamName); // if callback carried league/team context → team invite
                    await EmailService.send({
                        to: email,
                        subject: isTeamFlow
                          ? `${champName || 'ELITE Beerpong'} - Meghívó${teamName ? ` (${teamName})` : ''}`
                          : `Játékos meghívás`,
                        react: isTeamFlow
                          ? TeamInviteEmail({
                              championshipName: champName || 'ELITE Beerpong',
                              teamName: teamName || '',
                              inviteUrl: frontendInvite,
                              recipientName,
                              expiresAt: '',
                              inviterName: 'ELITE Beerpong',
                              supportEmail: 'support@elitebeerpong.hu',
                            } as any)
                          : PlayerInviteEmail({
                              inviteUrl: frontendInvite,
                              recipientName,
                              teamName: teamName,
                              expiresAt: '',
                              inviterName: 'ELITE Beerpong',
                              supportEmail: 'support@elitebeerpong.hu',
                            } as any) as any,
                    });
                } catch (err) {
                    console.error('Failed to send magic-link email', { email }, err);
                }
            },
            // ensure new users have default profile fields
            onSignIn: async ({ user }) => {
                // If nickname or name is missing, try to populate with empty defaults to satisfy NOT NULL constraints
                try {
                    const safeNickname = user.nickname ?? '';
                    const safeName = user.name ?? '';
                    await db.update(schema.user)
                      .set({ nickname: safeNickname, name: safeName })
                      .where(eq(schema.user.id, user.id));
                } catch {}
            }
        })
    ],
    user: {
        additionalFields: {
            role: {
                type: "string",
                required: false,
                defaultValue: "user",
                input: false, // don't allow user to set role
            },
            lang: {
                type: "string",
                required: false,
                defaultValue: "en",
            },
            nickname: {
                type: "string",
                required: true,
                defaultValue: "",
                unique: false,
            },
        },
    }
});