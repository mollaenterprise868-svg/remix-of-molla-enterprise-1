import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, FileDown, Package, Plus, Trash2, Upload, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { TopBar } from "@/components/molla/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { createStaff, removeStaff, resetStaffPin, setStaffRole } from "@/lib/staff.functions";
import { UNITS, money, paymentMethod, qty, timeOf } from "@/lib/molla";
import { exportSalesPdf, type SalesRow } from "@/lib/receipt";
import { STOCK_TEMPLATE_CSV, STOCK_TEMPLATE_HEADERS, parseStockFile } from "@/lib/stock-import";
import { deleteProduct, saveProducts, updateProduct } from "@/lib/stock.functions";

export const Route = createFileRoute("/_authenticated/manager")({
  head: () => ({
    meta: [
      { title: "Manager dashboard — Molla Enterprise" },
      {
        name: "description",
        content:
          "Manage the Molla Enterprise product catalogue, staff accounts, sales records and stock alerts in one dashboard.",
      },
      { property: "og:title", content: "Manager dashboard — Molla Enterprise" },
      {
        property: "og:description",
        content: "Catalogue, staff, records and stock alerts for Molla Enterprise managers.",
      },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (!(context as { isManager?: boolean }).isManager) throw redirect({ to: "/till" });
  },
  component: ManagerPage,
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
  low_stock_level: number;
};

function ManagerPage() {
  const queryClient = useQueryClient();

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const sales = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .is("cleared_at", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const staff = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id,worker_id,full_name,status").order("worker_id"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      return (profiles ?? []).map((p) => ({
        ...p,
        role: (roles ?? []).find((r) => r.user_id === p.id)?.role ?? "worker",
      }));
    },
  });

  const catalogue = products.data ?? [];
  const sorted = useMemo(() => [...catalogue].sort((a, b) => a.name.localeCompare(b.name)), [catalogue]);
  const lowStock = catalogue.filter((p) => Number(p.quantity) <= Number(p.low_stock_level));
  const salesList = sales.data ?? [];
  const revenue = salesList.reduce((sum, s) => sum + Number(s.total), 0);
  const stockValue = catalogue.reduce((sum, p) => sum + Number(p.price) * Number(p.quantity), 0);

  function refreshAll() {
    void queryClient.invalidateQueries();
  }

  async function clearRecords(mode: "archive" | "purge") {
    const { error } = await supabase.rpc("clear_sales_records", { _purge: mode === "purge" });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      mode === "archive"
        ? "Sales records cleared — the product catalogue is untouched"
        : "Sales records deleted — the product catalogue is untouched",
    );
    refreshAll();
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <TopBar title="Manager dashboard" subtitle="Stock, staff and sales records." />

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Recorded sales" value={money(revenue)} />
        <Stat label="Transactions" value={String(salesList.length)} />
        <Stat label="Products" value={String(catalogue.length)} />
        <Stat label="Stock value" value={money(stockValue)} />
      </div>

      {lowStock.length > 0 ? (
        <div className="panel mt-4 flex items-start gap-3 border-destructive/40 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-sm font-medium">{lowStock.length} item(s) at or below low stock</p>
            <p className="text-xs break-words text-muted-foreground">
              {lowStock.map((p) => `${p.name} (${qty(p.quantity, p.unit)})`).join(" · ")}
            </p>
          </div>
        </div>
      ) : null}

      <Tabs defaultValue="stock" className="mt-4">
        <TabsList className="w-full max-w-full overflow-x-auto">
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="monthly">Monthly report</TabsTrigger>
          <TabsTrigger value="records">Records</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="space-y-4">
          <MonthlyReport catalogue={sorted} />
        </TabsContent>

        <TabsContent value="stock" className="space-y-4">
          <ProductForm onSaved={refreshAll} />
          <StockImport onImported={refreshAll} />
          <section className="panel p-4">
            <p className="text-sm font-medium">Product catalogue ({sorted.length})</p>
            <div className="mt-3 space-y-2">
              {sorted.length === 0 ? (
                <p className="text-sm text-muted-foreground">No products yet.</p>
              ) : (
                sorted.map((product) => (
                  <ProductRow key={product.id} product={product} onChanged={refreshAll} />
                ))
              )}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="records" className="space-y-4">
          <section className="panel flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium">Clear sold-item records</p>
              <p className="text-xs text-muted-foreground">
                Resets the sales history only. Products, prices and stock levels stay exactly as
                they are.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={salesList.length === 0}
                onClick={() => exportSalesPdf(salesList as unknown as SalesRow[])}
              >
                <FileDown className="mr-2 size-4" />
                Export PDF
              </Button>
              <ConfirmButton
                label="Clear records"
                description="Sales records are archived and removed from this list. The product catalogue is not changed."
                onConfirm={() => clearRecords("archive")}
              />
              <ConfirmButton
                variant="destructive"
                label="Delete permanently"
                description="Sales records are permanently deleted. The product catalogue is not changed."
                onConfirm={() => clearRecords("purge")}
              />
            </div>
          </section>

          <section className="panel p-4">
            <div className="space-y-2">
              {salesList.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales records.</p>
              ) : (
                salesList.map((sale) => (
                  <div key={sale.id} className="rounded-lg bg-secondary/50 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium">{sale.receipt_no}</p>
                      <p className="shrink-0 font-medium tabular-nums">{money(sale.total)}</p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {paymentMethod(sale.payment_method).label}
                      {sale.customer_number ? ` · ${sale.customer_number}` : ""}
                      {sale.agent_code ? ` · agent ${sale.agent_code}` : ""}
                      {sale.payment_reference ? ` · ref ${sale.payment_reference}` : ""} ·{" "}
                      {sale.item_count} item(s) · {timeOf(sale.created_at)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="team" className="space-y-4">
          <StaffForm onSaved={refreshAll} />
          <section className="panel p-4">
            <div className="space-y-2">
              {(staff.data ?? []).map((member) => (
                <div
                  key={member.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {member.full_name}{" "}
                      <span className="text-muted-foreground">({member.worker_id})</span>
                    </p>
                    <p className="text-xs capitalize text-muted-foreground">{member.role}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await setStaffRole({
                          data: {
                            userId: member.id,
                            role: member.role === "manager" ? "worker" : "manager",
                          },
                        });
                        toast.success("Role updated");
                        refreshAll();
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Could not update");
                      }
                    }}
                  >
                    Make {member.role === "manager" ? "worker" : "manager"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const pin = window.prompt("New PIN (4-8 digits)");
                      if (!pin) return;
                      try {
                        await resetStaffPin({ data: { userId: member.id, pin } });
                        toast.success("PIN reset");
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Could not reset PIN");
                      }
                    }}
                  >
                    Reset PIN
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await removeStaff({ data: { userId: member.id } });
                        toast.success("Staff member removed");
                        refreshAll();
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Could not remove");
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel min-w-0 p-4">
      <p className="truncate text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="stat-value mt-1 break-words text-primary">{value}</p>
    </div>
  );
}

function ConfirmButton({
  label,
  description,
  onConfirm,
  variant = "secondary",
}: {
  label: string;
  description: string;
  onConfirm: () => void;
  variant?: "secondary" | "destructive";
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant={variant}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ProductForm({ onSaved }: { onSaved: () => void }) {
  const empty = {
    name: "",
    sku: "",
    price: "",
    quantity: "",
    unit: "item",
    category: "General",
    low_stock_level: "5",
  };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await saveProducts({
        data: {
          rows: [
            {
              name: form.name.trim(),
              sku: form.sku.trim() || null,
              price: Number(form.price),
              quantity: Number(form.quantity),
              unit: form.unit,
              category: form.category.trim() || "General",
              low_stock_level: Number(form.low_stock_level || 0),
            },
          ],
        },
      });
      toast.success("Product added");
      setForm(empty);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add that product");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel space-y-3 p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Package className="size-4 text-primary" />
        Add a product
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Name" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Field label="Product number / SKU" value={form.sku} onChange={(v) => setForm({ ...form, sku: v })} />
        <Field label="Category" value={form.category} onChange={(v) => setForm({ ...form, category: v })} />
        <Field
          label="Price (MWK)"
          required
          type="number"
          value={form.price}
          onChange={(v) => setForm({ ...form, price: v })}
        />
        <Field
          label="Quantity in stock"
          required
          type="number"
          value={form.quantity}
          onChange={(v) => setForm({ ...form, quantity: v })}
        />
        <div className="space-y-2">
          <Label htmlFor="unit">Unit</Label>
          <select
            id="unit"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit} className="bg-background">
                {unit}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="Low stock alert at"
          type="number"
          value={form.low_stock_level}
          onChange={(v) => setForm({ ...form, low_stock_level: v })}
        />
      </div>
      <Button type="submit" disabled={busy}>
        <Plus className="mr-2 size-4" />
        {busy ? "Saving…" : "Add product"}
      </Button>
    </form>
  );
}

function ProductRow({ product, onChanged }: { product: Product; onChanged: () => void }) {
  const [price, setPrice] = useState(String(product.price));
  const [quantity, setQuantity] = useState(String(product.quantity));

  async function save() {
    try {
      await updateProduct({
        data: { id: product.id, price: Number(price), quantity: Number(quantity) },
      });
      toast.success(`${product.name} updated`);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update that product");
    }
  }

  async function remove() {
    if (!window.confirm(`Erase ${product.name} from stock? Past sales records are kept.`)) return;
    try {
      await deleteProduct({ data: { id: product.id } });
      toast.success(`${product.name} removed`);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove that product");
    }
  }

  const low = Number(product.quantity) <= Number(product.low_stock_level);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2">
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm font-medium">
          {product.name} {low ? <span className="text-destructive">· low</span> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {product.category} · {product.sku || "no number"} · {qty(product.quantity, product.unit)}
        </p>
      </div>
      <Input
        className="w-28"
        type="number"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        aria-label={`Price for ${product.name}`}
      />
      <Input
        className="w-24"
        type="number"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        aria-label={`Stock for ${product.name}`}
      />
      <Button size="sm" variant="secondary" onClick={save}>
        Save
      </Button>
      <Button size="icon" variant="ghost" onClick={remove}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function StaffForm({ onSaved }: { onSaved: () => void }) {
  const [workerId, setWorkerId] = useState("");
  const [fullName, setFullName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<"worker" | "manager">("worker");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await createStaff({ data: { workerId, fullName, pin, role } });
      toast.success("Staff member added");
      setWorkerId("");
      setFullName("");
      setPin("");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add that staff member");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel space-y-3 p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <UserPlus className="size-4 text-primary" />
        Add a staff member
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Worker ID" required value={workerId} onChange={setWorkerId} />
        <Field label="Full name" required value={fullName} onChange={setFullName} />
        <Field label="PIN (4-8 digits)" required value={pin} onChange={setPin} />
        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value as "worker" | "manager")}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="worker" className="bg-background">
              Worker
            </option>
            <option value="manager" className="bg-background">
              Manager
            </option>
          </select>
        </div>
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Add staff member"}
      </Button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function StockImport({ onImported }: { onImported: () => void }) {
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<ReturnType<typeof parseStockFile>["rows"]>([]);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.(csv|txt|tsv|pdf)$/i.test(file.name)) {
      setErrors(["Only .csv, .txt/.tsv or .pdf stock files can be imported."]);
      setRows([]);
      setPreview(null);
      return;
    }
    setBusy(true);
    try {
      let text: string;
      if (/\.pdf$/i.test(file.name)) {
        const { pdfToStockText } = await import("@/lib/pdf-stock");
        text = await pdfToStockText(file);
      } else {
        text = await file.text();
      }
      const result = parseStockFile(text);
      setErrors(result.errors);
      setRows(result.rows);
      setPreview(result.rows.length);
    } catch {
      setErrors(["That file could not be read. Try a CSV, or a PDF with a clear stock table."]);
      setRows([]);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function importRows() {
    if (rows.length === 0) return;
    setBusy(true);
    try {
      await saveProducts({ data: { rows } });
      toast.success(`${rows.length} product(s) imported`);
      setRows([]);
      setPreview(null);
      setErrors([]);
      onImported();
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Could not import that stock file"]);
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([STOCK_TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "molla-stock-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel space-y-3 p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Upload className="size-4 text-primary" />
        Upload a stock file
      </p>
      <p className="text-xs text-muted-foreground">
        Upload a CSV or PDF file with these columns: {STOCK_TEMPLATE_HEADERS.join(", ")}. Only{" "}
        <strong>name</strong>, <strong>price</strong> and <strong>quantity</strong> are required.
        Unit must be one of: {UNITS.join(", ")}. A PDF needs a table with a header row naming the
        columns. The same product name can appear more than once (different types are kept
        separately). Every row is checked before anything is saved.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="file" accept=".csv,.tsv,.txt,.pdf" onChange={onFile} className="max-w-xs" />
        <Button type="button" size="sm" variant="secondary" onClick={downloadTemplate}>
          Download template
        </Button>
        {rows.length > 0 ? (
          <Button type="button" size="sm" onClick={importRows} disabled={busy}>
            {busy ? "Importing…" : `Import ${rows.length} product(s)`}
          </Button>
        ) : null}
      </div>
      {preview !== null ? (
        <p className="text-xs text-muted-foreground">
          {preview} valid row(s) ready to import
          {errors.length > 0 ? ` · ${errors.length} row(s) skipped` : ""}.
        </p>
      ) : null}
      {errors.length > 0 ? (
        <ul className="space-y-1 text-xs text-destructive">
          {errors.slice(0, 8).map((message) => (
            <li key={message}>{message}</li>
          ))}
          {errors.length > 8 ? <li>…and {errors.length - 8} more.</li> : null}
        </ul>
      ) : null}
    </section>
  );
}

type MonthlyLine = {
  key: string;
  name: string;
  unit: string;
  sold: number;
  revenue: number;
  remaining: number | null;
};

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function MonthlyReport({ catalogue }: { catalogue: Product[] }) {
  const [month, setMonth] = useState(() => monthKey(new Date()));

  const start = useMemo(() => new Date(`${month}-01T00:00:00`), [month]);
  const end = useMemo(() => {
    const d = new Date(start);
    d.setMonth(d.getMonth() + 1);
    return d;
  }, [start]);

  const report = useQuery({
    queryKey: ["monthly-report", month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_id,name,unit,quantity,line_total,sales!inner(created_at)")
        .gte("sales.created_at", start.toISOString())
        .lt("sales.created_at", end.toISOString());
      if (error) throw error;
      return (data ?? []) as unknown as {
        product_id: string | null;
        name: string;
        unit: string;
        quantity: number;
        line_total: number;
      }[];
    },
  });

  const lines = useMemo<MonthlyLine[]>(() => {
    const map = new Map<string, MonthlyLine>();
    for (const item of report.data ?? []) {
      const key = item.product_id ?? `name:${item.name}`;
      const product = item.product_id
        ? catalogue.find((p) => p.id === item.product_id)
        : catalogue.find((p) => p.name === item.name);
      const existing = map.get(key);
      if (existing) {
        existing.sold += Number(item.quantity);
        existing.revenue += Number(item.line_total);
      } else {
        map.set(key, {
          key,
          name: product?.name ?? item.name,
          unit: product?.unit ?? item.unit,
          sold: Number(item.quantity),
          revenue: Number(item.line_total),
          remaining: product ? Number(product.quantity) : null,
        });
      }
    }
    // Products with no sales this month still matter for remaining stock.
    for (const product of catalogue) {
      if (!map.has(product.id)) {
        map.set(product.id, {
          key: product.id,
          name: product.name,
          unit: product.unit,
          sold: 0,
          revenue: 0,
          remaining: Number(product.quantity),
        });
      }
    }
    return [...map.values()].sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name));
  }, [report.data, catalogue]);

  const totalSold = lines.reduce((sum, l) => sum + l.sold, 0);
  const totalRevenue = lines.reduce((sum, l) => sum + l.revenue, 0);
  const monthLabel = start.toLocaleString(undefined, { month: "long", year: "numeric" });

  function downloadCsv() {
    const rows = [
      ["Product", "Unit", "Sold", "Remaining in stock", "Sales value (MWK)"],
      ...lines.map((l) => [
        l.name,
        l.unit,
        String(l.sold),
        l.remaining === null ? "" : String(l.remaining),
        String(Math.round(l.revenue)),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `molla-monthly-stock-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Monthly stock report</p>
          <p className="text-xs text-muted-foreground">
            Items sold, what is left in stock and the unit each product is sold by.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-2">
            <Label htmlFor="report-month">Month</Label>
            <Input
              id="report-month"
              type="month"
              value={month}
              max={monthKey(new Date())}
              onChange={(event) => setMonth(event.target.value || monthKey(new Date()))}
              className="w-[11rem]"
            />
          </div>
          <Button size="sm" variant="secondary" onClick={downloadCsv} disabled={lines.length === 0}>
            <FileDown className="mr-2 size-4" />
            Download
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={`Sold in ${monthLabel}`} value={`${totalSold}`} />
        <Stat label="Sales value" value={money(totalRevenue)} />
        <Stat label="Products listed" value={String(lines.length)} />
      </div>

      {report.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading the report…</p>
      ) : lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing to report for {monthLabel}.</p>
      ) : (
        <div className="space-y-2">
          {lines.map((line) => (
            <div key={line.key} className="rounded-lg bg-secondary/50 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{line.name}</p>
                <p className="shrink-0 text-sm font-medium tabular-nums">{money(line.revenue)}</p>
              </div>
              <p className="mt-0.5 text-xs break-words text-muted-foreground">
                Sold: {qty(line.sold, line.unit)} · Remaining:{" "}
                {line.remaining === null ? "not in catalogue" : qty(line.remaining, line.unit)} ·
                Sold by: {line.unit}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
