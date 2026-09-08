# Privy Webhook Ingest

Verify Privy's Svix webhook signature and return the authenticated event. This action does not dispatch downstream actions.

## Inputs

- `rawBody`: exact UTF-8 HTTP request body, captured before JSON parsing.
- `headers`: object with lowercase `svix-id`, `svix-timestamp`, and `svix-signature` keys.
- `PRIVY_WEBHOOK_SECRET`: the endpoint signing secret from Privy, including its `whsec_` prefix.

Pass the body unchanged. The verifier authenticates the delivery ID, timestamp, and raw body using HMAC-SHA256 and timing-safe comparison. Deliveries more than five minutes in the past or future are rejected. Multiple version-1 signatures are supported for key rotation.

## Output

Valid signatures and JSON bodies with a string `type` return `success: true`, `data.verified: true`, and `data.event` parsed exclusively from the authenticated body. Failed verification or invalid JSON returns `success: false` with no event.

Timestamp validation limits replay age but does not deduplicate deliveries. The HTTP receiver must persist/deduplicate `svix-id` before performing downstream effects; Privy may redeliver the same message.

## Migration

The previous `signature`/parsed `payload`/separate `event` interface is rejected. It did not implement Privy's signing format and allowed event substitution. Forward `rawBody` and the three Svix headers instead. App ID and app secret are not required for this local verification feature.

References: [Privy webhook verification](https://docs.privy.io/api-reference/webhooks/overview), [Svix manual verification](https://docs.svix.com/receiving/verifying-payloads/how-manual).
