import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.error('Service worker kaydedilemedi.', error);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />,
);
