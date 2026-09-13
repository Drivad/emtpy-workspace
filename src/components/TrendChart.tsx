"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { format, parseISO } from "date-fns";
import type { DailyAggregate } from "@/lib/types";

interface Props {
  title: string;
  data: DailyAggregate[];
  dataKey: keyof DailyAggregate;
  color: string;
  unit: string;
  kind?: "line" | "bar";
  decimals?: number;
}

export function TrendChart({ title, data, dataKey, color, unit, kind = "line", decimals = 0 }: Props) {
  const chartData = data.map((d) => ({
    date: d.date,
    label: format(parseISO(d.date), "d MMM"),
    value: d[dataKey] === null ? null : Number(d[dataKey]),
  }));

  const hasAnyData = chartData.some((d) => d.value !== null);

  return (
    <div className="rounded-lg border border-[var(--gridline)] bg-[var(--surface-1)] p-4">
      <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">{title}</h3>
      {!hasAnyData ? (
        <div className="h-[180px] flex items-center justify-center text-sm text-[var(--text-muted)]">
          No data yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          {kind === "line" ? (
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--gridline)" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="var(--axis-line)"
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                minTickGap={24}
              />
              <YAxis
                stroke="var(--axis-line)"
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                width={40}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--gridline)",
                  fontSize: 12,
                  color: "var(--text-primary)",
                }}
                formatter={(value) => [`${Number(value).toFixed(decimals)} ${unit}`, title]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={{ r: 3, fill: color }}
                connectNulls
              />
            </LineChart>
          ) : (
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--gridline)" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="var(--axis-line)"
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                minTickGap={24}
              />
              <YAxis
                stroke="var(--axis-line)"
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--gridline)",
                  fontSize: 12,
                  color: "var(--text-primary)",
                }}
                formatter={(value) => [`${Number(value).toFixed(decimals)} ${unit}`, title]}
              />
              <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  );
}
