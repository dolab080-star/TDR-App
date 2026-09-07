/**
 * Single source of truth for the price shown in the UI. This is DISPLAY ONLY
 * — the amount actually charged comes from the Stripe Price you create
 * (STRIPE_PRICE_ID). Keep this in sync with that Price so the pricing page
 * never shows a number Stripe doesn't charge.
 */
export const PRICE_DISPLAY = '$6.90';
