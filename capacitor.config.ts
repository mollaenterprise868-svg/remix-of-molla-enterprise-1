import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for wrapping Molla Enterprise as an Android APK.
 * See MOBILE.md for the full build steps. The app is served from the published
 * web URL so the till always runs the latest deployed version.
 */
const config: CapacitorConfig = {
  appId: "mw.molla.enterprise",
  appName: "Molla Enterprise",
  webDir: "dist",
  server: {
    url: "https://project--c31e862f-8906-4067-8501-78e9814ff121.lovable.app",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      backgroundColor: "#0d1a16",
      showSpinner: false,
    },
  },
};

export default config;
