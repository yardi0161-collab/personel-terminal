import type { ReactNode } from "react";

export const metadata = { title: "Personnel Terminal" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
