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

/**
 * ロイヤリティ集計用のGraphQL Admin API検索クエリ文字列を組み立てる。
 *
 * @param {{orgCode: string, year: number, month: number}} params
 * @returns {string}
 */
export function buildOrdersSearchQuery({orgCode, year, month}) {
  if (!isValidOrgCode(orgCode)) {
    throw new Error(`invalid orgCode: ${orgCode}`);
  }
  const {start, end} = monthRangeJst(year, month);
  // tag: は完全一致だがクオートが必須（クオートを忘れると前方一致扱いのtag_prefix:と
  // 混同しやすく、実際にDevストアの検証でクオート漏れにより0件になったことがある）。
  return [
    `tag:'org:${orgCode}'`,
    'fulfillment_status:fulfilled',
    `created_at:>='${start}'`,
    `created_at:<'${end}'`,
  ].join(' AND ');
}
