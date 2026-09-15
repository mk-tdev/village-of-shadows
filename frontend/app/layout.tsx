import type { Metadata } from "next";
import "./globals.css";
import { PreferencesProvider } from "@/components/Preferences";

export const metadata: Metadata = {
  title: "Village of Shadows",
  description: "Enter a living multi-agent game where six AI minds and one human player reason, remember, deceive, and decide.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body><PreferencesProvider>{children}</PreferencesProvider></body>
    </html>
  );
}
