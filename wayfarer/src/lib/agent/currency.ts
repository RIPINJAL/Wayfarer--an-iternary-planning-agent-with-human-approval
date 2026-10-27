import 'server-only';
import { getJson, TtlCache } from './http';

const cache = new TtlCache<number>(6 * 3600_000);

export async function convertCurrency(amount: number, from: string, to: string) {
  from = from.toUpperCase();
  to = to.toUpperCase();
  if (from === to) return { amount, from, to, rate: 1, converted: amount };
  const key = `${from}>${to}`;
  let rate = cache.get(key);
  if (rate === undefined) {
    type R = { rates?: Record<string, number> };
    const d = await getJson<R>(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`);
    rate = d.rates?.[to];
    if (!rate) throw new Error(`No exchange rate available for ${from} to ${to}`);
    cache.set(key, rate);
  }
  return { amount, from, to, rate, converted: Number((amount * rate).toFixed(2)) };
}
