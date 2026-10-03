type RevenueOrder = { status?: string; total?: number; paidAt?: number; createdAt?: number };
export function revenueSummary(orders: RevenueOrder[], timezone = 'America/New_York', now = Date.now(), days = 28) {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const localDay = (at: number) => { const parts = Object.fromEntries(formatter.formatToParts(new Date(at)).map(p => [p.type, p.value])); return `${parts.year}-${parts.month}-${parts.day}`; };
  const shift = (key: string, delta: number) => new Date(Date.parse(`${key}T12:00:00Z`) + delta * 86400000).toISOString().slice(0, 10);
  const today = localDay(now), dayOfWeek = new Date(`${today}T12:00:00Z`).getUTCDay();
  const weekStart = shift(today, -(dayOfWeek + 6) % 7), previousWeekStart = shift(weekStart, -7), rangeStart = shift(today, 1 - days);
  const daily = Array.from({ length: days }, (_, i) => ({ date: shift(rangeStart, i), gross: 0, orders: 0 })), byDate = new Map(daily.map(d => [d.date, d]));
  let gross = 0, thisWeek = 0, lastWeek = 0, legacyDates = 0, missingDates = 0;
  for (const order of orders) {
    if (order.status !== 'paid' || !Number.isSafeInteger(order.total) || !order.total || order.total < 0) continue;
    const amount = order.total, at = order.paidAt ?? order.createdAt;
    if (at !== undefined && at > now) continue;
    gross += amount;
    if (!Number.isFinite(at)) { missingDates++; continue; }
    if (!Number.isFinite(order.paidAt)) legacyDates++;
    const date = localDay(at!);
    if (date >= weekStart && date <= today) thisWeek += amount;
    if (date >= previousWeekStart && date < weekStart) lastWeek += amount;
    const day = byDate.get(date); if (day) { day.gross += amount; day.orders++; }
  }
  return { gross, thisWeek, lastWeek, daily, timezone, weekStart, previousWeekStart, rangeStart, legacyDates, missingDates };
}
