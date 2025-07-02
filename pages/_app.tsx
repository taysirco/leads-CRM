import '../styles/globals.css';
import type { AppProps } from 'next/app';
import RTLWrapper from '../components/RTLWrapper';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <RTLWrapper>
      <Component {...pageProps} />
    </RTLWrapper>
  );
}

export default MyApp; 