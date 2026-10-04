import {describe, test, expect} from 'vitest';
import {buildOrdersSearchQuery, monthRangeJst, isValidOrgCode} from '../src/searchQuery.js';

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

describe('buildOrdersSearchQuery', () => {
  test('組織コード・発送済み・月範囲をANDで組み立てる（ハイフンを含むコードも正しくクオートする）', () => {
    const query = buildOrdersSearchQuery({orgCode: 'test-agency-b', year: 2026, month: 10});
    expect(query).toBe(
      "tag:'org:test-agency-b' AND fulfillment_status:fulfilled AND created_at:>='2026-10-01T00:00:00+09:00' AND created_at:<'2026-11-01T00:00:00+09:00'",
    );
  });

  test('不正な組織コードは例外を投げる（検索クエリへのインジェクション防止）', () => {
    expect(() => buildOrdersSearchQuery({orgCode: "' OR 1=1 --", year: 2026, month: 10})).toThrow();
  });
});
