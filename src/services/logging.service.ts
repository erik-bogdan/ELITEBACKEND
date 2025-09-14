import { db } from '../db';
import { systemLogs } from '../database/schema';

export interface LogEntry {
  userId: string;
  type: 'invite' | 'match' | 'championship' | 'team' | 'player' | 'user' | 'system';
  operation: string;
  metadata?: Record<string, any>;
}

export class LoggingService {
  /**
   * Log a user operation to the system logs
   */
  static async log(entry: LogEntry): Promise<void> {
    try {
      await db.insert(systemLogs).values({
        userId: entry.userId,
        type: entry.type,
        operation: entry.operation,
        metadata: entry.metadata || null,
        datetime: new Date()
      });
    } catch (error) {
      // Don't throw errors for logging failures to avoid breaking the main operation
      console.error('Failed to log system operation:', error);
    }
  }

  /**
   * Log invite acceptance
   */
  static async logInviteAccept(userId: string, championshipName: string, teamName?: string): Promise<void> {
    await this.log({
      userId,
      type: 'invite',
      operation: `Elfogadta a(z) ${championshipName} bajnokságra küldött meghívót${teamName ? ` (${teamName} csapat)` : ''}`,
      metadata: { championshipName, teamName }
    });
  }

  /**
   * Log invite decline
   */
  static async logInviteDecline(userId: string, championshipName: string, teamName?: string): Promise<void> {
    await this.log({
      userId,
      type: 'invite',
      operation: `Elutasította a(z) ${championshipName} bajnokságra küldött meghívót${teamName ? ` (${teamName} csapat)` : ''}`,
      metadata: { championshipName, teamName }
    });
  }

  /**
   * Log match result submission
   */
  static async logMatchResult(userId: string, homeTeamName: string, awayTeamName: string, homeScore: number, awayScore: number, championshipName?: string): Promise<void> {
    await this.log({
      userId,
      type: 'match',
      operation: `Eredményt adott hozzá az alábbi meccsre: ${homeTeamName} - ${awayTeamName} (${homeScore}-${awayScore})${championshipName ? ` (${championshipName})` : ''}`,
      metadata: { homeTeamName, awayTeamName, homeScore, awayScore, championshipName }
    });
  }

  /**
   * Log championship creation
   */
  static async logChampionshipCreate(userId: string, championshipName: string): Promise<void> {
    await this.log({
      userId,
      type: 'championship',
      operation: `Létrehozta a(z) ${championshipName} bajnokságot`,
      metadata: { championshipName }
    });
  }

  /**
   * Log championship update
   */
  static async logChampionshipUpdate(userId: string, championshipName: string): Promise<void> {
    await this.log({
      userId,
      type: 'championship',
      operation: `Módosította a(z) ${championshipName} bajnokságot`,
      metadata: { championshipName }
    });
  }

  /**
   * Log team creation
   */
  static async logTeamCreate(userId: string, teamName: string): Promise<void> {
    await this.log({
      userId,
      type: 'team',
      operation: `Létrehozta a(z) ${teamName} csapatot`,
      metadata: { teamName }
    });
  }

  /**
   * Log player creation
   */
  static async logPlayerCreate(userId: string, playerName: string, teamName?: string): Promise<void> {
    await this.log({
      userId,
      type: 'player',
      operation: `Létrehozta a(z) ${playerName} játékost${teamName ? ` (${teamName} csapat)` : ''}`,
      metadata: { playerName, teamName }
    });
  }

  /**
   * Log user registration
   */
  static async logUserRegister(userId: string, userName: string, email: string): Promise<void> {
    await this.log({
      userId,
      type: 'user',
      operation: `Regisztrált a rendszerbe: ${userName} (${email})`,
      metadata: { userName, email }
    });
  }

  /**
   * Log user login
   */
  static async logUserLogin(userId: string, userName: string): Promise<void> {
    await this.log({
      userId,
      type: 'user',
      operation: `Bejelentkezett: ${userName}`,
      metadata: { userName }
    });
  }

  /**
   * Log custom operation
   */
  static async logCustom(userId: string, type: LogEntry['type'], operation: string, metadata?: Record<string, any>): Promise<void> {
    await this.log({
      userId,
      type,
      operation,
      metadata
    });
  }
}
