import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // -------- User --------
  const email = process.env.SEED_USER_EMAIL || "lisa@local.crm";
  const password = process.env.SEED_USER_PASSWORD || "lisa";
  const name = process.env.SEED_USER_NAME || "Lisa";
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      name,
      studioName: "Lisa · Boudoir Studio Bamberg",
      studioTagline: "Behind closed doors. Echte Boudoir-Fotografie.",
      studioPhone: "+49 951 1234567",
      studioEmail: "hallo@lisa-boudoir.de",
      studioWebsite: "https://lisa-boudoir.de",
      studioAddress: "Hauptstraße 12\n96047 Bamberg",
      studioInstagram: "@lisa.boudoir",
    },
  });
  console.log(`✓ User: ${email} / ${password}`);

  // -------- Team-Expertise --------
  const expertiseSeed = [
    { label: "Boudoir", color: "#C8102E" },
    { label: "Akt", color: "#9C0822" },
    { label: "Hochzeit", color: "#19191A" },
    { label: "Couples", color: "#7D7878" },
    { label: "Make-up", color: "#9F877F" },
  ];
  for (const e of expertiseSeed) {
    await prisma.teamExpertise.upsert({
      where: { ownerId_label: { ownerId: user.id, label: e.label } },
      update: {},
      create: { ...e, ownerId: user.id },
    });
  }
  console.log(`✓ ${expertiseSeed.length} Team-Expertisen`);

  // -------- Team-Mitglieder --------
  const teamCount = await prisma.teamMember.count({ where: { ownerId: user.id } });
  if (teamCount === 0) {
    const exBoudoir = await prisma.teamExpertise.findUnique({ where: { ownerId_label: { ownerId: user.id, label: "Boudoir" } } });
    const exAkt = await prisma.teamExpertise.findUnique({ where: { ownerId_label: { ownerId: user.id, label: "Akt" } } });
    const exHochzeit = await prisma.teamExpertise.findUnique({ where: { ownerId_label: { ownerId: user.id, label: "Hochzeit" } } });
    const exCouples = await prisma.teamExpertise.findUnique({ where: { ownerId_label: { ownerId: user.id, label: "Couples" } } });
    const exMakeup = await prisma.teamExpertise.findUnique({ where: { ownerId_label: { ownerId: user.id, label: "Make-up" } } });

    await prisma.teamMember.create({
      data: {
        firstName: "Lisa",
        lastName: "Steiner",
        role: "Inhaberin · Fotografin",
        email: "lisa@lisa-boudoir.de",
        phone: "+49 951 1234567",
        bio: "Seit 8 Jahren am Set. Mein Ding: ehrliche, ruhige Boudoir-Bilder, die du dir später noch traust anzuschauen. Studio in Bamberg, ich arbeite mit Tageslicht und einem kleinen, sehr empathischen Team.",
        instagram: "@lisa.boudoir",
        isOwner: true,
        linkedUserId: user.id,
        ownerId: user.id,
        position: 0,
        expertise: { connect: [{ id: exBoudoir!.id }, { id: exAkt!.id }, { id: exCouples!.id }] },
      },
    });
    await prisma.teamMember.create({
      data: {
        firstName: "Mira",
        lastName: "Hoffmann",
        role: "Make-up & Hair",
        email: "mira@example.com",
        phone: "+49 151 87654321",
        bio: "Mira sorgt dafür, dass du dich vor der Kamera wie deine beste Version fühlst — ohne dass du dich danach fremd siehst.",
        instagram: "@mira.beauty",
        position: 1,
        ownerId: user.id,
        expertise: { connect: [{ id: exMakeup!.id }, { id: exBoudoir!.id }] },
      },
    });
    await prisma.teamMember.create({
      data: {
        firstName: "Tom",
        lastName: "Kessler",
        role: "Second Shooter",
        email: "tom@example.com",
        bio: "Tom kommt bei Hochzeiten und größeren Editorials dazu. Schnelles Auge, ruhige Hand.",
        position: 2,
        ownerId: user.id,
        expertise: { connect: [{ id: exHochzeit!.id }, { id: exCouples!.id }] },
      },
    });
    console.log(`✓ 3 Team-Mitglieder (inkl. Eigentümerin)`);
  }

  // -------- Kunden-Status --------
  const customerStatuses = [
    { label: "Interessent", color: "#9F877F", position: 0, isDefault: true },
    { label: "Im Gespräch", color: "#C8102E", position: 1 },
    { label: "Gebucht", color: "#19191A", position: 2 },
    { label: "Bestandskunde", color: "#7D7878", position: 3 },
    { label: "Archiv", color: "#DFDEDA", position: 4 },
  ];
  for (const s of customerStatuses) {
    await prisma.customerStatus.upsert({
      where: { ownerId_label: { ownerId: user.id, label: s.label } },
      update: {},
      create: { ...s, ownerId: user.id },
    });
  }
  console.log(`✓ ${customerStatuses.length} Kundenstatus`);

  // -------- Shooting-Status --------
  const shootingStatuses = [
    { label: "Angefragt", color: "#9F877F", position: 0, isDefault: true },
    { label: "Geplant", color: "#C8102E", position: 1 },
    { label: "Bestätigt", color: "#19191A", position: 2 },
    { label: "Heute", color: "#9C0822", position: 3 },
    { label: "In Bearbeitung", color: "#7D7878", position: 4 },
    { label: "Abgeschlossen", color: "#19191A", position: 5, isDone: true },
    { label: "Storniert", color: "#DFDEDA", position: 6, isDone: true },
  ];
  for (const s of shootingStatuses) {
    await prisma.shootingStatus.upsert({
      where: { ownerId_label: { ownerId: user.id, label: s.label } },
      update: {},
      create: { ...s, ownerId: user.id },
    });
  }
  console.log(`✓ ${shootingStatuses.length} Shooting-Status`);

  // -------- Tags --------
  const tags = [
    { label: "VIP", color: "#C8102E" },
    { label: "Empfehlung", color: "#9F877F" },
    { label: "Boudoir", color: "#19191A" },
    { label: "Akt", color: "#9C0822" },
    { label: "Couples", color: "#7D7878" },
  ];
  for (const t of tags) {
    await prisma.tag.upsert({
      where: { ownerId_label: { ownerId: user.id, label: t.label } },
      update: {},
      create: { ...t, ownerId: user.id },
    });
  }
  console.log(`✓ ${tags.length} Tags`);

  // -------- Fragebogen-Vorlagen --------
  const tplCount = await prisma.questionnaireTemplate.count({ where: { ownerId: user.id } });
  if (tplCount === 0) {
    await prisma.questionnaireTemplate.create({
      data: {
        title: "Briefing Boudoir",
        description:
          "Hi! Damit wir deinen Shootingtag perfekt vorbereiten, beantworte uns bitte in Ruhe ein paar Fragen. Dauert 5–7 Minuten.",
        position: 0,
        ownerId: user.id,
        fields: { create: [
          { type: "TEXT", label: "Wie sollen wir dich nennen?", required: true, position: 0 },
          { type: "EMAIL", label: "Deine Mail für die finalen Bilder", required: true, position: 1 },
          { type: "PHONE", label: "Handy für den Tag (falls wir kurzfristig was abstimmen müssen)", required: false, position: 2 },
          { type: "TEXTAREA", label: "Worauf freust du dich am meisten — und was macht dich nervös?", helpText: "So ehrlich wie möglich. Wir lesen das nur zur Vorbereitung.", required: true, position: 3 },
          {
            type: "SELECT_SINGLE",
            label: "Welche Stimmung passt am ehesten?",
            required: true,
            options: JSON.stringify([
              "Hell & soft (Tageslicht, warm)",
              "Dunkel & dramatisch (low-key, kontrastreich)",
              "Editorial & cool (sauber, magazinhaft)",
              "Bin offen — überrasch mich",
            ]),
            position: 4,
          },
          {
            type: "SELECT_MULTI",
            label: "Welche Outfits planst du mitzubringen?",
            helpText: "Mehrfachauswahl möglich",
            required: false,
            options: JSON.stringify(["Spitze", "Body", "Bralette", "Oversize-Hemd", "Schmuck/Accessoires", "Nichts — wir reden vor Ort"]),
            position: 5,
          },
          { type: "YES_NO", label: "Bringst du jemanden zum Shooting mit?", required: true, position: 6 },
          { type: "RATING", label: "Wie wohl fühlst du dich aktuell vor der Kamera? (1=gar nicht – 5=sehr)", required: true, position: 7 },
          { type: "FILE", label: "Hast du ein Mood-Image, das dich inspiriert? Lade es gern hoch.", helpText: "Bild oder PDF — bis 10 MB", required: false, position: 8 },
        ]},
      },
    });
    await prisma.questionnaireTemplate.create({
      data: {
        title: "Feedback nach dem Shooting",
        description: "Schön, dass du da warst! Hilf uns kurz, besser zu werden.",
        position: 1,
        ownerId: user.id,
        fields: { create: [
          { type: "RATING", label: "Wie war das Shooting insgesamt für dich?", required: true, position: 0 },
          { type: "TEXTAREA", label: "Was hat dir besonders gut gefallen?", required: false, position: 1 },
          { type: "TEXTAREA", label: "Was hätten wir besser machen können?", required: false, position: 2 },
          { type: "YES_NO", label: "Würdest du uns weiterempfehlen?", required: true, position: 3 },
        ]},
      },
    });
    console.log(`✓ 2 Fragebogen-Vorlagen`);
  }

  // -------- Beispiel-Pakete --------
  const existingPackages = await prisma.package.count({ where: { ownerId: user.id } });
  if (existingPackages === 0) {
    const owner = await prisma.teamMember.findFirst({ where: { ownerId: user.id, isOwner: true } });
    const mira = await prisma.teamMember.findFirst({ where: { ownerId: user.id, firstName: "Mira" } });
    const tom = await prisma.teamMember.findFirst({ where: { ownerId: user.id, firstName: "Tom" } });
    const briefingTpl = await prisma.questionnaireTemplate.findFirst({ where: { ownerId: user.id, title: "Briefing Boudoir" } });
    const feedbackTpl = await prisma.questionnaireTemplate.findFirst({ where: { ownerId: user.id, title: "Feedback nach dem Shooting" } });

    await prisma.package.create({
      data: {
        name: "Boudoir Classic",
        description: "2 Stunden Shooting, Make-up inklusive, 10 bearbeitete Bilder digital.",
        coverUrl: "/assets/packages/boudoir-classic.jpg",
        price: 590,
        depositAmount: 150,
        paymentTerms: "150 € Anzahlung bei Buchung, Rest am Shootingtag in bar oder per Überweisung.",
        durationMin: 120,
        position: 0,
        ownerId: user.id,
        primaryContactId: owner?.id,
        defaultTeam: owner && mira ? { connect: [{ id: owner.id }, { id: mira.id }] } : undefined,
        defaultQuestionnaires: briefingTpl && feedbackTpl
          ? { connect: [{ id: briefingTpl.id }, { id: feedbackTpl.id }] }
          : undefined,
        checklistTemplates: {
          create: [
            {
              title: "Was du mitbringst",
              audience: "CUSTOMER",
              position: 0,
              items: { create: [
                { label: "2–3 Outfits (eins davon Spitze/Body)", position: 0 },
                { label: "Hautfarbene Unterwäsche", position: 1 },
                { label: "Lieblings-Lippenstift", position: 2 },
                { label: "Bequeme Schuhe für den Weg", position: 3 },
              ]},
            },
            {
              title: "Vor dem Shooting",
              audience: "CUSTOMER",
              position: 1,
              items: { create: [
                { label: "Viel Wasser trinken (1 Tag vorher)", position: 0 },
                { label: "Auf eng anliegende Kleidung verzichten", position: 1 },
                { label: "Bei Bedarf Make-up entfernen", position: 2 },
              ]},
            },
            {
              title: "Meine Vorbereitung",
              audience: "INTERNAL",
              position: 2,
              items: { create: [
                { label: "Briefing-Mail 3 Tage vorher", position: 0 },
                { label: "Studio aufheizen (morgens)", position: 1 },
                { label: "Make-up-Bag bei Mira bestellen", position: 2 },
                { label: "Rechnung vorbereiten", position: 3 },
              ]},
            },
          ],
        },
      },
    });
    await prisma.package.create({
      data: {
        name: "Boudoir Premium",
        description: "3,5 Stunden, Make-up & Outfit-Styling, 20 bearbeitete Bilder + Print-Box (15×20).",
        coverUrl: "/assets/packages/boudoir-premium.jpg",
        price: 1190,
        depositAmount: 300,
        paymentTerms: "300 € Anzahlung, 50 % zwei Wochen vor Termin, Rest am Shootingtag.",
        durationMin: 210,
        position: 1,
        ownerId: user.id,
        primaryContactId: owner?.id,
        defaultTeam: owner && mira ? { connect: [{ id: owner.id }, { id: mira.id }] } : undefined,
        defaultQuestionnaires: briefingTpl ? { connect: [{ id: briefingTpl.id }] } : undefined,
        checklistTemplates: {
          create: [
            {
              title: "Was du mitbringst",
              audience: "CUSTOMER",
              position: 0,
              items: { create: [
                { label: "4–5 Outfits (inkl. Highlight-Outfit)", position: 0 },
                { label: "Persönliche Accessoires (Schmuck, Hüte …)", position: 1 },
                { label: "Lieblings-Lippenstift", position: 2 },
              ]},
            },
            {
              title: "Fitting-Termin",
              audience: "CUSTOMER",
              position: 1,
              items: { create: [
                { label: "Outfit-Auswahl gemeinsam besprechen", position: 0 },
                { label: "Mood-Board sichten", position: 1 },
                { label: "Fragen klären", position: 2 },
              ]},
            },
            {
              title: "Mein Produktions-Check",
              audience: "INTERNAL",
              position: 2,
              items: { create: [
                { label: "Print-Box vorab bestellen (Lieferzeit 10 Tage)", position: 0 },
                { label: "Mira Termin bestätigen", position: 1 },
                { label: "Studio aufheizen", position: 2 },
              ]},
            },
          ],
        },
      },
    });
    await prisma.package.create({
      data: {
        name: "Akt Editorial",
        description: "Halber Tag im Studio, künstlerische Akt-Edition, 15 finalisierte Bilder.",
        coverUrl: "/assets/packages/akt-editorial.jpg",
        price: 890,
        depositAmount: 200,
        paymentTerms: "200 € Anzahlung, Rest am Shootingtag.",
        durationMin: 240,
        position: 2,
        ownerId: user.id,
        primaryContactId: owner?.id,
        defaultTeam: owner ? { connect: [{ id: owner.id }] } : undefined,
      },
    });
    console.log(`✓ 3 Beispiel-Pakete mit Audience-Checklisten & Standard-Teams`);
  }

  // -------- Beispiel-Kundinnen --------
  const customerCount = await prisma.customer.count({ where: { ownerId: user.id } });
  if (customerCount === 0) {
    const gebucht = await prisma.customerStatus.findUnique({ where: { ownerId_label: { ownerId: user.id, label: "Gebucht" } } });
    const interess = await prisma.customerStatus.findUnique({ where: { ownerId_label: { ownerId: user.id, label: "Interessent" } } });
    const bestand = await prisma.customerStatus.findUnique({ where: { ownerId_label: { ownerId: user.id, label: "Bestandskunde" } } });
    const tagBoudoir = await prisma.tag.findUnique({ where: { ownerId_label: { ownerId: user.id, label: "Boudoir" } } });
    const tagVIP = await prisma.tag.findUnique({ where: { ownerId_label: { ownerId: user.id, label: "VIP" } } });

    await prisma.customer.create({
      data: {
        firstName: "Melanie",
        lastName: "Bauer",
        email: "melanie.bauer@example.com",
        phone: "+49 151 23456789",
        birthday: new Date("1991-04-12"),
        billingStreet: "Hauptstraße 12",
        billingZip: "96047",
        billingCity: "Bamberg",
        instagram: "@mel.bauer",
        source: "Empfehlung von Anna K.",
        internalNotes: "Sehr entspannt im Shooting. Liebt klassische Schwarzweiß-Looks.",
        statusId: bestand?.id,
        ownerId: user.id,
        tags: { connect: [{ id: tagBoudoir!.id }, { id: tagVIP!.id }] },
      },
    });
    await prisma.customer.create({
      data: {
        firstName: "Anna",
        lastName: "Kraus",
        email: "anna.k@example.com",
        phone: "+49 170 1112233",
        billingStreet: "Sandstraße 4",
        billingZip: "96049",
        billingCity: "Bamberg",
        instagram: "@anna.k",
        source: "Instagram",
        statusId: gebucht?.id,
        ownerId: user.id,
        tags: { connect: [{ id: tagBoudoir!.id }] },
      },
    });
    await prisma.customer.create({
      data: {
        firstName: "Sophia",
        lastName: "Linde",
        email: "sophia@example.com",
        source: "Google",
        statusId: interess?.id,
        ownerId: user.id,
      },
    });
    console.log(`✓ 3 Beispiel-Kundinnen`);
  }

  // -------- Beispiel-Shootings --------
  const shootingCount = await prisma.shooting.count({ where: { ownerId: user.id } });
  if (shootingCount === 0) {
    const allCustomers = await prisma.customer.findMany({ where: { ownerId: user.id }, orderBy: { firstName: "asc" } });
    const allPackages = await prisma.package.findMany({ where: { ownerId: user.id }, orderBy: { position: "asc" } });
    const stPlanned = await prisma.shootingStatus.findUnique({ where: { ownerId_label: { ownerId: user.id, label: "Geplant" } } });
    const stConfirmed = await prisma.shootingStatus.findUnique({ where: { ownerId_label: { ownerId: user.id, label: "Bestätigt" } } });
    const stRequested = await prisma.shootingStatus.findUnique({ where: { ownerId_label: { ownerId: user.id, label: "Angefragt" } } });
    const stDone = await prisma.shootingStatus.findUnique({ where: { ownerId_label: { ownerId: user.id, label: "Abgeschlossen" } } });

    const anna = allCustomers.find((c) => c.firstName === "Anna");
    const melanie = allCustomers.find((c) => c.firstName === "Melanie");
    const sophia = allCustomers.find((c) => c.firstName === "Sophia");
    const classic = allPackages.find((p) => p.name === "Boudoir Classic");
    const premium = allPackages.find((p) => p.name === "Boudoir Premium");
    const editorial = allPackages.find((p) => p.name === "Akt Editorial");

    const inDays = (d: number, h = 11) => {
      const date = new Date();
      date.setDate(date.getDate() + d);
      date.setHours(h, 0, 0, 0);
      return date;
    };

    const ownerM = await prisma.teamMember.findFirst({ where: { ownerId: user.id, isOwner: true } });
    const miraM = await prisma.teamMember.findFirst({ where: { ownerId: user.id, firstName: "Mira" } });

    if (anna && classic && stConfirmed) {
      const s = await prisma.shooting.create({
        data: {
          title: `Boudoir-Shooting ${anna.firstName}`,
          publicSlug: `anna-${Math.random().toString(36).slice(2, 8)}`,
          ownerId: user.id,
          customerId: anna.id,
          packageId: classic.id,
          statusId: stConfirmed.id,
          scheduledAt: inDays(4),
          durationMin: classic.durationMin,
          location: "Studio Bamberg",
          description:
            "2 Stunden für dich, ganz entspannt. Wir nehmen uns Zeit, machen Make-up und probieren mehrere Looks. Du wirst sehen — nach 20 Minuten vergisst du, dass die Kamera überhaupt da ist.",
          price: classic.price,
          depositAmount: classic.depositAmount,
          paymentTerms: classic.paymentTerms,
          depositPaid: true,
          kanbanPosition: 0,
          primaryContactId: ownerM?.id,
          team: ownerM && miraM ? { connect: [{ id: ownerM.id }, { id: miraM.id }] } : undefined,
          dates: { create: [
            {
              label: "Fitting & Vorgespräch",
              startAt: inDays(2, 17),
              endAt: inDays(2, 18),
              location: "Studio Bamberg, Hauptstr. 12",
              locationUrl: "https://maps.google.com/?q=Hauptstra%C3%9Fe+12,+96047+Bamberg",
              description: "Outfits gemeinsam sichten, Mood besprechen, Fragen klären.",
              position: 0,
            },
            {
              label: "Shooting",
              startAt: inDays(4, 11),
              endAt: inDays(4, 13),
              location: "Studio Bamberg, Hauptstr. 12",
              locationUrl: "https://maps.google.com/?q=Hauptstra%C3%9Fe+12,+96047+Bamberg",
              description: "Make-up startet pünktlich. Bring deine Outfits mit.",
              position: 1,
            },
            {
              label: "Bildauswahl",
              startAt: inDays(12, 15),
              endAt: inDays(12, 16),
              location: "Studio Bamberg",
              locationUrl: "https://maps.google.com/?q=Hauptstra%C3%9Fe+12,+96047+Bamberg",
              description: "Gemeinsam die finalen Bilder aussuchen — bei Tee.",
              position: 2,
            },
          ]},
          checklists: { create: [
            {
              title: "Was du mitbringst",
              audience: "CUSTOMER",
              position: 0,
              items: { create: [
                { label: "2–3 Outfits (eins davon Spitze)", position: 0 },
                { label: "Hautfarbene Unterwäsche", position: 1 },
                { label: "Lieblings-Lippenstift", position: 2 },
              ]},
            },
            {
              title: "Meine Vorbereitung",
              audience: "INTERNAL",
              position: 1,
              items: { create: [
                { label: "Briefing-Mail 3 Tage vorher", done: true, dueAt: inDays(1), position: 0 },
                { label: "Studio aufheizen", dueAt: inDays(4, 9), position: 1 },
                { label: "Make-up bestellt", dueAt: inDays(2), position: 2 },
                { label: "Rechnung schreiben", dueAt: inDays(-1), position: 3 },
              ]},
            },
          ]},
          notes: { create: [
            { text: "Outfit-Mix Spitze + Body. Stimmung: warm, soft, viel Tageslicht.", status: "IMPORTANT" },
            { text: "Hat angerufen, will Termin morgens (vor 12 Uhr)", status: "DONE" },
            { text: "Rechnung am Shootingtag bereitstellen", status: "OPEN" },
          ]},
          questionnaires: { create: [
            {
              title: "Briefing für unser Shooting",
              description:
                "Hi Anna, schön, dass du dabei bist! Damit wir den Tag perfekt für dich vorbereiten, beantworte mir bitte in Ruhe ein paar Fragen. Geht in 5–7 Minuten.",
              status: "SENT",
              sentAt: new Date(),
              position: 0,
              fields: { create: [
                { type: "TEXT", label: "Wie sollen wir dich nennen?", required: true, position: 0 },
                { type: "EMAIL", label: "Deine Mail für die finalen Bilder", required: true, position: 1 },
                { type: "PHONE", label: "Handy für den Tag (falls wir kurzfristig was abstimmen müssen)", required: false, position: 2 },
                { type: "TEXTAREA", label: "Worauf freust du dich am meisten — und was macht dich nervös?", helpText: "So ehrlich wie möglich. Wir lesen das nur zur Vorbereitung.", required: true, position: 3 },
                {
                  type: "SELECT_SINGLE",
                  label: "Welche Stimmung passt am ehesten?",
                  required: true,
                  options: JSON.stringify([
                    "Hell & soft (Tageslicht, warm)",
                    "Dunkel & dramatisch (low-key, kontrastreich)",
                    "Editorial & cool (sauber, magazinhaft)",
                    "Bin offen — überrasch mich",
                  ]),
                  position: 4,
                },
                {
                  type: "SELECT_MULTI",
                  label: "Welche Outfits planst du mitzubringen?",
                  helpText: "Mehrfachauswahl möglich",
                  required: false,
                  options: JSON.stringify(["Spitze", "Body", "Bralette", "Oversize-Hemd", "Schmuck/Accessoires", "Nichts — wir reden vor Ort"]),
                  position: 5,
                },
                { type: "YES_NO", label: "Bringst du jemanden zum Shooting mit?", required: true, position: 6 },
                { type: "DATE", label: "Falls du Make-up zuhause schon machen willst — wann ist dein Wecker?", required: false, position: 7 },
                { type: "RATING", label: "Wie wohl fühlst du dich aktuell vor der Kamera? (1=gar nicht – 5=sehr)", required: true, position: 8 },
                { type: "FILE", label: "Hast du ein Mood-Image, das dich inspiriert? Lade es gern hoch.", helpText: "Bild oder PDF — bis 10 MB", required: false, position: 9 },
              ]},
            },
          ]},
        },
      });
    }

    if (melanie && premium && stPlanned) {
      await prisma.shooting.create({
        data: {
          title: `Premium-Shooting ${melanie.firstName}`,
          publicSlug: `melanie-${Math.random().toString(36).slice(2, 8)}`,
          ownerId: user.id,
          customerId: melanie.id,
          packageId: premium.id,
          statusId: stPlanned.id,
          scheduledAt: inDays(14, 14),
          durationMin: premium.durationMin,
          location: "Studio Bamberg",
          price: 1090,
          depositAmount: premium.depositAmount,
          paymentTerms: "300 € Anzahlung, Rest am Shootingtag (Stammkundinnen-Konditionen).",
          kanbanPosition: 0,
          primaryContactId: ownerM?.id,
          team: ownerM && miraM ? { connect: [{ id: ownerM.id }, { id: miraM.id }] } : undefined,
          dates: { create: [
            { label: "Fitting", startAt: inDays(10, 16), endAt: inDays(10, 17), location: "Studio Bamberg", position: 0 },
            { label: "Shooting", startAt: inDays(14, 14), endAt: inDays(14, 17), location: "Studio Bamberg", position: 1 },
          ]},
          notes: { create: [
            { text: "Stammkundin — kennt den Ablauf, kein extra Briefing nötig.", status: "DONE" },
          ]},
          checklists: { create: [
            {
              title: "Mein Premium-Check",
              audience: "INTERNAL",
              position: 0,
              items: { create: [
                { label: "Print-Box bestellen", dueAt: inDays(7), position: 0 },
                { label: "Mira Termin bestätigen", dueAt: inDays(8), position: 1 },
              ]},
            },
          ]},
        },
      });
    }

    if (sophia && stRequested && classic) {
      await prisma.shooting.create({
        data: {
          title: `Erstgespräch & Probebild ${sophia.firstName}`,
          publicSlug: `sophia-${Math.random().toString(36).slice(2, 8)}`,
          ownerId: user.id,
          customerId: sophia.id,
          packageId: classic.id,
          statusId: stRequested.id,
          scheduledAt: inDays(2, 17),
          location: "Café Müller, Bamberg",
          price: 0,
          kanbanPosition: 0,
          dates: { create: [
            { label: "Kennenlernen", startAt: inDays(2, 17), endAt: inDays(2, 18), location: "Café Müller, Bamberg", position: 0 },
          ]},
        },
      });
    }

    if (anna && editorial && stDone) {
      await prisma.shooting.create({
        data: {
          title: `Editorial-Akt ${anna.firstName}`,
          ownerId: user.id,
          customerId: anna.id,
          packageId: editorial.id,
          statusId: stDone.id,
          scheduledAt: inDays(-30, 10),
          durationMin: editorial.durationMin,
          location: "Studio Bamberg",
          price: editorial.price,
          depositAmount: editorial.depositAmount,
          paymentTerms: editorial.paymentTerms,
          depositPaid: true,
          finalPaid: true,
          kanbanPosition: 0,
        },
      });
    }

    console.log(`✓ Beispiel-Shootings mit Terminen, Notizen, Checklisten`);
  }

  // -------- Beispiel-Aufgaben --------
  const taskCount = await prisma.task.count({ where: { ownerId: user.id } });
  if (taskCount === 0) {
    const anna = await prisma.customer.findFirst({ where: { ownerId: user.id, firstName: "Anna" } });
    const sophia = await prisma.customer.findFirst({ where: { ownerId: user.id, firstName: "Sophia" } });
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const inThreeDays = new Date(); inThreeDays.setDate(inThreeDays.getDate() + 3);
    await prisma.task.create({
      data: {
        title: "Briefing-Mail an Anna schicken",
        description: "Outfit-Empfehlungen, Adresse, Parkhinweis.",
        ownerId: user.id,
        customerId: anna?.id,
        dueAt: tomorrow,
      },
    });
    await prisma.task.create({
      data: {
        title: "Sophia nach Erstgespräch zurückrufen",
        ownerId: user.id,
        customerId: sophia?.id,
        dueAt: inThreeDays,
      },
    });
    await prisma.task.create({
      data: {
        title: "Studio-Snacks nachbestellen",
        ownerId: user.id,
      },
    });
    console.log(`✓ Beispiel-Aufgaben`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
