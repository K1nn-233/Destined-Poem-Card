export interface Attributes {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  mind: number;
}

export interface EquipmentItem {
  name: string;
  type: string;
  tag: string[];
  rarity: string;
  effect: Record<string, string>;
  description: string;
}

export interface SkillItem {
  name: string;
  type: string;
  tag: string[];
  rarity: string;
  consume: string;
  effect: Record<string, string>;
  description: string;
}
