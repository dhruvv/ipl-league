import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fantasy points breakdown",
  robots: { index: false, follow: false },
};

export default function FantasyBreakdownLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
