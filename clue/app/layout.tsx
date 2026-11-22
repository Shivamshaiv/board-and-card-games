import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Gilded Alibi — A Vesper House Mystery",
  description: "Enter Vesper House and solve a complete cinematic deduction mystery against privacy-safe AI investigators.",
  applicationName: "The Gilded Alibi",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "The Gilded Alibi",
    description: "Six guests. Nine rooms. One truth sealed in brass and wax.",
    type: "website",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "The Gilded Alibi at Vesper House" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Gilded Alibi",
    description: "A playable Vesper House deduction mystery.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#090e0f",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en"><body>{children}</body></html>
  );
}
