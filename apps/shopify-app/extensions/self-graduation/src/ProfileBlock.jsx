import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';

const API_VERSION = '2026-07';
const METAFIELD_NAMESPACE = '$app';
const METAFIELD_KEY = 'self_graduated';

export default async () => {
  render(<Extension />, document.body);
};

async function callCustomerAccountApi(query, variables) {
  const response = await fetch(
    `shopify:customer-account/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({query, variables}),
    },
  );
  return response.json();
}

function Extension() {
  const translate = shopify.i18n.translate;
  const [customerId, setCustomerId] = useState(null);
  const [graduated, setGraduated] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    callCustomerAccountApi(`
      query {
        customer {
          id
          metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
            value
          }
        }
      }
    `).then(({data}) => {
      if (!data?.customer) return;
      setCustomerId(data.customer.id);
      setGraduated(data.customer.metafield?.value === 'true');
    });
  }, []);

  async function handleGraduate() {
    setSubmitting(true);
    setError(false);
    const {data} = await callCustomerAccountApi(
      `
        mutation setSelfGraduated($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { value }
            userErrors { field message }
          }
        }
      `,
      {
        metafields: [
          {
            ownerId: customerId,
            namespace: METAFIELD_NAMESPACE,
            key: METAFIELD_KEY,
            type: 'boolean',
            value: 'true',
          },
        ],
      },
    );
    setSubmitting(false);
    if (!data || data.metafieldsSet.userErrors.length > 0) {
      setError(true);
      return;
    }
    setGraduated(true);
  }

  if (graduated === null) {
    return (
      <s-section heading={translate('heading')}>
        <s-spinner size="base" />
      </s-section>
    );
  }

  return (
    <s-section heading={translate('heading')}>
      <s-stack direction="block" gap="base">
        <s-text>
          {graduated ? translate('graduatedStatus') : translate('activeStatus')}
        </s-text>

        {error && <s-text tone="critical">{translate('errorMessage')}</s-text>}

        {!graduated && (
          <>
            <s-button command="--show" commandFor="graduate-modal">
              {translate('graduateButton')}
            </s-button>
            <s-modal id="graduate-modal" heading={translate('modalHeading')}>
              <s-paragraph>{translate('modalDescription')}</s-paragraph>
              <s-button
                slot="secondary-actions"
                command="--hide"
                commandFor="graduate-modal"
              >
                {translate('cancelButton')}
              </s-button>
              <s-button
                slot="primary-action"
                variant="primary"
                tone="critical"
                command="--hide"
                commandFor="graduate-modal"
                loading={submitting}
                onClick={handleGraduate}
              >
                {translate('confirmButton')}
              </s-button>
            </s-modal>
          </>
        )}
      </s-stack>
    </s-section>
  );
}
