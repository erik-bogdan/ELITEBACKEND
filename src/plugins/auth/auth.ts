import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../../db";
import * as schema from "./../../database/schema"; // Importáld a séma objektumot
import { admin, magicLink } from "better-auth/plugins"
import { playerInvitations } from "../../database/schema";
import { eq } from "drizzle-orm";
import TeamInviteEmail from "../../emails/invite";
import PlayerInviteEmail from "../../emails/player-invite";
import ForgotPasswordEmail from "../../emails/forgot-password";
import { EmailService } from "../../services/email.service";

export const auth = betterAuth({
    trustedOrigins: ['http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003', 'https://elite-fe-five.vercel.app', 'https://elitebeerpong.hu', 'https://elite.sorpingpong.hu'],
    database: drizzleAdapter(db, {
        schema,
        provider: "pg",
    }),
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
        sendResetPassword: async ({ user, url, token }) => {
            try {
                const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
                const resetUrl = `${frontendUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
                
                await EmailService.send({
                    to: user.email,
                    subject: 'ELITE Beerpong - Jelszó visszaállítás',
                    react: ForgotPasswordEmail({
                        resetUrl: resetUrl,
                        recipientName: user.name || 'Felhasználó',
                        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleString('hu-HU'),
                        supportEmail: 'sorpingpong@gmail.com',
                    }),
                });
            } catch (err) {
                console.error('Failed to send password reset email', { email: user.email }, err);
            }
        },
    },
    plugins: [
        admin(),
        magicLink({
            expiresIn: 7 * 24 * 60 * 60,
            async sendMagicLink({ email, url, token }) {
                // Only send magic link emails for admin functions (set-password, etc.)
                // Player invites now use direct email system
                try {
                    const u = new URL(url);
                    const cb = u.searchParams.get('callbackURL');
                    
                    // Check if this is an admin function (set-password, etc.)
                    const isAdminFunction = cb && cb.includes('/auth/set-password');
                    
                    if (!isAdminFunction) {
                        // Skip sending email for player invites - they use direct email system now
                        return;
                    }
                    
                    // Send magic link email only for admin functions
                    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
                    const magicLinkUrl = `${frontendUrl}/auth/accept-invite?ba=${encodeURIComponent(token)}`;
                    
                    await EmailService.send({
                        to: email,
                        subject: 'ELITE Beerpong - Bejelentkezés',
                        react: PlayerInviteEmail({
                            inviteUrl: magicLinkUrl,
                            recipientName: 'Felhasználó',
                            teamName: undefined,
                            expiresAt: '',
                            inviterName: 'ELITE Beerpong',
                            supportEmail: 'sorpingpong@gmail.com',
                        } as any),
                    });
                } catch (err) {
                    console.error('Failed to send magic-link email', { email }, err);
                }
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