import { CONFIG } from '../config.js';

const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

export function formatMoney(value) {
  return moneyFormatter.format(Math.round(value));
}

export function formatPercent(value, digits = 0) {
  return `${(value * 100).toFixed(digits).replace('.', ',')}%`;
}

export function formatNumber(value, digits = 1) {
  return value.toFixed(digits).replace('.', ',');
}

export function calendarOf(day) {
  const { daysPerMonth, startCalendarMonth, weekdays, monthNames } = CONFIG.time;
  const monthIndex = Math.floor(day / daysPerMonth);
  const absoluteMonth = startCalendarMonth + monthIndex;
  return {
    monthIndex,
    dayOfMonth: (day % daysPerMonth) + 1,
    calendarMonth: absoluteMonth % 12,
    monthName: monthNames[absoluteMonth % 12],
    year: 1 + Math.floor(absoluteMonth / 12),
    weekday: day % 7,
    weekdayName: weekdays[day % 7],
  };
}

export function formatDate(day) {
  const c = calendarOf(day);
  return `${c.weekdayName}, ${c.dayOfMonth} ${c.monthName} · Ano ${c.year}`;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
