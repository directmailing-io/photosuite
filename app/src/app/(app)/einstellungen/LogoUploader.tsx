"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Trash2, Crop, Save, X, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { saveStudioLogo, removeStudioLogo } from "./actions";

type Initial = {
  logoUrl: string | null;
  logoOriginalUrl: string | null;
  logoMimeType: string | null;
  studioName: string | null;
};

const ACCEPT = "image/svg+xml,image/png,image/jpeg,image/jpg";

export function LogoUploader({ initial }: { initial: Initial }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  // Während der User die Original-Datei wählt + croppt, zwischengespeichert:
  const [pendingOriginal, setPendingOriginal] = useState<{ url: string; mimeType: string } | null>(null);
  const [cropping, setCropping] = useState<{ url: string; mimeType: string } | null>(null);

  async function uploadFile(file: File): Promise<{ url: string; mimeType: string }> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload/logo", { method: "POST", body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Upload fehlgeschlagen" }));
      throw new Error(err.error ?? "Upload fehlgeschlagen");
    }
    return res.json();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uploaded = await uploadFile(file);
      setPendingOriginal(uploaded);
      // SVG kann nicht sinnvoll gecropped werden (Vektor) → direkt übernehmen
      if (uploaded.mimeType === "image/svg+xml") {
        await commit(uploaded.url, uploaded.url, uploaded.mimeType);
      } else {
        setCropping(uploaded);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Upload fehlgeschlagen");
    } finally {
      // Input zurücksetzen, damit erneutes Hochladen derselben Datei feuert
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function commit(logoUrl: string, originalUrl: string, mimeType: string) {
    startTransition(async () => {
      try {
        await saveStudioLogo({ logoUrl, logoOriginalUrl: originalUrl, mimeType });
        toast.success("Logo gespeichert");
        setCropping(null);
        setPendingOriginal(null);
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Konnte nicht speichern");
      }
    });
  }

  async function onCropDone(croppedBlob: Blob) {
    const orig = cropping ?? pendingOriginal;
    if (!orig) return;
    try {
      const file = new File([croppedBlob], "logo-cropped.png", { type: "image/png" });
      const uploaded = await uploadFile(file);
      await commit(uploaded.url, orig.url, "image/png");
    } catch (err: any) {
      toast.error(err?.message ?? "Crop fehlgeschlagen");
    }
  }

  async function onRemove() {
    if (!confirm("Logo entfernen?")) return;
    startTransition(async () => {
      await removeStudioLogo();
      toast.success("Logo entfernt");
      router.refresh();
    });
  }

  function reCrop() {
    if (!initial.logoOriginalUrl || !initial.logoMimeType) return;
    if (initial.logoMimeType === "image/svg+xml") {
      toast("SVG-Logos sind Vektoren und werden nicht zugeschnitten.");
      return;
    }
    setCropping({ url: initial.logoOriginalUrl, mimeType: initial.logoMimeType });
  }

  const hasLogo = !!initial.logoUrl;
  const isSvg = initial.logoMimeType === "image/svg+xml";

  return (
    <section className="card p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="font-serif text-xl">Logo</div>
          <div className="text-xs text-smoke mt-1 max-w-md">
            Erscheint auf der Kundenansicht und auf jeder Rechnung. SVG bevorzugt für gestochen scharfe Darstellung.
            Raster (PNG/JPG) wird auf Wunsch zugeschnitten.
          </div>
        </div>
        {hasLogo && (
          <button type="button" onClick={onRemove} disabled={pending} className="btn-ghost text-xs" style={{ color: "rgb(var(--accent))" }}>
            <Trash2 size={12} /> Entfernen
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={onFile}
      />

      <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4 items-start">
        {/* Vorschau */}
        <div
          className="rounded-xl border border-dashed border-stone bg-linen/40 aspect-square flex items-center justify-center overflow-hidden"
        >
          {hasLogo && initial.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={initial.logoUrl} alt="Logo" className="max-w-[80%] max-h-[80%] object-contain" />
          ) : (
            <div className="text-center text-smoke px-4">
              <ImageIcon size={24} strokeWidth={1.25} className="mx-auto mb-2 opacity-60" />
              <div className="text-xs">{initial.studioName ?? "Studio"}</div>
              <div className="text-[10px] opacity-70 mt-0.5">noch kein Logo</div>
            </div>
          )}
        </div>

        {/* Aktionen */}
        <div className="space-y-2.5 text-sm">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending}
              className="btn-primary h-9 text-xs"
            >
              <Upload size={13} /> {hasLogo ? "Anderes Logo wählen" : "Logo hochladen"}
            </button>
            {hasLogo && !isSvg && initial.logoOriginalUrl && (
              <button type="button" onClick={reCrop} disabled={pending} className="btn-secondary h-9 text-xs">
                <Crop size={13} /> Zuschnitt anpassen
              </button>
            )}
          </div>

          <ul className="text-xs text-smoke space-y-0.5">
            <li>• Formate: SVG, PNG, JPG (max. 5 MB)</li>
            <li>• Quadratisches Format empfohlen</li>
            <li>• Transparenter Hintergrund für PNG/SVG ist möglich</li>
          </ul>

          {hasLogo && (
            <div className="text-[11px] text-smoke pt-2 border-t border-stone/60 mt-3">
              Aktuell: {isSvg ? "SVG (Vektor)" : initial.logoMimeType?.replace("image/", "").toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {cropping && (
        <CropModal
          imageUrl={cropping.url}
          onCancel={() => setCropping(null)}
          onDone={onCropDone}
        />
      )}
    </section>
  );
}

// -------- Crop Modal: leichter selbstgebauter Cropper (Zoom + Drag + Output-Größe 512px) --------

function CropModal({
  imageUrl, onCancel, onDone,
}: {
  imageUrl: string;
  onCancel: () => void;
  onDone: (blob: Blob) => Promise<void> | void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [dragging, setDragging] = useState<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [imgNaturalW, setImgNaturalW] = useState(0);
  const [imgNaturalH, setImgNaturalH] = useState(0);

  const VIEWPORT = 360; // px im Modal
  const OUTPUT = 512;   // px Endgröße quadratisch

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const el = e.currentTarget;
    setImgNaturalW(el.naturalWidth);
    setImgNaturalH(el.naturalHeight);
    // Initial: passend in den Viewport einpassen
    const fit = Math.min(VIEWPORT / el.naturalWidth, VIEWPORT / el.naturalHeight);
    // Zoom-Faktor relativ zum "fit"-Zustand
    setScale(1);
    setTx(0);
    setTy(0);
    // Bilddimensionen werden im Render aus naturalWxH * fit * scale berechnet
    void fit;
  }

  // Visible image size in the viewport, ab "fit" als 1.0
  const baseSize = imgNaturalW && imgNaturalH
    ? Math.min(VIEWPORT / imgNaturalW, VIEWPORT / imgNaturalH)
    : 1;
  const displayW = imgNaturalW * baseSize * scale;
  const displayH = imgNaturalH * baseSize * scale;

  function clamp(value: number, displayed: number): number {
    // Erlaube nur Drag bis das Bild den Viewport noch füllt
    const half = (displayed - VIEWPORT) / 2;
    if (displayed <= VIEWPORT) return 0;
    return Math.max(-half, Math.min(half, value));
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging({ startX: e.clientX, startY: e.clientY, baseX: tx, baseY: ty });
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;
    setTx(clamp(dragging.baseX + dx, displayW));
    setTy(clamp(dragging.baseY + dy, displayH));
  }
  function onPointerUp() {
    setDragging(null);
  }

  async function done() {
    setBusy(true);
    try {
      const blob = await renderCrop({
        imageUrl,
        naturalW: imgNaturalW,
        naturalH: imgNaturalH,
        baseSize,
        scale,
        tx, ty,
        viewport: VIEWPORT,
        output: OUTPUT,
      });
      await onDone(blob);
    } catch (err: any) {
      toast.error(err?.message ?? "Konnte Crop nicht erstellen");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="card max-w-md w-full p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-serif text-lg">Zuschnitt anpassen</div>
            <div className="text-xs text-smoke mt-0.5">Ziehe das Bild, zoome mit dem Regler.</div>
          </div>
          <button onClick={onCancel} className="btn-icon" disabled={busy} aria-label="Schließen">
            <X size={14} />
          </button>
        </div>

        <div
          ref={containerRef}
          className="relative bg-linen rounded-xl overflow-hidden cursor-move touch-none select-none mx-auto"
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={imageUrl}
            alt=""
            crossOrigin="anonymous"
            onLoad={onImageLoad}
            className="absolute select-none pointer-events-none"
            style={{
              left: "50%",
              top: "50%",
              width: displayW || undefined,
              height: displayH || undefined,
              transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`,
              maxWidth: "none",
              maxHeight: "none",
            }}
            draggable={false}
          />
          {/* Crop-Mask Overlay (Highlight des sichtbaren Bereichs) */}
          <div className="absolute inset-0 pointer-events-none" style={{
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.6)",
          }} />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-smoke">Zoom</span>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.01"
            value={scale}
            onChange={(e) => {
              const newScale = Number(e.target.value);
              // Beim Zoomen den Translation-Wert clampen, damit Bild im Viewport bleibt
              const newDisplayW = imgNaturalW * baseSize * newScale;
              const newDisplayH = imgNaturalH * baseSize * newScale;
              setScale(newScale);
              setTx((prev) => clamp(prev, newDisplayW));
              setTy((prev) => clamp(prev, newDisplayH));
            }}
            className="flex-1"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} disabled={busy} className="btn-ghost text-xs h-9">
            Abbrechen
          </button>
          <button onClick={done} disabled={busy} className="btn-primary text-xs h-9">
            <Save size={12} /> {busy ? "Speichern…" : "Übernehmen"}
          </button>
        </div>
      </div>
    </div>
  );
}

async function renderCrop(args: {
  imageUrl: string;
  naturalW: number;
  naturalH: number;
  baseSize: number;
  scale: number;
  tx: number;
  ty: number;
  viewport: number;
  output: number;
}): Promise<Blob> {
  const { imageUrl, naturalW, naturalH, baseSize, scale, tx, ty, viewport, output } = args;
  const img = await loadImage(imageUrl);
  const displayedW = naturalW * baseSize * scale;
  const displayedH = naturalH * baseSize * scale;
  // Die Mitte des angezeigten Bildes liegt bei (viewport/2 + tx, viewport/2 + ty).
  // Wir berechnen, welcher Ausschnitt im Original-Pixelraum dem Viewport entspricht.
  const naturalPerDisplayed = naturalW / displayedW; // = 1/(baseSize*scale)
  const cropSizeNatural = viewport * naturalPerDisplayed;
  const centerNaturalX = naturalW / 2 - (tx * naturalPerDisplayed);
  const centerNaturalY = naturalH / 2 - (ty * naturalPerDisplayed);
  const sx = Math.max(0, Math.min(naturalW - cropSizeNatural, centerNaturalX - cropSizeNatural / 2));
  const sy = Math.max(0, Math.min(naturalH - cropSizeNatural, centerNaturalY - cropSizeNatural / 2));

  const canvas = document.createElement("canvas");
  canvas.width = output;
  canvas.height = output;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas-Kontext nicht verfügbar");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, cropSizeNatural, cropSizeNatural, 0, 0, output, output);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas konnte kein Bild erstellen"));
    }, "image/png", 0.95);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
    img.src = src;
  });
}
