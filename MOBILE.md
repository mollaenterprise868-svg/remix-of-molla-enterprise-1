# Molla Enterprise — mobile guide

## Install as an app (PWA)

The app is installable straight from the browser — no store needed.

- **Android (Chrome):** open the published link, tap the ⋮ menu → **Install app** / **Add to Home screen**.
- **iPhone (Safari):** open the link, tap Share → **Add to Home Screen**.

It then launches full screen with the Molla icon. Camera barcode scanning needs the
site to be opened over HTTPS and camera permission allowed once.

## Camera barcode scanning

On the till, tap the camera button next to the scan box, point the phone at the
barcode, and the item is added automatically. USB/bluetooth laser scanners still work
by typing into the scan box and pressing Enter.

## Receipts and reports

- After a sale, use **Print receipt** or **Download PDF** on the till.
- Managers can export the whole sales record list to PDF from **Records → Export PDF**.

## Android APK with Capacitor

`capacitor.config.ts` is already in the project. To produce an APK:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap add android
npm run build
npx cap sync android
npx cap open android      # opens Android Studio
```

In Android Studio: **Build → Build Bundle(s)/APK(s) → Build APK(s)**.

Notes:

- `server.url` in `capacitor.config.ts` points the APK at the published web app, so
  staff always get the latest version without reinstalling. Update that URL if you
  deploy to your own domain or cPanel host. Remove the `server` block entirely if you
  prefer to ship the built `dist` files inside the APK.
- Add camera permission to `android/app/src/main/AndroidManifest.xml`:
  `<uses-permission android:name="android.permission.CAMERA" />`
- App icons: replace the launcher icons in `android/app/src/main/res` with the Molla
  logo (Android Studio → **Image Asset**).
- Signing for the Play Store: **Build → Generate Signed Bundle / APK** and keep the
  keystore safe.

## Stock file import format

Managers upload a CSV with these columns:

```
name,barcode,sku,category,unit,price,quantity,low_stock_level
```

`name`, `price` and `quantity` are required; everything else is optional.
`unit` must be one of piece, packet, kg, litre, metre, bundle. A template can be
downloaded from the Stock tab.
