import { useEffect, useState, type ChangeEvent } from 'react';
import {
  createPartnerGalleryItem,
  getCharInfoPartnerGalleryMap,
  getPartnerGalleryRecordsByScopeKey,
  getLegacyPartnerGalleryMap,
  getPredefinedPartnerGalleryMap,
  readAvatarFileAsDataUrl,
  removePartnerGalleryRecord,
  savePartnerGalleryItems,
  type PartnerGalleryItem,
} from '../../core/utils';
import type { PartnerRecord } from './destiny-types';

export function usePartnerGallery(
  avatarScopeKey: string,
  partnerEntries: [string, PartnerRecord][],
) {
  const [partnerGalleryMap, setPartnerGalleryMap] = useState<Record<string, PartnerGalleryItem[]>>(
    {},
  );
  const [partnerExternalGalleryMap, setPartnerExternalGalleryMap] = useState<
    Record<string, PartnerGalleryItem[]>
  >({});
  const [partnerPredefinedGalleryMap, setPartnerPredefinedGalleryMap] = useState<
    Record<string, PartnerGalleryItem[]>
  >({});
  const [isPartnerGalleryLoading, setIsPartnerGalleryLoading] = useState(false);
  const [editingGalleryItemId, setEditingGalleryItemId] = useState<string | null>(null);
  const [editingGalleryTitle, setEditingGalleryTitle] = useState('');
  const [pendingGalleryDelete, setPendingGalleryDelete] = useState<{
    partnerName: string;
    itemId: string;
  } | null>(null);
  const [activeGalleryPreview, setActiveGalleryPreview] = useState<{
    partnerName: string;
    itemId: string;
  } | null>(null);

  const activeGalleryPreviewItem = activeGalleryPreview
    ? (partnerGalleryMap[activeGalleryPreview.partnerName] ?? []).find(
        item => item.id === activeGalleryPreview.itemId,
      )
    : null;
  const pendingGalleryDeleteTarget = pendingGalleryDelete
    ? {
        type: '关系相册图片',
        path: '',
        name: pendingGalleryDelete.partnerName,
      }
    : null;

  const getFallbackGalleryTitle = (file: File) => {
    const fileName = _.trim(file.name || '相册图片');
    return _.trim(fileName.replace(/\.[^.]+$/, '')) || '相册图片';
  };

  const persistPartnerGalleryItems = async (
    partner_name: string,
    next_items: PartnerGalleryItem[],
  ) => {
    if (next_items.length === 0) {
      await removePartnerGalleryRecord(avatarScopeKey, partner_name);
    } else {
      await savePartnerGalleryItems(avatarScopeKey, partner_name, next_items);
    }

    setPartnerGalleryMap(previous => ({
      ...previous,
      [partner_name]: next_items,
    }));
  };

  const handlePartnerGalleryUpload = async (
    partner_name: string,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';

    if (!selectedFile) {
      return;
    }

    try {
      const nextGalleryUrl = await readAvatarFileAsDataUrl(selectedFile);
      if (!nextGalleryUrl) {
        return;
      }

      const nextItem = createPartnerGalleryItem({
        title: getFallbackGalleryTitle(selectedFile),
        url: nextGalleryUrl,
      });
      const nextItems = [...(partnerGalleryMap[partner_name] ?? []), nextItem];

      await persistPartnerGalleryItems(partner_name, nextItems);
      setEditingGalleryItemId(nextItem.id);
      setEditingGalleryTitle(nextItem.title);
    } catch (error) {
      console.warn('[DestinyTab] 添加伙伴相册图片失败:', error);
    }
  };

  const handlePartnerGalleryLoadPredefined = async (partner_name: string) => {
    const predefinedItems = partnerPredefinedGalleryMap[partner_name] ?? [];
    if (predefinedItems.length === 0) {
      return;
    }

    try {
      await persistPartnerGalleryItems(partner_name, predefinedItems.map(createPartnerGalleryItem));
    } catch (error) {
      console.warn('[DestinyTab] 加载预定义伙伴相册失败:', error);
    }
  };

  const handlePartnerGalleryLoadExternal = async (partner_name: string) => {
    const externalItems = partnerExternalGalleryMap[partner_name] ?? [];
    if (externalItems.length === 0) {
      return;
    }

    try {
      await persistPartnerGalleryItems(partner_name, externalItems.map(createPartnerGalleryItem));
    } catch (error) {
      console.warn('[DestinyTab] 加载外部伙伴相册失败:', error);
    }
  };

  const handlePartnerGalleryDelete = async (partner_name: string, item_id: string) => {
    const nextItems = (partnerGalleryMap[partner_name] ?? []).filter(item => item.id !== item_id);

    try {
      await persistPartnerGalleryItems(partner_name, nextItems);
      if (
        activeGalleryPreview?.partnerName === partner_name &&
        activeGalleryPreview.itemId === item_id
      ) {
        setActiveGalleryPreview(null);
      }
      if (editingGalleryItemId === item_id) {
        setEditingGalleryItemId(null);
        setEditingGalleryTitle('');
      }
    } catch (error) {
      console.warn('[DestinyTab] 删除伙伴相册图片失败:', error);
    }
  };

  const requestPartnerGalleryDelete = (partner_name: string, item: PartnerGalleryItem) => {
    setPendingGalleryDelete({
      partnerName: partner_name,
      itemId: item.id,
    });
  };

  const cancelPartnerGalleryDelete = () => {
    setPendingGalleryDelete(null);
  };

  const confirmPartnerGalleryDelete = async () => {
    if (!pendingGalleryDelete) {
      return;
    }

    await handlePartnerGalleryDelete(pendingGalleryDelete.partnerName, pendingGalleryDelete.itemId);
    setPendingGalleryDelete(null);
  };

  const startPartnerGalleryTitleEdit = (item: PartnerGalleryItem) => {
    setEditingGalleryItemId(item.id);
    setEditingGalleryTitle(item.title);
  };

  const cancelPartnerGalleryTitleEdit = () => {
    setEditingGalleryItemId(null);
    setEditingGalleryTitle('');
  };

  const commitPartnerGalleryTitleEdit = async (partner_name: string, item_id: string) => {
    const currentItems = partnerGalleryMap[partner_name] ?? [];
    const currentItem = currentItems.find(item => item.id === item_id);
    if (!currentItem) {
      cancelPartnerGalleryTitleEdit();
      return;
    }

    const nextTitle = _.trim(editingGalleryTitle) || currentItem.title;
    if (nextTitle === currentItem.title) {
      cancelPartnerGalleryTitleEdit();
      return;
    }

    const nextItems = currentItems.map(item =>
      item.id === item_id ? { ...item, title: nextTitle } : item,
    );

    try {
      await persistPartnerGalleryItems(partner_name, nextItems);
      cancelPartnerGalleryTitleEdit();
    } catch (error) {
      console.warn('[DestinyTab] 修改伙伴相册标题失败:', error);
    }
  };

  useEffect(() => {
    let ignore = false;

    const loadPartnerGalleries = async () => {
      try {
        const partnerNames = partnerEntries.map(([partnerName]) => partnerName);
        if (partnerNames.length === 0) {
          if (!ignore) {
            setIsPartnerGalleryLoading(false);
            setPartnerGalleryMap({});
            setPartnerExternalGalleryMap({});
            setPartnerPredefinedGalleryMap({});
          }
          return;
        }

        if (!ignore) {
          setIsPartnerGalleryLoading(true);
        }

        const partnerNameSet = new Set(partnerNames);
        const records = (await getPartnerGalleryRecordsByScopeKey(avatarScopeKey)).filter(
          record => record.owner_type === 'partner' && partnerNameSet.has(record.owner_name),
        );
        const recordsByPartnerName = _.keyBy(records, 'owner_name');
        const legacyGalleryMap = getLegacyPartnerGalleryMap(partnerNames);
        const charInfoGalleryMap = getCharInfoPartnerGalleryMap(partnerNames);
        const nextGalleryMap = partnerNames.reduce<Record<string, PartnerGalleryItem[]>>(
          (result, partnerName) => {
            const localRecord = recordsByPartnerName[partnerName];
            result[partnerName] = localRecord ? localRecord.items : [];
            return result;
          },
          {},
        );
        const nextExternalGalleryMap = partnerNames.reduce<Record<string, PartnerGalleryItem[]>>(
          (result, partnerName) => {
            const localRecord = recordsByPartnerName[partnerName];
            const legacyGalleryItems = legacyGalleryMap[partnerName] ?? [];
            const charInfoGalleryItems = charInfoGalleryMap[partnerName] ?? [];
            if (
              !localRecord &&
              (legacyGalleryItems.length > 0 || charInfoGalleryItems.length > 0)
            ) {
              result[partnerName] = [...legacyGalleryItems, ...charInfoGalleryItems];
            }
            return result;
          },
          {},
        );
        const nextPredefinedGalleryMap = await getPredefinedPartnerGalleryMap(partnerNames);
        if (!ignore) {
          setPartnerGalleryMap(nextGalleryMap);
          setPartnerExternalGalleryMap(nextExternalGalleryMap);
          setPartnerPredefinedGalleryMap(nextPredefinedGalleryMap);
          setIsPartnerGalleryLoading(false);
        }
      } catch (error) {
        console.warn('[DestinyTab] 读取伙伴图片失败:', error);
        if (!ignore) {
          setPartnerGalleryMap({});
          setPartnerExternalGalleryMap({});
          setPartnerPredefinedGalleryMap({});
          setIsPartnerGalleryLoading(false);
        }
      }
    };

    void loadPartnerGalleries();

    return () => {
      ignore = true;
    };
  }, [avatarScopeKey, partnerEntries]);

  return {
    partnerGalleryMap,
    setPartnerGalleryMap,
    partnerExternalGalleryMap,
    setPartnerExternalGalleryMap,
    partnerPredefinedGalleryMap,
    setPartnerPredefinedGalleryMap,
    isPartnerGalleryLoading,
    editingGalleryItemId,
    editingGalleryTitle,
    setEditingGalleryTitle,
    pendingGalleryDelete,
    setPendingGalleryDelete,
    activeGalleryPreview,
    setActiveGalleryPreview,
    activeGalleryPreviewItem,
    pendingGalleryDeleteTarget,
    handlePartnerGalleryUpload,
    handlePartnerGalleryLoadPredefined,
    handlePartnerGalleryLoadExternal,
    requestPartnerGalleryDelete,
    cancelPartnerGalleryDelete,
    confirmPartnerGalleryDelete,
    startPartnerGalleryTitleEdit,
    cancelPartnerGalleryTitleEdit,
    commitPartnerGalleryTitleEdit,
  };
}
