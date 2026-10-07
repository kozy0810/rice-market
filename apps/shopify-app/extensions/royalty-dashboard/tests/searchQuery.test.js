import {describe, test, expect} from 'vitest';
import {
  buildAllOrgsOrdersSearchQuery,
  monthRangeJst,
  isValidOrgCode,
  isMonthOutsideDefaultOrderWindow,
} from '../src/searchQuery.js';

describe('monthRangeJst', () => {
  test('月の範囲をJSTオフセット付きISO8601で返す', () => {
    expect(monthRangeJst(2026, 10)).toEqual({
      start: '2026-10-01T00:00:00+09:00',
      end: '2026-11-01T00:00:00+09:00',
    });
  });

  test('12月は年またぎで翌年1月を終端にする', () => {
    expect(monthRangeJst(2026, 12)).toEqual({
      start: '2026-12-01T00:00:00+09:00',
      end: '2027-01-01T00:00:00+09:00',
    });
  });
});

describe('isValidOrgCode', () => {
  test('半角英数字とハイフンのみ許可する', () => {
    expect(isValidOrgCode('test-agency-b')).toBe(true);
    expect(isValidOrgCode('sakura')).toBe(true);
  });

  test('クオートやスペースなど検索クエリを壊しうる文字は拒否する', () => {
    expect(isValidOrgCode("sakura' OR tag:'member")).toBe(false);
    expect(isValidOrgCode('sakura ')).toBe(false);
    expect(isValidOrgCode('')).toBe(false);
  });
});

describe('buildAllOrgsOrdersSearchQuery', () => {
  test('派遣元を問わずorg:タグ・発送済み・月範囲をANDで組み立てる', () => {
    const query = buildAllOrgsOrdersSearchQuery({year: 2026, month: 10});
    expect(query).toBe(
      "tag_prefix:org: AND fulfillment_status:fulfilled AND created_at:>='2026-10-01T00:00:00+09:00' AND created_at:<'2026-11-01T00:00:00+09:00'",
    );
  });
});

describe('isMonthOutsideDefaultOrderWindow', () => {
  const now = new Date('2026-10-04T12:00:00+09:00');

  test('今月は範囲内', () => {
    expect(isMonthOutsideDefaultOrderWindow({year: 2026, month: 10}, now)).toBe(false);
  });

  test('60日以内に収まる前月は範囲内', () => {
    expect(isMonthOutsideDefaultOrderWindow({year: 2026, month: 9}, now)).toBe(false);
  });

  test('月初が60日より前になる月は範囲外', () => {
    // 2026-07-01は2026-10-04の95日前で、60日の範囲に入らない
    expect(isMonthOutsideDefaultOrderWindow({year: 2026, month: 7}, now)).toBe(true);
  });

  test('ちょうど60日前が月初になる場合は範囲内（境界の厳密な仕様が不明なため目安の判定）', () => {
    const exactBoundaryNow = new Date('2026-08-30T00:00:00+09:00'); // 2026-07-01から60日後
    expect(isMonthOutsideDefaultOrderWindow({year: 2026, month: 7}, exactBoundaryNow)).toBe(false);
  });
});
