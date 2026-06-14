import type { AnalyticsProcessor, ChartDataPoint } from '../../core';
import { DataSanitizer } from '../../utils/DataSanitizer';
import { addMoney } from '../../utils/CurrencyUtils';
import { getPeriodBoundaries } from '../../utils/DateUtils';

/**
 * CRM conversion / value KPIs — returns a set of named single-value points
 * consumed as cards: win rate, pipeline value, weighted forecast, avg ticket,
 * avg sales cycle (days), new leads in period (with previousValue trend), totals.
 *
 * Note: record-level timestamps are injected by CrmAnalyticsService into
 * `data._createdAt` / `data._updatedAt` (the analytics context only exposes data).
 */
export const crmConversionProcessor: AnalyticsProcessor = (context) => {
  const { rows, params } = context;
  const now = params.referenceDate ? new Date(params.referenceDate) : new Date();
  const tz = params.timeZone || 'UTC';
  const datePreset = params.datePreset || 'thisYear';
  const { currentStart, currentEnd, prevStart, prevEnd } = getPeriodBoundaries(datePreset, now, tz);

  let won = 0, lost = 0, open = 0;
  let pipelineValue = 0, forecast = 0;
  let wonTicketTotal = 0, wonTicketCount = 0;
  let cycleTotalDays = 0, cycleCount = 0;
  let newCurrent = 0, newPrev = 0;

  for (const r of rows) {
    const d = r.data || {};
    const status = String(d.status ?? 'Open');
    if (status === 'Won') won++;
    else if (status === 'Lost' || status === 'Disqualified') lost++;
    else open++;

    const amount = DataSanitizer.extractCurrency(d.latestProposalAmount);
    if (status === 'Open' && amount > 0) {
      pipelineValue = addMoney(pipelineValue, amount);
      const wp = Number(d.latestProposalWinProbability ?? 0);
      if (Number.isFinite(wp) && wp > 0) forecast = addMoney(forecast, amount * (wp / 100));
    }
    if (status === 'Won' && amount > 0) {
      wonTicketTotal = addMoney(wonTicketTotal, amount);
      wonTicketCount++;
    }

    if (status === 'Won' && d._createdAt && d._updatedAt) {
      const start = new Date(d._createdAt).getTime();
      const end = new Date(d._updatedAt).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        cycleTotalDays += (end - start) / 86400000;
        cycleCount++;
      }
    }

    if (d._createdAt) {
      const c = new Date(d._createdAt);
      if (!Number.isNaN(c.getTime())) {
        if (c >= currentStart && c < currentEnd) newCurrent++;
        else if (c >= prevStart && c < prevEnd) newPrev++;
      }
    }
  }

  const closed = won + lost;
  const winRate = closed > 0 ? Math.round((won / closed) * 100) : 0;
  const avgTicket = wonTicketCount > 0 ? wonTicketTotal / wonTicketCount : 0;
  const avgCycle = cycleCount > 0 ? Math.round(cycleTotalDays / cycleCount) : 0;

  const out: ChartDataPoint[] = [
    { name: 'totalLeads', value: rows.length },
    { name: 'openLeads', value: open },
    { name: 'wonLeads', value: won },
    { name: 'winRate', value: winRate },
    { name: 'pipelineValue', value: pipelineValue },
    { name: 'forecast', value: forecast },
    { name: 'avgTicket', value: avgTicket },
    { name: 'avgCycleDays', value: avgCycle },
    { name: 'newLeads', value: newCurrent, previousValue: newPrev },
  ];
  return out;
};
