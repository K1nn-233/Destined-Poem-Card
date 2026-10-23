import { useEffect, useState } from 'react';
import {
  exportAvatarFile,
  getAvatarActionState,
  getAvatarRecordsByScopeKey,
  getDefaultPartnerAvatarMap,
  markAvatarAsRemoved,
  loadAvatarPresetGroups,
  readAvatarFileAsDataUrl,
  removeAvatarRecord,
  saveAvatarRecord,
  type AvatarPresetGroups,
} from '../../core/utils';
import type { PartnerRecord } from './destiny-types';

export function usePartnerAvatars(
  avatarScopeKey: string,
  partnerEntries: [string, PartnerRecord][],
) {
  const [partnerAvatarMap, setPartnerAvatarMap] = useState<Record<string, string>>({});
  const [partnerDefaultAvatarMap, setPartnerDefaultAvatarMap] = useState<Record<string, string>>(
    {},
  );
  const [partnerAvatarRemovedMap, setPartnerAvatarRemovedMap] = useState<Record<string, boolean>>(
    {},
  );
  const [avatarPresetGroups, setAvatarPresetGroups] = useState<AvatarPresetGroups>({});
  const [activeAvatarPartnerName, setActiveAvatarPartnerName] = useState<string | null>(null);
  const getPartnerAvatarUrl = (partner_name: string) => {
    if (partnerAvatarRemovedMap[partner_name]) {
      return '';
    }

    return partnerAvatarMap[partner_name] || partnerDefaultAvatarMap[partner_name] || '';
  };

  const hasPartnerAvatar = (partner_name: string) => Boolean(getPartnerAvatarUrl(partner_name));

  const handlePartnerAvatarUpload = async (partner_name: string, file: File) => {
    try {
      const nextAvatarUrl = await readAvatarFileAsDataUrl(file);
      if (!nextAvatarUrl) {
        return;
      }

      await saveAvatarRecord({
        scope_key: avatarScopeKey,
        owner_type: 'partner',
        owner_name: partner_name,
        source_type: 'upload',
        value: nextAvatarUrl,
      });

      setPartnerAvatarMap(previous => ({
        ...previous,
        [partner_name]: nextAvatarUrl,
      }));
      setPartnerAvatarRemovedMap(previous => ({
        ...previous,
        [partner_name]: false,
      }));
    } catch (error) {
      console.warn('[DestinyTab] 上传伙伴头像失败:', error);
    }
  };

  const handlePartnerAvatarUrlInput = async (partner_name: string, url_input: string) => {
    const nextAvatarUrl = _.trim(url_input || '');
    if (!nextAvatarUrl) {
      return;
    }

    try {
      await saveAvatarRecord({
        scope_key: avatarScopeKey,
        owner_type: 'partner',
        owner_name: partner_name,
        source_type: 'url',
        value: nextAvatarUrl,
      });

      setPartnerAvatarMap(previous => ({
        ...previous,
        [partner_name]: nextAvatarUrl,
      }));
      setPartnerAvatarRemovedMap(previous => ({
        ...previous,
        [partner_name]: false,
      }));
    } catch (error) {
      console.warn('[DestinyTab] 保存伙伴头像链接失败:', error);
    }
  };

  const handlePartnerAvatarPreset = async (partner_name: string, url: string) => {
    try {
      await saveAvatarRecord({
        scope_key: avatarScopeKey,
        owner_type: 'partner',
        owner_name: partner_name,
        source_type: 'preset',
        value: url,
      });

      setPartnerAvatarMap(previous => ({ ...previous, [partner_name]: url }));
      setPartnerAvatarRemovedMap(previous => ({ ...previous, [partner_name]: false }));
    } catch (error) {
      console.warn('[DestinyTab] 保存伙伴预制头像失败:', error);
    }
  };

  const handlePartnerAvatarExport = async (partner_name: string) => {
    const currentAvatarUrl = getPartnerAvatarUrl(partner_name);
    if (!currentAvatarUrl) {
      return;
    }

    try {
      await exportAvatarFile(`${partner_name}-avatar.png`, currentAvatarUrl);
    } catch (error) {
      console.warn('[DestinyTab] 导出伙伴头像失败:', error);
    }
  };

  const handlePartnerAvatarRemove = async (partner_name: string) => {
    try {
      await markAvatarAsRemoved(avatarScopeKey, 'partner', partner_name);
      setPartnerAvatarMap(previous => ({
        ...previous,
        [partner_name]: '',
      }));
      setPartnerAvatarRemovedMap(previous => ({
        ...previous,
        [partner_name]: true,
      }));
    } catch (error) {
      console.warn('[DestinyTab] 删除伙伴头像失败:', error);
    }
  };

  const handlePartnerAvatarReset = async (partner_name: string) => {
    try {
      await removeAvatarRecord(avatarScopeKey, 'partner', partner_name);
      setPartnerAvatarMap(previous => ({
        ...previous,
        [partner_name]: '',
      }));
      setPartnerAvatarRemovedMap(previous => ({
        ...previous,
        [partner_name]: false,
      }));
    } catch (error) {
      console.warn('[DestinyTab] 恢复伙伴默认头像失败:', error);
    }
  };

  const handlePartnerAvatarImageError = (partner_name: string) => {
    if (!partnerAvatarMap[partner_name] && partnerDefaultAvatarMap[partner_name]) {
      setPartnerDefaultAvatarMap(previous => ({
        ...previous,
        [partner_name]: '',
      }));
      return;
    }

    if (partnerAvatarMap[partner_name]) {
      void removeAvatarRecord(avatarScopeKey, 'partner', partner_name)
        .then(() => {
          setPartnerAvatarMap(previous => ({ ...previous, [partner_name]: '' }));
          setPartnerAvatarRemovedMap(previous => ({ ...previous, [partner_name]: false }));
        })
        .catch(error => console.warn('[DestinyTab] 清理失效伙伴头像失败:', error));
    }
  };

  const openPartnerAvatarModal = (partner_name: string) => {
    setActiveAvatarPartnerName(partner_name);
  };

  const closePartnerAvatarModal = () => {
    setActiveAvatarPartnerName(null);
  };

  useEffect(() => {
    let ignore = false;

    const loadPartnerAvatars = async () => {
      try {
        const partnerNames = partnerEntries.map(([partnerName]) => partnerName);

        if (partnerNames.length === 0) {
          if (!ignore) {
            setPartnerAvatarMap({});
            setPartnerDefaultAvatarMap({});
            setPartnerAvatarRemovedMap({});
          }
          return;
        }

        const partnerNameSet = new Set(partnerNames);
        const records = (await getAvatarRecordsByScopeKey(avatarScopeKey)).filter(
          record => record.owner_type === 'partner' && partnerNameSet.has(record.owner_name),
        );
        console.log('[DestinyTab] 读取到伙伴头像本地记录:', records);

        if (ignore) {
          return;
        }

        const recordsByPartnerName = _.keyBy(records, 'owner_name');
        const defaultAvatarPartnerNames: string[] = [];
        const nextAvatarMap: Record<string, string> = {};
        const nextRemovedMap: Record<string, boolean> = {};

        partnerNames.forEach(partnerName => {
          const avatarRecord = recordsByPartnerName[partnerName];
          const isAvatarRemoved = avatarRecord?.source_type === 'removed';
          const customAvatarUrl = isAvatarRemoved ? '' : (avatarRecord?.value ?? '');

          nextAvatarMap[partnerName] = customAvatarUrl;
          nextRemovedMap[partnerName] = isAvatarRemoved;

          if (!isAvatarRemoved && !customAvatarUrl) {
            defaultAvatarPartnerNames.push(partnerName);
          }
        });

        const nextDefaultAvatarMap = await getDefaultPartnerAvatarMap(defaultAvatarPartnerNames);
        if (ignore) {
          return;
        }

        setPartnerAvatarMap(nextAvatarMap);
        setPartnerDefaultAvatarMap(nextDefaultAvatarMap);
        setPartnerAvatarRemovedMap(nextRemovedMap);
      } catch (error) {
        console.warn('[DestinyTab] 读取伙伴头像失败:', error);
        if (!ignore) {
          setPartnerAvatarMap({});
          setPartnerDefaultAvatarMap({});
          setPartnerAvatarRemovedMap({});
        }
      }
    };

    void loadPartnerAvatars();

    return () => {
      ignore = true;
    };
  }, [avatarScopeKey, partnerEntries]);

  useEffect(() => {
    void loadAvatarPresetGroups().then(setAvatarPresetGroups);
  }, []);

  const activePartnerAvatarActionState = activeAvatarPartnerName
    ? {
        ...getAvatarActionState({
          current_url: getPartnerAvatarUrl(activeAvatarPartnerName),
          custom_url: partnerAvatarMap[activeAvatarPartnerName],
          default_url: partnerDefaultAvatarMap[activeAvatarPartnerName],
          removed: partnerAvatarRemovedMap[activeAvatarPartnerName],
        }),
        canDelete: Boolean(getPartnerAvatarUrl(activeAvatarPartnerName)),
      }
    : null;

  return {
    partnerAvatarMap,
    setPartnerAvatarMap,
    partnerDefaultAvatarMap,
    setPartnerDefaultAvatarMap,
    partnerAvatarRemovedMap,
    setPartnerAvatarRemovedMap,
    avatarPresetGroups,
    activeAvatarPartnerName,
    setActiveAvatarPartnerName,
    getPartnerAvatarUrl,
    hasPartnerAvatar,
    handlePartnerAvatarUpload,
    handlePartnerAvatarUrlInput,
    handlePartnerAvatarPreset,
    handlePartnerAvatarExport,
    handlePartnerAvatarRemove,
    handlePartnerAvatarReset,
    handlePartnerAvatarImageError,
    openPartnerAvatarModal,
    closePartnerAvatarModal,
    activePartnerAvatarActionState,
  };
}
