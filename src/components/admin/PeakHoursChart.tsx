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
import { CalendarDays, Flame } from "lucide-react";
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
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      {/* 24-Hour Activity Distribution Bar Chart */}
      <div className="animate-fade-in-up stagger-2 interactive-card xl:col-span-7 rounded-2xl bg-white border border-[#9db4c0]/45 p-5 shadow-[0_2px_10px_rgba(37,50,55,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h2 className="text-sm font-semibold text-[#253237]">
              {t.admin.chart24hTitle}
            </h2>
            <p className="text-xs text-[#5c6b73] mt-0.5">
              {t.admin.chart24hSubtitle}
            </p>
          </div>

          {peakWindowSummary ? (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#253237] px-3 py-1 text-xs font-semibold text-[#e0fbfc] border border-[#5c6b73]">
              <Flame className="h-3.5 w-3.5 text-[#c2dfe3]" />
              <span>
                {t.admin.chartPeakWindow(
                  peakWindowSummary.label,
                  peakWindowSummary.sharePercent
                )}
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#e0fbfc] px-3 py-1 text-xs font-medium text-[#5c6b73] border border-[#9db4c0]/45">
              <span>{t.admin.chartAwaitingTelemetry}</span>
            </div>
          )}
        </div>

        <div className="h-[260px] w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={hourlyDistribution}
              margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="rgba(92,107,115,0.16)"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#5c6b73" }}
                interval={2}
                axisLine={{ stroke: "rgba(92,107,115,0.25)" }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#5c6b73" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(224, 251, 252, 0.55)" }}
                contentStyle={{
                  backgroundColor: "#ffffff",
                  border: "1px solid rgba(37,50,55,0.22)",
                  borderRadius: "12px",
                  fontSize: "12px",
                  color: "#253237",
                  boxShadow: "0 10px 26px rgba(37,50,55,0.12)",
                }}
                formatter={(value, name) => {
                  const num = typeof value === "number" ? value : Number(value ?? 0);
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
              <Bar dataKey="queries" radius={[5, 5, 0, 0]} maxBarSize={24}>
                {hourlyDistribution.map((entry) => (
                  <Cell
                    key={`hour-${entry.hour}`}
                    fill={entry.isPeak ? "#253237" : "#c2dfe3"}
                    stroke={entry.isPeak ? "#253237" : "#9db4c0"}
                    strokeWidth={entry.isPeak ? 1.5 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 flex items-center gap-4 text-[11px] text-[#5c6b73]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-xs bg-[#253237]" />
            {t.admin.chartLegendPeak}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-xs bg-[#c2dfe3] border border-[#9db4c0]" />
            {t.admin.chartLegendStandard}
          </span>
        </div>
      </div>

      {/* Day-of-Week Activity & Latency Breakdown */}
      <div className="animate-fade-in-up stagger-3 interactive-card xl:col-span-5 rounded-2xl bg-white border border-[#9db4c0]/45 p-5 shadow-[0_2px_10px_rgba(37,50,55,0.04)]">
        <div className="flex items-start justify-between gap-2 mb-5">
          <div>
            <h2 className="text-sm font-semibold text-[#253237]">
              {t.admin.chartWeeklyTitle}
            </h2>
            <p className="text-xs text-[#5c6b73] mt-0.5">
              {t.admin.chartWeeklySubtitle}
            </p>
          </div>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#e0fbfc] text-[#253237] border border-[#9db4c0]/45">
            <CalendarDays className="h-4 w-4" />
          </span>
        </div>

        <div className="h-[260px] w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={localizedDays}
              margin={{ top: 8, right: 6, left: -18, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="rgba(92,107,115,0.16)"
              />
              <XAxis
                dataKey="localizedDay"
                tick={{ fontSize: 11, fill: "#5c6b73" }}
                axisLine={{ stroke: "rgba(92,107,115,0.25)" }}
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
                  border: "1px solid rgba(37,50,55,0.22)",
                  borderRadius: "12px",
                  fontSize: "12px",
                  color: "#253237",
                }}
              />
              <Bar
                yAxisId="left"
                dataKey="queries"
                name={t.admin.chartLegendVolume}
                fill="#9db4c0"
                stroke="#5c6b73"
                strokeWidth={1}
                radius={[5, 5, 0, 0]}
                maxBarSize={28}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="avgLatencyMs"
                name={t.admin.chartLegendLatency}
                stroke="#253237"
                strokeWidth={2.2}
                dot={{
                  r: 3.8,
                  fill: "#e0fbfc",
                  stroke: "#253237",
                  strokeWidth: 1.8,
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 flex items-center gap-4 text-[11px] text-[#5c6b73]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-xs bg-[#9db4c0] border border-[#5c6b73]/50" />
            {t.admin.chartLegendVolume}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#e0fbfc] border-[1.5px] border-[#253237]" />
            {t.admin.chartLegendLatency}
          </span>
        </div>
      </div>
    </div>
  );
}
