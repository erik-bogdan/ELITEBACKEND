export type Stat = number;

export type Player = {
  id: string;
  name: string;
  nickname: string;
  foot: "left" | "right";
  position: "left" | "center" | "right";
  stats: {
    pace: Stat;
    pass: Stat;
    trick: Stat;
    shot: Stat;
    grit: Stat;
    vision: Stat;
    stamina: Stat;
  };
  fatigue: number; // aktuális állapot (100 → 0)
};