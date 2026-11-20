"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLanguage } from "@/lib/i18n";

export interface HourlyBucket {
  hour: number;
  label: string;
  queries: number;
  tokens: number;
  isPeak: boolean;
}

export interface DayOfWeekBucket {
  day: string;
  queries: number;
  tokens: number;
  avgLatencyMs: number;
}

export interface PeakWindowSummary {
  label: string;
  sharePercent: number;
  peakQueries: number;
}

interface PeakHoursChartProps {
  hourlyDistribution: HourlyBucket[];
  peakWindowSummary: PeakWindowSummary | null;
  dayOfWeekDistribution: DayOfWeekBucket[];
}

export function PeakHoursChart({
  hourlyDistribution,
  peakWindowSummary,
  dayOfWeekDistribution,
}: PeakHoursChartProps) {
  const { t } = useLanguage();

  const localizedDays = useMemo(
    () =>
      dayOfWeekDistribution.map((d) => ({
        ...d,
        localizedDay: t.admin.days[d.day] ?? d.day,
      })),
    [dayOfWeekDistribution, t.admin.days]
  );

  return (
    <section className="grid grid-cols-1 xl:grid-cols-12 gap-10 border-t border-[#253237]/10 pt-8">
      {/* 24-Hour Activity Distribution */}
      <div className="xl:col-span-7 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-[#253237]">
              {t.admin.chart24hTitle}
            </h2>
            <p className="text-sm text-[#5c6b73] mt-0.5">
              {t.admin.chart24hSubtitle}
            </p>
          </div>
          <p className="font-mono text-xs text-[#5c6b73]">
            {peakWindowSummary
              ? t.admin.chartPeakWindow(
                  peakWindowSummary.label,
                  peakWindowSummary.sharePercent
                )
              : t.admin.chartAwaitingTelemetry}
          </p>
        </div>

        <div className="h-[240px] w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={hourlyDistribution}
              margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="rgba(37,50,55,0.08)"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#5c6b73" }}
                interval={2}
                axisLine={{ stroke: "rgba(37,50,55,0.12)" }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#5c6b73" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(37, 50, 55, 0.04)" }}
                contentStyle={{
                  backgroundColor: "#ffffff",
                  border: "1px solid rgba(37,50,55,0.14)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#253237",
                  boxShadow: "0 6px 18px rgba(37,50,55,0.08)",
                }}
                formatter={(value, name) => {
                  const num =
                    typeof value === "number" ? value : Number(value ?? 0);
                  if (name === "queries") {
                    return [
                      t.admin.chartQueriesValue(num.toLocaleString()),
                      t.admin.chartQueriesSeries,
                    ];
                  }
                  return [num.toLocaleString(), String(name)];
                }}
                labelFormatter={(label, payload) => {
                  const item = payload?.[0]?.payload as HourlyBucket | undefined;
                  const tokenNote = item
                    ? t.admin.chartTokensNote(item.tokens.toLocaleString())
                    : "";
                  return `${String(label)} UTC${item?.isPeak ? t.admin.chartPeakTag : ""}${tokenNote}`;
                }}
              />
              <Bar dataKey="queries" radius={[3, 3, 0, 0]} maxBarSize={22}>
                {hourlyDistribution.map((entry) => (
                  <Cell
                    key={`hour-${entry.hour}`}
                    fill={entry.isPeak ? "#253237" : "#c2dfe3"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex items-center gap-4 text-[11px] text-[#5c6b73]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-[#253237]" />
            {t.admin.chartLegendPeak}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-[#c2dfe3]" />
            {t.admin.chartLegendStandard}
          </span>
        </div>
      </div>

      {/* Day-of-Week Activity & Latency Breakdown */}
      <div className="xl:col-span-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[#253237]">
            {t.admin.chartWeeklyTitle}
          </h2>
          <p className="text-sm text-[#5c6b73] mt-0.5">
            {t.admin.chartWeeklySubtitle}
          </p>
        </div>

        <div className="h-[240px] w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={localizedDays}
              margin={{ top: 8, right: 6, left: -18, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="rgba(37,50,55,0.08)"
              />
              <XAxis
                dataKey="localizedDay"
                tick={{ fontSize: 11, fill: "#5c6b73" }}
                axisLine={{ stroke: "rgba(37,50,55,0.12)" }}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#5c6b73" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10, fill: "#5c6b73" }}
                axisLine={false}
                tickLine={false}
                unit="ms"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#ffffff",
                  border: "1px solid rgba(37,50,55,0.14)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#253237",
                  boxShadow: "0 6px 18px rgba(37,50,55,0.08)",
                }}
              />
              <Bar
                yAxisId="left"
                dataKey="queries"
                name={t.admin.chartLegendVolume}
                fill="#c2dfe3"
                radius={[3, 3, 0, 0]}
                maxBarSize={26}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="avgLatencyMs"
                name={t.admin.chartLegendLatency}
                stroke="#253237"
                strokeWidth={2}
                dot={{
                  r: 3,
                  fill: "#ffffff",
                  stroke: "#253237",
                  strokeWidth: 1.5,
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="flex items-center gap-4 text-[11px] text-[#5c6b73]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-[#c2dfe3]" />
            {t.admin.chartLegendVolume}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white border-[1.5px] border-[#253237]" />
            {t.admin.chartLegendLatency}
          </span>
        </div>
      </div>
    </section>
  );
}
