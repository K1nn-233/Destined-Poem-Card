import {
  PartnerListCategories,
  PartnerAssetSections,
  renameRecordKey,
  type PartnerListCategory,
  type PartnerDetailSection,
  type PartnerRecord,
} from './destiny-types';
import { usePartnerAvatars } from './use-partner-avatars';
import { usePartnerGallery } from './use-partner-gallery';
import { PartnerAvatar } from './PartnerAvatar';
import { PartnerDetails } from './PartnerDetails';
import { PartnerList } from './PartnerList';
import { handlePartnerGalleryImageError } from './PartnerGallery';
import { FC, KeyboardEvent, MouseEvent, useEffect, useMemo, useState } from 'react';
import { useDeleteConfirm } from '../../core/hooks';
import { useEditorSettingStore, useMvuDataStore } from '../../core/stores';
import {
  buildSessionKey,
  getAvatarScopeKey,
  readSessionState,
  renameAvatarRecord,
  renamePartnerGalleryRecord,
  writeSessionState,
} from '../../core/utils';

import {
  AvatarActionModal,
  DeleteConfirmModal,
  EditableField,
  EmptyHint,
  IconTitle,
} from '../../shared/components';
import { withMvuData, WithMvuDataProps } from '../../shared/hoc';
import styles from './DestinyTab.module.scss';

/**
 * 命定页内容组件
 */
const DestinyTabContent: FC<WithMvuDataProps> = ({ data }) => {
  const editEnabled = useEditorSettingStore(state => state.editEnabled);
  const { setPartnerPresence, updateField } = useMvuDataStore();
  const { deleteTarget, setDeleteTarget, handleDelete, cancelDelete, isConfirmOpen } =
    useDeleteConfirm();
  const destinyPoints = data.命运点数;
  const partners = data.关系列表;
  const partnerEntries = useMemo(() => Object.entries(partners ?? {}), [partners]);
  const partnerCategoryStorageKey = buildSessionKey('destiny', 'partner-category');
  const partnerNameStorageKey = buildSessionKey('destiny', 'partner-name');
  const partnerMobileDetailOpenStorageKey = buildSessionKey(
    'destiny',
    'partner-mobile-detail-open',
  );
  const partnerDetailStorageKey = buildSessionKey('destiny', 'partner-detail');
  const partnerSearchStorageKey = buildSessionKey('destiny', 'partner-search');
  const partnerLabelStorageKey = buildSessionKey('destiny', 'partner-label');
  const avatarScopeKey = useMemo(() => getAvatarScopeKey(), []);
  const avatars = usePartnerAvatars(avatarScopeKey, partnerEntries);
  const {
    setPartnerAvatarMap,
    setPartnerDefaultAvatarMap,
    setPartnerAvatarRemovedMap,
    avatarPresetGroups,
    activeAvatarPartnerName,
    setActiveAvatarPartnerName,
    handlePartnerAvatarUpload,
    handlePartnerAvatarUrlInput,
    handlePartnerAvatarPreset,
    handlePartnerAvatarExport,
    handlePartnerAvatarRemove,
    handlePartnerAvatarReset,
    closePartnerAvatarModal,
    activePartnerAvatarActionState,
  } = avatars;

  const [activePartnerListCategory, setActivePartnerListCategory] = useState<PartnerListCategory>(
    () => readSessionState<PartnerListCategory>(partnerCategoryStorageKey, 'present'),
  );
  const [selectedPartnerName, setSelectedPartnerName] = useState<string | null>(() =>
    readSessionState<string | null>(partnerNameStorageKey, null),
  );
  const [thoughtsExpanded, setThoughtsExpanded] = useState(false);
  const [isPartnerDetailOpen, setIsPartnerDetailOpen] = useState<boolean>(() =>
    readSessionState<boolean>(partnerMobileDetailOpenStorageKey, false),
  );
  const [activePartnerDetailSection, setActivePartnerDetailSection] =
    useState<PartnerDetailSection>(() =>
      readSessionState<PartnerDetailSection>(partnerDetailStorageKey, 'overview'),
    );
  const [partnerSearchKeyword, setPartnerSearchKeyword] = useState<string>(() =>
    readSessionState<string>(partnerSearchStorageKey, ''),
  );
  const [activePartnerLabel, setActivePartnerLabel] = useState<string | null>(() =>
    readSessionState<string | null>(partnerLabelStorageKey, null),
  );
  const gallery = usePartnerGallery(avatarScopeKey, partnerEntries);
  const {
    setPartnerGalleryMap,
    setPartnerExternalGalleryMap,
    setPartnerPredefinedGalleryMap,
    pendingGalleryDelete,
    setPendingGalleryDelete,
    activeGalleryPreview,
    setActiveGalleryPreview,
    activeGalleryPreviewItem,
    pendingGalleryDeleteTarget,
    cancelPartnerGalleryDelete,
    confirmPartnerGalleryDelete,
  } = gallery;
  const [hiddenGroupExpanded, setHiddenGroupExpanded] = useState(false);
  const partnerCategoryEntries = useMemo(() => {
    return PartnerListCategories.map(category => {
      const entries = partnerEntries.filter(([, partner]) => category.matches(partner));
      return {
        ...category,
        count: entries.length,
        entries,
      };
    });
  }, [partnerEntries]);

  /** 全部伙伴标签（用于标签筛选） */
  const allPartnerLabels = useMemo(() => {
    const labelSet = new Set<string>();
    partnerEntries.forEach(([, partner]) => {
      (partner.标签 ?? []).forEach(tag => labelSet.add(tag));
    });
    return Array.from(labelSet);
  }, [partnerEntries]);

  const activePartnerListCategoryConfig =
    partnerCategoryEntries.find(category => category.key === activePartnerListCategory) ??
    partnerCategoryEntries[0];

  /** 当前可见伙伴：固定分类 + 标签筛选 + 关键词搜索 叠加 */
  const visiblePartnerEntries = useMemo(() => {
    let entries = activePartnerListCategoryConfig?.entries ?? [];

    if (activePartnerLabel) {
      entries = entries.filter(([, partner]) => (partner.标签 ?? []).includes(activePartnerLabel));
    }

    const keyword = partnerSearchKeyword.trim().toLowerCase();
    if (keyword) {
      entries = entries.filter(([name, partner]) => {
        const identity = Array.isArray(partner.身份)
          ? partner.身份.join(' ')
          : (partner.身份 ?? '');
        const occupation = Array.isArray(partner.职业)
          ? partner.职业.join(' ')
          : (partner.职业 ?? '');
        const haystack = [name, partner.种族 ?? '', identity, occupation, ...(partner.标签 ?? [])]
          .join(' ')
          .toLowerCase();
        return haystack.includes(keyword);
      });
    }

    return entries;
  }, [activePartnerLabel, activePartnerListCategoryConfig, partnerSearchKeyword]);
  const activePartnerName =
    selectedPartnerName && visiblePartnerEntries.some(([name]) => name === selectedPartnerName)
      ? selectedPartnerName
      : (visiblePartnerEntries[0]?.[0] ?? null);
  const activePartner = activePartnerName ? partners?.[activePartnerName] : null;
  const isPartnerDetailVisible = Boolean(isPartnerDetailOpen && activePartnerName && activePartner);
  const activePartnerAssetSection =
    PartnerAssetSections.find(section => section.key === activePartnerDetailSection) ?? null;

  /** 切换伙伴在场状态（快捷操作，不依赖编辑模式） */
  const handleTogglePresence = async (partnerName: string, partner: PartnerRecord) => {
    const next = !partner.在场;
    const success = await setPartnerPresence(partnerName, next);
    if (success) {
      toastr.success(next ? `「${partnerName}」已切换为在场` : `「${partnerName}」已切换为离场`);
    } else {
      toastr.error('在场状态切换失败');
    }
  };

  /** 切换伙伴隐藏状态（隐藏的伙伴在列表中折叠收起） */
  const handleTogglePartnerHidden = async (partnerName: string, partner: PartnerRecord) => {
    const success = await updateField(`关系列表.${partnerName}._隐藏`, !partner._隐藏);
    if (!success) {
      toastr.error('隐藏状态切换失败');
    }
  };

  const renderPartnerPresenceToggle = (partnerName: string, partner: PartnerRecord) => (
    <button
      type="button"
      className={`${styles.partnerPresenceToggle} ${partner.在场 ? styles.partnerPresenceToggleOn : ''}`}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        void handleTogglePresence(partnerName, partner);
      }}
      title={partner.在场 ? '切换为离场' : '切换为在场'}
    >
      <i className={partner.在场 ? 'fa-solid fa-eye' : 'fa-regular fa-eye-slash'} />
    </button>
  );

  const renderPartnerDeleteButton = (partnerName: string) => {
    return (
      <button
        className={styles.deletePartnerBtn}
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          setDeleteTarget({
            type: '关系',
            path: `关系列表.${partnerName}`,
            name: partnerName,
          });
        }}
        title="删除关系"
      >
        <i className="fa-solid fa-trash-can" />
      </button>
    );
  };

  const renderPartnerHideButton = (partnerName: string, partner: PartnerRecord) => {
    return (
      <button
        className={`${styles.hidePartnerBtn} ${partner._隐藏 ? styles.isHidden : ''}`}
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          void handleTogglePartnerHidden(partnerName, partner);
        }}
        title={partner._隐藏 ? '取消隐藏' : '隐藏'}
      >
        <i className={`fa-solid ${partner._隐藏 ? 'fa-circle-plus' : 'fa-circle-minus'}`} />
      </button>
    );
  };

  const handlePartnerRename = async (currentName: string, value: unknown) => {
    const nextName = String(value).trim();
    if (!nextName || nextName === currentName) return;

    setSelectedPartnerName(nextName);
    setActiveAvatarPartnerName(name => (name === currentName ? nextName : name));
    setActiveGalleryPreview(preview =>
      preview?.partnerName === currentName ? { ...preview, partnerName: nextName } : preview,
    );
    setPendingGalleryDelete(pending =>
      pending?.partnerName === currentName ? { ...pending, partnerName: nextName } : pending,
    );
    setPartnerAvatarMap(record => renameRecordKey(record, currentName, nextName));
    setPartnerDefaultAvatarMap(record => renameRecordKey(record, currentName, nextName));
    setPartnerAvatarRemovedMap(record => renameRecordKey(record, currentName, nextName));
    setPartnerGalleryMap(record => renameRecordKey(record, currentName, nextName));
    setPartnerExternalGalleryMap(record => renameRecordKey(record, currentName, nextName));
    setPartnerPredefinedGalleryMap(record => renameRecordKey(record, currentName, nextName));

    try {
      await Promise.all([
        renameAvatarRecord(avatarScopeKey, 'partner', currentName, nextName),
        renamePartnerGalleryRecord(avatarScopeKey, currentName, nextName),
      ]);
    } catch (error) {
      console.warn('[DestinyTab] 迁移伙伴本地图片失败:', error);
    }
  };

  /** 详情头部身份信息：名字 + 好感度 + 在场/契约标记 */
  const renderPartnerIdentity = (partnerName: string, partner: PartnerRecord) => (
    <>
      <div className={styles.partnerIdentityHeader}>
        <div className={styles.partnerIdentityTitleRow}>
          {editEnabled ? (
            <EditableField
              path={`关系列表.${partnerName}`}
              value={partnerName}
              type="text"
              renameKey
              className={styles.partnerName}
              onUpdateSuccess={value => {
                void handlePartnerRename(partnerName, value);
              }}
            />
          ) : (
            <IconTitle text={partnerName} className={styles.partnerName} />
          )}
        </div>
      </div>
      <div className={styles.partnerMeta}>
        <span className={styles.affectionBadge}>好感度 {partner.好感度 ?? 0}</span>
        <div className={styles.partnerTags}>
          {partner.在场 && <span className={`${styles.tag} ${styles.tagPresent}`}>在场</span>}
          {partner.命定契约 && (
            <span className={`${styles.tag} ${styles.tagContract}`}>命定契约</span>
          )}
        </div>
      </div>
    </>
  );

  const renderPartnerSummary = (partnerName: string, partner: PartnerRecord) => (
    <div className={styles.partnerTitle}>
      <div className={styles.partnerTitleMain}>
        <PartnerAvatar
          partnerName={partnerName}
          partner={partner}
          size="sm"
          showOverlays={false}
          avatars={avatars}
        />
        <div className={styles.partnerTitleContent}>
          {renderPartnerIdentity(partnerName, partner)}
        </div>
      </div>
      <div className={styles.partnerTitleActions}>
        {renderPartnerHideButton(partnerName, partner)}
        {renderPartnerDeleteButton(partnerName)}
      </div>
    </div>
  );

  /** 生命值数据：当前 / 上限（基础 + 额外）/ 百分比 */
  const handlePartnerSelect = (partnerName: string) => {
    setSelectedPartnerName(partnerName);
    setActivePartnerDetailSection('overview');
    setIsPartnerDetailOpen(true);
  };

  const handlePartnerDetailBack = () => {
    setIsPartnerDetailOpen(false);
    setActivePartnerDetailSection('overview');
  };

  const handlePartnerListCategoryChange = (category: PartnerListCategory) => {
    setActivePartnerListCategory(category);
    setSelectedPartnerName(null);
    setActivePartnerDetailSection('overview');
    setPartnerSearchKeyword('');
    setActivePartnerLabel(null);
    setIsPartnerDetailOpen(false);
  };

  const handlePartnerDetailSectionChange = (section: PartnerDetailSection) => {
    setActivePartnerDetailSection(section);
  };

  /** 列表项标签 chips（最多 3 个，超出折叠为 +n） */
  const renderPartnerLabelChips = (partner: PartnerRecord) => {
    const labels = partner.标签 ?? [];
    if (labels.length === 0) return null;
    const visible = labels.slice(0, 3);
    const rest = labels.length - visible.length;
    return (
      <div className={styles.partnerRowTags}>
        {visible.map((tag: string) => (
          <span key={tag} className={styles.partnerLabelChip}>
            {tag}
          </span>
        ))}
        {rest > 0 && <span className={styles.partnerLabelChipMore}>+{rest}</span>}
      </div>
    );
  };

  const renderPartnerListItem = (partnerName: string, partner: PartnerRecord) => (
    <div
      className={`${styles.partnerRow} ${activePartnerName === partnerName ? styles.partnerRowActive : ''}`}
      onClick={() => handlePartnerSelect(partnerName)}
      role="button"
      tabIndex={0}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handlePartnerSelect(partnerName);
        }
      }}
    >
      <PartnerAvatar partnerName={partnerName} partner={partner} size="sm" avatars={avatars} />
      <div className={styles.partnerRowMain}>
        <div className={styles.partnerRowTitle}>
          <span className={styles.partnerRowName}>{partnerName}</span>
        </div>
        {renderPartnerLabelChips(partner)}
        <div className={styles.partnerRowMeta}>
          <span className={styles.affectionBadge}>好感度 {partner.好感度 ?? 0}</span>
          {partner.在场 && <span className={`${styles.tag} ${styles.tagPresent}`}>在场</span>}
          {partner.命定契约 && (
            <span className={`${styles.tag} ${styles.tagContract}`}>命定契约</span>
          )}
        </div>
      </div>
      <div className={styles.partnerRowActions}>
        {renderPartnerPresenceToggle(partnerName, partner)}
        {editEnabled ? renderPartnerHideButton(partnerName, partner) : null}
        {editEnabled ? renderPartnerDeleteButton(partnerName) : null}
      </div>
    </div>
  );

  const renderActivePartnerDetailContent = () =>
    activePartnerName && activePartner ? (
      <>
        <div className={styles.partnerDetailHeader}>
          {renderPartnerSummary(activePartnerName, activePartner)}
        </div>
        <PartnerDetails
          partnerName={activePartnerName}
          partner={activePartner}
          partners={partners}
          editEnabled={editEnabled}
          activePartnerDetailSection={activePartnerDetailSection}
          activePartnerAssetSection={activePartnerAssetSection}
          handlePartnerDetailSectionChange={handlePartnerDetailSectionChange}
          thoughtsExpanded={thoughtsExpanded}
          setThoughtsExpanded={setThoughtsExpanded}
          setDeleteTarget={setDeleteTarget}
          gallery={gallery}
        />
      </>
    ) : (
      <EmptyHint className={styles.emptyHint} text="暂无可查看关系" />
    );

  const renderPartnerCategories = () => (
    <div className={styles.partnerCategoryBar}>
      {partnerCategoryEntries.map(category => (
        <button
          key={category.key}
          type="button"
          className={`${styles.partnerCategoryBtn} ${activePartnerListCategory === category.key ? styles.partnerCategoryBtnActive : ''}`}
          onClick={() => handlePartnerListCategoryChange(category.key)}
        >
          <span>{category.label}</span>
          <span className={styles.partnerCategoryCount}>{category.count}</span>
        </button>
      ))}
    </div>
  );

  /** 渲染关系列表 */
  useEffect(() => {
    writeSessionState(partnerCategoryStorageKey, activePartnerListCategory);
  }, [activePartnerListCategory, partnerCategoryStorageKey]);

  useEffect(() => {
    if (!selectedPartnerName) {
      writeSessionState(partnerNameStorageKey, null);
      return;
    }

    writeSessionState(partnerNameStorageKey, selectedPartnerName);
  }, [partnerNameStorageKey, selectedPartnerName]);

  useEffect(() => {
    writeSessionState(partnerMobileDetailOpenStorageKey, isPartnerDetailOpen);
  }, [isPartnerDetailOpen, partnerMobileDetailOpenStorageKey]);

  useEffect(() => {
    writeSessionState(partnerDetailStorageKey, activePartnerDetailSection);
  }, [activePartnerDetailSection, partnerDetailStorageKey]);

  useEffect(() => {
    writeSessionState(partnerSearchStorageKey, partnerSearchKeyword);
  }, [partnerSearchKeyword, partnerSearchStorageKey]);

  useEffect(() => {
    writeSessionState(partnerLabelStorageKey, activePartnerLabel);
  }, [activePartnerLabel, partnerLabelStorageKey]);

  useEffect(() => {
    if (!selectedPartnerName || !activePartnerName) return;
    if (selectedPartnerName === activePartnerName) return;
    setSelectedPartnerName(activePartnerName);
  }, [activePartnerName, selectedPartnerName]);

  return (
    <div
      className={`${styles.destinyTab} ${isPartnerDetailVisible ? styles.destinyTabDetailModeMobile : ''}`}
    >
      <div className={styles.destinyTabHeader}>
        {renderPartnerCategories()}
        <div className={styles.destinyPoints}>
          <i className={`fa-solid fa-star ${styles.destinyPointsIcon}`} />
          {editEnabled ? (
            <EditableField
              path="命运点数"
              value={destinyPoints ?? 0}
              type="number"
              numberConfig={{ min: 0, step: 1 }}
            />
          ) : (
            <span className={styles.destinyPointsValue}>{destinyPoints ?? 0}</span>
          )}
          <span className={styles.destinyPointsUnit}>FP</span>
        </div>
      </div>

      {/* 关系列表 */}
      <section className={styles.destinyTabPartners}>
        <PartnerList
          partners={partners}
          detailContent={renderActivePartnerDetailContent()}
          partnerSearchKeyword={partnerSearchKeyword}
          setPartnerSearchKeyword={setPartnerSearchKeyword}
          allPartnerLabels={allPartnerLabels}
          activePartnerLabel={activePartnerLabel}
          setActivePartnerLabel={setActivePartnerLabel}
          isPartnerDetailVisible={isPartnerDetailVisible}
          visiblePartnerEntries={visiblePartnerEntries}
          hiddenGroupExpanded={hiddenGroupExpanded}
          setHiddenGroupExpanded={setHiddenGroupExpanded}
          activePartnerListCategoryConfig={activePartnerListCategoryConfig}
          renderPartnerListItem={renderPartnerListItem}
        />
      </section>

      {isPartnerDetailVisible && (
        <div className={styles.partnerDetailPageMobile}>
          <div className={styles.partnerDetailPageTopbar}>
            <button className={styles.partnerBackBtn} onClick={handlePartnerDetailBack}>
              <i className="fa-solid fa-chevron-left" />
              <span>返回关系列表</span>
            </button>
          </div>
          <div className={styles.partnerDetailPageBody}>{renderActivePartnerDetailContent()}</div>
        </div>
      )}

      {activeAvatarPartnerName ? (
        <AvatarActionModal
          open
          title={`${activeAvatarPartnerName}头像`}
          subtitle="支持导入本地图片、保存图片链接、导出当前头像、删除当前头像，或恢复到默认头像。"
          linkPlaceholder={`请输入${activeAvatarPartnerName}头像图片链接`}
          canExport={activePartnerAvatarActionState?.canExport ?? false}
          canDelete={activePartnerAvatarActionState?.canDelete ?? false}
          canReset={activePartnerAvatarActionState?.canReset ?? false}
          deleteLabel="删除头像"
          presetGroups={avatarPresetGroups}
          onClose={closePartnerAvatarModal}
          onUpload={(file: File) => handlePartnerAvatarUpload(activeAvatarPartnerName, file)}
          onSubmitLink={(url: string) => handlePartnerAvatarUrlInput(activeAvatarPartnerName, url)}
          onSelectPreset={(url: string) => handlePartnerAvatarPreset(activeAvatarPartnerName, url)}
          onExport={() => handlePartnerAvatarExport(activeAvatarPartnerName)}
          onDelete={() => handlePartnerAvatarRemove(activeAvatarPartnerName)}
          onReset={() => handlePartnerAvatarReset(activeAvatarPartnerName)}
        />
      ) : null}

      {activeGalleryPreview && activeGalleryPreviewItem ? (
        <div
          className={styles.partnerGalleryPreviewOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={`${activeGalleryPreview.partnerName}相册预览`}
          onClick={() => setActiveGalleryPreview(null)}
        >
          <div
            className={styles.partnerGalleryPreviewPanel}
            onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.partnerGalleryPreviewClose}
              onClick={() => setActiveGalleryPreview(null)}
              aria-label="关闭图片预览"
            >
              <i className="fa-solid fa-xmark" />
            </button>
            <img
              src={activeGalleryPreviewItem.url}
              alt={activeGalleryPreviewItem.title}
              className={styles.partnerGalleryPreviewImage}
              onError={event => handlePartnerGalleryImageError(event, activeGalleryPreviewItem)}
            />
            <div className={styles.partnerGalleryPreviewTitle}>
              {activeGalleryPreviewItem.title}
            </div>
          </div>
        </div>
      ) : null}

      <DeleteConfirmModal
        open={Boolean(pendingGalleryDelete)}
        target={pendingGalleryDeleteTarget}
        onConfirm={() => {
          void confirmPartnerGalleryDelete();
        }}
        onCancel={cancelPartnerGalleryDelete}
      />

      {/* 删除确认弹窗 */}
      <DeleteConfirmModal
        open={isConfirmOpen}
        target={deleteTarget}
        onConfirm={handleDelete}
        onCancel={cancelDelete}
      />
    </div>
  );
};

/**
 * 命定页组件（使用 HOC 包装）
 */
export const DestinyTab = withMvuData({ baseClassName: styles.destinyTab })(DestinyTabContent);
