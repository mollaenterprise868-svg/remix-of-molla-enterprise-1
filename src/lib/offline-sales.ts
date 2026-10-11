import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export type QueuedSale = {
  clientRef: string;
  createdAt: string;
  method: string;
  customerNumber?: string;
  agentCode?: string;
  reference?: string;
  total: number;
  items: { product_id: string; quantity: number }[];
  lastError?: string;
};

const KEY = "molla.sale-queue.v1";

function read(): QueuedSale[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedSale[]) : [];
  } catch {
    return [];
  }
}

function write(queue: QueuedSale[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(queue));
  window.dispatchEvent(new Event("molla-queue-changed"));
}

export function newClientRef(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ref-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function enqueueSale(sale: QueuedSale) {
  write([...read(), sale]);
}

/** Sends one queued sale. The client reference makes a repeat send harmless. */
async function send(sale: QueuedSale) {
  const { error } = await supabase.rpc("process_sale", {
    _items: sale.items,
    _payment_method: sale.method,
    _client_ref: sale.clientRef,
    ...(sale.customerNumber ? { _customer_number: sale.customerNumber } : {}),
    ...(sale.agentCode ? { _agent_code: sale.agentCode } : {}),
    ...(sale.reference ? { _payment_reference: sale.reference } : {}),
  });
  if (error) throw new Error(error.message);
}

export function useSaleQueue(onSynced?: () => void) {
  const [queue, setQueue] = useState<QueuedSale[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const refresh = () => setQueue(read());
    refresh();
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("molla-queue-changed", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("molla-queue-changed", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const sync = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const pending = read();
    if (pending.length === 0) return;
    setSyncing(true);
    let synced = 0;
    const remaining: QueuedSale[] = [];
    for (const sale of pending) {
      try {
        await send(sale);
        synced += 1;
      } catch (error) {
        remaining.push({
          ...sale,
          lastError: error instanceof Error ? error.message : "Could not sync this sale",
        });
      }
    }
    write(remaining);
    setSyncing(false);
    if (synced > 0) onSynced?.();
  }, [onSynced]);

  useEffect(() => {
    void sync();
    const timer = window.setInterval(() => void sync(), 20000);
    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [sync]);

  function discard(clientRef: string) {
    write(read().filter((s) => s.clientRef !== clientRef));
  }

  return { queue, online, syncing, sync, discard };
}
