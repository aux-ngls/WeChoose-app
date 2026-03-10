"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { PushNotifications } from "@capacitor/push-notifications";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import {
  rememberNativePushToken,
  syncNativePushToken,
} from "@/lib/native-app";

export default function NativeBridge() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const handles: PluginListenerHandle[] = [];

    const bootNativeBridge = async () => {
      await SplashScreen.hide().catch(() => undefined);
      await StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
      await StatusBar.setBackgroundColor({ color: "#09090b" }).catch(() => undefined);

      handles.push(
        await PushNotifications.addListener("registration", (token) => {
          void rememberNativePushToken(token.value);
        }),
      );

      handles.push(
        await PushNotifications.addListener("registrationError", (error) => {
          console.error("Push registration error", error);
        }),
      );

      handles.push(
        await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
          const route = typeof event.notification.data?.route === "string"
            ? event.notification.data.route
            : "/";
          router.push(route);
        }),
      );

      handles.push(
        await CapacitorApp.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            void syncNativePushToken();
          }
        }),
      );

      let permissions = await PushNotifications.checkPermissions();
      if (permissions.receive === "prompt") {
        permissions = await PushNotifications.requestPermissions();
      }

      if (permissions.receive === "granted") {
        if (Capacitor.getPlatform() === "android") {
          await PushNotifications.createChannel({
            id: "qulte-updates",
            name: "Qulte Updates",
            description: "Messages prives et activite sociale",
            importance: 5,
            visibility: 1,
          }).catch(() => undefined);
        }
        await PushNotifications.register();
      }

      await syncNativePushToken();
    };

    void bootNativeBridge();

    return () => {
      for (const handle of handles) {
        void handle.remove();
      }
    };
  }, [router, pathname]);

  return null;
}
