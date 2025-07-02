import '../styles/globals.css';
import React from 'react';

export const metadata = {
  title: 'Leads CRM',
  description: 'CRM for managing leads from Google Sheets',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
} 