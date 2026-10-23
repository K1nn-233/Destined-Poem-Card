import type { SyntheticEvent } from 'react';
import type { PartnerGalleryItem } from '../../core/utils';
import { Card, EmptyHint } from '../../shared/components';
import type { usePartnerGallery } from './use-partner-gallery';
import styles from './DestinyTab.module.scss';

export const handlePartnerGalleryImageError = (
  event: SyntheticEvent<HTMLImageElement>,
  item: PartnerGalleryItem,
) => {
  const image = event.currentTarget;
  const sources = item.sources ?? [item.url];
  const currentIndex = Number(image.dataset.sourceIndex ?? 0);
  const nextSource = sources[currentIndex + 1];

  if (nextSource) {
    image.dataset.sourceIndex = String(currentIndex + 1);
    image.src = nextSource;
    return;
  }

  const galleryItem = image.closest('figure') as HTMLElement | null;
  if (galleryItem) {
    galleryItem.style.display = 'none';
  } else {
    image.style.display = 'none';
  }
};

export const PartnerGallery = ({
  partnerName,
  gallery,
}: {
  partnerName: string;
  gallery: ReturnType<typeof usePartnerGallery>;
}) => {
  const {
    partnerGalleryMap,
    partnerExternalGalleryMap,
    partnerPredefinedGalleryMap,
    isPartnerGalleryLoading,
    editingGalleryItemId,
    editingGalleryTitle,
    setEditingGalleryTitle,
    setActiveGalleryPreview,
    handlePartnerGalleryUpload,
    handlePartnerGalleryLoadPredefined,
    handlePartnerGalleryLoadExternal,
    requestPartnerGalleryDelete,
    startPartnerGalleryTitleEdit,
    cancelPartnerGalleryTitleEdit,
    commitPartnerGalleryTitleEdit,
  } = gallery;
  const galleryItems = partnerGalleryMap[partnerName] ?? [];
  const externalGalleryItems = partnerExternalGalleryMap[partnerName] ?? [];
  const predefinedGalleryItems = partnerPredefinedGalleryMap[partnerName] ?? [];

  const renderGalleryUploadControl = () => (
    <label className={styles.partnerGalleryActionButton}>
      <i className="fa-solid fa-upload" />
      <span>添加图片</span>
      <input
        className={styles.partnerGalleryFileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={event => {
          void handlePartnerGalleryUpload(partnerName, event);
        }}
      />
    </label>
  );

  if (isPartnerGalleryLoading) {
    return <EmptyHint className={styles.emptyHint} text="相册加载中..." />;
  }

  if (galleryItems.length === 0) {
    return (
      <div className={styles.partnerGalleryEmptyPanel}>
        <EmptyHint className={styles.emptyHint} text="暂无相册图片" />
        {externalGalleryItems.length > 0 ? (
          <div className={styles.partnerGalleryPredefinedPrompt}>
            <div className={styles.partnerGalleryPredefinedText}>
              有 {externalGalleryItems.length} 张外部相册图片，是否加载？
            </div>
            <button
              type="button"
              className={styles.partnerGalleryActionButton}
              onClick={() => {
                void handlePartnerGalleryLoadExternal(partnerName);
              }}
            >
              <i className="fa-solid fa-images" />
              <span>加载外部图片</span>
            </button>
          </div>
        ) : null}
        {predefinedGalleryItems.length > 0 ? (
          <div className={styles.partnerGalleryPredefinedPrompt}>
            <div className={styles.partnerGalleryPredefinedText}>
              有 {predefinedGalleryItems.length} 张预定义相册图片，是否加载？
            </div>
            <button
              type="button"
              className={styles.partnerGalleryActionButton}
              onClick={() => {
                void handlePartnerGalleryLoadPredefined(partnerName);
              }}
            >
              <i className="fa-solid fa-images" />
              <span>加载预定义图片</span>
            </button>
          </div>
        ) : null}
        {renderGalleryUploadControl()}
      </div>
    );
  }

  return (
    <Card title="相册">
      <div className={styles.partnerGalleryHeader}>
        <div>
          <div className={styles.partnerGallerySummary}>共 {galleryItems.length} 张</div>
        </div>
        {renderGalleryUploadControl()}
      </div>

      <div className={styles.partnerGalleryGrid}>
        {galleryItems.map((item, index) => (
          <figure
            key={item.id || `${partnerName}-gallery-${index}`}
            className={styles.partnerGalleryItem}
          >
            <button
              type="button"
              className={styles.partnerGalleryDeleteButton}
              onClick={() => {
                requestPartnerGalleryDelete(partnerName, item);
              }}
              aria-label={`删除${item.title}`}
              title="删除图片"
            >
              <i className="fa-solid fa-trash-can" />
            </button>
            <button
              type="button"
              className={styles.partnerGalleryButton}
              onClick={() => setActiveGalleryPreview({ partnerName, itemId: item.id })}
              aria-label={`查看${item.title}`}
            >
              <img
                src={item.url}
                alt={item.title}
                className={styles.partnerGalleryImage}
                loading="lazy"
                onError={event => handlePartnerGalleryImageError(event, item)}
              />
            </button>
            <figcaption className={styles.partnerGalleryCaption}>
              {editingGalleryItemId === item.id ? (
                <input
                  className={styles.partnerGalleryTitleInput}
                  value={editingGalleryTitle}
                  autoFocus
                  onChange={event => setEditingGalleryTitle(event.target.value)}
                  onBlur={() => {
                    void commitPartnerGalleryTitleEdit(partnerName, item.id);
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void commitPartnerGalleryTitleEdit(partnerName, item.id);
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      cancelPartnerGalleryTitleEdit();
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={styles.partnerGalleryTitleButton}
                  onClick={() => startPartnerGalleryTitleEdit(item)}
                  title="修改标题"
                >
                  {item.title}
                </button>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </Card>
  );
};
