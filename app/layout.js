import './globals.css';

export const metadata = {
  title: 'Academia do Tio Zé',
  description: 'Tycoon casual: transforme a garagem herdada na academia mais querida do bairro.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f7f1e6',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@500;700;800;900&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
