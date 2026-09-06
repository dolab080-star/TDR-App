import { PRICE_DISPLAY } from './lib/price';

document.querySelectorAll('#price, #price2, .price-inline').forEach((el) => {
  el.textContent = PRICE_DISPLAY;
});

if (new URLSearchParams(window.location.search).get('canceled') === '1') {
  document.getElementById('canceled-note')?.removeAttribute('hidden');
}

const buyBtn = document.getElementById('buy-btn') as HTMLButtonElement | null;
const errorEl = document.getElementById('buy-error');

function showError(message: string) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.removeAttribute('hidden');
}

buyBtn?.addEventListener('click', async () => {
  if (!buyBtn) return;
  buyBtn.disabled = true;
  const originalText = buyBtn.textContent;
  buyBtn.textContent = 'Redirecting to secure checkout…';
  errorEl?.setAttribute('hidden', '');
  try {
    const res = await fetch('/api/create-checkout-session', { method: 'POST' });
    const data = (await res.json()) as { url?: string; error?: string };
    if (res.ok && data.url) {
      window.location.href = data.url;
      return;
    }
    if (data.error === 'not_configured') {
      showError("Payments aren't set up yet — check back soon.");
    } else {
      showError('Could not start checkout. Please try again in a moment.');
    }
  } catch {
    showError('Could not reach the checkout server. Check your connection and try again.');
  }
  buyBtn.disabled = false;
  buyBtn.textContent = originalText;
});
