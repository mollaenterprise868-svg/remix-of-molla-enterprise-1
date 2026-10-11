import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Check,
  CloudOff,
  Download,
  Minus,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  ScanBarcode,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { CameraScanner } from "@/components/molla/camera-scanner";
import { TopBar } from "@/components/molla/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  PAYMENT_METHODS,
  matchesSearch,
  money,
  paymentMethod,
  qty,
  timeOf,
  type PaymentMethodId,
} from "@/lib/molla";
import { downloadReceipt, printReceipt, type ReceiptData } from "@/lib/receipt";
import { enqueueSale, newClientRef, useSaleQueue } from "@/lib/offline-sales";

export const Route = createFileRoute("/_authenticated/till")({
  head: () => ({
    meta: [
      { title: "Till — Molla Enterprise" },
      {
        name: "description",
        content:
          "Scan or search stock by barcode, name or product number, record the payment method and complete the sale.",
      },
      { property: "og:title", content: "Till — Molla Enterprise" },
      {
        property: "og:description",
        content: "Fast barcode scanning and payment record keeping for the Molla Enterprise till.",
      },
    ],
  }),
  beforeLoad: ({ context }) => {
    // Managers run the shop from the dashboard; the till belongs to workers only.
    if ((context as { isManager?: boolean }).isManager) throw redirect({ to: "/manager" });
  },
  component: TillPage,
});

type Product = {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  price: number;
  quantity: number;
  unit: string;
  category: string;
};

type Line = { product: Product; quantity: number };

function TillPage() {
  const queryClient = useQueryClient();
  const scanRef = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState("");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [method, setMethod] = useState<PaymentMethodId>("cash");
  const [customerNumber, setCustomerNumber] = useState("");
  const [agentCode, setAgentCode] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);

  const onSynced = useCallback(() => {
    toast.success("Queued sales have been synced");
    void queryClient.invalidateQueries();
  }, [queryClient]);
  const { queue, online, syncing, sync } = useSaleQueue(onSynced);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("products")
          .select("id,name,barcode,sku,price,quantity,unit,category")
          .order("name");
        if (error) throw error;
        const rows = (data ?? []) as Product[];
        // Keep a copy on the device so the till still works with no connection.
        window.localStorage.setItem("molla.catalogue", JSON.stringify(rows));
        return rows;
      } catch (error) {
        const cached = window.localStorage.getItem("molla.catalogue");
        if (cached) return JSON.parse(cached) as Product[];
        throw error;
      }
    },
  });

  const mySales = useQuery({
    queryKey: ["my-sales-today"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return [];
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("sales")
        .select("id,receipt_no,total,item_count,payment_method,customer_number,agent_code,created_at")
        .eq("worker_user_id", user.user.id)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const catalogue = products.data ?? [];
  const results = useMemo(
    () => (search.trim() ? catalogue.filter((p) => matchesSearch(p, search)).slice(0, 24) : []),
    [catalogue, search],
  );

  const total = lines.reduce((sum, l) => sum + Number(l.product.price) * l.quantity, 0);
  const config = paymentMethod(method);

  function addProduct(product: Product) {
    setLines((current) => {
      const existing = current.find((l) => l.product.id === product.id);
      const next = (existing?.quantity ?? 0) + 1;
      if (next > Number(product.quantity)) {
        toast.error(`Only ${qty(product.quantity, product.unit)} of ${product.name} left`);
        return current;
      }
      return existing
        ? current.map((l) => (l.product.id === product.id ? { ...l, quantity: next } : l))
        : [...current, { product, quantity: 1 }];
    });
  }

  function changeQuantity(id: string, delta: number) {
    setLines((current) =>
      current.flatMap((line) => {
        if (line.product.id !== id) return [line];
        const next = Number((line.quantity + delta).toFixed(3));
        if (next <= 0) return [];
        if (next > Number(line.product.quantity)) {
          toast.error(`Only ${qty(line.product.quantity, line.product.unit)} left`);
          return [line];
        }
        return [{ ...line, quantity: next }];
      }),
    );
  }

  function addByCode(code: string) {
    const q = code.trim().toLowerCase();
    const hit =
      catalogue.find((p) => (p.barcode ?? "").toLowerCase() === q) ??
      catalogue.find((p) => (p.sku ?? "").toLowerCase() === q);
    if (hit) {
      addProduct(hit);
    } else {
      // No exact match — show every product with a similar number or name.
      const similar = catalogue.filter((p) => matchesSearch(p, code));
      if (similar.length > 0) {
        setSearch(code);
        toast.info(`No exact match for ${code} — ${similar.length} similar item${similar.length === 1 ? "" : "s"} below, tap to add`);
      } else {
        toast.error(`No product with barcode or number ${code}`);
      }
    }
    setScan("");
    scanRef.current?.focus();
  }

  function onScan(event: React.FormEvent) {
    event.preventDefault();
    const code = scan.trim();
    if (!code) return;
    addByCode(code);
  }

  function clearSaleForm() {
    setLines([]);
    setCustomerNumber("");
    setAgentCode("");
    setReference("");
    setMethod("cash");
    scanRef.current?.focus();
  }

  async function completeSale() {
    if (lines.length === 0) return;
    if (config.needsNumber && !customerNumber.trim()) {
      toast.error(`Enter the ${config.numberLabel.toLowerCase()}`);
      return;
    }
    setBusy(true);
    const snapshot = lines.map((l) => ({
      name: l.product.name,
      unit: l.product.unit,
      quantity: l.quantity,
      unitPrice: Number(l.product.price),
    }));
    const clientRef = newClientRef();
    const queued = {
      clientRef,
      createdAt: new Date().toISOString(),
      method,
      total,
      items: lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
      ...(customerNumber.trim() ? { customerNumber: customerNumber.trim() } : {}),
      ...(agentCode.trim() ? { agentCode: agentCode.trim() } : {}),
      ...(reference.trim() ? { reference: reference.trim() } : {}),
    };

    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    let receiptNo = `OFFLINE-${clientRef.slice(0, 6).toUpperCase()}`;
    let createdAt = queued.createdAt;

    if (offline) {
      enqueueSale(queued);
      toast.success("Saved on this device — it will sync when you are back online");
    } else {
      const { data: saleData, error } = await supabase.rpc("process_sale", {
        _items: queued.items,
        _payment_method: method,
        _client_ref: clientRef,
        ...(customerNumber.trim() ? { _customer_number: customerNumber.trim() } : {}),
        ...(agentCode.trim() ? { _agent_code: agentCode.trim() } : {}),
        ...(reference.trim() ? { _payment_reference: reference.trim() } : {}),
      });
      if (error) {
        // Connection dropped mid-sale — keep the sale safe on the device.
        enqueueSale({ ...queued, lastError: error.message });
        toast.warning("Could not reach the server — the sale is queued for syncing");
      } else {
        const sale = saleData as unknown as { receipt_no: string; created_at: string } | null;
        receiptNo = sale?.receipt_no ?? receiptNo;
        createdAt = sale?.created_at ?? createdAt;
        toast.success("Sale recorded and stock updated");
      }
    }

    setBusy(false);
    setLastReceipt({
      receiptNo,
      createdAt,
      total,
      method,
      customerNumber: customerNumber.trim() || undefined,
      agentCode: agentCode.trim() || undefined,
      reference: reference.trim() || undefined,
      lines: snapshot,
    });
    clearSaleForm();
    void queryClient.invalidateQueries({ queryKey: ["products"] });
    void queryClient.invalidateQueries({ queryKey: ["my-sales-today"] });
  }

  const takings = (mySales.data ?? []).reduce((sum, s) => sum + Number(s.total), 0);
  const units = (mySales.data ?? []).reduce((sum, s) => sum + Number(s.item_count), 0);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <TopBar title="Till" subtitle="Scan, record the payment, balance the day." />

      {!online || queue.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3">
          <CloudOff className="size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium break-words">
              {online ? "Back online" : "Working offline"}
              {queue.length > 0
                ? ` · ${queue.length} sale(s) waiting to sync`
                : " · sales are saved on this device"}
            </p>
            {queue.find((s) => s.lastError) ? (
              <p className="text-xs break-words text-destructive">
                Last sync problem: {queue.find((s) => s.lastError)?.lastError}
              </p>
            ) : null}
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void sync()}
            disabled={!online || syncing || queue.length === 0}
          >
            <RefreshCw className={`mr-2 size-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      ) : null}


      <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <section className="panel p-4">
          <form onSubmit={onScan} className="flex gap-2">
            <div className="relative flex-1">
              <ScanBarcode className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={scanRef}
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                placeholder="Scan barcode or type code, then Enter"
                className="pl-9"
                autoFocus
              />
            </div>
            <Button type="submit" variant="secondary">
              Add
            </Button>
            <CameraScanner
              onDetected={(code) => {
                const hit =
                  catalogue.find((p) => (p.barcode ?? "").toLowerCase() === code.toLowerCase()) ??
                  catalogue.find((p) => (p.sku ?? "").toLowerCase() === code.trim().toLowerCase());
                if (hit) {
                  addProduct(hit);
                  toast.success(`Added ${hit.name}`);
                } else {
                  setSearch(code);
                  toast.error(`Not found: ${code}`);
                }
              }}
            />
          </form>

          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items by name, barcode or product number"
              className="pl-9"
            />
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {!search.trim() ? (
              <p className="col-span-full text-sm text-muted-foreground">
                Search or scan to find an item.
              </p>
            ) : results.length === 0 ? (
              <p className="col-span-full text-sm font-medium text-destructive">
                Not found — this item is not in stock.
              </p>
            ) : (
              results.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addProduct(product)}
                  className="cursor-pointer rounded-lg bg-secondary/60 p-3 text-left transition-colors hover:bg-secondary"
                >
                  <p className="truncate text-sm font-medium">{product.name}</p>
                  <p className="mt-1 truncate text-xs tabular-nums text-muted-foreground">
                    {money(product.price)} · {qty(product.quantity, product.unit)} left
                  </p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    SKU / barcode: {product.sku || "—"} / {product.barcode || "—"}
                  </p>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="panel flex flex-col p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Current sale
            </h2>
            <span className="stat-value text-primary">{money(total)}</span>
          </div>

          <div className="mt-3 flex-1 space-y-2 overflow-y-auto">
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">Scan an item to start a sale.</p>
            ) : (
              lines.map((line) => (
                <div
                  key={line.product.id}
                  className="flex items-center gap-2 rounded-lg bg-secondary/50 p-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.product.name}</p>
                    <p className="truncate text-xs tabular-nums text-muted-foreground">
                      {money(line.product.price)} × {qty(line.quantity, line.product.unit)} ={" "}
                      {money(Number(line.product.price) * line.quantity)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => changeQuantity(line.product.id, -1)}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <span className="w-10 text-center text-sm tabular-nums">{line.quantity}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => changeQuantity(line.product.id, 1)}
                    >
                      <Plus className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        setLines((c) => c.filter((l) => l.product.id !== line.product.id))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  variant={method === option.id ? "default" : "secondary"}
                  onClick={() => setMethod(option.id)}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            {config.needsNumber ? (
              <div className="space-y-2">
                <Label htmlFor="customer-number">{config.numberLabel}</Label>
                <Input
                  id="customer-number"
                  value={customerNumber}
                  onChange={(e) => setCustomerNumber(e.target.value)}
                  placeholder="e.g. 0991234567"
                  inputMode="numeric"
                />
              </div>
            ) : null}

            {config.supportsAgentCode ? (
              <div className="space-y-2">
                <Label htmlFor="agent-code">Agent code used for withdrawal (optional)</Label>
                <Input
                  id="agent-code"
                  value={agentCode}
                  onChange={(e) => setAgentCode(e.target.value)}
                  placeholder="e.g. AG-4821"
                />
              </div>
            ) : null}

            {config.referenceLabel ? (
              <div className="space-y-2">
                <Label htmlFor="reference">{config.referenceLabel}</Label>
                <Input
                  id="reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. TRX-99201"
                />
              </div>
            ) : null}

            <p className="text-center text-xs text-muted-foreground">
              Payments are recorded here only — no money is collected by this app. Nothing is
              deducted from stock until you complete the sale.
            </p>

            <Button className="w-full" onClick={completeSale} disabled={busy || lines.length === 0}>
              <Check className="mr-2 size-4" />
              {busy ? "Recording…" : "Complete sale"}
            </Button>

            {lastReceipt ? (
              <div className="rounded-lg bg-secondary/60 p-3">
                <p className="text-xs text-muted-foreground">
                  Last sale {lastReceipt.receiptNo} · {money(lastReceipt.total)}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => printReceipt(lastReceipt)}
                  >
                    <Printer className="mr-2 size-4" />
                    Print receipt
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => downloadReceipt(lastReceipt)}
                  >
                    <Download className="mr-2 size-4" />
                    Download PDF
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="panel mt-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            My sales today
          </h2>
          <div className="flex gap-6">
            <div>
              <p className="text-xs text-muted-foreground">Takings</p>
              <p className="stat-value text-primary">{money(takings)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Units sold</p>
              <p className="stat-value">{units}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {(mySales.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales recorded yet today.</p>
          ) : (
            (mySales.data ?? []).map((sale) => (
              <div
                key={sale.id}
                className="flex items-center gap-3 rounded-lg bg-secondary/50 px-3 py-2"
              >
                <Receipt className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{sale.receipt_no}</p>
                  <p className="truncate text-xs capitalize text-muted-foreground">
                    {paymentMethod(sale.payment_method).label}
                    {sale.customer_number ? ` · ${sale.customer_number}` : ""}
                    {sale.agent_code ? ` · agent ${sale.agent_code}` : ""} · {timeOf(sale.created_at)}
                  </p>
                </div>
                <p className="shrink-0 font-medium tabular-nums">{money(sale.total)}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
