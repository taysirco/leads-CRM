import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="ar" dir="rtl">
      <Head>
        <meta charSet="utf-8" />
        
        {/* ✨ تحسين تحميل الخطوط */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        
        {/* تحميل الخط بـ display=swap للسرعة */}
        <link 
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap" 
          rel="stylesheet"
        />
        
        {/* DNS Prefetch للسرعة */}
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://fonts.gstatic.com" />
        
        {/* Meta tags للأداء */}
        <meta name="theme-color" content="#3b82f6" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </Head>
      <body className="rtl font-cairo" dir="rtl">
        <Main />
        <NextScript />
      </body>
    </Html>
  )
} 