import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liefert das JS-Snippet, das Lisa auf ihre Kunden-Website einbettet.
 * Das Snippet sucht alle `<div data-photosuite-form="ID">`-Container,
 * fügt einen iframe ein und synchronisiert die Höhe via postMessage.
 *
 * Wird statisch ausgeliefert — keine User-Daten enthalten, daher cache-fähig.
 */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const js = `(function(){
  var origin = ${JSON.stringify(origin)};
  function init(c) {
    if (c.dataset.photosuiteLoaded) return;
    c.dataset.photosuiteLoaded = "1";
    var id = c.dataset.photosuiteForm;
    if (!id) return;
    var iframe = document.createElement("iframe");
    iframe.src = origin + "/embed/" + encodeURIComponent(id);
    iframe.style.cssText = "width:100%;border:0;display:block;min-height:400px;background:transparent;";
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("title", "Anfrage-Formular");
    iframe.setAttribute("allow", "");
    c.appendChild(iframe);
    window.addEventListener("message", function(e) {
      if (e.source !== iframe.contentWindow) return;
      var d = e.data;
      if (d && d.type === "photosuite-resize" && typeof d.height === "number" && d.height > 0) {
        iframe.style.height = (d.height + 4) + "px";
      }
    });
  }
  function run() {
    var els = document.querySelectorAll("[data-photosuite-form]");
    for (var i = 0; i < els.length; i++) init(els[i]);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();`;

  return new NextResponse(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // CDN-fähig: 5 Min Browser-Cache, 1 Std bei Edges
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      // CORS — Snippet darf von beliebiger Domain geladen werden
      "Access-Control-Allow-Origin": "*",
    },
  });
}
