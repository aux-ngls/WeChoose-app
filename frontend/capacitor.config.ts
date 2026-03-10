import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "dev.dury.qulte",
  appName: "Qulte",
  webDir: ".next",
  server: {
    url: "https://wechoose.dury.dev",
    cleartext: false,
    allowNavigation: ["wechoose.dury.dev", "api.wechoose.dury.dev"],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 1200,
      backgroundColor: "#09090b",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#09090b",
      overlaysWebView: false,
    },
  },
};

export default config;
