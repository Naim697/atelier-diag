import { render } from 'preact';
import './ui/style.css';
import { Root } from './ui/app';

const root = document.getElementById('app')!;
root.textContent = '';
render(<Root />, root);

// Mode hors ligne : le service worker garde l'appli et les paquets de codes dans le téléphone.
if ('serviceWorker' in navigator && location.protocol === 'https:' && !document.querySelector('script[data-pack-index]')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => undefined); });
}
