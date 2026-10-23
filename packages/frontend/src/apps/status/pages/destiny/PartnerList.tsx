import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { EmptyHint } from '../../shared/components';
import type { PartnerRecord } from './destiny-types';
import styles from './DestinyTab.module.scss';

type Props = {
  partners: Record<string, PartnerRecord> | undefined;
  detailContent: ReactNode;
  partnerSearchKeyword: string;
  setPartnerSearchKeyword: Dispatch<SetStateAction<string>>;
  allPartnerLabels: string[];
  activePartnerLabel: string | null;
  setActivePartnerLabel: Dispatch<SetStateAction<string | null>>;
  isPartnerDetailVisible: boolean;
  visiblePartnerEntries: [string, PartnerRecord][];
  hiddenGroupExpanded: boolean;
  setHiddenGroupExpanded: Dispatch<SetStateAction<boolean>>;
  activePartnerListCategoryConfig?: { label: string };
  renderPartnerListItem: (name: string, partner: PartnerRecord) => ReactNode;
};

export function PartnerList({
  partners,
  detailContent,
  partnerSearchKeyword,
  setPartnerSearchKeyword,
  allPartnerLabels,
  activePartnerLabel,
  setActivePartnerLabel,
  isPartnerDetailVisible,
  visiblePartnerEntries,
  hiddenGroupExpanded,
  setHiddenGroupExpanded,
  activePartnerListCategoryConfig,
  renderPartnerListItem,
}: Props) {
  if (_.isEmpty(partners)) {
    return <EmptyHint className={styles.emptyHint} text="暂无关系" />;
  }

  return (
    <div className={styles.partnerSectionContent}>
      <div className={styles.partnerMasterDetail}>
        <div className={styles.partnerToolbar}>
          <div className={styles.partnerSearchBar}>
            <i className="fa-solid fa-magnifying-glass" />
            <input
              type="text"
              className={styles.partnerSearchInput}
              placeholder="搜索关系名称/标签/种族/身份/职业"
              value={partnerSearchKeyword}
              onChange={e => setPartnerSearchKeyword(e.target.value)}
            />
            {partnerSearchKeyword && (
              <button
                type="button"
                className={styles.partnerSearchClear}
                onClick={() => setPartnerSearchKeyword('')}
                title="清空搜索"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            )}
          </div>
          {allPartnerLabels.length > 0 && (
            <div className={styles.partnerLabelBar}>
              <button
                type="button"
                className={`${styles.partnerLabelBtn} ${activePartnerLabel === null ? styles.partnerLabelBtnActive : ''}`}
                onClick={() => setActivePartnerLabel(null)}
              >
                全部
              </button>
              {allPartnerLabels.map(label => (
                <button
                  key={label}
                  type="button"
                  className={`${styles.partnerLabelBtn} ${activePartnerLabel === label ? styles.partnerLabelBtnActive : ''}`}
                  onClick={() => setActivePartnerLabel(label)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.partnerMasterDetailContent}>
          <div
            className={`${styles.partnerSummaryList} ${isPartnerDetailVisible ? styles.partnerSummaryListHiddenMobile : ''}`}
          >
            {visiblePartnerEntries.length > 0 ? (
              <>
                {visiblePartnerEntries
                  .filter(([, partner]) => !partner._隐藏)
                  .map(([name, partner]) => (
                    <div key={name}>{renderPartnerListItem(name, partner)}</div>
                  ))}
                {visiblePartnerEntries.some(([, partner]) => partner._隐藏) && (
                  <div className={styles.hiddenGroup}>
                    <button
                      type="button"
                      className={styles.hiddenGroupToggle}
                      onClick={() => setHiddenGroupExpanded(expanded => !expanded)}
                      aria-expanded={hiddenGroupExpanded}
                    >
                      <i
                        className={`fa-solid ${hiddenGroupExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}`}
                      />
                      <span>
                        已隐藏（
                        {visiblePartnerEntries.filter(([, partner]) => partner._隐藏).length}）
                      </span>
                    </button>
                    {hiddenGroupExpanded && (
                      <div className={styles.hiddenGroupBody}>
                        {visiblePartnerEntries
                          .filter(([, partner]) => partner._隐藏)
                          .map(([name, partner]) => (
                            <div key={name}>{renderPartnerListItem(name, partner)}</div>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <EmptyHint
                className={styles.emptyHint}
                text={`当前“${activePartnerListCategoryConfig?.label ?? '全部'}”分类下暂无关系`}
              />
            )}
          </div>

          <div className={styles.partnerDetailPanel}>{detailContent}</div>
        </div>
      </div>
    </div>
  );
}
