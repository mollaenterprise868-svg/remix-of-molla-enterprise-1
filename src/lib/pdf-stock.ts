/**
 * Turns an uploaded PDF stock list into CSV-style text that parseStockFile understands.
 * The PDF must contain a table whose first row names the columns (name, price, quantity, ...).
 */
export async function pdfToStockText(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const lines: string[] = [];

  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; text: string }[]>();

    for (const item of content.items as any[]) {
      const text = String(item.str ?? "").trim();
      if (!text) continue;
      const y = Math.round(item.transform[5] / 3) * 3;
      const bucket = rows.get(y) ?? [];
      bucket.push({ x: item.transform[4], text });
      rows.set(y, bucket);
    }

    [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, cells]) => {
        const line = cells
          .sort((a, b) => a.x - b.x)
          .map((c) => (c.text.includes(",") ? `"${c.text.replace(/"/g, '""')}"` : c.text))
          .join(",");
        if (line.trim()) lines.push(line);
      });
  }

  // Drop anything before the header row so page titles are ignored.
  const headerIndex = lines.findIndex((line) => {
    const lower = line.toLowerCase();
    return (
      (lower.includes("name") || lower.includes("product")) &&
      lower.includes("price") &&
      lower.includes("quantity")
    );
  });

  return (headerIndex >= 0 ? lines.slice(headerIndex) : lines).join("\n");
}
