export type MapMarkerIcon =
  | 'fa-solid fa-location-dot'
  | 'fa-solid fa-star'
  | 'fa-solid fa-flag'
  | 'fa-solid fa-landmark'
  | 'fa-solid fa-skull-crossbones'
  | 'fa-solid fa-city'
  | 'fa-solid fa-mountain'
  | 'fa-solid fa-tree'
  | 'fa-solid fa-water'
  | 'fa-solid fa-campground';

export interface MapMarker {
  id: string;
  name: string;
  group?: string;
  description?: string;
  imageUrls?: string[];
  icon?: MapMarkerIcon;
  color?: string;
  position: { nx: number; ny: number };
}
