import { pgTable, timestamp, varchar, uuid, text, boolean, jsonb, integer } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').$defaultFn(() => false).notNull(),
	image: text('image'),
	createdAt: timestamp('created_at').$defaultFn(() => /* @__PURE__ */ new Date()).notNull(),
	updatedAt: timestamp('updated_at').$defaultFn(() => /* @__PURE__ */ new Date()).notNull(),
	role: text('role').default('user'),
	banned: boolean('banned'),
	banReason: text('ban_reason'),
	banExpires: timestamp('ban_expires'),
	lang: text('lang').default('en'),
	nickname: text('nickname').notNull().default('')
});

export const session = pgTable("session", {
	id: text('id').primaryKey(),
	expiresAt: timestamp('expires_at').notNull(),
	token: text('token').notNull().unique(),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	impersonatedBy: text('impersonated_by')
});

export const account = pgTable("account", {
	id: text('id').primaryKey(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at'),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
	scope: text('scope'),
	password: text('password'),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull()
});

export const verification = pgTable("verification", {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at').notNull(),
	createdAt: timestamp('created_at').$defaultFn(() => /* @__PURE__ */ new Date()),
	updatedAt: timestamp('updated_at').$defaultFn(() => /* @__PURE__ */ new Date())
});


export const emailSubscriptions = pgTable('email_subscriptions', {
	id: uuid().notNull().primaryKey().defaultRandom(),
	email: varchar('email', { length: 255 }).notNull().unique(),
	createdAt: timestamp('created_at').defaultNow(),
	updatedAt: timestamp('updated_at').defaultNow()
});

export const news = pgTable('news', {
	id: uuid().notNull().primaryKey().defaultRandom(),
	author: varchar('author', { length: 255 }).notNull(),
	createdAt: timestamp('created_at').defaultNow(),
	updatedAt: timestamp('updated_at').defaultNow()
});

export const newsTranslations = pgTable('news_translations', {
	id: uuid().notNull().primaryKey().defaultRandom(),
	newsId: uuid().notNull().references(() => news.id),
	language: varchar('language', { length: 10 }).notNull(), // e.g., 'hu', 'en', 'de'
	title: varchar('title', { length: 255 }).notNull(),
	lead: text('lead').notNull(),
	content: text('content').notNull(),
	createdAt: timestamp('created_at').defaultNow(),
	updatedAt: timestamp('updated_at').defaultNow()
});

export const seasons = pgTable('seasons', {
	id: uuid().notNull().primaryKey().defaultRandom(),
	name: varchar('name', { length: 255 }).notNull(),
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  isActive: boolean('is_active').notNull().default(false),
	createdAt: timestamp('created_at').defaultNow(),
	updatedAt: timestamp('updated_at').defaultNow()
});

export const leagues = pgTable('leagues', {
	id: uuid().notNull().primaryKey().defaultRandom(),
	seasonId: uuid().notNull().references(() => seasons.id),
	name: varchar('name', { length: 255 }).notNull(),
	subName: varchar('sub_name', { length: 255 }),
	createdAt: timestamp('created_at').defaultNow(),
	logo: text('logo'),
	slug: varchar('slug', { length: 255 }).notNull(),
	isActive: boolean('is_active').notNull().default(true),
	isArchived: boolean('is_archived').notNull().default(false),
	description: text('description'),
	properties: jsonb('properties'), // {type: 'league', rounds: 2, hasPlayoff: true, teams: 16}
	updatedAt: timestamp('updated_at').defaultNow(),
	isStarted: boolean('is_started').notNull().default(false),
	phase: varchar('phase', { length: 32 }).notNull().default('regular'), // 'regular' | 'knockout'
	knockoutRound: integer('knockout_round').notNull().default(0),
	regularRound: integer('regular_round').notNull().default(0)
});

export const teams = pgTable('teams', {
	id: uuid().notNull().primaryKey().defaultRandom(),
	name: varchar('name', { length: 255 }).notNull(),
	createdAt: timestamp('created_at').defaultNow(),
	logo: text('logo'),
	slug: varchar('slug', { length: 255 }).notNull(),
	description: text('description'),
	properties: jsonb('properties'),
});

export const players = pgTable('players', {
	id: uuid().notNull().primaryKey().defaultRandom(),
	nickname: varchar('nickname', { length: 255 }).notNull(),
	firstName: varchar('first_name', { length: 255 }),
	lastName: varchar('last_name', { length: 255 }),
	email: varchar('email', { length: 255 }),
  teamId: uuid().references(() => teams.id),
	birthDate: timestamp('birth_date'),
	image: text('image'),
  userId: text('user_id').references(() => user.id),
	shirtSize: varchar('shirt_size', { length: 16 }),
	createdAt: timestamp('created_at').defaultNow(),
	updatedAt: timestamp('updated_at').defaultNow()
});

export const playerInvitations = pgTable('player_invitations', {
  id: uuid().notNull().primaryKey().defaultRandom(),
  playerId: uuid().notNull().references(() => players.id),
  email: varchar('email', { length: 255 }).notNull(),
  token: varchar('token', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  status: varchar('status', { length: 32 }).notNull().default('pending'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const leagueTeams = pgTable('league_teams', {
	id: uuid().notNull().primaryKey().defaultRandom(),
	leagueId: uuid().notNull().references(() => leagues.id),
	teamId: uuid().notNull().references(() => teams.id),
	status: varchar('status', { length: 32 }).notNull().default('pending'),
	heir: uuid('heir').references(() => teams.id),
	declineReason: varchar('decline_reason', { length: 64 }),
	inviteSent: boolean('invite_sent').notNull().default(false),
	inviteSentDate: timestamp('invite_sent_date'),
	createdAt: timestamp('created_at').defaultNow(),
	updatedAt: timestamp('updated_at').defaultNow()
});

export const playerMvps = pgTable('player_mvps', {
	id: uuid().notNull().primaryKey().defaultRandom(),
	leagueId: uuid().notNull().references(() => leagues.id),
	teamId: uuid().notNull().references(() => teams.id),
	playerId: uuid().notNull().references(() => players.id),
	createdAt: timestamp('created_at').defaultNow(),
	updatedAt: timestamp('updated_at').defaultNow()
});

export const matches = pgTable('matches', {
	id: uuid().notNull().primaryKey().defaultRandom(),
	leagueId: uuid().notNull().references(() => leagues.id),
	teamId: uuid().notNull().references(() => teams.id),
	homeTeamId: uuid().notNull().references(() => teams.id),
	awayTeamId: uuid().notNull().references(() => teams.id),
  homeLeagueTeamId: uuid('home_league_team_id').references(() => leagueTeams.id),
  awayLeagueTeamId: uuid('away_league_team_id').references(() => leagueTeams.id),
	homeTeamScore: integer('home_team_score').notNull(),
	awayTeamScore: integer('away_team_score').notNull(),
	homeTeamBestPlayerId: uuid().references(() => players.id),
	awayTeamBestPlayerId: uuid().references(() => players.id),
  homeFirstPlayerId: uuid('home_first_player_id').references(() => players.id),
  homeSecondPlayerId: uuid('home_second_player_id').references(() => players.id),
  awayFirstPlayerId: uuid('away_first_player_id').references(() => players.id),
  awaySecondPlayerId: uuid('away_second_player_id').references(() => players.id),

	matchAt: timestamp('match_at').notNull(),
	matchDate: timestamp('match_date').notNull(),
	matchTime: timestamp('match_time').notNull(),
	matchStatus: varchar('match_status', { length: 255 }).notNull(),
	matchType: varchar('match_type', { length: 255 }).notNull(),
	matchRound: integer('match_round').notNull(),
	gameDay: integer('game_day').notNull().default(1),
	matchTable: integer('match_table').notNull(),
	trackingActive: integer('tracking_active').notNull().default(0),
	trackingStartedAt: timestamp('tracking_started_at'),
	trackingFinishedAt: timestamp('tracking_finished_at'),
	trackingData: jsonb('tracking_data'),
	createdAt: timestamp('created_at').defaultNow(),
	updatedAt: timestamp('updated_at').defaultNow()
});

// New: team_players linking players to teams per season
export const teamPlayers = pgTable('team_players', {
  id: uuid().notNull().primaryKey().defaultRandom(),
  teamId: uuid().notNull().references(() => teams.id),
  playerId: uuid().notNull().references(() => players.id),
  seasonId: uuid().notNull().references(() => seasons.id),
  captain: boolean('captain').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Player MVPs per gameday/finale
export const playerGamedayMvps = pgTable('player_gameday_mvps', {
  id: uuid().notNull().primaryKey().defaultRandom(),
  seasonId: uuid().notNull().references(() => seasons.id),
  teamId: uuid().notNull().references(() => teams.id),
  playerId: uuid().notNull().references(() => players.id),
  gameDay: integer('game_day').notNull().default(0), // 0 => finale
  mvpType: integer('mvp_type').notNull().default(1), // 1 normal, 2 finale
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// System logs for tracking user operations
export const systemLogs = pgTable('system_logs', {
  id: uuid().notNull().primaryKey().defaultRandom(),
  datetime: timestamp('datetime').notNull().defaultNow(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'invite', 'match', 'championship', 'team', 'player', etc.
  operation: text('operation').notNull(), // Human readable description of the operation
  metadata: jsonb('metadata'), // Additional data like team names, match scores, etc.
  createdAt: timestamp('created_at').defaultNow()
});