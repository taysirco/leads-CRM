import '../styles/globals.css';
import type { AppProps } from 'next/app';
import RTLWrapper from '../components/RTLWrapper';
import ErrorBoundary from '../components/ErrorBoundary';
import { ToastProvider } from '../contexts/ToastContext';
import { ConfirmProvider } from '../contexts/ConfirmContext';
import ToastContainer from '../components/ui/ToastContainer';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <ConfirmProvider>
          <RTLWrapper>
            <Component {...pageProps} />
            <ToastContainer />
          </RTLWrapper>
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default MyApp;