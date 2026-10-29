/** Campos enviados pelo protocolo binário público v14. */
export interface Actor {
  id: number;
  x: number;
  z: number;
  yaw?: number;
  speed?: number;
  mode?: number;
  vehicle?: number | null;
  emote?: number;
  trailer?: number;
  alt?: number;
  character?: number;
  team?: number;
  shirt?: number;
  appearance?: number;
  vx?: number;
  vz?: number;
  stop?: number;
}

export type Actors = Iterable<Actor> | Map<number, Actor> | null | undefined;
export interface InputAck {
  seq: number;
  held: number;
}
export interface NearGroup {
  buffer: Buffer;
  indexes: Map<number, number>;
}
export interface InputPose {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  epoch: number;
  at: number;
  trailer?: number;
}
export interface InputMessage {
  type: number;
  seq: number;
  x: number;
  z: number;
  dx: number;
  dz: number;
  run: boolean;
  sprint: boolean;
  vehicle: boolean;
  pose?: InputPose;
}
