import type { Metadata } from "next";
import "./globals.css";
import "./network.css";
export const metadata: Metadata = {
  title: {
    default: "Fundicate — Fund together. Decide together.",
    template: "%s · Fundicate",
  },
  description:
    "Community governance, fair decisions and transparent external-payment records. Payment tracking stays separate from simulated funding tools.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
