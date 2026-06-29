"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
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
  const userId = await requireUserId();
  let customerId = s(formData.get("customerId"));
  const title = s(formData.get("title"));
  const price = num(formData.get("price"));
  const packageId = s(formData.get("packageId"));

  // Inline-Kundin-Anlage: wenn kein customerId, aber Vor- und Nachname befüllt,
  // erst neuen Customer anlegen und dann mit dieser ID weitermachen.
  if (!customerId) {
    const inlineFirst = s(formData.get("inlineCustomerFirstName"));
    const inlineLast = s(formData.get("inlineCustomerLastName"));
    if (inlineFirst && inlineLast) {
      const created = await prisma.customer.create({
        data: {
          ownerId: userId,
          firstName: inlineFirst,
          lastName: inlineLast,
          email: s(formData.get("inlineCustomerEmail")),
          phone: s(formData.get("inlineCustomerPhone")),
        },
        select: { id: true },
      });
      customerId = created.id;
    }
  }

  if (!customerId || !title || price == null) {
    throw new Error("Kundin (auswählen oder anlegen), Titel und Preis sind Pflicht.");
  }

  // Customer-Ownership: niemand darf für fremde Kunden Shootings anlegen.
  const customer = await prisma.customer.findFirst({ where: { id: customerId, ownerId: userId } });
  if (!customer) throw new Error("Kunde nicht gefunden");

  const status = await prisma.shootingStatus.findFirst({
    where: { ownerId: userId, isDefault: true },
    orderBy: { position: "asc" },
  });

  // Package-Ownership: nur eigene Pakete dürfen referenziert werden.
  let safePackageId: string | null = null;
  const pkg = packageId
    ? await prisma.package.findFirst({
        where: { id: packageId, ownerId: userId },
        include: {
          checklistTemplates: { include: { items: true } },
          defaultTeam: true,
          defaultQuestionnaires: { include: { fields: { orderBy: { position: "asc" } } } },
        },
      })
    : null;
  if (pkg) safePackageId = pkg.id;

  // Modular-Modus: optionales Bildpaket. Ownership-Check, kein Throw bei leer.
  const imagePackageIdRaw = s(formData.get("imagePackageId"));
  let safeImagePackageId: string | null = null;
  if (imagePackageIdRaw) {
    const ipkg = await prisma.package.findFirst({
      where: { id: imagePackageIdRaw, ownerId: userId },
      select: { id: true },
    });
    if (ipkg) safeImagePackageId = ipkg.id;
  }

  const slug = generateSlug(customer.firstName);

  // Add-Ons mit Preis-Snapshot vorbereiten — Ownership-Filter auf eigene Add-Ons.
  const addonInput = parseAddons(formData);
  const addonRecords = addonInput.length
    ? await prisma.addon.findMany({
        where: { id: { in: addonInput.map((a) => a.addonId) }, ownerId: userId },
      })
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

  // Override-Team aus Form, sonst Paket-Default, sonst Owner als Fallback.
  // Alle Team-IDs gegen ownerId filtern.
  const formTeamIds = formData.getAll("teamIds").map(String).filter(Boolean);
  const formPrimaryId = s(formData.get("primaryContactId"));
  const requestedTeamIds = formTeamIds.length > 0 ? formTeamIds : pkg?.defaultTeam.map((m) => m.id) ?? [];
  const ownedTeam = requestedTeamIds.length
    ? await prisma.teamMember.findMany({
        where: { id: { in: requestedTeamIds }, ownerId: userId },
        select: { id: true },
      })
    : [];
  let teamIds = ownedTeam.map((m) => m.id);

  let primaryId: string | null = null;
  if (formPrimaryId) {
    const pc = await prisma.teamMember.findFirst({ where: { id: formPrimaryId, ownerId: userId } });
    if (pc) primaryId = pc.id;
  } else if (pkg?.primaryContactId) {
    const pc = await prisma.teamMember.findFirst({ where: { id: pkg.primaryContactId, ownerId: userId } });
    if (pc) primaryId = pc.id;
  }

  if (!primaryId && teamIds.length === 0) {
    const owner = await prisma.teamMember.findFirst({ where: { ownerId: userId, isOwner: true } });
    if (owner) {
      primaryId = owner.id;
      teamIds = [owner.id];
    }
  } else if (primaryId && !teamIds.includes(primaryId)) {
    teamIds.push(primaryId);
  }

  // ShootingStatus-Ownership prüfen, falls statusId mitgegeben.
  const requestedStatusId = s(formData.get("statusId"));
  let safeStatusId: string | undefined = status?.id;
  if (requestedStatusId) {
    const st = await prisma.shootingStatus.findFirst({ where: { id: requestedStatusId, ownerId: userId } });
    if (st) safeStatusId = st.id;
  }

  const shooting = await prisma.shooting.create({
    data: {
      ownerId: userId,
      title,
      publicSlug: slug,
      customerId,
      packageId: safePackageId,
      imagePackageId: safeImagePackageId,
      statusId: safeStatusId,
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
    data: {
      ownerId: userId,
      kind: "shooting_created",
      message: `Shooting angelegt: ${title}`,
      shootingId: shooting.id,
      customerId,
    },
  });

  // In verbundene externe Kalender pushen (best-effort, blockiert nicht)
  if (shooting.scheduledAt) {
    const { pushShootingToCalendar } = await import("@/lib/calendar/sync");
    const end = new Date(shooting.scheduledAt.getTime() + (shooting.durationMin ?? 60) * 60_000);
    await pushShootingToCalendar(userId, {
      shootingId: shooting.id,
      title: shooting.title,
      startAt: shooting.scheduledAt,
      endAt: end,
      location: shooting.location,
    }).catch(() => { /* best-effort */ });
  }

  // Zeitbasierte Workflows (shooting_before/after) für das neue Shooting planen.
  // Fire-and-forget, blockiert das Anlegen nicht.
  if (shooting.scheduledAt) {
    const { scheduleShootingWorkflows } = await import("@/lib/workflow/engine");
    scheduleShootingWorkflows(shooting.id).catch((err) =>
      console.error(`[createShooting] scheduleShootingWorkflows: ${err?.message ?? err}`),
    );
  }

  revalidatePath("/shootings");
  revalidatePath(`/kunden/${customerId}`);
  redirect(`/shootings/${shooting.id}`);
}

/**
 * Inline-Edit-Action für den Shooting-Header (Title / Kundin / Status).
 * Lisa kann die Eckdaten direkt im Header bearbeiten — schmaler als das große Form.
 */
export async function updateShootingMeta(
  id: string,
  patch: { title?: string; customerId?: string; statusId?: string | null },
): Promise<void> {
  const userId = await requireUserId();
  const existing = await prisma.shooting.findFirst({ where: { id, ownerId: userId } });
  if (!existing) throw new Error("Shooting nicht gefunden");

  const data: { title?: string; customerId?: string; statusId?: string | null } = {};

  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new Error("Titel darf nicht leer sein.");
    data.title = title;
  }

  if (patch.customerId !== undefined) {
    const cust = await prisma.customer.findFirst({
      where: { id: patch.customerId, ownerId: userId },
      select: { id: true },
    });
    if (!cust) throw new Error("Kundin nicht gefunden");
    data.customerId = cust.id;
  }

  if (patch.statusId !== undefined) {
    if (patch.statusId === null || patch.statusId === "") {
      data.statusId = null;
    } else {
      const st = await prisma.shootingStatus.findFirst({
        where: { id: patch.statusId, ownerId: userId },
        select: { id: true },
      });
      if (!st) throw new Error("Status nicht gefunden");
      data.statusId = st.id;
    }
  }

  await prisma.shooting.update({ where: { id }, data });
  revalidatePath(`/shootings/${id}`);
  revalidatePath("/shootings");
  revalidatePath("/");
}

export async function updateShooting(id: string, formData: FormData) {
  const userId = await requireUserId();
  const existing = await prisma.shooting.findFirst({ where: { id, ownerId: userId } });
  if (!existing) throw new Error("Shooting nicht gefunden");

  const newStatusId = s(formData.get("statusId"));
  const teamIds = formData.getAll("teamIds").map(String).filter(Boolean);
  const primaryId = s(formData.get("primaryContactId"));
  const packageIdRaw = s(formData.get("packageId"));

  // Package-Ownership prüfen.
  let safePackageId: string | null = null;
  if (packageIdRaw) {
    const pk = await prisma.package.findFirst({ where: { id: packageIdRaw, ownerId: userId } });
    if (pk) safePackageId = pk.id;
  }

  // imagePackageId — leerer String = explicit unset.
  // Default: bestehender Wert wird beibehalten, wenn das Feld nicht im Form ist.
  const imagePackageIdRaw = formData.get("imagePackageId");
  let safeImagePackageId: string | null = existing.imagePackageId;
  if (imagePackageIdRaw !== null) {
    const trimmed = String(imagePackageIdRaw).trim();
    if (trimmed === "") {
      safeImagePackageId = null;
    } else {
      const ipk = await prisma.package.findFirst({
        where: { id: trimmed, ownerId: userId },
        select: { id: true },
      });
      safeImagePackageId = ipk ? ipk.id : existing.imagePackageId;
    }
  }

  // ShootingStatus-Ownership prüfen.
  let safeStatusId: string | null = existing.statusId;
  if (newStatusId) {
    const st = await prisma.shootingStatus.findFirst({ where: { id: newStatusId, ownerId: userId } });
    if (st) safeStatusId = st.id;
  }

  // Team-Ownership: nur eigene Members durchlassen.
  const ownedTeam = teamIds.length
    ? await prisma.teamMember.findMany({
        where: { id: { in: teamIds }, ownerId: userId },
        select: { id: true },
      })
    : [];
  const safeTeamIds = ownedTeam.map((m) => m.id);

  let safePrimaryId: string | null = null;
  if (primaryId) {
    const pc = await prisma.teamMember.findFirst({ where: { id: primaryId, ownerId: userId } });
    if (pc) safePrimaryId = pc.id;
  }

  // Add-Ons: vorhandene Buchungen behalten Snapshot-Preis, neue holen aktuellen Addon.price.
  // Ownership-Filter auf addonRecords.
  const addonInput = parseAddons(formData);
  const existingBookings = await prisma.shootingAddon.findMany({ where: { shootingId: id } });
  const addonRecords = addonInput.length
    ? await prisma.addon.findMany({
        where: { id: { in: addonInput.map((a) => a.addonId) }, ownerId: userId },
      })
    : [];
  // Set der erlaubten Add-On-IDs (eigene), damit Fremde nicht via formData injiziert werden können.
  const allowedAddonIds = new Set(addonRecords.map((r) => r.id));
  const safeAddonInput = addonInput.filter((bo) => allowedAddonIds.has(bo.addonId));

  await prisma.$transaction(async (tx) => {
    const wanted = new Set(safeAddonInput.map((a) => a.addonId));
    const removeIds = existingBookings.filter((b) => !wanted.has(b.addonId)).map((b) => b.id);
    if (removeIds.length) {
      await tx.shootingAddon.deleteMany({ where: { id: { in: removeIds } } });
    }
    for (let i = 0; i < safeAddonInput.length; i++) {
      const bo = safeAddonInput[i];
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
      packageId: safePackageId,
      imagePackageId: safeImagePackageId,
      statusId: safeStatusId,
      description: s(formData.get("description")) ?? null,
      scheduledAt: dt(formData.get("scheduledAt")) ?? null,
      durationMin: num(formData.get("durationMin")) ?? null,
      location: s(formData.get("location")) ?? null,
      price: num(formData.get("price")) ?? existing.price,
      depositAmount: num(formData.get("depositAmount")) ?? null,
      depositPaid: formData.get("depositPaid") === "on",
      finalPaid: formData.get("finalPaid") === "on",
      paymentTerms: s(formData.get("paymentTerms")) ?? null,
      primaryContactId: safePrimaryId,
      // Team-Block in Kundenansicht zeigen? Checkbox-Semantik:
      // wenn das Feld im Form vorhanden ist, wird der Wert übernommen, sonst bestehend.
      showTeamOnPublic: formData.has("showTeamOnPublic")
        ? formData.get("showTeamOnPublic") === "on"
        : existing.showTeamOnPublic,
      team: { set: safeTeamIds.map((id) => ({ id })) },
    },
  });

  if (existing.statusId !== updated.statusId) {
    const oldS = existing.statusId
      ? await prisma.shootingStatus.findFirst({ where: { id: existing.statusId, ownerId: userId } })
      : null;
    const newS = updated.statusId
      ? await prisma.shootingStatus.findFirst({ where: { id: updated.statusId, ownerId: userId } })
      : null;
    await prisma.activity.create({
      data: {
        ownerId: userId,
        kind: "shooting_status_changed",
        message: `Status: ${oldS?.label ?? "—"} → ${newS?.label ?? "—"}`,
        shootingId: id,
        customerId: updated.customerId,
      },
    });
  }
  if (!existing.depositPaid && updated.depositPaid) {
    await prisma.activity.create({
      data: { ownerId: userId, kind: "payment_received", message: `Anzahlung verbucht`, shootingId: id, customerId: updated.customerId },
    });
  }
  if (!existing.finalPaid && updated.finalPaid) {
    await prisma.activity.create({
      data: { ownerId: userId, kind: "payment_received", message: `Restbetrag verbucht`, shootingId: id, customerId: updated.customerId },
    });
  }

  // Bei Änderung des Shooting-Datums: zeitbasierte Workflows neu planen.
  // scheduleShootingWorkflows ist idempotent — cancelt offene Jobs zuerst.
  const oldTime = existing.scheduledAt?.getTime() ?? null;
  const newTime = updated.scheduledAt?.getTime() ?? null;
  if (oldTime !== newTime) {
    const { scheduleShootingWorkflows, cancelShootingWorkflows } = await import("@/lib/workflow/engine");
    if (updated.scheduledAt) {
      scheduleShootingWorkflows(id).catch((err) =>
        console.error(`[updateShooting] scheduleShootingWorkflows: ${err?.message ?? err}`),
      );
    } else {
      // Datum entfernt → alle offenen Jobs cancellen
      cancelShootingWorkflows(id, true).catch((err) =>
        console.error(`[updateShooting] cancelShootingWorkflows: ${err?.message ?? err}`),
      );
    }
  }

  revalidatePath(`/shootings/${id}`);
  revalidatePath("/shootings");
}

export async function deleteShooting(id: string) {
  const userId = await requireUserId();
  const sh = await prisma.shooting.findFirst({ where: { id, ownerId: userId } });
  if (!sh) throw new Error("Shooting nicht gefunden");
  // Zeitbasierte Workflow-Jobs vorher cancellen — Cascade-Delete würde sie zwar
  // auch entfernen, aber wir wollen die Runs explizit auf "cancelled" markieren.
  const { cancelShootingWorkflows } = await import("@/lib/workflow/engine");
  await cancelShootingWorkflows(id, false).catch((err) =>
    console.error(`[deleteShooting] cancelShootingWorkflows: ${err?.message ?? err}`),
  );
  await prisma.shooting.delete({ where: { id } });
  revalidatePath("/shootings");
  revalidatePath(`/kunden/${sh.customerId}`);
  redirect("/shootings");
}

export async function moveShootingToStatus(shootingId: string, statusId: string, position: number) {
  const userId = await requireUserId();
  // Shooting + Status beide auf Ownership prüfen.
  const sh = await prisma.shooting.findFirst({ where: { id: shootingId, ownerId: userId } });
  if (!sh) throw new Error("Shooting nicht gefunden");
  const st = await prisma.shootingStatus.findFirst({ where: { id: statusId, ownerId: userId } });
  if (!st) throw new Error("Status nicht gefunden");
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
  const userId = await requireUserId();
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("Ungültiges Datum");
  const sh = await prisma.shooting.findFirst({ where: { id: shootingId, ownerId: userId } });
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
  const fresh = await prisma.shooting.findFirst({ where: { id: shootingId, ownerId: userId } });
  if (fresh?.scheduledAt) {
    const end = new Date(fresh.scheduledAt.getTime() + (fresh.durationMin ?? 60) * 60_000);
    await pushShootingToCalendar(userId, {
      shootingId: fresh.id,
      title: fresh.title,
      startAt: fresh.scheduledAt,
      endAt: end,
      location: fresh.location,
    }).catch(() => { /* best-effort */ });
  }

  // Zeitbasierte Workflows neu planen (Datum hat sich geändert).
  const { scheduleShootingWorkflows } = await import("@/lib/workflow/engine");
  scheduleShootingWorkflows(shootingId).catch((err) =>
    console.error(`[moveShootingToDate] scheduleShootingWorkflows: ${err?.message ?? err}`),
  );
}

// ---------- Termine ----------

// Sammelt + validiert attachmentIds aus FormData (multiple-Werte als "attachmentIds").
// Nur eigene Anhänge dürfen verlinkt werden (über Shooting-Ownership).
async function safeAttachmentIdsForShooting(
  shootingId: string,
  ownerId: string,
  formData: FormData,
): Promise<string[]> {
  const raw = formData.getAll("attachmentIds").map(String).filter(Boolean);
  if (raw.length === 0) return [];
  const owned = await prisma.attachment.findMany({
    where: { id: { in: raw }, shootingId, shooting: { ownerId } },
    select: { id: true },
  });
  return owned.map((a) => a.id);
}

export async function addShootingDate(shootingId: string, formData: FormData) {
  const userId = await requireUserId();
  // Shooting-Ownership prüfen.
  const sh = await prisma.shooting.findFirst({ where: { id: shootingId, ownerId: userId } });
  if (!sh) throw new Error("Shooting nicht gefunden");
  const label = s(formData.get("label"));
  const startAt = dt(formData.get("startAt"));
  if (!label || !startAt) throw new Error("Bezeichnung und Startzeit sind Pflicht.");
  const endAt = dt(formData.get("endAt")) ?? null;
  const location = s(formData.get("location")) ?? null;
  const description = s(formData.get("description")) ?? null;
  const syncToCalendar = formData.get("syncToCalendar") === "on";
  const max = await prisma.shootingDate.findFirst({
    where: { shootingId },
    orderBy: { position: "desc" },
  });
  const created = await prisma.shootingDate.create({
    data: {
      shootingId,
      label,
      startAt,
      endAt,
      location,
      locationUrl: s(formData.get("locationUrl")),
      description,
      position: (max?.position ?? -1) + 1,
      syncToCalendar,
    },
  });

  // Attachment-Zuordnungen (Multi-Select aus DateForm). Ownership ist via
  // shootingId gesichert — wir setzen shootingDateId nur für Attachments,
  // die zu diesem Shooting gehören.
  const safeAttIds = await safeAttachmentIdsForShooting(shootingId, userId, formData);
  if (safeAttIds.length > 0) {
    await prisma.attachment.updateMany({
      where: { id: { in: safeAttIds }, shootingId },
      data: { shootingDateId: created.id },
    });
  }

  // Calendar-Push (best-effort, kein Throw).
  if (syncToCalendar) {
    try {
      const { pushDateToCalendar } = await import("@/lib/calendar/sync");
      await pushDateToCalendar(userId, {
        dateId: created.id,
        title: label,
        startAt,
        endAt: endAt ?? new Date(startAt.getTime() + 60 * 60_000),
        location,
        description,
      });
    } catch {
      // ignorieren — Sync ist Best-Effort
    }
  }

  // Email-Notify an Kundin (best-effort, opt-in via Checkbox).
  if (formData.get("notifyCustomer") === "on") {
    const { notifyCustomerOfUpdate } = await import("@/lib/email/notify");
    const detail = `${label} am ${startAt.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${location ? ` · ${location}` : ""}`;
    await notifyCustomerOfUpdate({ shootingId, kind: "new_date", detail });
  }

  // Wenn das Shooting noch kein primäres scheduledAt hat, übernehmen
  if (!sh.scheduledAt) {
    await prisma.shooting.update({
      where: { id: shootingId },
      data: { scheduledAt: startAt, location },
    });
  }
  revalidatePath(`/shootings/${shootingId}`);
}

export async function updateShootingDate(id: string, shootingId: string, formData: FormData) {
  const userId = await requireUserId();
  // ShootingDate via Shooting-Ownership absichern.
  const sd = await prisma.shootingDate.findFirst({
    where: { id, shooting: { ownerId: userId } },
  });
  if (!sd) throw new Error("Termin nicht gefunden");
  const startAt = dt(formData.get("startAt"));
  if (!startAt) throw new Error("Startzeit ist Pflicht.");
  const endAt = dt(formData.get("endAt")) ?? null;
  const label = s(formData.get("label")) ?? "Termin";
  const location = s(formData.get("location")) ?? null;
  const description = s(formData.get("description")) ?? null;
  const syncToCalendar = formData.get("syncToCalendar") === "on";

  await prisma.shootingDate.update({
    where: { id },
    data: {
      label,
      startAt,
      endAt,
      location,
      locationUrl: s(formData.get("locationUrl")) ?? null,
      description,
      syncToCalendar,
    },
  });

  // Attachment-Re-Assignment: erst alle aktuellen Zuordnungen lösen, dann neue setzen.
  // Sicher gegen IDOR: safeAttachmentIdsForShooting filtert auf shootingId.
  const safeAttIds = await safeAttachmentIdsForShooting(shootingId, userId, formData);
  await prisma.attachment.updateMany({
    where: { shootingDateId: id, shootingId },
    data: { shootingDateId: null },
  });
  if (safeAttIds.length > 0) {
    await prisma.attachment.updateMany({
      where: { id: { in: safeAttIds }, shootingId },
      data: { shootingDateId: id },
    });
  }

  // Calendar-Sync-Hooks: push wenn syncToCalendar wahr, sonst remove (Wechsel).
  try {
    if (syncToCalendar) {
      const { pushDateToCalendar } = await import("@/lib/calendar/sync");
      await pushDateToCalendar(userId, {
        dateId: id,
        title: label,
        startAt,
        endAt: endAt ?? new Date(startAt.getTime() + 60 * 60_000),
        location,
        description,
      });
    } else if (sd.syncToCalendar) {
      // war vorher gesynct, jetzt nicht mehr → aus Kalender entfernen
      const { removeDateFromCalendar } = await import("@/lib/calendar/sync");
      await removeDateFromCalendar(userId, id);
    }
  } catch {
    // ignorieren — Sync ist Best-Effort
  }

  // Email-Notify bei Update.
  if (formData.get("notifyCustomer") === "on") {
    const { notifyCustomerOfUpdate } = await import("@/lib/email/notify");
    const detail = `${label} am ${startAt.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${location ? ` · ${location}` : ""}`;
    await notifyCustomerOfUpdate({ shootingId, kind: "updated_date", detail });
  }

  revalidatePath(`/shootings/${shootingId}`);
}

export async function deleteShootingDate(id: string, shootingId: string) {
  const userId = await requireUserId();
  const sd = await prisma.shootingDate.findFirst({
    where: { id, shooting: { ownerId: userId } },
  });
  if (!sd) throw new Error("Termin nicht gefunden");
  await prisma.shootingDate.delete({ where: { id } });

  // Wenn der Date gesynct war, auch aus dem Kalender entfernen.
  if (sd.syncToCalendar) {
    try {
      const { removeDateFromCalendar } = await import("@/lib/calendar/sync");
      await removeDateFromCalendar(userId, id);
    } catch {
      // ignorieren
    }
  }
  revalidatePath(`/shootings/${shootingId}`);
}

// ---------- Strukturierte Notizen ----------

// Whitelist erlaubter Kategorie-Werte. Lisa kann später eigene zulassen,
// für jetzt fix definiert — schützt vor Junk-Input.
const NOTE_CATEGORIES = new Set(["ALLGEMEIN", "ERSTGESPRAECH", "BILDAUSWAHL", "RETUSCHE"]);

export async function addShootingNote(shootingId: string, formData: FormData) {
  const userId = await requireUserId();
  const sh = await prisma.shooting.findFirst({ where: { id: shootingId, ownerId: userId } });
  if (!sh) throw new Error("Shooting nicht gefunden");
  const text = s(formData.get("text"));
  const status = s(formData.get("status")) ?? "OPEN";
  const categoryRaw = s(formData.get("category")) ?? "ALLGEMEIN";
  const category = NOTE_CATEGORIES.has(categoryRaw) ? categoryRaw : "ALLGEMEIN";
  if (!text) return;
  await prisma.shootingNote.create({
    data: { shootingId, text, status, category },
  });
  revalidatePath(`/shootings/${shootingId}`);
}

export async function setShootingNoteStatus(id: string, status: string, shootingId: string) {
  const userId = await requireUserId();
  if (!["OPEN", "DONE", "IMPORTANT"].includes(status)) return;
  const note = await prisma.shootingNote.findFirst({
    where: { id, shooting: { ownerId: userId } },
  });
  if (!note) throw new Error("Notiz nicht gefunden");
  await prisma.shootingNote.update({ where: { id }, data: { status } });
  revalidatePath(`/shootings/${shootingId}`);
}

// Nachträglich Kategorie wechseln (z.B. Notiz von „Allgemein" zu „Bildauswahl").
export async function setShootingNoteCategory(id: string, category: string, shootingId: string) {
  const userId = await requireUserId();
  if (!NOTE_CATEGORIES.has(category)) return;
  const note = await prisma.shootingNote.findFirst({
    where: { id, shooting: { ownerId: userId } },
  });
  if (!note) throw new Error("Notiz nicht gefunden");
  await prisma.shootingNote.update({ where: { id }, data: { category } });
  revalidatePath(`/shootings/${shootingId}`);
}

export async function deleteShootingNote(id: string, shootingId: string) {
  const userId = await requireUserId();
  const note = await prisma.shootingNote.findFirst({
    where: { id, shooting: { ownerId: userId } },
  });
  if (!note) throw new Error("Notiz nicht gefunden");
  await prisma.shootingNote.delete({ where: { id } });
  revalidatePath(`/shootings/${shootingId}`);
}

// ---------- Checklisten ----------

export async function addChecklist(shootingId: string, formData: FormData) {
  const userId = await requireUserId();
  const sh = await prisma.shooting.findFirst({ where: { id: shootingId, ownerId: userId } });
  if (!sh) throw new Error("Shooting nicht gefunden");
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
  const userId = await requireUserId();
  if (!["INTERNAL", "CUSTOMER"].includes(audience)) return;
  const cl = await prisma.checklist.findFirst({
    where: { id: checklistId, shooting: { ownerId: userId } },
  });
  if (!cl) throw new Error("Checkliste nicht gefunden");
  await prisma.checklist.update({ where: { id: checklistId }, data: { audience } });
  revalidatePath(`/shootings/${shootingId}`);
}

export async function setChecklistItemDeadline(itemId: string, dueAt: string | null, shootingId: string) {
  const userId = await requireUserId();
  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId, checklist: { shooting: { ownerId: userId } } },
  });
  if (!item) throw new Error("Eintrag nicht gefunden");
  await prisma.checklistItem.update({
    where: { id: itemId },
    data: { dueAt: dueAt ? new Date(dueAt) : null },
  });
  revalidatePath(`/shootings/${shootingId}`);
  revalidatePath(`/aufgaben`);
}

export async function deleteChecklist(checklistId: string, shootingId: string) {
  const userId = await requireUserId();
  const cl = await prisma.checklist.findFirst({
    where: { id: checklistId, shooting: { ownerId: userId } },
  });
  if (!cl) throw new Error("Checkliste nicht gefunden");
  await prisma.checklist.delete({ where: { id: checklistId } });
  revalidatePath(`/shootings/${shootingId}`);
}

export async function addChecklistItem(checklistId: string, shootingId: string, formData: FormData) {
  const userId = await requireUserId();
  const cl = await prisma.checklist.findFirst({
    where: { id: checklistId, shooting: { ownerId: userId } },
  });
  if (!cl) throw new Error("Checkliste nicht gefunden");
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
  const userId = await requireUserId();
  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId, checklist: { shooting: { ownerId: userId } } },
  });
  if (!item) throw new Error("Eintrag nicht gefunden");
  await prisma.checklistItem.update({ where: { id: itemId }, data: { done } });
  revalidatePath(`/shootings/${shootingId}`);
  revalidatePath(`/aufgaben`);
}

export async function deleteChecklistItem(itemId: string, shootingId: string) {
  const userId = await requireUserId();
  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId, checklist: { shooting: { ownerId: userId } } },
  });
  if (!item) throw new Error("Eintrag nicht gefunden");
  await prisma.checklistItem.delete({ where: { id: itemId } });
  revalidatePath(`/shootings/${shootingId}`);
}

// ---------- Attachments ----------

export async function addAttachment(shootingId: string, formData: FormData) {
  const userId = await requireUserId();
  const sh = await prisma.shooting.findFirst({ where: { id: shootingId, ownerId: userId } });
  if (!sh) throw new Error("Shooting nicht gefunden");
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
  const userId = await requireUserId();
  const att = await prisma.attachment.findFirst({
    where: { id: attachmentId, shooting: { ownerId: userId } },
  });
  if (!att) throw new Error("Anhang nicht gefunden");
  await prisma.attachment.delete({ where: { id: attachmentId } });
  revalidatePath(`/shootings/${shootingId}`);
}
