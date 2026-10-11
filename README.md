# Molla Enterprise 2026

Create a new web app closely matching the visual design, layout, navigation, and functionality of https://molla-enterprise.bakilinoor29.workers.dev/. Inspect the reference site directly and recreate it faithfully. Remove PayChangu and all live payment processing. For Airtel Money, Mpamba, and bank payments, provide a record-keeping flow that captures the payer/customer number and payment method only. Products must be searchable by barcode, product name, and number/SKU in the sale/payment workflow. For Airtel Money and Mpamba, support recording agent codes used for customer withdrawals. Build a manager dashboard that can clear/reset records of sold items without deleting or changing the product catalog. Add roles and management flows for workers and managers. The app needs persistent backend data and authentication, so enable Lovable Cloud first if needed; also prepare it to use a user-owned Supabase connection once the user connects it in Project Settings > Integrations > Supabase, so the data/auth continue to work when deployed on another host such as cPanel. Use the image the user attached as favicon and Lovable badge icon if it is available in the message attachments; if no image attachment reaches you, note that the user needs to provide it. Do not invent the payment provider or add external checkout.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c31e862f-8906-4067-8501-78e9814ff121).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
