"use client";

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
  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      {/* 24-Hour Activity Distribution Bar Chart */}
      <div className="xl:col-span-7 rounded-2xl bg-white border border-[#373737]/12 p-5 shadow-[0_2px_10px_rgba(55,55,55,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h2 className="text-sm font-semibold text-[#373737]">
              24-Hour Activity Distribution (Most Used Times)
            </h2>
            <p className="text-xs text-[#373737]/60 mt-0.5">
              Query traffic across UTC hours — top 3 peak hours highlighted in Jasmine
            </p>
          </div>

          {peakWindowSummary ? (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#fce694] px-3 py-1 text-xs font-semibold text-[#373737] border border-[#373737]/25">
              <Flame className="h-3.5 w-3.5" />
              <span>
                Peak Activity Window: {peakWindowSummary.label} (
                {peakWindowSummary.sharePercent}% of traffic)
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#c1dbe3]/45 px-3 py-1 text-xs font-medium text-[#373737]/80">
              <span>Awaiting query telemetry</span>
            </div>
          )}
        </div>

        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={hourlyDistribution}
              margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="rgba(55,55,55,0.09)"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#373737" }}
                interval={2}
                axisLine={{ stroke: "rgba(55,55,55,0.15)" }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#373737" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(193, 219, 227, 0.22)" }}
                contentStyle={{
                  backgroundColor: "#ffffff",
                  border: "1px solid rgba(55,55,55,0.2)",
                  borderRadius: "12px",
                  fontSize: "12px",
                  color: "#373737",
                  boxShadow: "0 8px 24px rgba(55,55,55,0.1)",
                }}
                formatter={(value, name) => {
                  const num = typeof value === "number" ? value : Number(value ?? 0);
                  if (name === "queries") {
                    return [`${num.toLocaleString()} queries`, "Queries"];
                  }
                  return [num.toLocaleString(), String(name)];
                }}
                labelFormatter={(label, payload) => {
                  const item = payload?.[0]?.payload as HourlyBucket | undefined;
                  const tokenNote = item
                    ? ` • ${item.tokens.toLocaleString()} tokens`
                    : "";
                  return `${String(label)} UTC${item?.isPeak ? " (Peak)" : ""}${tokenNote}`;
                }}
              />
              <Bar dataKey="queries" radius={[5, 5, 0, 0]} maxBarSize={24}>
                {hourlyDistribution.map((entry) => (
                  <Cell
                    key={`hour-${entry.hour}`}
                    fill={entry.isPeak ? "#fce694" : "#c1dbe3"}
                    stroke={entry.isPeak ? "#373737" : "rgba(55,55,55,0.22)"}
                    strokeWidth={entry.isPeak ? 1.5 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 flex items-center gap-4 text-[11px] text-[#373737]/70">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-xs bg-[#fce694] border border-[#373737]" />
            Top 3 Peak Hours
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-xs bg-[#c1dbe3] border border-[#373737]/25" />
            Standard Hours
          </span>
        </div>
      </div>

      {/* Day-of-Week Activity & Latency Breakdown */}
      <div className="xl:col-span-5 rounded-2xl bg-white border border-[#373737]/12 p-5 shadow-[0_2px_10px_rgba(55,55,55,0.04)]">
        <div className="flex items-start justify-between gap-2 mb-5">
          <div>
            <h2 className="text-sm font-semibold text-[#373737]">
              Day-of-Week Volume &amp; Latency
            </h2>
            <p className="text-xs text-[#373737]/60 mt-0.5">
              Weekly query count (bars) vs. average response time in ms (line)
            </p>
          </div>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#c7dfc5]/65 text-[#373737]">
            <CalendarDays className="h-4 w-4" />
          </span>
        </div>

        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={dayOfWeekDistribution}
              margin={{ top: 8, right: 6, left: -18, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="rgba(55,55,55,0.09)"
              />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: "#373737" }}
                axisLine={{ stroke: "rgba(55,55,55,0.15)" }}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#373737" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10, fill: "#373737" }}
                axisLine={false}
                tickLine={false}
                unit="ms"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#ffffff",
                  border: "1px solid rgba(55,55,55,0.2)",
                  borderRadius: "12px",
                  fontSize: "12px",
                  color: "#373737",
                }}
              />
              <Bar
                yAxisId="left"
                dataKey="queries"
                name="Queries"
                fill="#c7dfc5"
                stroke="rgba(55,55,55,0.28)"
                strokeWidth={1}
                radius={[5, 5, 0, 0]}
                maxBarSize={28}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="avgLatencyMs"
                name="Avg Latency (ms)"
                stroke="#373737"
                strokeWidth={2}
                dot={{ r: 3.5, fill: "#f6feaa", stroke: "#373737", strokeWidth: 1.5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 flex items-center gap-4 text-[11px] text-[#373737]/70">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-xs bg-[#c7dfc5] border border-[#373737]/25" />
            Query Volume
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#f6feaa] border-[1.5px] border-[#373737]" />
            Avg Latency (ms)
          </span>
        </div>
      </div>
    </div>
  );
}
