# Security model

The cloud service cannot execute shell commands or access a desktop. The worker exposes only named browser/shopping/payment operations and runs Edge through Playwright's structured API. There is no arbitrary JavaScript evaluation tool.

Sensitive inputs (passwords, OTP/2FA, bank/card and payment-password fields) are blocked. General risky browser clicks and both shopping transitions use short-lived, single-use confirmation tokens. Order submission never confirms the final Alipay payment; that remains a user action in the Alipay app.

`alipay-bot` is spawned locally with `shell:false` and a fixed subcommand allowlist. Payment URLs must be HTTPS on an exact `cashier*.alipay.com` host and contain `cashiermain.htm` plus `orderId`.

Treat screenshots and page text as private. They are returned only to the authenticated request, are size-limited by the relay, and are not persisted by this application. Rotate both secrets after suspected exposure.
