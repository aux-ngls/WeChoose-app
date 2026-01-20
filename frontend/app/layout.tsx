import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WeChoose 🍿",
  description: "L'application pour choisir vos films entre amis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${inter.className} bg-black text-white`}>
        <Navbar />
        {/* Padding dynamique : En bas sur mobile (pb-20), En haut sur PC (md:pt-20) */}
        <div className="pb-24 md:pb-0 md:pt-20 min-h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}