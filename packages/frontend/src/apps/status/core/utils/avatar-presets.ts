import { loadPredefinedData } from './predefined-data';
import { getAllowedExternalImageUrl } from './external-image';

export type AvatarPresetGroups = Record<string, string[]>;

let avatarPresetGroupsPromise: Promise<AvatarPresetGroups> | null = null;

export const loadAvatarPresetGroups = async (): Promise<AvatarPresetGroups> => {
  if (avatarPresetGroupsPromise) {
    return avatarPresetGroupsPromise;
  }

  const promise: Promise<AvatarPresetGroups> = (async () => {
    const data = await loadPredefinedData<unknown>('avatar-presets.json', 'AvatarPreset');
    if (!_.isPlainObject(data)) {
      return {};
    }

    const groups = data as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(groups).map(([group, urls]) => [
        group,
        Array.isArray(urls) ? urls.map(getAllowedExternalImageUrl).filter(Boolean) : [],
      ]),
    ) as AvatarPresetGroups;
  })();

  avatarPresetGroupsPromise = promise;
  return promise;
};
