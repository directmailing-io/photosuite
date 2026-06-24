"use server";

import { prisma } from "@/lib/prisma";
import { auth, requireUserId } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { computeTotals } from "@/lib/invoice/calc";
import { nextInvoiceNumber } from "@/lib/invoiceNumber";
import { emptyIssuer, type IssuerSnapshot } from "@/lib/invoiceSnapshot";
import { centsFromInput } from "@/lib/money";
import { generateUrlToken } from "@/lib/crypto";

function s(v: FormDataEntryValue | null): string | undefined {
  if (v == null) return undefined;
  const t = String(v).trim();
  return t === "" ? undefined : t;
}
function dt(v: FormDataEntryValue | null): Date | null | undefined {
  const str = s(v);
  if (str == null) return undefined;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}
function num(v: FormDataEntryValue | null): number | undefined {
  const str = s(v);
  if (str == null) return undefined;
  const n = Number(String(str).replace(",", "."));
  return isNaN(n) ? undefined : n;
}

async function getUserOrThrow() {
  const { loadCurrentUser } = await import("@/lib/loadUser");
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet");
  const user = await loadCurrentUser(session);
  if (!user) throw new Error("User nicht gefunden");
  return user;
}

function snapshotFromUser(u: Awaited<ReturnType<typeof getUserOrThrow>>): IssuerSnapshot {
  return {
    companyName: u.invoiceCompanyName ?? u.studioName ?? u.name,
    owner: u.invoiceCompanyOwner,
    street: u.invoiceStreet,
    zip: u.invoiceZip,
    city: u.invoiceCity,
    country: u.invoiceCountry,
    taxId: u.invoiceTaxId,
    vatId: u.invoiceVatId,
    isSmallBusiness: u.isSmallBusiness,
    bankName: u.invoiceBankName,
    iban: u.invoiceIban,
    bic: u.invoiceBic,
    email: u.invoiceEmail ?? u.studioEmail,
    phone: u.studioPhone,
    footerNote: u.invoiceFooterNote,
    logoUrl: u.logoUrl,
    logoMimeType: u.logoMimeType,
  };
}

// ---------- DRAFT erstellen ----------

type CreateOptions = {
  customerId: string;
  shootingId?: string;
  kind?: string;            // FINAL | DEPOSIT | INTERIM
  installmentId?: string;   // bei Zahlungsplan-Rate
  preset?: "fullFromShooting" | "depositFromShooting" | "fromInstallment" | "blank";
};

export async function createDraftInvoice(opts: CreateOptions) {
  const user = await getUserOrThrow();
  const userId = user.id;
  // Bei "fromInstallment": shooting + customer aus der Rate ableiten
  let resolvedCustomerId = opts.customerId;
  let resolvedShootingId = opts.shootingId;
  if (opts.preset === "fromInstallment" && opts.installmentId) {
    const inst = await prisma.paymentInstallment.findFirst({
      where: { id: opts.installmentId, schedule: { ownerId: userId } },
      include: { schedule: { include: { shooting: true } } },
    });
    if (!inst) throw new Error("Rate nicht gefunden");
    resolvedShootingId = inst.schedule.shootingId;
    resolvedCustomerId = inst.schedule.shooting.customerId;
  } else if (!resolvedCustomerId && resolvedShootingId) {
    const sh = await prisma.shooting.findFirst({ where: { id: resolvedShootingId, ownerId: userId } });
    if (!sh) throw new Error("Shooting nicht gefunden");
    resolvedCustomerId = sh.customerId;
  }
  if (!resolvedCustomerId) throw new Error("Kunde fehlt");
  const customer = await prisma.customer.findFirst({ where: { id: resolvedCustomerId, ownerId: userId } });
  if (!customer) throw new Error("Kunde nicht gefunden");
  const shooting = resolvedShootingId ? await prisma.shooting.findFirst({
    where: { id: resolvedShootingId, ownerId: userId },
    include: {
      package: true,
      addons: { orderBy: { position: "asc" }, include: { addon: true } },
    },
  }) : null;
  if (resolvedShootingId && !shooting) throw new Error("Shooting nicht gefunden");

  const issuer = snapshotFromUser(user);

  // Empfänger-Adresse
  const recipientName = `${customer.firstName} ${customer.lastName}`;
  const recipientAddress = [
    customer.billingStreet,
    [customer.billingZip, customer.billingCity].filter(Boolean).join(" "),
    customer.billingCountry,
  ].filter(Boolean).join("\n");

  const issueDate = new Date();
  const dueDate = new Date(issueDate);
  dueDate.setDate(dueDate.getDate() + (user.invoicePaymentDueDays ?? 14));

  // Items per Preset
  type SeedItem = { title: string; description: string | null; quantity: number; unit: string | null; unitPriceCents: number; totalCents: number; position: number };
  let items: SeedItem[] = [];
  let kind = opts.kind ?? "FINAL";
  let parentInvoiceId: string | null = null;
  let installmentToLink: string | null = opts.installmentId ?? null;

  if (opts.preset === "fullFromShooting" && shooting) {
    // Paket-Preis ohne Add-Ons (ShootingForm rechnet Add-Ons bewusst NICHT in shooting.price ein,
    // damit beide Posten getrennt in der Rechnung erscheinen).
    items = [{
      title: shooting.package?.name ?? shooting.title,
      description: shooting.package?.description ?? null,
      quantity: 1,
      unit: "Pauschal",
      unitPriceCents: Math.round((shooting.price ?? 0) * 100),
      totalCents: Math.round((shooting.price ?? 0) * 100),
      position: 0,
    }];
    // ShootingAddon.unitPrice ist der Snapshot zum Buchungszeitpunkt — nicht den aktuellen Addon.price nehmen.
    for (const booking of shooting.addons ?? []) {
      const unitCents = Math.round(booking.unitPrice * 100);
      items.push({
        title: booking.addon.name,
        description: booking.addon.description,
        quantity: booking.quantity,
        unit: "Stück",
        unitPriceCents: unitCents,
        totalCents: unitCents * booking.quantity,
        position: items.length,
      });
    }
    kind = "FINAL";
  } else if (opts.preset === "depositFromShooting" && shooting && shooting.depositAmount) {
    items = [{
      title: `Anzahlung — ${shooting.package?.name ?? shooting.title}`,
      description: shooting.package?.name
        ? `Anzahlung für ${shooting.package.name}. Die Schlussrechnung folgt nach Leistungserbringung.`
        : null,
      quantity: 1,
      unit: "Pauschal",
      unitPriceCents: Math.round(shooting.depositAmount * 100),
      totalCents: Math.round(shooting.depositAmount * 100),
      position: 0,
    }];
    kind = "DEPOSIT";
  } else if (opts.preset === "fromInstallment" && opts.installmentId) {
    const inst = await prisma.paymentInstallment.findFirst({
      where: { id: opts.installmentId, schedule: { ownerId: userId } },
      include: { schedule: { include: { shooting: { include: { package: true } } } } },
    });
    if (!inst) throw new Error("Rate nicht gefunden");
    const sh = inst.schedule.shooting;
    items = [{
      title: inst.label,
      description: sh.package ? sh.package.name : null,
      quantity: 1,
      unit: "Pauschal",
      unitPriceCents: inst.amountCents,
      totalCents: inst.amountCents,
      position: 0,
    }];
    kind = inst.kind === "DEPOSIT" ? "DEPOSIT" : inst.kind === "FINAL" ? "FINAL" : "INTERIM";
    installmentToLink = inst.id;
    // bei FINAL: link Anzahlungen aus dem gleichen Schedule
    if (kind === "FINAL") {
      const depInvoices = await prisma.invoice.findMany({
        where: {
          ownerId: userId,
          shootingId: sh.id,
          kind: "DEPOSIT",
          status: { not: "CANCELLED" },
          number: { not: null },
        },
        orderBy: { issueDate: "asc" },
      });
      // erste Anzahlung als parent setzen (für Verkettung in PDF)
      parentInvoiceId = depInvoices[0]?.id ?? null;
    }
  }

  // Beträge
  const vatRate = user.isSmallBusiness ? 0 : (user.defaultVatRate ?? 19);
  const { subtotalCents, vatAmountCents, totalCents } = computeTotals(
    items,
    vatRate,
    user.isSmallBusiness,
  );

  // Bei FINAL: bereits gezahlte Anzahlungen abziehen
  let prepaidCents = 0;
  if (kind === "FINAL" && resolvedShootingId) {
    const deps = await prisma.invoice.findMany({
      where: {
        ownerId: userId,
        shootingId: resolvedShootingId,
        kind: "DEPOSIT",
        status: { not: "CANCELLED" },
        number: { not: null },
      },
    });
    prepaidCents = deps.reduce((sum, d) => sum + d.totalCents, 0);
  }
  const amountDueCents = totalCents - prepaidCents;

  const invoice = await prisma.invoice.create({
    data: {
      customerId: customer.id,
      shootingId: resolvedShootingId ?? null,
      kind,
      status: "DRAFT",
      recipientName,
      recipientAddress,
      issuerSnapshot: JSON.stringify(issuer),
      issueDate,
      serviceDate: shooting?.scheduledAt ?? null,
      dueDate,
      subtotalCents,
      vatRate,
      vatAmountCents,
      totalCents,
      prepaidCents,
      amountDueCents,
      isSmallBusiness: user.isSmallBusiness,
      parentInvoiceId,
      ownerId: userId,
      items: { create: items },
    },
  });

  if (installmentToLink) {
    await prisma.paymentInstallment.update({
      where: { id: installmentToLink },
      data: { invoiceId: invoice.id },
    });
  }

  revalidatePath("/buchhaltung");
  if (resolvedShootingId) revalidatePath(`/shootings/${resolvedShootingId}`);
  revalidatePath(`/kunden/${customer.id}`);
  redirect(`/buchhaltung/${invoice.id}`);
}

// ---------- DRAFT bearbeiten ----------

export async function updateDraftInvoice(id: string, formData: FormData) {
  const user = await getUserOrThrow();
  const userId = user.id;
  const inv = await prisma.invoice.findFirst({
    where: { id, ownerId: userId },
    include: { items: true },
  });
  if (!inv) throw new Error("Rechnung nicht gefunden");
  if (inv.status !== "DRAFT") throw new Error("Nur Entwürfe können bearbeitet werden");

  const isSmallBusiness = formData.get("isSmallBusiness") === "on";
  // Wenn KU aktiv: vatRate=0 erzwingen (sonst wäre Snapshot inkonsistent).
  // Wenn KU aus: vom Form gesendeten Wert nehmen, mindestens defaultVatRate, fallback 19.
  const formVatRate = num(formData.get("vatRate"));
  const vatRate = isSmallBusiness
    ? 0
    : (formVatRate && formVatRate > 0 ? formVatRate : (user.defaultVatRate || 19));

  // Items aus Form (Arrays per Index)
  const titles = formData.getAll("item.title").map(String);
  const descriptions = formData.getAll("item.description").map(String);
  const quantities = formData.getAll("item.quantity").map((v) => Number(String(v).replace(",", ".")));
  const units = formData.getAll("item.unit").map(String);
  const prices = formData.getAll("item.unitPrice").map((v) => centsFromInput(String(v)));

  const items = titles.map((t, i) => ({
    title: t.trim() || "Leistung",
    description: (descriptions[i] ?? "").trim() || null,
    quantity: quantities[i] || 1,
    unit: units[i] || null,
    unitPriceCents: prices[i] || 0,
  }));

  // computeTotals nimmt items mit unitPriceCents+quantity — passt
  const { subtotalCents, vatAmountCents, totalCents } = computeTotals(items as any, vatRate, isSmallBusiness);

  // Snapshots Aussteller — bei DRAFT aktualisieren wir noch
  const issuer = snapshotFromUser(user);

  await prisma.$transaction([
    prisma.invoiceItem.deleteMany({ where: { invoiceId: id } }),
    prisma.invoice.update({
      where: { id },
      data: {
        recipientName: s(formData.get("recipientName")) ?? inv.recipientName,
        recipientAddress: s(formData.get("recipientAddress")) ?? inv.recipientAddress,
        issueDate: dt(formData.get("issueDate")) ?? inv.issueDate,
        serviceDate: dt(formData.get("serviceDate")) ?? null,
        serviceDateEnd: dt(formData.get("serviceDateEnd")) ?? null,
        dueDate: dt(formData.get("dueDate")) ?? inv.dueDate,
        vatRate,
        isSmallBusiness,
        subtotalCents,
        vatAmountCents,
        totalCents,
        prepaidCents: inv.prepaidCents,
        amountDueCents: totalCents - inv.prepaidCents,
        issuerSnapshot: JSON.stringify(issuer),
        internalNote: s(formData.get("internalNote")) ?? null,
        items: {
          create: items.map((it, i) => ({
            title: it.title,
            description: it.description,
            quantity: it.quantity,
            unit: it.unit,
            unitPriceCents: it.unitPriceCents,
            totalCents: Math.round(it.quantity * it.unitPriceCents),
            position: i,
          })),
        },
      },
    }),
  ]);

  revalidatePath(`/buchhaltung/${id}`);
  revalidatePath("/buchhaltung");
}

// ---------- ISSUE (Nummer vergeben, immutable machen) ----------

export async function issueInvoice(id: string) {
  const user = await getUserOrThrow();
  const userId = user.id;
  const inv = await prisma.invoice.findFirst({
    where: { id, ownerId: userId },
    include: { items: true },
  });
  if (!inv) throw new Error("Rechnung nicht gefunden");
  if (inv.status !== "DRAFT") throw new Error("Rechnung wurde bereits ausgestellt");
  if (inv.items.length === 0) throw new Error("Mindestens eine Position erforderlich");
  if (!inv.recipientName.trim()) throw new Error("Empfänger-Name fehlt");

  // Issuer-Validation
  const issuer = JSON.parse(inv.issuerSnapshot);
  if (!issuer.companyName) throw new Error("Firmenname fehlt im Rechnungs-Profil — bitte unter Einstellungen ergänzen.");
  if (!issuer.taxId && !issuer.vatId) {
    throw new Error("Steuernummer oder USt-IdNr fehlt im Rechnungs-Profil.");
  }

  const number = await nextInvoiceNumber(user.id);
  // Bei Stornorechnungen ist online-Bezahlung sinnlos; sonst Token erzeugen,
  // damit der öffentliche /k/r/[token]-Link sofort verfügbar ist.
  const paymentToken = inv.kind === "CANCEL"
    ? inv.paymentToken
    : (inv.paymentToken ?? generateUrlToken());
  await prisma.invoice.update({
    where: { id },
    data: { number, status: "ISSUED", paymentToken },
  });

  revalidatePath(`/buchhaltung/${id}`);
  revalidatePath("/buchhaltung");
  if (inv.shootingId) revalidatePath(`/shootings/${inv.shootingId}`);
}

// ---------- Status-Übergänge ----------

export async function markInvoicePaid(id: string) {
  const userId = await requireUserId();
  const inv = await prisma.invoice.findFirst({ where: { id, ownerId: userId } });
  if (!inv) return;
  await prisma.invoice.update({
    where: { id },
    data: { status: "PAID", paidAt: new Date() },
  });
  if (inv.shootingId) {
    // Verknüpften Installment auch markieren
    const inst = await prisma.paymentInstallment.findFirst({ where: { invoiceId: id } });
    if (inst) await prisma.paymentInstallment.update({ where: { id: inst.id }, data: { paidAt: new Date() } });
    revalidatePath(`/shootings/${inv.shootingId}`);
  }
  revalidatePath(`/buchhaltung/${id}`);
  revalidatePath("/buchhaltung");
}

export async function markInvoiceSent(id: string) {
  const userId = await requireUserId();
  const inv = await prisma.invoice.findFirst({ where: { id, ownerId: userId } });
  if (!inv) throw new Error("Rechnung nicht gefunden");
  await prisma.invoice.update({
    where: { id },
    data: { sentAt: new Date() },
  });
  revalidatePath(`/buchhaltung/${id}`);
}

// ---------- Storno via Korrekturrechnung ----------

export async function cancelInvoice(id: string) {
  const user = await getUserOrThrow();
  const userId = user.id;
  const inv = await prisma.invoice.findFirst({
    where: { id, ownerId: userId },
    include: { items: true, cancelledByInvoice: true },
  });
  if (!inv) throw new Error("Rechnung nicht gefunden");
  if (inv.status === "DRAFT") {
    // Entwurf darf direkt gelöscht werden — noch nichts ausgestellt
    await prisma.invoice.delete({ where: { id } });
    revalidatePath("/buchhaltung");
    redirect("/buchhaltung");
  }
  if (inv.status === "CANCELLED") throw new Error("Rechnung ist bereits storniert");
  if (inv.cancelledByInvoice) throw new Error("Rechnung wurde bereits storniert");

  // Stornorechnung erzeugen mit negativen Beträgen
  const number = await nextInvoiceNumber(user.id);
  const cancel = await prisma.invoice.create({
    data: {
      number,
      kind: "CANCEL",
      status: "ISSUED",
      customerId: inv.customerId,
      shootingId: inv.shootingId,
      recipientName: inv.recipientName,
      recipientAddress: inv.recipientAddress,
      issuerSnapshot: inv.issuerSnapshot,
      issueDate: new Date(),
      serviceDate: inv.serviceDate,
      serviceDateEnd: inv.serviceDateEnd,
      dueDate: new Date(),
      subtotalCents: -inv.subtotalCents,
      vatRate: inv.vatRate,
      vatAmountCents: -inv.vatAmountCents,
      totalCents: -inv.totalCents,
      prepaidCents: 0,
      amountDueCents: -inv.totalCents,
      isSmallBusiness: inv.isSmallBusiness,
      cancelsInvoiceId: inv.id,
      ownerId: userId,
      items: {
        create: inv.items.map((it) => ({
          title: `Storno: ${it.title}`,
          description: it.description,
          quantity: it.quantity,
          unit: it.unit,
          unitPriceCents: -it.unitPriceCents,
          totalCents: -it.totalCents,
          position: it.position,
        })),
      },
    },
  });

  await prisma.invoice.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  revalidatePath("/buchhaltung");
  redirect(`/buchhaltung/${cancel.id}`);
}

// ---------- Profil ----------

export async function updateInvoiceProfile(formData: FormData) {
  const user = await getUserOrThrow();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      invoiceCompanyName: s(formData.get("invoiceCompanyName")) ?? null,
      invoiceCompanyOwner: s(formData.get("invoiceCompanyOwner")) ?? null,
      invoiceStreet: s(formData.get("invoiceStreet")) ?? null,
      invoiceZip: s(formData.get("invoiceZip")) ?? null,
      invoiceCity: s(formData.get("invoiceCity")) ?? null,
      invoiceCountry: s(formData.get("invoiceCountry")) ?? "Deutschland",
      invoiceEmail: s(formData.get("invoiceEmail")) ?? null,
      invoiceTaxId: s(formData.get("invoiceTaxId")) ?? null,
      invoiceVatId: s(formData.get("invoiceVatId")) ?? null,
      isSmallBusiness: formData.get("isSmallBusiness") === "on",
      defaultVatRate: num(formData.get("defaultVatRate")) ?? 19,
      invoiceBankName: s(formData.get("invoiceBankName")) ?? null,
      invoiceIban: s(formData.get("invoiceIban")) ?? null,
      invoiceBic: s(formData.get("invoiceBic")) ?? null,
      invoiceFooterNote: s(formData.get("invoiceFooterNote")) ?? null,
      invoiceNumberFormat: s(formData.get("invoiceNumberFormat")) ?? "{YYYY}-{####}",
      invoicePaymentDueDays: num(formData.get("invoicePaymentDueDays")) ?? 14,
      reminderDays1: num(formData.get("reminderDays1")) ?? 7,
      reminderDays2: num(formData.get("reminderDays2")) ?? 7,
      reminderDays3: num(formData.get("reminderDays3")) ?? 14,
      reminderFee1Cents: centsFromInput(String(formData.get("reminderFee1") ?? "0")),
      reminderFee2Cents: centsFromInput(String(formData.get("reminderFee2") ?? "5")),
      reminderFee3Cents: centsFromInput(String(formData.get("reminderFee3") ?? "10")),
    },
  });
  revalidatePath("/einstellungen");
}

// ---------- Mahnwesen ----------

export async function createReminder(invoiceId: string, level: number) {
  if (![1, 2, 3].includes(level)) throw new Error("Ungültige Mahnstufe");

  const user = await getUserOrThrow();
  const userId = user.id;
  const inv = await prisma.invoice.findFirst({
    where: { id: invoiceId, ownerId: userId },
    include: { reminders: true },
  });
  if (!inv) throw new Error("Rechnung nicht gefunden");
  if (inv.status !== "ISSUED") throw new Error("Nur offene Rechnungen können gemahnt werden.");
  if (inv.kind === "CANCEL") throw new Error("Stornorechnungen können nicht gemahnt werden.");
  if (level !== inv.reminderLevel + 1) {
    throw new Error(`Nächste Mahnstufe ist ${inv.reminderLevel + 1}, nicht ${level}.`);
  }

  // Gebühren + neue Frist aus User-Defaults
  const feeCents = level === 1 ? user.reminderFee1Cents
                : level === 2 ? user.reminderFee2Cents
                : user.reminderFee3Cents;
  const days = level === 1 ? user.reminderDays1
             : level === 2 ? user.reminderDays2
             : user.reminderDays3;
  const newDueDate = new Date();
  newDueDate.setDate(newDueDate.getDate() + days);

  await prisma.$transaction([
    prisma.invoiceReminder.create({
      data: {
        invoiceId,
        level,
        feeCents,
        newDueDate,
        issuedAt: new Date(),
      },
    }),
    prisma.invoice.update({
      where: { id: invoiceId },
      data: { reminderLevel: level },
    }),
  ]);

  revalidatePath(`/buchhaltung/${invoiceId}`);
  revalidatePath(`/buchhaltung`);
  if (inv.shootingId) revalidatePath(`/shootings/${inv.shootingId}`);
  revalidatePath(`/kunden/${inv.customerId}`);
}

export async function markReminderSent(reminderId: string) {
  const userId = await requireUserId();
  // Reminder hat selbst kein ownerId — über invoice joinen
  const r = await prisma.invoiceReminder.findFirst({
    where: { id: reminderId, invoice: { ownerId: userId } },
  });
  if (!r) return;
  await prisma.invoiceReminder.update({ where: { id: reminderId }, data: { sentAt: new Date() } });
  revalidatePath(`/buchhaltung/${r.invoiceId}`);
}

// ---------- Zahlungsplan ----------

export async function upsertPaymentSchedule(shootingId: string, formData: FormData) {
  const userId = await requireUserId();
  const shooting = await prisma.shooting.findFirst({ where: { id: shootingId, ownerId: userId } });
  if (!shooting) throw new Error("Shooting nicht gefunden");

  const labels = formData.getAll("inst.label").map(String);
  const kinds = formData.getAll("inst.kind").map(String);
  const amounts = formData.getAll("inst.amount").map((v) => centsFromInput(String(v)));
  const dues = formData.getAll("inst.dueDate").map((v) => {
    const str = String(v).trim();
    return str === "" ? null : new Date(str);
  });

  await prisma.$transaction(async (tx) => {
    let sched = await tx.paymentSchedule.findUnique({ where: { shootingId } });
    if (!sched) {
      sched = await tx.paymentSchedule.create({ data: { shootingId, ownerId: userId } });
    } else {
      // Behalte Installments, die bereits eine Rechnung haben — sonst löschen
      await tx.paymentInstallment.deleteMany({
        where: { scheduleId: sched.id, invoiceId: null },
      });
    }
    for (let i = 0; i < labels.length; i++) {
      await tx.paymentInstallment.create({
        data: {
          scheduleId: sched.id,
          label: labels[i],
          kind: kinds[i] || "INTERIM",
          amountCents: amounts[i],
          dueDate: dues[i] && !isNaN(dues[i]!.getTime()) ? dues[i] : null,
          position: i,
        },
      });
    }
  });

  revalidatePath(`/shootings/${shootingId}`);
}

export async function deletePaymentSchedule(shootingId: string) {
  const userId = await requireUserId();
  const sched = await prisma.paymentSchedule.findFirst({
    where: { shootingId, ownerId: userId },
  });
  if (!sched) return;
  // Schutz: nicht löschen wenn Rechnungen verknüpft
  const hasInvoices = await prisma.paymentInstallment.findFirst({
    where: { scheduleId: sched.id, invoiceId: { not: null } },
  });
  if (hasInvoices) throw new Error("Es wurden bereits Rechnungen aus diesem Zahlungsplan ausgestellt. Plan kann nicht mehr gelöscht werden.");
  await prisma.paymentSchedule.delete({ where: { id: sched.id } });
  revalidatePath(`/shootings/${shootingId}`);
}
