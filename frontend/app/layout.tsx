import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import PwaProvider from "@/components/PwaProvider";

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
        <PwaProvider />
        <Navbar />
        <div className="min-h-screen pb-[calc(6.4rem+env(safe-area-inset-bottom))] pt-[calc(4.8rem+env(safe-area-inset-top))] md:pb-0 md:pt-20">
          {children}
        </div>
      </body>
    </html>
  );
}
