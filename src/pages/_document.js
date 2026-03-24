import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      {/* Pour Android et Chrome */}
        <link rel="manifest" href="/manifest.json" />
        {/* Pour iPhone (iOS) */}
        <link rel="apple-touch-icon" href="/logo-512.png" />
        {/* L'icône classique (favicon) */}
        <link rel="icon" href="/logo-512.png" />
        <meta name="theme-color" content="#0f172a" />
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
