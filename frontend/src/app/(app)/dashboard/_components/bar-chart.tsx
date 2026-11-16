'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartRow } from '@/lib/dashboard';

// DESIGN.md §7 "Chart". One series of counts, so one hue (chart-3) and no legend: the panel
// title names the series. Thin horizontal bars with a 4px rounded data end, the value written
// at the end of each bar, recessive axes, a hover tooltip, and a screen-reader table carrying
// the same numbers (the chart itself is aria-hidden).

const BAR = 14;
const ROW = 30;

/** Only what the tooltip reads from Recharts' content props. */
interface TooltipInput {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
}

function ChartTooltip({ active, payload }: TooltipInput) {
  const row = active ? (payload?.[0]?.payload as ChartRow | undefined) : undefined;
  if (!row) return null;
  return (
    <div className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm shadow-md">
      <span className="text-fg-secondary">{row.label}</span>{' '}
      <span className="font-mono text-foreground tabular-nums">{row.value}</span>
    </div>
  );
}

export function HorizontalBarChart({
  rows,
  caption,
  unit,
}: {
  rows: ChartRow[];
  /** Names the table for screen readers, e.g. "Active users by role". */
  caption: string;
  /** Header of the value column, e.g. "Users". */
  unit: string;
}) {
  const height = Math.max(rows.length, 1) * ROW + 8;
  return (
    <figure className="flex flex-col">
      <div aria-hidden="true" className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height }}>
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 40, bottom: 4, left: 0 }}
            barSize={BAR}
          >
            <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="2 4" />
            <XAxis type="number" hide allowDecimals={false} domain={[0, 'dataMax']} />
            <YAxis
              type="category"
              dataKey="label"
              width={104}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--fg-2)', fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: 'var(--surface-2)' }}
              content={(props) => <ChartTooltip {...props} />}
              isAnimationActive={false}
            />
            <Bar
              dataKey="value"
              fill="var(--chart-3)"
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="value"
                position="right"
                className="font-mono"
                fill="var(--fg-2)"
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Group</th>
            <th scope="col">{unit}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{r.label}</th>
              <td>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
