import "@/styles/globals.css";
import { Navbar } from '../components/layout/Navbar';
import { AuthProvider } from '../lib/context/AuthContext';
import { CurrencyProvider } from '../lib/context/CurrencyContext';
import { DashboardDataProvider } from '../lib/context/DashboardDataContext';
import { appWithTranslation } from 'next-i18next';
// @ts-ignore
import nextI18NextConfig from '../next-i18next.config.js';
import type { AppProps as NextAppProps } from 'next/app';
import ErrorBoundary from '../components/error-boundaries/ErrorBoundary';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { FloatingChatContainer } from '../components/floating-chat';
import { ToastProvider } from '../lib/context/ToastContext';

declare global {
  interface Window {
    next?: {
      router?: {
        events?: {
          off: (event: string, handler: () => void) => void;
        };
      };
    };
  }
}

// Usando type ao invés de interface vazia
type MyAppProps = NextAppProps;

function MyApp({ Component, pageProps }: MyAppProps) {
  const router = useRouter();

  // Verificar se a página atual é de login ou signup
  const isAuthPage = router.pathname === '/users/login' || router.pathname === '/users/signup';

  useEffect(() => {
    // Desativa o overlay de erros do Next.js apenas em produção
    if (process.env.NODE_ENV === 'production') {
      // Salva a referência original do console.error
      const originalConsoleError = console.error;

      // Sobrescreve o console.error para evitar que o overlay de erros apareça
      console.error = (...args) => {
        // Filtra mensagens de erro que não queremos que mostrem o overlay
        if (args[0] && typeof args[0] === 'string' &&
          (args[0].includes('Error:') ||
            args[0].includes('Uncaught') ||
            args[0].includes('Unhandled Rejection'))) {
          // Não faz nada para erros que queremos capturar com o Error Boundary
          return;
        }
        // Para outros erros, chama o console.error original
        originalConsoleError.apply(console, args);
      };

      // Função para prevenir o comportamento padrão de erros não capturados
      const handleError = (event: ErrorEvent | PromiseRejectionEvent) => {
        event.preventDefault();
        return false;
      };

      // Adiciona os listeners
      window.addEventListener('error', handleError);
      window.addEventListener('unhandledrejection', handleError);

      // Limpa os listeners quando o componente for desmontado
      return () => {
        // Restaura o console.error original
        console.error = originalConsoleError;
        // Remove os listeners
        window.removeEventListener('error', handleError);
        window.removeEventListener('unhandledrejection', handleError);
      };
    }
  }, []);

  // Check if current route is in the dashboard (CRM/ERP area)
  const isDashboardPage = router.pathname.startsWith('/dashboard');

  return (
    <ToastProvider>
      <ErrorBoundary>
        <AuthProvider>
          <CurrencyProvider>
            <DashboardDataProvider>
              <div className="flex flex-col min-h-screen bg-lumi-light-100 dark:bg-lumi-dark-500 transition-colors duration-300">
                {!isAuthPage && <Navbar />}
                <main className={!isAuthPage ? 'pt-[60px]' : ''}>
                  <Component {...pageProps} />
                </main>
              </div>
              {/* Floating Chat - aparece APENAS no dashboard (CRM/ERP) */}
              {isDashboardPage && <FloatingChatContainer />}
            </DashboardDataProvider>
          </CurrencyProvider>
        </AuthProvider>
      </ErrorBoundary>
    </ToastProvider>
  );
}

export default appWithTranslation(MyApp, nextI18NextConfig);
