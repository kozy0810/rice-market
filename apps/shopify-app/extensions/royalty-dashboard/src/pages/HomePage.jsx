import {useState, useEffect, useMemo} from 'preact/hooks';
import {aggregateOrders} from '../aggregate.js';
import {buildOrdersSearchQuery, isValidOrgCode} from '../searchQuery.js';
import {fetchAllFulfilledOrders, ORDERS_PAGE_SIZE, MAX_ORDER_PAGES} from '../fetchOrders.js';

// shopify.app.toml の [metaobjects.app.dispatch_org] の name と一致させる。
// GraphQL上のtypeは "app--<アプリのクライアントID>--dispatch_org" のようにストアへの
// インストールごとに変わる値になるため、ハードコードせずnameで定義を検索して解決する。
const DISPATCH_ORG_DEFINITION_NAME = '派遣元組織';

const DISPATCH_ORG_DEFINITION_QUERY = `
  query RoyaltyDispatchOrgDefinition {
    metaobjectDefinitions(first: 50) {
      nodes { type name }
    }
  }
`;

const DISPATCH_ORGS_QUERY = `
  query RoyaltyDispatchOrgs($type: String!) {
    metaobjects(type: $type, first: 50) {
      nodes {
        handle
        fields { key value }
      }
    }
  }
`;

const MONTH_OPTIONS = Array.from({length: 12}, (_, i) => i + 1);

function currentYearMonth() {
  const now = new Date();
  return {year: now.getFullYear(), month: now.getMonth() + 1};
}

function yearOptions(currentYear) {
  return [currentYear - 1, currentYear, currentYear + 1];
}

async function loadDispatchOrgs() {
  const defResult = await shopify.query(DISPATCH_ORG_DEFINITION_QUERY);
  if (defResult.errors) {
    throw new Error(JSON.stringify(defResult.errors));
  }
  const definition = (defResult.data?.metaobjectDefinitions?.nodes ?? []).find(
    (node) => node.name === DISPATCH_ORG_DEFINITION_NAME,
  );
  // 定義がまだ無いストア（構築直後など）では、ドロップダウンは空のまま自由入力だけで運用する。
  if (!definition) {
    return [];
  }

  const listResult = await shopify.query(DISPATCH_ORGS_QUERY, {
    variables: {type: definition.type},
  });
  if (listResult.errors) {
    throw new Error(JSON.stringify(listResult.errors));
  }
  return (listResult.data?.metaobjects?.nodes ?? [])
    .map((node) => {
      const fields = Object.fromEntries(node.fields.map((f) => [f.key, f.value]));
      return {
        handle: node.handle,
        orgName: fields.org_name ?? node.handle,
        orgCode: fields.org_code ?? '',
        active: fields.active === 'true',
      };
    })
    .filter((org) => org.orgCode);
}

export default function HomePage() {
  const {year: defaultYear, month: defaultMonth} = useMemo(currentYearMonth, []);

  const [dispatchOrgs, setDispatchOrgs] = useState([]);
  const [dispatchOrgsError, setDispatchOrgsError] = useState(null);

  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [orgCode, setOrgCode] = useState('');
  const [royaltyRatePercent, setRoyaltyRatePercent] = useState('1.5');

  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [errorMessage, setErrorMessage] = useState(null);
  const [result, setResult] = useState(null); // {orderCount, totalRevenueYen, royaltyAmountYen, currencyCode, orders, truncated}

  useEffect(() => {
    loadDispatchOrgs()
      .then(setDispatchOrgs)
      .catch((err) => setDispatchOrgsError(String(err?.message ?? err)));
  }, []);

  async function handleAggregate() {
    setResult(null);
    setErrorMessage(null);

    const trimmedOrgCode = orgCode.trim();
    if (!isValidOrgCode(trimmedOrgCode)) {
      setStatus('error');
      setErrorMessage('組織コードは半角英数字とハイフンのみで入力してください。');
      return;
    }

    setStatus('loading');
    try {
      const searchQuery = buildOrdersSearchQuery({orgCode: trimmedOrgCode, year, month});
      const {orders, truncated} = await fetchAllFulfilledOrders(searchQuery, (query, options) =>
        shopify.query(query, options),
      );
      const aggregated = aggregateOrders(orders, royaltyRatePercent);
      setResult({...aggregated, orders, truncated});
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setErrorMessage(String(err?.message ?? err));
    }
  }

  const activeDispatchOrgs = dispatchOrgs.filter((org) => org.active);

  return (
    <s-page heading="ロイヤリティ集計">
      <s-section heading="集計条件">
        {dispatchOrgsError && (
          <s-banner tone="warning">
            <s-paragraph>
              派遣元マスタの取得に失敗したため、ドロップダウンは使えません（自由入力は利用できます）: {dispatchOrgsError}
            </s-paragraph>
          </s-banner>
        )}
        <s-stack gap="base">
          <s-select
            label="派遣元（マスタ登録済みのみ。無効化済み・未登録の組織は下の直接入力を使う）"
            placeholder="選択してください"
            onChange={(e) => setOrgCode(e.currentTarget.value)}
          >
            {activeDispatchOrgs.map((org) => (
              <s-option key={org.handle} value={org.orgCode}>
                {org.orgName}（{org.orgCode}）
              </s-option>
            ))}
          </s-select>

          <s-text-field
            label="組織コード（直接入力）"
            details="顧客・注文タグ org:<コード> の <コード> 部分。マスタ未登録の組織や過去に無効化した組織はこちらに入力する"
            value={orgCode}
            onChange={(e) => setOrgCode(e.currentTarget.value)}
          />

          <s-select label="年" value={String(year)} onChange={(e) => setYear(Number(e.currentTarget.value))}>
            {yearOptions(defaultYear).map((y) => (
              <s-option key={y} value={String(y)}>
                {y}年
              </s-option>
            ))}
          </s-select>

          <s-select label="月" value={String(month)} onChange={(e) => setMonth(Number(e.currentTarget.value))}>
            {MONTH_OPTIONS.map((m) => (
              <s-option key={m} value={String(m)}>
                {m}月
              </s-option>
            ))}
          </s-select>

          <s-number-field
            label="ロイヤリティ率（%）"
            details="例: 1.5 と入力すると 1.5% として計算します"
            suffix="%"
            step="0.01"
            min="0"
            value={royaltyRatePercent}
            onChange={(e) => setRoyaltyRatePercent(e.currentTarget.value)}
          />

          <s-button variant="primary" onClick={handleAggregate} disabled={status === 'loading'}>
            {status === 'loading' ? '集計中...' : '集計する'}
          </s-button>
        </s-stack>
      </s-section>

      {status === 'error' && (
        <s-section heading="エラー">
          <s-banner tone="critical">
            <s-paragraph>{errorMessage}</s-paragraph>
          </s-banner>
        </s-section>
      )}

      {status === 'done' && result && (
        <s-section heading={`集計結果: ${year}年${month}月 / org:${orgCode}`}>
          {result.truncated && (
            <s-banner tone="warning">
              <s-paragraph>
                注文件数が上限（{MAX_ORDER_PAGES * ORDERS_PAGE_SIZE}件相当）に達したため、集計が対象期間の一部のみになっている可能性があります。
              </s-paragraph>
            </s-banner>
          )}

          {result.orderCount === 0 ? (
            <s-paragraph>対象の発送済み注文は見つかりませんでした。</s-paragraph>
          ) : (
            <>
              <s-paragraph>
                対象注文数: {result.orderCount}件 / 合計売上: {result.totalRevenueYen.toLocaleString('ja-JP')}円 / ロイヤリティ額:{' '}
                {result.royaltyAmountYen.toLocaleString('ja-JP')}円（率 {royaltyRatePercent}%）
              </s-paragraph>
              <s-table>
                <s-table-header-row>
                  <s-table-header>注文</s-table-header>
                  <s-table-header>小計</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {result.orders.map((o) => (
                    <s-table-row key={o.id}>
                      <s-table-cell>{o.name}</s-table-cell>
                      <s-table-cell>
                        {o.currentSubtotalPriceSet?.shopMoney?.amount} {o.currentSubtotalPriceSet?.shopMoney?.currencyCode}
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            </>
          )}
        </s-section>
      )}
    </s-page>
  );
}
