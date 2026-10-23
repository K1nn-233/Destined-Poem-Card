import type { MouseEvent } from 'react';
import { AvatarPanel } from '../../shared/components';
import type { PartnerRecord } from './destiny-types';
import type { usePartnerAvatars } from './use-partner-avatars';
import styles from './DestinyTab.module.scss';

export function PartnerAvatar({
  partnerName,
  partner,
  size,
  showOverlays = true,
  avatars,
}: {
  partnerName: string;
  partner: PartnerRecord;
  size: 'sm' | 'md';
  showOverlays?: boolean;
  avatars: ReturnType<typeof usePartnerAvatars>;
}) {
  const {
    hasPartnerAvatar,
    getPartnerAvatarUrl,
    openPartnerAvatarModal,
    handlePartnerAvatarImageError,
  } = avatars;
  const getPartnerHpData = (partner: PartnerRecord) => {
    const current = _.get(partner, '生命值.当前', 0);
    const base = _.get(partner, '生命值.上限._基础', 0);
    const extra = _.get(partner, '生命值.上限.额外', 0);
    const max = Math.max(0, base + extra);
    const percentage = max > 0 ? Math.min(1, current / max) : 0;
    return { current, max, percentage };
  };

  /** 头像右下角生命值小圆环（类似荒野之息精力轮：远小于头像，叠加在右下角，从顶部顺时针填充） */
  const renderPartnerHpRing = (partner: PartnerRecord) => {
    const { current, max, percentage } = getPartnerHpData(partner);
    const radius = 8;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - percentage);

    return (
      <span className={styles.partnerHpRing} title={`生命值 ${current}/${max}`}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle
            className={styles.partnerHpRingTrack}
            cx="12"
            cy="12"
            r={radius}
            fill="none"
            strokeWidth="3"
          />
          {max > 0 && (
            <circle
              className={styles.partnerHpRingFill}
              cx="12"
              cy="12"
              r={radius}
              fill="none"
              strokeWidth="3"
              stroke="var(--theme-resource-hp)"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform="rotate(-90 12 12)"
            />
          )}
        </svg>
      </span>
    );
  };

  /** 头像右上角 buff 数量小圆点（纯展示，hover 显示状态效果名） */
  const renderPartnerBuffDot = (partner: PartnerRecord) => {
    const buffNames = Object.keys(partner.状态效果 ?? {});
    if (buffNames.length === 0) return null;

    return (
      <span
        className={styles.partnerBuffDot}
        title={`状态效果（${buffNames.length}）：${buffNames.join('、')}`}
      >
        {buffNames.length}
      </span>
    );
  };

  /** 默认头像：圆形线框 + 姓名单字 */
  const renderPartnerDefaultAvatar = (partnerName: string, size: 'sm' | 'md') => (
    <button
      type="button"
      className={`${styles.partnerDefaultAvatar} ${size === 'sm' ? styles.sizeSm : styles.sizeMd}`}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        openPartnerAvatarModal(partnerName);
      }}
      aria-label={`${partnerName}头像`}
      title={`${partnerName}头像`}
    >
      <span>{Array.from(partnerName)[0]}</span>
    </button>
  );

  return (
    <div className={`${styles.partnerAvatarWrap} ${size === 'sm' ? styles.sizeSm : styles.sizeMd}`}>
      {hasPartnerAvatar(partnerName) ? (
        <AvatarPanel
          src={getPartnerAvatarUrl(partnerName)}
          alt={`${partnerName}头像`}
          size={size}
          className={styles.partnerAvatar}
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            openPartnerAvatarModal(partnerName);
          }}
          onImageError={() => handlePartnerAvatarImageError(partnerName)}
        />
      ) : (
        renderPartnerDefaultAvatar(partnerName, size)
      )}
      {showOverlays && renderPartnerHpRing(partner)}
      {showOverlays && renderPartnerBuffDot(partner)}
    </div>
  );
}
