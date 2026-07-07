"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";

export default function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicMoviePage = pathname.startsWith("/movie/");

  return (
    <>
      {!isPublicMoviePage ? <Navbar /> : null}
      <div
        className={
          isPublicMoviePage
            ? "app-shell min-h-screen"
            : "app-shell min-h-screen pb-[calc(5.85rem+env(safe-area-inset-bottom))] pt-[calc(0.45rem+env(safe-area-inset-top))] md:pb-0 md:pt-20"
        }
      >
        {children}
      </div>
    </>
  );
}
