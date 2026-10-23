import type { Dispatch, SetStateAction } from 'react';
import {
  Ascension,
  Card,
  EditableField,
  EmptyHint,
  ItemCollectionPanel,
  ResourceBar,
  StatusEffectDisplay,
} from '../../shared/components';
import type { useDeleteConfirm } from '../../core/hooks';
import {
  PartnerResourceFields,
  type FieldType,
  type PartnerRecord,
  type PartnerDetailSection,
  type PartnerAssetSectionConfig,
} from './destiny-types';
import { PartnerGallery } from './PartnerGallery';
import type { usePartnerGallery } from './use-partner-gallery';
import styles from './DestinyTab.module.scss';

type Props = {
  partnerName: string;
  partner: PartnerRecord;
  partners: Record<string, PartnerRecord> | undefined;
  editEnabled: boolean;
  activePartnerDetailSection: PartnerDetailSection;
  activePartnerAssetSection: PartnerAssetSectionConfig | null;
  handlePartnerDetailSectionChange: (section: PartnerDetailSection) => void;
  thoughtsExpanded: boolean;
  setThoughtsExpanded: Dispatch<SetStateAction<boolean>>;
  setDeleteTarget: ReturnType<typeof useDeleteConfirm>['setDeleteTarget'];
  gallery: ReturnType<typeof usePartnerGallery>;
};

export function PartnerDetails({
  partnerName,
  partner,
  partners,
  editEnabled,
  activePartnerDetailSection,
  activePartnerAssetSection,
  handlePartnerDetailSectionChange,
  thoughtsExpanded,
  setThoughtsExpanded,
  setDeleteTarget,
  gallery,
}: Props) {
  /**
   * 渲染可编辑字段行
   * 非编辑模式：保持原有布局
   * 编辑模式：替换为 EditableField
   */
  const renderEditableRow = (
    label: string,
    path: string,
    value: string | number | boolean | string[] | Record<string, any> | undefined,
    type: FieldType,
    rowClass: string,
    labelClass: string,
    valueClass: string,
    config?: {
      numberConfig?: { min?: number; max?: number; step?: number };
      toggleConfig?: { labelOff?: string; labelOn?: string; size?: 'sm' | 'md' };
    },
  ) => {
    // 非编辑模式：空值不显示
    if (!editEnabled && (value === undefined || value === null || value === '')) return null;

    // 格式化显示值
    const formatDisplayValue = () => {
      if (value === undefined || value === null) return '无';
      if (type === 'tags' && Array.isArray(value)) {
        return value.length > 0 ? value.join(' / ') : '无';
      }
      if (type === 'toggle') return value ? '是' : '否';
      if (type === 'keyvalue') {
        if (_.isEmpty(value)) return '无';
        return _.map(value as Record<string, unknown>, (effectValue, effectKey) => {
          const displayValue =
            effectValue === undefined || effectValue === null || effectValue === ''
              ? '无'
              : String(effectValue);
          return `${effectKey}: ${displayValue}`;
        }).join(' / ');
      }
      if (value === '') return '无';
      return String(value);
    };

    return (
      <div className={rowClass}>
        <span className={labelClass}>{label}</span>
        {editEnabled ? (
          <EditableField
            path={path}
            value={
              value ??
              (type === 'number'
                ? 0
                : type === 'toggle'
                  ? false
                  : type === 'tags'
                    ? []
                    : type === 'keyvalue'
                      ? {}
                      : '')
            }
            type={type}
            {...config}
          />
        ) : (
          <span className={valueClass}>{formatDisplayValue()}</span>
        )}
      </div>
    );
  };

  const renderAffectionBar = (value: number) => {
    const percentage = Math.abs(value);
    const isNegative = value < 0;

    return (
      <div className={styles.affectionBar}>
        <div className={styles.affectionBarTrack}>
          <div
            className={`${styles.affectionBarFill} ${isNegative ? styles.isNegative : ''}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className={`${styles.affectionBarValue} ${isNegative ? styles.isNegative : ''}`}>
          {value}
        </span>
      </div>
    );
  };

  /**
   * 伙伴资源条（只读模式用 ResourceBar，编辑模式可调 当前 / 上限.额外，_基础 只读）
   */
  const renderPartnerResourceField = (
    partnerName: string,
    partner: PartnerRecord,
    field: (typeof PartnerResourceFields)[number],
  ) => {
    const current = _.get(partner, `${field.key}.当前`, 0);
    const base = _.get(partner, `${field.key}.上限._基础`, 0);
    const extra = _.get(partner, `${field.key}.上限.额外`, 0);
    const max = Math.max(0, base + extra);

    if (!editEnabled) {
      return (
        <ResourceBar
          key={field.type}
          label={field.label}
          current={current}
          max={max}
          type={field.type}
          icon={field.icon}
        />
      );
    }

    return (
      <div key={field.type} className={styles.partnerResourceEditRow}>
        <span className={styles.partnerResourceLabel}>{field.label}</span>
        <div className={styles.partnerResourceEditors}>
          <EditableField
            path={`关系列表.${partnerName}.${field.key}.当前`}
            value={current}
            type="number"
            numberConfig={{ min: 0, max, step: 1 }}
          />
          <span className={styles.partnerResourceSeparator}>/</span>
          <span
            className={styles.partnerResourceMax}
            title="上限._基础（只读，仅随等级/属性/层级重算）"
          >
            {base}
          </span>
          <span className={styles.partnerResourceSeparator}>+</span>
          <EditableField
            path={`关系列表.${partnerName}.${field.key}.上限.额外`}
            value={extra}
            type="number"
            numberConfig={{ min: 0, step: 1 }}
          />
        </div>
      </div>
    );
  };

  const renderPartnerAssetSection = (
    partnerName: string,
    sectionConfig: PartnerAssetSectionConfig,
  ) => (
    <Card title={sectionConfig.label}>
      <ItemCollectionPanel
        scopeKey={`destiny-partner-${partnerName}-${sectionConfig.key}`}
        label={sectionConfig.dataKey}
        pathPrefix={`关系列表.${partnerName}.${sectionConfig.dataKey}`}
        filterKey={sectionConfig.filterKey}
        itemCategory={sectionConfig.itemCategory}
        source={partners?.[partnerName] ?? {}}
        emptyText={sectionConfig.emptyText}
      />
    </Card>
  );

  const renderStatusEffectsSection = (
    effects: Record<string, Record<string, any>> | undefined,
    partnerName: string,
  ) => {
    if (_.isEmpty(effects) && !editEnabled) {
      return (
        <Card title="状态效果">
          <EmptyHint className={styles.emptyHint} text="暂无 Buff" />
        </Card>
      );
    }

    return (
      <Card title="状态效果">
        <StatusEffectDisplay
          effects={effects ?? {}}
          editEnabled={editEnabled}
          pathPrefix={`关系列表.${partnerName}.状态效果`}
          emptyText="无"
          onDelete={(effectName: string) =>
            setDeleteTarget({
              type: '状态效果',
              path: `关系列表.${partnerName}.状态效果.${effectName}`,
              name: effectName,
            })
          }
        />
      </Card>
    );
  };

  /** 心里话卡片内容：默认整块被模糊遮挡，点击任意位置查看（展开态不持久化） */
  const renderPartnerThoughtsPreview = (partnerName: string, partner: PartnerRecord) => {
    const thoughts = _.trim(partner.心里话 || '');
    if (editEnabled) {
      return (
        <EditableField
          path={`关系列表.${partnerName}.心里话`}
          value={partner.心里话 ?? ''}
          type="textarea"
        />
      );
    }

    if (!thoughts) return null;

    if (thoughtsExpanded) {
      return <div className={styles.partnerThoughtsText}>{thoughts}</div>;
    }

    return (
      <button
        type="button"
        className={styles.partnerThoughtsCover}
        onClick={() => setThoughtsExpanded(true)}
        aria-label="查看心里话"
      >
        <span className={styles.partnerThoughtsText}>{thoughts}</span>
        <span className={styles.partnerThoughtsHint}>
          <i className="fa-solid fa-eye-slash" />
          <span>点击查看心里话</span>
        </span>
      </button>
    );
  };

  const renderPartnerDetails = () => {
    const statusEffectCount = _.size(partner.状态效果 ?? {});

    const detailSections: Array<{ key: PartnerDetailSection; label: string }> = [
      { key: 'overview', label: '概览' },
      { key: 'status', label: '状态' },
      { key: 'equipment', label: '装备' },
      { key: 'skills', label: '技能' },
      { key: 'inventory', label: '背包' },
      { key: 'assets', label: '资产' },
      { key: 'gallery', label: '相册' },
    ];

    return (
      <div className={styles.partnerDetails}>
        <div className={styles.partnerDetailNav}>
          {detailSections.map(section => (
            <button
              key={section.key}
              type="button"
              className={`${styles.partnerDetailTab} ${activePartnerDetailSection === section.key ? styles.partnerDetailTabActive : ''}`}
              onClick={() => handlePartnerDetailSectionChange(section.key)}
            >
              {section.label}
              {section.key === 'status' && statusEffectCount > 0 && (
                <span className={styles.partnerDetailTabCount}>{statusEffectCount}</span>
              )}
            </button>
          ))}
        </div>

        {activePartnerDetailSection === 'overview' && (
          <div className={styles.partnerCards}>
            {(Boolean(_.trim(partner.心里话 || '')) || editEnabled) && (
              <Card>{renderPartnerThoughtsPreview(partnerName, partner)}</Card>
            )}

            <Card>
              <div className={styles.partnerResources}>
                {PartnerResourceFields.map(field =>
                  renderPartnerResourceField(partnerName, partner, field),
                )}
              </div>
            </Card>

            <Card>
              <div className={styles.partnerAffection}>
                <span className={styles.label}>好感度</span>
                {editEnabled ? (
                  <EditableField
                    path={`关系列表.${partnerName}.好感度`}
                    value={partner.好感度 ?? 0}
                    type="number"
                    numberConfig={{ min: -100, max: 100, step: 1 }}
                  />
                ) : (
                  renderAffectionBar(partner.好感度 ?? 0)
                )}
              </div>

              {editEnabled && (
                <div className={styles.partnerStatusToggles}>
                  <div className={styles.toggleRow}>
                    <span className={styles.toggleLabel}>在场状态</span>
                    <EditableField
                      path={`关系列表.${partnerName}.在场`}
                      value={partner.在场 ?? false}
                      type="toggle"
                      toggleConfig={{ labelOff: '离场', labelOn: '在场', size: 'sm' }}
                    />
                  </div>
                  <div className={styles.toggleRow}>
                    <span className={styles.toggleLabel}>命定契约</span>
                    <EditableField
                      path={`关系列表.${partnerName}.命定契约`}
                      value={partner.命定契约 ?? false}
                      type="toggle"
                      toggleConfig={{ labelOff: '未缔结', labelOn: '已缔结', size: 'sm' }}
                    />
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <div className={styles.partnerInfo}>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>标签</span>
                  <EditableField
                    path={`关系列表.${partnerName}.标签`}
                    value={partner.标签 ?? []}
                    type="tags"
                    bypassEditGuard
                  />
                </div>
                {renderEditableRow(
                  '种族',
                  `关系列表.${partnerName}.种族`,
                  partner.种族,
                  'text',
                  styles.infoRow,
                  styles.infoLabel,
                  styles.infoValue,
                )}
                {renderEditableRow(
                  '身份',
                  `关系列表.${partnerName}.身份`,
                  partner.身份,
                  'tags',
                  styles.infoRow,
                  styles.infoLabel,
                  styles.infoValue,
                )}
                {renderEditableRow(
                  '职业',
                  `关系列表.${partnerName}.职业`,
                  partner.职业,
                  'tags',
                  styles.infoRow,
                  styles.infoLabel,
                  styles.infoValue,
                )}
                {renderEditableRow(
                  '生命层级',
                  `关系列表.${partnerName}.生命层级`,
                  partner.生命层级,
                  'text',
                  styles.infoRow,
                  styles.infoLabel,
                  styles.infoValue,
                )}
                {renderEditableRow(
                  '等级',
                  `关系列表.${partnerName}.等级`,
                  partner.等级,
                  'number',
                  styles.infoRow,
                  styles.infoLabel,
                  styles.infoValue,
                  { numberConfig: { min: 1, max: 25, step: 1 } },
                )}
              </div>
            </Card>

            {!_.isEmpty(partner.属性) && (
              <Card>
                <div
                  className={`${styles.attributeGrid} ${editEnabled ? styles.attributeGridEdit : ''}`}
                >
                  {_.map(partner.属性, (value: number | undefined, key: string) => (
                    <div
                      key={key}
                      className={`${styles.attributeItem} ${editEnabled ? styles.attributeItemEdit : ''}`}
                    >
                      <span className={styles.attributeKey}>{key}</span>
                      {editEnabled ? (
                        <EditableField
                          path={`关系列表.${partnerName}.属性.${key}`}
                          value={value ?? 0}
                          type="number"
                          numberConfig={{ min: 0, max: 20, step: 1 }}
                        />
                      ) : (
                        <span className={styles.attributeValue}>{value}</span>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {(partner.外貌 || partner.着装 || editEnabled) && (
              <Card>
                {renderEditableRow(
                  '外貌',
                  `关系列表.${partnerName}.外貌`,
                  partner.外貌,
                  'textarea',
                  styles.appearanceRow,
                  styles.appearanceLabel,
                  styles.appearanceValue,
                )}
                {renderEditableRow(
                  '着装',
                  `关系列表.${partnerName}.着装`,
                  partner.着装,
                  'textarea',
                  styles.appearanceRow,
                  styles.appearanceLabel,
                  styles.appearanceValue,
                )}
              </Card>
            )}

            {(partner.性格 || partner.喜爱 || editEnabled) && (
              <Card>
                {renderEditableRow(
                  '性格',
                  `关系列表.${partnerName}.性格`,
                  partner.性格,
                  'textarea',
                  styles.traitRow,
                  styles.traitLabel,
                  styles.traitValue,
                )}
                {renderEditableRow(
                  '喜爱',
                  `关系列表.${partnerName}.喜爱`,
                  partner.喜爱,
                  'textarea',
                  styles.traitRow,
                  styles.traitLabel,
                  styles.traitValue,
                )}
              </Card>
            )}

            {(partner.背景故事 || editEnabled) && (
              <Card>
                {renderEditableRow(
                  '背景故事',
                  `关系列表.${partnerName}.背景故事`,
                  partner.背景故事,
                  'textarea',
                  styles.backgroundRow,
                  styles.backgroundLabel,
                  styles.backgroundContent,
                )}
              </Card>
            )}
          </div>
        )}

        {activePartnerDetailSection === 'status' && (
          <div className={styles.partnerCards}>
            {renderStatusEffectsSection(partner.状态效果, partnerName)}
            {partner.登神长阶?.是否开启 && (
              <Card title="登神长阶">
                <Ascension
                  data={partner.登神长阶}
                  compact
                  editEnabled={editEnabled}
                  pathPrefix={`关系列表.${partnerName}.登神长阶`}
                />
              </Card>
            )}
          </div>
        )}

        {activePartnerAssetSection &&
          renderPartnerAssetSection(partnerName, activePartnerAssetSection)}

        {activePartnerDetailSection === 'gallery' && (
          <PartnerGallery partnerName={partnerName} gallery={gallery} />
        )}
      </div>
    );
  };

  return renderPartnerDetails();
}
