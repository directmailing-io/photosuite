"use server";

import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/upload";
import { generateSlug } from "@/lib/slug";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function s(v: FormDataEntryValue | null): string | undefined {
  if (v == null) return undefined;
  const t = String(v).trim();
  return t === "" ? undefined : t;
}
function num(v: FormDataEntryValue | null): number | undefined {
  const str = s(v);
  if (str == null) return undefined;
  const n = Number(str.replace(",", "."));
  return isNaN(n) ? undefined : n;
}
function dt(v: FormDataEntryValue | null): Date | null | undefined {
  const str = s(v);
  if (str == null) return undefined;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// FormData liefert `addons` als "id:qty"-Pairs. Wir parsen + dedupen (gewinnt die letzte Eingabe).
function parseAddons(formData: FormData): Array<{ addonId: string; quantity: number }> {
  const raw = formData.getAll("addons").map(String);
  const map = new Map<string, number>();
  for (const entry of raw) {
    const [id, q] = entry.split(":");
    if (!id) continue;
    const qty = Math.max(1, Math.min(99, Number(q) || 1));
    map.set(id, qty);
  }
  return Array.from(map.entries()).map(([addonId, quantity]) => ({ addonId, quantity }));
}

export async function createShooting(formData: FormData) {
  const customerId = s(formData.get("customerId"));
  const title = s(formData.get("title"));
  const price = num(formData.get("price"));
  const packageId = s(formData.get("packageId"));
  if (!customerId || !title || price == null) {
    throw new Error("Kunde, Titel und Preis sind Pflicht.");
  }

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  const status = await prisma.shootingStatus.findFirst({
    where: { isDefault: true },
    orderBy: { position: "asc" },
  });
  const pkg = packageId
    ? await prisma.package.findUnique({
        where: { id: packageId },
        include: {
          checklistTemplates: { include: { items: true } },
          defaultTeam: true,
          defaultQuestionnaires: { include: { fields: { orderBy: { position: "asc" } } } },
        },
      })
    : null;

  const slug = generateSlug(customer ? customer.firstName : "shooting");

  // Add-Ons mit Preis-Snapshot vorbereiten
  const addonInput = parseAddons(formData);
  const addonRecords = addonInput.length
    ? await prisma.addon.findMany({ where: { id: { in: addonInput.map((a) => a.addonId) } } })
    : [];
  const addonsToCreate = addonInput
    .map((bo, idx) => {
      const ad = addonRecords.find((r) => r.id === bo.addonId);
      if (!ad) return null;
      return {
        addonId: bo.addonId,
        quantity: bo.quantity,
        unitPrice: ad.price,
        position: idx,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Override-Team aus Form, sonst Paket-Default, sonst Owner als Fallback
  const formTeamIds = formData.getAll("teamIds").map(String).filter(Boolean);
  const formPrimaryId = s(formData.get("primaryContactId"));
  let teamIds = formTeamIds.length > 0 ? formTeamIds : pkg?.defaultTeam.map((m) => m.id) ?? [];
  let primaryId = formPrimaryId ?? pkg?.primaryContactId ?? null;
  if (!primaryId && teamIds.length === 0) {
    const owner = await prisma.teamMember.findFirst({ where: { isOwner: true } });
    if (owner) {
      primaryId = owner.id;
      teamIds = [owner.id];
    }
  } else if (primaryId && !teamIds.includes(primaryId)) {
    teamIds.push(primaryId);
  }

  const shooting = await prisma.shooting.create({
    data: {
      title,
      publicSlug: slug,
      customerId,
      packageId: packageId,
      statusId: s(formData.get("statusId")) ?? status?.id,
      description: s(formData.get("description")) ?? pkg?.description ?? null,
      scheduledAt: dt(formData.get("scheduledAt")) ?? null,
      durationMin: num(formData.get("durationMin")),
      location: s(formData.get("location")),
      price,
      depositAmount: num(formData.get("depositAmount")),
      paymentTerms: s(formData.get("paymentTerms")),
      primaryContactId: primaryId,
      team: teamIds.length ? { connect: teamIds.map((id) => ({ id })) } : undefined,
      addons: addonsToCreate.length ? { create: addonsToCreate } : undefined,
      // Checklisten aus Paket-Templates kopieren (mit Audience)
      checklists: pkg && pkg.checklistTemplates.length > 0 ? {
        create: pkg.checklistTemplates.map((tpl) => ({
          title: tpl.title,
          audience: tpl.audience,
          position: tpl.position,
          items: { create: tpl.items.map((it) => ({ label: it.label, position: it.position })) },
        })),
      } : undefined,
      // Fragebögen aus Paket-Vorlagen kopieren (als DRAFT)
      questionnaires: pkg && pkg.defaultQuestionnaires.length > 0 ? {
        create: pkg.defaultQuestionnaires.map((tpl, i) => ({
          title: tpl.title,
          description: tpl.description,
          position: i,
          fields: {
            create: tpl.fields.map((f) => ({
              type: f.type,
              label: f.label,
              helpText: f.helpText,
              required: f.required,
              options: f.options,
              position: f.position,
            })),
          },
        })),
      } : undefined,
      // Wenn ein erster Termin im Form mitgegeben — auch als ShootingDate anlegen
      dates: dt(formData.get("scheduledAt"))
        ? { create: [{
            label: "Shooting",
            startAt: dt(formData.get("scheduledAt"))!,
            location: s(formData.get("location")),
            position: 0,
          }]}
        : undefined,
    },
  });

  await prisma.activity.create({
    data: { kind: "shooting_created", message: `Shooting angelegt: ${title}`, shootingId: shooting.id, customerId },
  });

  // In verbundene externe Kalender pushen (best-effort, blockiert nicht)
  if (shooting.scheduledAt) {
    const { pushShootingToCalendar } = await import("@/lib/calendar/sync");
    const owner = await prisma.user.findFirst({ select: { id: true } });
    if (owner) {
      const end = new Date(shooting.scheduledAt.getTime() + (shooting.durationMin ?? 60) * 60_000);
      await pushShootingToCalendar(owner.id, {
        shootingId: shooting.id,
        title: shooting.title,
        startAt: shooting.scheduledAt,
        endAt: end,
        location: shooting.location,
      }).catch(() => { /* best-effort */ });
    }
  }

  revalidatePath("/shootings");
  revalidatePath(`/kunden/${customerId}`);
  redirect(`/shootings/${shooting.id}`);
}

export async function updateShooting(id: string, formData: FormData) {
  const existing = await prisma.shooting.findUnique({ where: { id } });
  if (!existing) throw new Error("Shooting nicht gefunden");

  const newStatusId = s(formData.get("statusId"));
  const teamIds = formData.getAll("teamIds").map(String).filter(Boolean);
  const primaryId = s(formData.get("primaryContactId"));

  // Add-Ons: vorhandene Buchungen behalten Snapshot-Preis, neue holen aktuellen Addon.price.
  const addonInput = parseAddons(formData);
  const existingBookings = await prisma.shootingAddon.findMany({ where: { shootingId: id } });
  const addonRecords = addonInput.length
    ? await prisma.addon.findMany({ where: { id: { in: addonInput.map((a) => a.addonId) } } })
    : [];

  await prisma.$transaction(async (tx) => {
    const wanted = new Set(addonInput.map((a) => a.addonId));
    const removeIds = existingBookings.filter((b) => !wanted.has(b.addonId)).map((b) => b.id);
    if (removeIds.length) {
      await tx.shootingAddon.deleteMany({ where: { id: { in: removeIds } } });
    }
    for (let i = 0; i < addonInput.length; i++) {
      const bo = addonInput[i];
      const existingBooking = existingBookings.find((b) => b.addonId === bo.addonId);
      if (existingBooking) {
        await tx.shootingAddon.update({
          where: { id: existingBooking.id },
          data: { quantity: bo.quantity, position: i },
        });
      } else {
        const ad = addonRecords.find((r) => r.id === bo.addonId);
        if (!ad) continue;
        await tx.shootingAddon.create({
          data: {
            shootingId: id,
            addonId: bo.addonId,
            quantity: bo.quantity,
            unitPrice: ad.price,
            position: i,
          },
        });
      }
    }
  });

  const updated = await prisma.shooting.update({
    where: { id },
    data: {
      title: s(formData.get("title")) ?? existing.title,
      packageId: s(formData.get("packageId")) ?? null,
      statusId: newStatusId ?? existing.statusId,
      description: s(formData.get("description")) ?? null,
      scheduledAt: dt(formData.get("scheduledAt")) ?? null,
      durationMin: num(formData.get("durationMin")) ?? null,
      location: s(formData.get("location")) ?? null,
      price: num(formData.get("price")) ?? existing.price,
      depositAmount: num(formData.get("depositAmount")) ?? null,
      depositPaid: formData.get("depositPaid") === "on",
      finalPaid: formData.get("finalPaid") === "on",
      paymentTerms: s(formData.get("paymentTerms")) ?? null,
      primaryContactId: primaryId ?? null,
      team: { set: teamIds.map((id) => ({ id })) },
    },
  });

  if (existing.statusId !== updated.statusId) {
    const oldS = existing.statusId ? await prisma.shootingStatus.findUnique({ where: { id: existing.statusId } }) : null;
    const newS = updated.statusId ? await prisma.shootingStatus.findUnique({ where: { id: updated.statusId } }) : null;
    await prisma.activity.create({
      data: {
        kind: "shooting_status_changed",
        message: `Status: ${oldS?.label ?? "—"} → ${newS?.label ?? "—"}`,
        shootingId: id,
        customerId: updated.customerId,
      },
    });
  }
  if (!existing.depositPaid && updated.depositPaid) {
    await prisma.activity.create({
      data: { kind: "payment_received", message: `Anzahlung verbucht`, shootingId: id, customerId: updated.customerId },
    });
  }
  if (!existing.finalPaid && updated.finalPaid) {
    await prisma.activity.create({
      data: { kind: "payment_received", message: `Restbetrag verbucht`, shootingId: id, customerId: updated.customerId },
    });
  }

  revalidatePath(`/shootings/${id}`);
  revalidatePath("/shootings");
}

export async function deleteShooting(id: string) {
  const sh = await prisma.shooting.findUnique({ where: { id } });
  await prisma.shooting.delete({ where: { id } });
  revalidatePath("/shootings");
  if (sh) revalidatePath(`/kunden/${sh.customerId}`);
  redirect("/shootings");
}

export async function moveShootingToStatus(shootingId: string, statusId: string, position: number) {
  await prisma.shooting.update({
    where: { id: shootingId },
    data: { statusId, kanbanPosition: position },
  });
  revalidatePath("/shootings");
}

// Im Kalender per Drag-and-Drop verschoben:
// Tageswechsel — behält die ursprüngliche Uhrzeit, ändert nur Datum.
// Synchronisiert das primäre ShootingDate (label="Shooting", beim Anlegen automatisch erzeugt),
// damit Detailansicht + Kundenansicht synchron bleiben.
// Zusätzlich: alle exakt auf dem alten Termin liegenden ShootingDates werden mitgezogen
// (z.B. wenn die Kundin manuell ein Date am Shootingtag hinzugefügt hat).
// Manuell platzierte Dates (Fitting, Bildauswahl an anderen Tagen) bleiben unberührt.
export async function moveShootingToDate(shootingId: string, isoDate: string) {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("Ungültiges Datum");
  const sh = await prisma.shooting.findUnique({ where: { id: shootingId } });
  if (!sh) throw new Error("Shooting nicht gefunden");
  const original = sh.scheduledAt;
  const next = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    original?.getHours() ?? 10,
    original?.getMinutes() ?? 0,
    0,
    0,
  );

  function shiftToTargetDay(d: Date): Date {
    return new Date(next.getFullYear(), next.getMonth(), next.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  }

  const { pushShootingToCalendar } = await import("@/lib/calendar/sync");

  await prisma.$transaction(async (tx) => {
    await tx.shooting.update({
      where: { id: shootingId },
      data: { scheduledAt: next },
    });

    // 1) Das primäre Shooting-Date (Label "Shooting" — beim Anlegen automatisch erzeugt)
    //    immer mitziehen. Robust auch wenn ein früherer Sync verloren ging.
    const primary = await tx.shootingDate.findFirst({
      where: { shootingId, label: "Shooting" },
    });
    if (primary) {
      await tx.shootingDate.update({
        where: { id: primary.id },
        data: {
          startAt: shiftToTargetDay(primary.startAt),
          endAt: primary.endAt ? shiftToTargetDay(primary.endAt) : null,
        },
      });
    }

    // 2) Zusätzliche Dates, die exakt auf dem alten scheduledAt liegen (Edge case:
    //    mehrere Dates am gleichen Zeitpunkt) — auch mitziehen, primary ausgenommen.
    if (original) {
      const delta = next.getTime() - original.getTime();
      const exact = await tx.shootingDate.findMany({
        where: {
          shootingId,
          startAt: original,
          ...(primary ? { NOT: { id: primary.id } } : {}),
        },
      });
      for (const d of exact) {
        await tx.shootingDate.update({
          where: { id: d.id },
          data: {
            startAt: next,
            endAt: d.endAt ? new Date(d.endAt.getTime() + delta) : null,
          },
        });
      }
    }
  });

  revalidatePath("/shootings");
  revalidatePath(`/shootings/${shootingId}`);
  if (sh.customerId) revalidatePath(`/kunden/${sh.customerId}`);
  // Customer-Portal: das Shooting hat einen publicSlug
  if (sh.publicSlug) revalidatePath(`/k/${sh.publicSlug}`);

  // Push in verbundene externe Kalender (Google, CalDAV) — best-effort
  const fresh = await prisma.shooting.findUnique({ where: { id: shootingId } });
  if (fresh?.scheduledAt) {
    const owner = await prisma.user.findFirst({ select: { id: true } });
    if (owner) {
      const end = new Date(fresh.scheduledAt.getTime() + (fresh.durationMin ?? 60) * 60_000);
      await pushShootingToCalendar(owner.id, {
        shootingId: fresh.id,
        title: fresh.title,
        startAt: fresh.scheduledAt,
        endAt: end,
        location: fresh.location,
      }).catch(() => { /* best-effort */ });
    }
  }
}

// ---------- Termine ----------

export async function addShootingDate(shootingId: string, formData: FormData) {
  const label = s(formData.get("label"));
  const startAt = dt(formData.get("startAt"));
  if (!label || !startAt) throw new Error("Bezeichnung und Startzeit sind Pflicht.");
  const max = await prisma.shootingDate.findFirst({
    where: { shootingId },
    orderBy: { position: "desc" },
  });
  await prisma.shootingDate.create({
    data: {
      shootingId,
      label,
      startAt,
      endAt: dt(formData.get("endAt")) ?? null,
      location: s(formData.get("location")),
      locationUrl: s(formData.get("locationUrl")),
      description: s(formData.get("description")),
      position: (max?.position ?? -1) + 1,
    },
  });
  // Wenn das Shooting noch kein primäres scheduledAt hat, übernehmen
  const sh = await prisma.shooting.findUnique({ where: { id: shootingId } });
  if (sh && !sh.scheduledAt) {
    await prisma.shooting.update({
      where: { id: shootingId },
      data: { scheduledAt: startAt, location: s(formData.get("location")) },
    });
  }
  revalidatePath(`/shootings/${shootingId}`);
}

export async function updateShootingDate(id: string, shootingId: string, formData: FormData) {
  const startAt = dt(formData.get("startAt"));
  if (!startAt) throw new Error("Startzeit ist Pflicht.");
  await prisma.shootingDate.update({
    where: { id },
    data: {
      label: s(formData.get("label")) ?? "Termin",
      startAt,
      endAt: dt(formData.get("endAt")) ?? null,
      location: s(formData.get("location")) ?? null,
      locationUrl: s(formData.get("locationUrl")) ?? null,
      description: s(formData.get("description")) ?? null,
    },
  });
  revalidatePath(`/shootings/${shootingId}`);
}

export async function deleteShootingDate(id: string, shootingId: string) {
  await prisma.shootingDate.delete({ where: { id } });
  revalidatePath(`/shootings/${shootingId}`);
}

// ---------- Strukturierte Notizen ----------

export async function addShootingNote(shootingId: string, formData: FormData) {
  const text = s(formData.get("text"));
  const status = s(formData.get("status")) ?? "OPEN";
  if (!text) return;
  await prisma.shootingNote.create({
    data: { shootingId, text, status },
  });
  revalidatePath(`/shootings/${shootingId}`);
}

export async function setShootingNoteStatus(id: string, status: string, shootingId: string) {
  if (!["OPEN", "DONE", "IMPORTANT"].includes(status)) return;
  await prisma.shootingNote.update({ where: { id }, data: { status } });
  revalidatePath(`/shootings/${shootingId}`);
}

export async function deleteShootingNote(id: string, shootingId: string) {
  await prisma.shootingNote.delete({ where: { id } });
  revalidatePath(`/shootings/${shootingId}`);
}

// ---------- Checklisten ----------

export async function addChecklist(shootingId: string, formData: FormData) {
  const title = s(formData.get("title"));
  const audience = s(formData.get("audience")) === "CUSTOMER" ? "CUSTOMER" : "INTERNAL";
  if (!title) return;
  const max = await prisma.checklist.findFirst({
    where: { shootingId },
    orderBy: { position: "desc" },
  });
  await prisma.checklist.create({
    data: { shootingId, title, audience, position: (max?.position ?? -1) + 1 },
  });
  revalidatePath(`/shootings/${shootingId}`);
}

export async function setChecklistAudience(checklistId: string, audience: string, shootingId: string) {
  if (!["INTERNAL", "CUSTOMER"].includes(audience)) return;
  await prisma.checklist.update({ where: { id: checklistId }, data: { audience } });
  revalidatePath(`/shootings/${shootingId}`);
}

export async function setChecklistItemDeadline(itemId: string, dueAt: string | null, shootingId: string) {
  await prisma.checklistItem.update({
    where: { id: itemId },
    data: { dueAt: dueAt ? new Date(dueAt) : null },
  });
  revalidatePath(`/shootings/${shootingId}`);
  revalidatePath(`/aufgaben`);
}

export async function deleteChecklist(checklistId: string, shootingId: string) {
  await prisma.checklist.delete({ where: { id: checklistId } });
  revalidatePath(`/shootings/${shootingId}`);
}

export async function addChecklistItem(checklistId: string, shootingId: string, formData: FormData) {
  const label = s(formData.get("label"));
  const dueAt = s(formData.get("dueAt"));
  if (!label) return;
  const max = await prisma.checklistItem.findFirst({
    where: { checklistId },
    orderBy: { position: "desc" },
  });
  await prisma.checklistItem.create({
    data: {
      checklistId,
      label,
      dueAt: dueAt ? new Date(dueAt) : null,
      position: (max?.position ?? -1) + 1,
    },
  });
  revalidatePath(`/shootings/${shootingId}`);
  revalidatePath(`/aufgaben`);
}

export async function toggleChecklistItem(itemId: string, done: boolean, shootingId: string) {
  await prisma.checklistItem.update({ where: { id: itemId }, data: { done } });
  revalidatePath(`/shootings/${shootingId}`);
  revalidatePath(`/aufgaben`);
}

export async function deleteChecklistItem(itemId: string, shootingId: string) {
  await prisma.checklistItem.delete({ where: { id: itemId } });
  revalidatePath(`/shootings/${shootingId}`);
}

// ---------- Attachments ----------

export async function addAttachment(shootingId: string, formData: FormData) {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return;
  const r = await saveUpload(file, `shootings/${shootingId}`);
  await prisma.attachment.create({
    data: {
      shootingId,
      url: r.url,
      filename: r.filename,
      sizeBytes: r.sizeBytes,
      mimeType: r.mimeType,
    },
  });
  revalidatePath(`/shootings/${shootingId}`);
}

export async function deleteAttachment(attachmentId: string, shootingId: string) {
  await prisma.attachment.delete({ where: { id: attachmentId } });
  revalidatePath(`/shootings/${shootingId}`);
}
