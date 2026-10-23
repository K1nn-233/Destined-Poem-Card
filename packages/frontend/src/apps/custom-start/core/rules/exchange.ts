export const EXCHANGE_RATES = { money: 100, destinyPoints: 2 } as const;
export type ExchangeTarget = keyof typeof EXCHANGE_RATES;
export const exchangeCost = (amount: number, target: ExchangeTarget): number =>
  Math.ceil(amount / EXCHANGE_RATES[target]);
export const exchangeGain = (points: number, target: ExchangeTarget): number =>
  Math.max(0, Math.round(points)) * EXCHANGE_RATES[target];
export const exchangeBudget = (
  totalPoints: number,
  consumedPoints: number,
  currentAmount: number,
  target: ExchangeTarget,
): number => Math.max(0, totalPoints - consumedPoints + exchangeCost(currentAmount, target));
