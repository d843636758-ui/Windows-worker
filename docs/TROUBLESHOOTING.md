# Troubleshooting

- **Worker offline:** keep Windows logged in and awake; run `doctor.ps1`; confirm `RELAY_URL` uses `wss://`; inspect the newest local log.
- **Edge will not start:** close Edge instances using the dedicated profile. Never point `EDGE_PROFILE_DIR` at your normal browser profile.
- **Taobao asks for login/CAPTCHA:** finish it manually in the visible Edge window, then retry.
- **Control not unique/not found:** reread the page, navigate to the intended product, and use exact visible text.
- **Confirmation expired:** call the prepare/click tool again and confirm the newly returned summary/token.
- **Payment unavailable:** install the official Alipay helper, run `alipay-bot check-wallet` locally, and keep final approval on the phone.
- **Cloud timeout:** the local action may still be visible in Edge. Inspect before retrying to avoid duplicate orders.
