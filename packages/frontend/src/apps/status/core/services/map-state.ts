import type { DrawStroke } from '../hooks/use-canvas-draw';
import type { MapMarker } from '../types/map-markers';

/** The locked host API only accepts the current character scope, not a target ID. */
function assertMapCharacter(characterId: string): void {
  if (getCurrentCharacterId() !== characterId) {
    throw new Error('地图所属角色已切换，已阻止将旧地图写入当前角色');
  }
}

export function readMapState(): {
  characterId: string;
  drawings: DrawStroke[];
  markers: MapMarker[];
} {
  const characterId = getCurrentCharacterId();
  if (!characterId) throw new Error('没有当前角色，无法读取地图');
  const variables = getVariables({ type: 'character' });
  const drawings = variables.map_drawings;
  const markers = variables.map_markers;
  return {
    characterId,
    drawings: Array.isArray(drawings) ? (drawings as DrawStroke[]) : [],
    markers: Array.isArray(markers) ? (markers as MapMarker[]) : [],
  };
}

export function saveMapDrawings(characterId: string, drawings: DrawStroke[]) {
  assertMapCharacter(characterId);
  insertOrAssignVariables({ map_drawings: drawings }, { type: 'character' });
}

export function saveMapMarkers(characterId: string, markers: MapMarker[]) {
  assertMapCharacter(characterId);
  insertOrAssignVariables({ map_markers: markers }, { type: 'character' });
}
