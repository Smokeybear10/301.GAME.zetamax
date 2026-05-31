import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { ServiceWorkerRegistration } from "./sw-register";
import { ThemeMusic } from "./_components/theme-music";
import { SITE_URL } from "@/lib/site-url";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "ZETAMAX | timed mental math drill",
  description:
    "Two minutes. Mental arithmetic. Open and drill, or sign in to play with friends.",
  // Link previews. The opengraph-image.tsx / icon conventions supply the
  // images automatically; these fields fill in the text + card type so
  // iMessage/Discord/Slack/X all render a rich card.
  openGraph: {
    type: "website",
    siteName: "Zetamax",
    title: "ZETAMAX | timed mental math drill",
    description:
      "Two minutes. Mental arithmetic. Open and drill, or sign in to play with friends.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "ZETAMAX | timed mental math drill",
    description:
      "Two minutes. Mental arithmetic. Open and drill, or sign in to play with friends.",
  },
  manifest: "/manifest.webmanifest",
  applicationName: "Zetamax",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Zetamax",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const geistSans = Geist({
  variable: "--font-sans",
  display: "swap",
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "700", "900"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  display: "swap",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${jetbrainsMono.variable} font-sans antialiased bg-black text-white`}
      >
        {children}
        <ThemeMusic />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
