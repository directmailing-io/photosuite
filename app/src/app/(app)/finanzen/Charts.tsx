"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const fmt = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function RevenueChart({ data }: { data: { month: string; paid: number; taxes: number }[] }) {
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--stone))" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "rgb(var(--taupe))" }} tickLine={false} axisLine={{ stroke: "rgb(var(--stone))" }} />
          <YAxis tick={{ fontSize: 11, fill: "rgb(var(--taupe))" }} tickLine={false} axisLine={{ stroke: "rgb(var(--stone))" }} tickFormatter={(v) => fmt(v).replace(/,00\s/, " ")} width={70} />
          <Tooltip
            contentStyle={{ background: "rgb(var(--paper))", border: "1px solid rgb(var(--stone))", fontSize: 12, borderRadius: 6 }}
            formatter={(value: any, name: any) => [fmt(Number(value) || 0), name === "paid" ? "Bezahlt" : "Steuern"]}
          />
          <Bar dataKey="paid" fill="rgb(var(--ink))" radius={[4, 4, 0, 0]} />
          <Bar dataKey="taxes" fill="rgb(var(--accent))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatusDonut({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            innerRadius={55}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: "rgb(var(--paper))", border: "1px solid rgb(var(--stone))", fontSize: 12, borderRadius: 6 }}
            formatter={(value: any) => fmt(Number(value) || 0)}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            wrapperStyle={{ fontSize: 11, color: "rgb(var(--taupe))" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
