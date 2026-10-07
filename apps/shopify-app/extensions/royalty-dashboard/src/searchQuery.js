// 派遣元マスタの識別コード（org_code）は半角英数字とハイフンのみ
// （apps/shopify-app/shopify.app.toml の dispatch_org.fields.org_code 参照）。
// 自由入力欄から来た値をこの形式に限定することで、検索クエリ文字列への
// クオート抜け・インジェクションを防ぐ。
const ORG_CODE_PATTERN = /^[a-z0-9-]+$/;

export function isValidOrgCode(orgCode) {
  return typeof orgCode === 'string' && ORG_CODE_PATTERN.test(orgCode);
}

/**
 * 指定した年月（JST）の「月初00:00」〜「翌月初00:00」の範囲をISO8601（+09:00固定）で返す。
 * created_at の素のYYYY-MM-DD指定はタイムゾーンの扱いが非公開のため、
 * 月末・月初の注文を取りこぼさないよう常にJSTのオフセットを明示する。
 */
export function monthRangeJst(year, month) {
  const pad = (n) => String(n).padStart(2, '0');
  let endYear = year;
  let endMonth = month + 1;
  if (endMonth > 12) {
    endMonth = 1;
    endYear += 1;
  }
  return {
    start: `${year}-${pad(month)}-01T00:00:00+09:00`,
    end: `${endYear}-${pad(endMonth)}-01T00:00:00+09:00`,
  };
}

// Admin GraphQL APIは read_orders / write_orders だけでは「直近60日分の注文」しか
// 読めない（それより古い注文には要承認スコープ read_all_orders が必要）。公式ドキュメントは
// 「last 60 days' worth of orders」という一文のみで、60日の起点やタイムゾーンの扱いは
// 明記されていない。境界の厳密な仕様が不明なため、この関数は「対象月の開始日が、今日から
// 60日前より前かどうか」で判定する目安であり、実際の境界とズレる可能性がある前提で使う。
const DEFAULT_ORDER_ACCESS_WINDOW_DAYS = 60;

/**
 * 指定した年月(JST)が、Admin APIのデフォルトアクセス範囲(直近60日)の外に
 * 出ている可能性があるかを判定する。true の場合、read_all_orders 未承認だと
 * 集計結果が0件または不完全になりうることをUI側で警告する目的で使う。
 *
 * @param {{year: number, month: number}} params
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isMonthOutsideDefaultOrderWindow({year, month}, now = new Date()) {
  const {start} = monthRangeJst(year, month);
  const windowStart = new Date(now.getTime() - DEFAULT_ORDER_ACCESS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return new Date(start) < windowStart;
}

/**
 * ロイヤリティ集計用のGraphQL Admin API検索クエリ文字列を組み立てる。
 * 派遣元を問わず、org:タグが付いた発送済み注文を対象月分すべて取得する
 * （組織ごとの内訳は取得後にクライアント側で集計する。 aggregate.js の
 * aggregateOrdersByOrg 参照）。
 *
 * @param {{year: number, month: number}} params
 * @returns {string}
 */
export function buildAllOrgsOrdersSearchQuery({year, month}) {
  const {start, end} = monthRangeJst(year, month);
  return [
    'tag_prefix:org:',
    'fulfillment_status:fulfilled',
    `created_at:>='${start}'`,
    `created_at:<'${end}'`,
  ].join(' AND ');
}
