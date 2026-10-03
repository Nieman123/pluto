import { revenueSummary } from '../../../functions/src/ticketing/revenue.ts';
import { esc, money } from './api.js';

export function revenueChart(root, orders, timezone) {
  let days = 28;
  const render = () => {
    const data = revenueSummary(orders, timezone, Date.now(), days), series = data.daily, max = Math.max(100, ...series.map(d => d.gross));
    const left = 65, right = 880, top = 24, bottom = 204, x = i => left + i * (right - left) / (series.length - 1), y = value => bottom - value / max * (bottom - top);
    const points = series.map((d, i) => `${x(i)},${y(d.gross)}`).join(' '), total = series.reduce((n, d) => n + d.gross, 0);
    const dateLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
    root.innerHTML = `<div class="revenue-heading"><div><p class="eyebrow">REVENUE TRACKING</p><h3>${money(total)} <span>in the last ${days} days</span></h3></div><label>Period<select id="revenue-period">${[7, 28, 90].map(n => `<option value="${n}" ${days === n ? 'selected' : ''}>Last ${n} days</option>`).join('')}</select></label></div><p class="revenue-note">Paid gross sales · ${esc(timezone)} · before refunds, tax and fees</p>
      <svg class="revenue-chart" viewBox="0 0 920 250" role="img" aria-label="Daily gross revenue for the last ${days} days: ${esc(money(total))}. Use the daily figures below for exact values.">
        <defs><linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffbb78" stop-opacity=".3"/><stop offset="100%" stop-color="#ffbb78" stop-opacity=".01"/></linearGradient></defs>
        ${[0, .5, 1].map(t => `<line x1="${left}" y1="${y(max * t)}" x2="${right}" y2="${y(max * t)}" stroke="#ffffff20"/><text x="${left - 10}" y="${y(max * t) + 5}" text-anchor="end">${esc(money(Math.round(max * t)))}</text>`).join('')}
        <polygon points="${left},${bottom} ${points} ${right},${bottom}" fill="url(#revenue-fill)"/><polyline points="${points}" fill="none" stroke="#ffbb78" stroke-width="3" stroke-linejoin="round"/>
        ${series.map((d, i) => `<circle cx="${x(i)}" cy="${y(d.gross)}" r="${d.gross ? 4 : 2}" fill="#ffbb78"><title>${esc(dateLabel(d.date))}: ${esc(money(d.gross))} · ${d.orders} paid orders</title></circle>`).join('')}
        ${[0, Math.floor((series.length - 1) / 2), series.length - 1].map(i => `<text x="${x(i)}" y="235" text-anchor="middle">${esc(dateLabel(series[i].date))}</text>`).join('')}
      </svg>${!total ? '<p>No paid sales in this period.</p>' : ''}${data.legacyDates || data.missingDates ? `<p class="revenue-note">${data.legacyDates} older paid orders use checkout dates; ${data.missingDates} records without dates are excluded from the timeline.</p>` : ''}
      <details class="revenue-values"><summary>View daily revenue figures</summary><div class="table-scroll"><table class="ticket-table"><thead><tr><th scope="col">Date</th><th scope="col">Paid orders</th><th scope="col">Gross revenue</th></tr></thead><tbody>${series.map(d => `<tr><td>${esc(dateLabel(d.date))}</td><td>${d.orders}</td><td>${money(d.gross)}</td></tr>`).join('')}</tbody></table></div></details>`;
    root.querySelector('#revenue-period').onchange = event => { days = Number(event.target.value); render(); root.querySelector('#revenue-period').focus(); };
  };
  render();
}
