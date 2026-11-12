// Client-side exports for Insights (CSV of displayed rows, PNG of the displayed chart). Browser-only; no network.
import html2canvas from "html2canvas";

export function exportCSV(filename: string, rows: Array<Record<string, any>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const v = row[h] ?? "";
          const s = String(v).replace(/"/g, '""');
          return `"${s}"`;
        })
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportPNG(elementId: string, filename: string) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const svg = el.querySelector("svg");

  // Prefer exporting the chart SVG directly because html2canvas can choke on
  // modern CSS colour functions like oklch used elsewhere in the app.
  if (svg) {
    const svgClone = svg.cloneNode(true) as SVGSVGElement;
    const width = Number(svg.getAttribute("width")) || svg.clientWidth || 1200;
    const height = Number(svg.getAttribute("height")) || svg.clientHeight || 500;

    svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svgClone.setAttribute("width", String(width));
    svgClone.setAttribute("height", String(height));

    const svgData = new XMLSerializer().serializeToString(svgClone);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.crossOrigin = "anonymous";

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg_export_failed"));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(url);
      return;
    }

    ctx.scale(2, 2);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    URL.revokeObjectURL(url);

    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
    return;
  }

  // Fallback for non-chart blocks.
  const canvas = await html2canvas(el, {
    backgroundColor: "#0a0a0a",
    scale: 2,
  });

  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
