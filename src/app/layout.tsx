import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "EduPulse AMS — School Management",
  description: "Offline-ready academy management for Bangladeshi primary schools",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport={width:"device-width",initialScale:1,themeColor:"#155eef"};
export default function RootLayout({children}:{children:ReactNode}){
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
