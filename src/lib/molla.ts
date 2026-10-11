export const STAFF_EMAIL_DOMAIN = "molla-till.local";

/** Worker IDs are turned into a stable internal email so staff only ever type an ID + PIN. */
export function workerEmail(workerId: string): string {
  const slug = workerId.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `${slug || "staff"}@${STAFF_EMAIL_DOMAIN}`;
}

/** PINs are short, so they are expanded into a longer password before hitting auth. */
export function pinPassword(pin: string): string {
  return `molla-till-pin-${pin.trim()}`;
}

export const MWK = new Intl.NumberFormat("en-MW", {
  style: "currency",
  currency: "MWK",
  maximumFractionDigits: 0,
});

export function money(value: number | string | null | undefined): string {
  return MWK.format(Number(value ?? 0));
}

export const UNITS = ["packs", "boxes", "sets", "item", "pairs"] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_LABEL: Record<string, string> = {
  packs: "packs",
  boxes: "boxes",
  sets: "sets",
  item: "items",
  pairs: "pairs",
};

export function qty(value: number | string, unit: string): string {
  const n = Number(value ?? 0);
  const text = Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return `${text} ${UNIT_LABEL[unit] ?? unit}`;
}

export type PaymentMethodId = "cash" | "airtel" | "mpamba" | "bank";

export type PaymentMethod = {
  id: PaymentMethodId;
  label: string;
  /** Mobile money / bank payments are recorded only — no live processing happens. */
  needsNumber: boolean;
  numberLabel: string;
  supportsAgentCode: boolean;
  referenceLabel?: string;
};

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: "cash", label: "Cash", needsNumber: false, numberLabel: "", supportsAgentCode: false },
  {
    id: "airtel",
    label: "Airtel Money",
    needsNumber: true,
    numberLabel: "Customer Airtel number",
    supportsAgentCode: true,
  },
  {
    id: "mpamba",
    label: "TNM Mpamba",
    needsNumber: true,
    numberLabel: "Customer Mpamba number",
    supportsAgentCode: true,
  },
  {
    id: "bank",
    label: "Bank",
    needsNumber: true,
    numberLabel: "Payer account / phone number",
    supportsAgentCode: false,
    referenceLabel: "Bank reference or slip number",
  },
];

export function paymentMethod(id: string): PaymentMethod {
  return PAYMENT_METHODS.find((m) => m.id === id) ?? PAYMENT_METHODS[0]!;
}

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function timeOf(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Matches a product against a barcode / name / SKU search box. */
export function matchesSearch(
  product: { name: string; barcode: string | null; sku: string | null },
  term: string,
): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return false;
  return (
    product.name.toLowerCase().includes(q) ||
    (product.barcode ?? "").toLowerCase().includes(q) ||
    (product.sku ?? "").toLowerCase().includes(q)
  );
}
