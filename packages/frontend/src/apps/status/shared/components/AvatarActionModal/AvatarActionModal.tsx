import { ChangeEvent, FC, useId, useState } from 'react';
import { ConfirmModal } from '../ConfirmModal';
import styles from './AvatarActionModal.module.scss';

export interface AvatarActionModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  linkPlaceholder?: string;
  canExport?: boolean;
  canDelete?: boolean;
  canReset?: boolean;
  deleteLabel?: string;
  resetLabel?: string;
  presetGroups?: Record<string, string[]>;
  onClose: () => void;
  onUpload: (file: File) => Promise<void> | void;
  onSubmitLink: (url: string) => Promise<void> | void;
  onExport?: () => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onReset?: () => Promise<void> | void;
  onSelectPreset?: (url: string) => Promise<void> | void;
}

/**
 * 头像操作弹窗
 */
export const AvatarActionModal: FC<AvatarActionModalProps> = ({
  open,
  title,
  subtitle,
  linkPlaceholder = '请输入头像链接',
  canExport = false,
  canDelete = false,
  canReset = false,
  deleteLabel = '删除头像',
  resetLabel = '恢复默认',
  presetGroups = {},
  onClose,
  onUpload,
  onSubmitLink,
  onExport,
  onDelete,
  onReset,
  onSelectPreset,
}) => {
  const [avatarUrl, setAvatarUrl] = useState('');
  const [failedPresetUrls, setFailedPresetUrls] = useState<Set<string>>(() => new Set());
  const [expandedPresetGroup, setExpandedPresetGroup] = useState<string | null>(null);
  const fileInputId = useId();

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';

    if (!selectedFile) {
      return;
    }

    await onUpload(selectedFile);
    onClose();
  };

  const handleLinkSubmit = async () => {
    const normalizedUrl = _.trim(avatarUrl);
    if (!normalizedUrl) {
      return;
    }

    await onSubmitLink(normalizedUrl);
    setAvatarUrl('');
    onClose();
  };

  const handleClose = () => {
    setAvatarUrl('');
    onClose();
  };

  const handleExport = async () => {
    await onExport?.();
    onClose();
  };

  const handleDelete = async () => {
    await onDelete?.();
    onClose();
  };

  const handleReset = async () => {
    await onReset?.();
    onClose();
  };

  return (
    <ConfirmModal open={open} title={title} onClose={handleClose} className={styles.modal}>
      <div className={styles.panel}>
        {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}

        <div className={styles.section}>
          <div className={styles.sectionTitle}>预设头像</div>
          <div className={styles.presetTabs} role="tablist" aria-label="预设头像分类">
            {Object.entries(presetGroups).map(([group]) => {
              const isExpanded = expandedPresetGroup === group;

              return (
                <button
                  key={group}
                  type="button"
                  className={`${styles.presetTab} ${isExpanded ? styles.presetTabActive : ''}`}
                  role="tab"
                  aria-selected={isExpanded}
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedPresetGroup(isExpanded ? null : group)}
                >
                  <span>{group}</span>
                </button>
              );
            })}
          </div>

          {expandedPresetGroup ? (
            <div className={styles.presetContent} role="tabpanel">
              <div className={styles.presetList}>
                {(presetGroups[expandedPresetGroup] ?? []).map((url, index) => (
                  <button
                    key={url}
                    type="button"
                    className={styles.presetButton}
                    disabled={failedPresetUrls.has(url)}
                    onClick={async () => {
                      await onSelectPreset?.(url);
                      onClose();
                    }}
                    title={`使用${expandedPresetGroup}_${String(index + 1).padStart(2, '0')}头像`}
                  >
                    <img
                      src={url}
                      alt=""
                      aria-hidden="true"
                      onError={() => setFailedPresetUrls(previous => new Set(previous).add(url))}
                    />
                    <span>{String(index + 1).padStart(2, '0')}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>本地导入</div>
          <label htmlFor={fileInputId} className={styles.actionButton}>
            <i className="fa-solid fa-upload" />
            <span>导入头像</span>
          </label>
          <input
            id={fileInputId}
            className={styles.fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={event => {
              void handleFileChange(event);
            }}
          />
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>图片链接</div>
          <div className={styles.linkRow}>
            <input
              className={styles.linkInput}
              value={avatarUrl}
              placeholder={linkPlaceholder}
              onChange={event => setAvatarUrl(event.target.value)}
            />
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => {
                void handleLinkSubmit();
              }}
              disabled={!_.trim(avatarUrl)}
            >
              <i className="fa-solid fa-link" />
              <span>保存链接</span>
            </button>
          </div>
        </div>

        <div className={styles.footerActions}>
          {canExport ? (
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => {
                void handleExport();
              }}
            >
              <i className="fa-solid fa-file-export" />
              <span>导出头像</span>
            </button>
          ) : null}

          {canDelete ? (
            <button
              type="button"
              className={`${styles.actionButton} ${styles.actionButtonDanger}`}
              onClick={() => {
                void handleDelete();
              }}
            >
              <i className="fa-solid fa-trash-can" />
              <span>{deleteLabel}</span>
            </button>
          ) : null}

          {canReset ? (
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => {
                void handleReset();
              }}
            >
              <i className="fa-solid fa-rotate-left" />
              <span>{resetLabel}</span>
            </button>
          ) : null}
        </div>
      </div>
    </ConfirmModal>
  );
};
