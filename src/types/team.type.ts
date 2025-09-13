import { Player } from "./player.type";

export type Team = {
  id: string;
  name: string;
  color: string;
  players: Player[];
};
