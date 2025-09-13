export type PlayerRating = {
    playerId: string;
    rating: number;
    fatigueEnd: number;
};

export type MatchSummary = {
    ratings: PlayerRating[];
    manOfTheMatch: PlayerRating;
    mostFatiguedPlayer: PlayerRating;
    teamAaverage: number;
    teamBaverage: number;
};