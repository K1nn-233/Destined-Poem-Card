/**
 * 数字格式化工具
 * 将大数字转换为可读格式，中英文通用
 */

/** 数字单位配置 */
const NumberUnits = [
  { threshold: 1_0000_0000_0000, suffix: '兆', divisor: 1_0000_0000_0000 }, // 万亿
  { threshold: 1_0000_0000, suffix: '亿', divisor: 1_0000_0000 },
  { threshold: 1_0000, suffix: '万', divisor: 1_0000 },
] as const;

/**
 * 移除小数末尾多余的零
 * @param numStr - 数字字符串
 * @returns 处理后的字符串
 */
function trimTrailingZeros(numStr: string): string {
  if (!numStr.includes('.')) return numStr;
  return numStr.replace(/\.?0+$/, '');
}

/**
 * 格式化金钱数值为可读格式
 * - 小于 10000: 显示原数字带千分位 (如 1,234 或 -1,234)
 * - 10000+: 显示简化格式 + 千分位原值 (如 1.5万 (15,000))
 *
 * @param value - 金钱数值（支持负数）
 * @returns 格式化后的字符串
 */
export function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '0';

  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const originalFormatted = value.toLocaleString('en-US');

  // 查找适合的单位
  for (const unit of NumberUnits) {
    if (absValue >= unit.threshold) {
      const divided = absValue / unit.divisor;
      // 保留最多2位小数，去除末尾的0
      const formatted = trimTrailingZeros(divided.toFixed(2));
      return `${sign}${formatted}${unit.suffix} (${originalFormatted})`;
    }
  }

  // 小于万的数字使用千分位格式
  return originalFormatted;
}
