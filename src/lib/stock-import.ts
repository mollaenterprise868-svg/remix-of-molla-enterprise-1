import { UNITS } from "@/lib/molla";

export type StockRow = {
  name: string;
  barcode: string | null;
  sku: string | null;
  category: string;
  unit: string;
  price: number;
  quantity: number;
  low_stock_level: number;
};

export type ImportResult = { rows: StockRow[]; errors: string[] };

export const STOCK_TEMPLATE_HEADERS = [
  "name",
  "barcode",
  "sku",
  "category",
  "unit",
  "price",
  "quantity",
  "low_stock_level",
] as const;

export const STOCK_TEMPLATE_CSV = `${STOCK_TEMPLATE_HEADERS.join(",")}
School shirt,6001234567890,SKU-001,Clothing,item,7500,40,5
Socks 3-pack,6009876543210,SKU-002,Clothing,packs,3200,12,3
`;

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === "," || char === ";" || char === "\t") {
      out.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  out.push(value);
  return out.map((v) => v.trim());
}

/** Parses an uploaded CSV stock file and validates every row before anything is saved. */
export function parseStockFile(text: string): ImportResult {
  const errors: string[] = [];
  const rows: StockRow[] = [];

  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    return { rows, errors: ["The file is empty — it needs a header row and at least one product."] };
  }

  // Accept friendly aliases so stock-report exports (PDF/CSV) import as-is.
  const HEADER_ALIASES: Record<string, string> = {
    product: "name",
    item: "name",
    sold_by: "unit",
    alert_at: "low_stock_level",
    low_stock: "low_stock_level",
    stock: "quantity",
    qty: "quantity",
  };
  const header = splitCsvLine(lines[0]!).map((h) => {
    const key = h.toLowerCase().replace(/\s+/g, "_");
    return HEADER_ALIASES[key] ?? key;
  });
  const required = ["name", "price", "quantity"];
  const missing = required.filter((key) => !header.includes(key));
  if (missing.length > 0) {
    return {
      rows,
      errors: [`Missing required column(s): ${missing.join(", ")}. Download the template below.`],
    };
  }

  const index = (key: string) => header.indexOf(key);

  lines.slice(1).forEach((line, i) => {
    // PDF exports repeat the header on every page — skip those rows silently.
    if (line === lines[0]) return;
    const cells = splitCsvLine(line);
    // Footers like "Products: 54" have far fewer cells than the table — ignore them.
    if (cells.length < Math.min(3, header.length)) return;
    const at = (key: string) => {
      const idx = index(key);
      return idx === -1 ? "" : (cells[idx] ?? "").trim();
    };
    const row = i + 2;
    const name = at("name");
    if (!name) {
      errors.push(`Row ${row}: name is required.`);
      return;
    }



    const price = Number(at("price").replace(/[^0-9.-]/g, ""));
    const quantity = Number(at("quantity").replace(/[^0-9.-]/g, ""));
    const lowRaw = at("low_stock_level");
    const low = lowRaw ? Number(lowRaw.replace(/[^0-9.-]/g, "")) : 5;

    if (!Number.isFinite(price) || price < 0) {
      errors.push(`Row ${row}: price must be a number of 0 or more.`);
      return;
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      errors.push(`Row ${row}: quantity must be a number of 0 or more.`);
      return;
    }
    if (!Number.isFinite(low) || low < 0) {
      errors.push(`Row ${row}: low_stock_level must be a number of 0 or more.`);
      return;
    }

    const unitRaw = at("unit").toLowerCase().trim();
    // Normalise plurals/singulars so "items" → "item", "pack" → "packs", etc.
    let unit = unitRaw || "item";
    if (!(UNITS as readonly string[]).includes(unit)) {
      if (unit.endsWith("s") && (UNITS as readonly string[]).includes(unit.slice(0, -1))) {
        unit = unit.slice(0, -1);
      } else if ((UNITS as readonly string[]).includes(`${unit}s`)) {
        unit = `${unit}s`;
      }
    }
    if (!(UNITS as readonly string[]).includes(unit)) {
      errors.push(`Row ${row}: unit "${unitRaw}" is not supported (${UNITS.join(", ")}).`);
      return;
    }

    rows.push({
      name,
      barcode: at("barcode") || null,
      sku: at("sku") || null,
      category: at("category") || "General",
      unit,
      price,
      quantity,
      low_stock_level: low,
    });
  });

  return { rows, errors };
}
