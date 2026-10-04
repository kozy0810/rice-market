import {describe, test, expect} from 'vitest';
import {aggregateOrders} from '../src/aggregate.js';
import ordersEmpty from './fixtures/orders-empty.json';
import ordersMultiple from './fixtures/orders-multiple.json';
import ordersDecimalSubtotal from './fixtures/orders-decimal-subtotal.json';
import ordersRoundingBoundary from './fixtures/orders-rounding-boundary.json';

describe('aggregateOrders', () => {
  test('0件のときはNaNにならず、すべて0になる', () => {
    const result = aggregateOrders(ordersEmpty, '1.5');
    expect(result).toEqual({
      orderCount: 0,
      totalRevenueYen: 0,
      royaltyAmountYen: 0,
      currencyCode: null,
    });
  });

  test('複数注文を合算し、ロイヤリティ率を掛ける（金額はDevストアのsakura実注文2件の小計を借用。ただし#1002は9月・#1004は10月のため、1回の月指定クエリでこの2件が同時に返ることはない）', () => {
    const result = aggregateOrders(ordersMultiple, '1.5');
    expect(result.orderCount).toBe(2);
    expect(result.totalRevenueYen).toBe(20500);
    // 20500 * 0.015 = 307.5 → 四捨五入で308
    expect(result.royaltyAmountYen).toBe(308);
    expect(result.currencyCode).toBe('JPY');
  });

  test('小数を含む小計を浮動小数点誤差なく合算する', () => {
    const result = aggregateOrders(ordersDecimalSubtotal, '10');
    // 133.33 + 66.67 = 200.00 ちょうど
    expect(result.totalRevenueYen).toBe(200);
    expect(result.royaltyAmountYen).toBe(20);
  });

  test('四捨五入の境界（ちょうど0.5円）は切り上げる', () => {
    // 100円 × 0.5% = 0.5円 ちょうど
    const result = aggregateOrders(ordersRoundingBoundary, '0.5');
    expect(result.royaltyAmountYen).toBe(1);
  });

  test('ロイヤリティ率0を指定すると0円になる', () => {
    const result = aggregateOrders(ordersMultiple, '0');
    expect(result.royaltyAmountYen).toBe(0);
    expect(result.totalRevenueYen).toBe(20500);
  });

  test('注文配列以外（null/undefined）を渡されても例外を投げない', () => {
    expect(aggregateOrders(null, '1.5').orderCount).toBe(0);
    expect(aggregateOrders(undefined, '1.5').orderCount).toBe(0);
  });
});
