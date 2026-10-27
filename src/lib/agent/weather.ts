import 'server-only';
import { getJson } from './http';
import { addDays } from '../schemas';

const WMO: Record<number, string> = {
  0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 80: 'rain showers', 81: 'rain showers', 82: 'violent showers',
  95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with hail',
};

export interface WeatherDay {
  date: string;
  highC: number | null;
  lowC: number | null;
  rainChancePct: number | null;
  conditions?: string;
}

export interface WeatherResult {
  basis: 'forecast' | 'last_year';
  note: string;
  days: WeatherDay[];
}

const today = () => new Date().toISOString().slice(0, 10);

export async function getWeather(lat: number, lng: number, start: string, end: string): Promise<WeatherResult> {
  const horizon = addDays(today(), 15);
  if (end <= horizon && start >= addDays(today(), -1)) {
    type F = { daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[]; weather_code: number[] } };
    const d = await getJson<F>(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&start_date=${start}&end_date=${end}`,
    );
    return {
      basis: 'forecast',
      note: 'Real forecast from Open-Meteo.',
      days: d.daily.time.map((t, i) => ({
        date: t,
        highC: d.daily.temperature_2m_max[i],
        lowC: d.daily.temperature_2m_min[i],
        rainChancePct: d.daily.precipitation_probability_max[i],
        conditions: WMO[d.daily.weather_code[i]],
      })),
    };
  }

  // Too far ahead for a forecast: use what actually happened on the same dates in a past year.
  let shift = 1;
  while (addDays(start, -365 * shift) > addDays(today(), -7) || addDays(end, -365 * shift) > addDays(today(), -7)) shift++;
  const s = addDays(start, -365 * shift);
  const e = addDays(end, -365 * shift);
  type A = { daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_sum: number[] } };
  const d = await getJson<A>(
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&start_date=${s}&end_date=${e}`,
  );
  return {
    basis: 'last_year',
    note: `Dates are beyond forecast range. These are observed values from ${s} to ${e}, shifted to the trip dates. Treat as typical, not predicted.`,
    days: d.daily.time.map((_, i) => ({
      date: addDays(start, i),
      highC: d.daily.temperature_2m_max[i],
      lowC: d.daily.temperature_2m_min[i],
      rainChancePct: d.daily.precipitation_sum[i] == null ? null : d.daily.precipitation_sum[i] >= 1 ? 60 : 15,
      conditions: d.daily.precipitation_sum[i] >= 1 ? 'wet day' : 'mostly dry',
    })),
  };
}
