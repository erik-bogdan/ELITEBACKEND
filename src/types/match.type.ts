import { Team } from "./team.type";
import { PlayerStats, TeamStats } from "./stats.type";

export type MatchEvent =
  | {
    type: "pass";
    from: string;
    to: string;
    success: boolean;
    time: number;
    staminaAfter?: number;
    comment?: string;
  }
  | {
    type: "trick";
    playerId: string;
    success: boolean;
    time: number;
    staminaAfter?: number;
    comment?: string;
  }
  | {
    type: "shot";
    playerId: string;
    success: boolean;
    time: number;
    staminaAfter?: number;
    comment?: string;
  }
  | {
    type: "goal";
    playerId: string;
    time: number;
    comment?: string;
  }
  | {
    type: "turnover";
    playerId: string;
    time: number;
    comment?: string;
  };


export type MatchResult = {
  teamA: Team;
  teamB: Team;
  goalsA: number;
  goalsB: number;
  events: MatchEvent[];
  duration: number;
  playerStats: Record<string, PlayerStats>;
  teamStats: Record<string, TeamStats>;
};
