import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { Plus, Users, Search } from "lucide-react";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function KundenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const statusFilter = sp.status;

  const where: any = {};
  if (q) {
    where.OR = [
      { firstName: { contains: q } },
      { lastName: { contains: q } },
      { email: { contains: q } },
      { phone: { contains: q } },
    ];
  }
  if (statusFilter) where.statusId = statusFilter;

  const [customers, statuses] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { status: true, tags: true, _count: { select: { shootings: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.customerStatus.findMany({ orderBy: { position: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Deine Menschen"
        title="Kunden"
        subtitle="Alle Interessenten, Buchungen und Stammkunden an einem Ort."
      >
        <Link href="/kunden/neu" className="btn-accent">
          <Plus size={16} /> Neue Kundin
        </Link>
      </PageHeader>

      <form className="card flex items-center gap-2 p-3 mb-6">
        <div className="flex-1 flex items-center gap-2 px-2">
          <Search size={16} className="text-smoke" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Suchen nach Name, E-Mail, Telefon…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-smoke/60"
          />
        </div>
        <select name="status" defaultValue={statusFilter ?? ""} className="select w-44">
          <option value="">Alle Status</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <button className="btn-primary">Filtern</button>
      </form>

      {customers.length === 0 ? (
        <EmptyState
          icon={<Users size={36} strokeWidth={1.25} />}
          title="Noch keine Kundin angelegt"
          description="Lege deinen ersten Kontakt an — Interessent oder schon gebucht."
          action={
            <Link href="/kunden/neu" className="btn-accent">
              <Plus size={16} /> Erste Kundin anlegen
            </Link>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Name</th>
                <th className="table-th">Kontakt</th>
                <th className="table-th">Status</th>
                <th className="table-th">Tags</th>
                <th className="table-th text-right">Shootings</th>
                <th className="table-th">Aktualisiert</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="table-row group cursor-pointer">
                  <td className="table-td">
                    <Link href={`/kunden/${c.id}`} className="flex items-center gap-3">
                      <Avatar url={c.avatarUrl} firstName={c.firstName} lastName={c.lastName} />
                      <div>
                        <div className="font-medium">{c.firstName} {c.lastName}</div>
                        {c.source && <div className="text-xs text-smoke mt-0.5">{c.source}</div>}
                      </div>
                    </Link>
                  </td>
                  <td className="table-td text-smoke">
                    {c.email && <div>{c.email}</div>}
                    {c.phone && <div className="text-xs">{c.phone}</div>}
                  </td>
                  <td className="table-td">
                    {c.status ? (
                      <StatusBadge label={c.status.label} color={c.status.color} />
                    ) : (
                      <span className="text-xs text-smoke">—</span>
                    )}
                  </td>
                  <td className="table-td">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <span
                          key={t.id}
                          className="badge"
                          style={{ background: `${t.color}12`, color: t.color }}
                        >
                          {t.label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="table-td text-right tabular-nums font-medium">
                    {c._count.shootings}
                  </td>
                  <td className="table-td text-smoke text-xs">{formatDate(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
