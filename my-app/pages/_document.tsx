import Document, { Html, Head, Main, NextScript, DocumentContext, DocumentInitialProps } from 'next/document';

class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext): Promise<DocumentInitialProps & { locale?: string }> {
    const initialProps = await Document.getInitialProps(ctx);
    return { ...initialProps, locale: ctx.locale }; // Pass locale to props
  }

  render() {
    // Acessar locale das props, com fallback para o defaultLocale se não estiver definido (ex: build time)
    // O defaultLocale é 'en' conforme next.config.js
    const currentLocale = (this.props as { __NEXT_DATA__?: { locale?: string } }).__NEXT_DATA__?.locale || 'en';

    return (
      <Html lang={currentLocale}> {/* Use o locale dinâmico aqui */}
        <Head />
        <body>
          <script
            dangerouslySetInnerHTML={{
              __html: `
              (function() {
                function getInitialTheme() {
                  const storedTheme = window.localStorage.getItem('theme');
                  if (typeof storedTheme === 'string') return storedTheme;
                  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  return prefersDark ? 'dark' : 'light';
                }
                const theme = getInitialTheme();
                // Certifique-se de que apenas uma classe de tema exista, removendo a oposta se necessário
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark'); 
                }
              })();
            `,
            }}
          />
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
