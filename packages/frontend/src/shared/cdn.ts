/** Build supplies the deployment root without a trailing slash. */
export const ASSET_BASE = __DESTINY_ASSET_BASE__;
export const assetUrl = (path: string): string => `${ASSET_BASE}/${path.replace(/^\/+/, '')}`;
export const dataUrl = (filename: string): string => assetUrl(`assets/data/${filename}`);
