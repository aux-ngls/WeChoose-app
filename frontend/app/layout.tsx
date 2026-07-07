import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import NativeBridge from "@/components/NativeBridge";
import PwaProvider from "@/components/PwaProvider";
import WebPushPrompt from "@/components/WebPushPrompt";
import AccountTheme from "@/components/AccountTheme";
import WelcomeTutorial from "@/components/WelcomeTutorial";
import AppChrome from "@/components/AppChrome";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://wechoose.dury.dev"),
  title: {
    default: "Qulte",
    template: "%s | Qulte",
  },
  description: "Qulte, l'application cinema sociale pour decouvrir, noter et partager des films.",
  applicationName: "Qulte",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Qulte",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#09090b",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${inter.className} bg-black text-white`}>
        <AccountTheme />
        <WelcomeTutorial />
        <NativeBridge />
        <PwaProvider />
        <WebPushPrompt />
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
