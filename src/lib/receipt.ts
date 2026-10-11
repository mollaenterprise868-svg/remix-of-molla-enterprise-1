import { jsPDF } from "jspdf";

import { money, paymentMethod, qty, timeOf } from "@/lib/molla";

export type ReceiptLine = {
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
};

export type ReceiptData = {
  receiptNo: string;
  createdAt: string;
  total: number;
  method: string;
  customerNumber?: string | undefined;
  agentCode?: string | undefined;
  reference?: string | undefined;
  worker?: string | undefined;
  lines: ReceiptLine[];
};

function buildReceipt(receipt: ReceiptData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: [80, 200] });
  let y = 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("MOLLA ENTERPRISE", 40, y, { align: "center" });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Sales receipt", 40, y, { align: "center" });
  y += 6;
  doc.text(`Receipt: ${receipt.receiptNo}`, 6, y);
  y += 4;
  doc.text(`Date: ${timeOf(receipt.createdAt)}`, 6, y);
  if (receipt.worker) {
    y += 4;
    doc.text(`Served by: ${receipt.worker}`, 6, y);
  }
  y += 5;
  doc.line(6, y, 74, y);
  y += 5;

  for (const line of receipt.lines) {
    doc.text(line.name.slice(0, 34), 6, y);
    y += 4;
    doc.text(`${qty(line.quantity, line.unit)} x ${money(line.unitPrice)}`, 6, y);
    doc.text(money(line.quantity * line.unitPrice), 74, y, { align: "right" });
    y += 5;
  }

  doc.line(6, y, 74, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("TOTAL", 6, y);
  doc.text(money(receipt.total), 74, y, { align: "right" });
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Payment: ${paymentMethod(receipt.method).label}`, 6, y);
  if (receipt.customerNumber) {
    y += 4;
    doc.text(`Customer number: ${receipt.customerNumber}`, 6, y);
  }
  if (receipt.agentCode) {
    y += 4;
    doc.text(`Agent code: ${receipt.agentCode}`, 6, y);
  }
  if (receipt.reference) {
    y += 4;
    doc.text(`Reference: ${receipt.reference}`, 6, y);
  }
  y += 6;
  doc.text("Payment recorded only - no money", 40, y, { align: "center" });
  y += 4;
  doc.text("is collected by this app.", 40, y, { align: "center" });
  y += 6;
  doc.text("Thank you for your business", 40, y, { align: "center" });
  return doc;
}

export function downloadReceipt(receipt: ReceiptData) {
  buildReceipt(receipt).save(`receipt-${receipt.receiptNo}.pdf`);
}

export function printReceipt(receipt: ReceiptData) {
  const doc = buildReceipt(receipt);
  const url = doc.output("bloburl");
  const win = window.open(String(url), "_blank");
  win?.addEventListener("load", () => win.print());
}

export type SalesRow = {
  receipt_no: string;
  created_at: string;
  total: number | string;
  item_count: number;
  payment_method: string;
  customer_number?: string | null;
  agent_code?: string | null;
  worker_label?: string | null;
};

export function exportSalesPdf(rows: SalesRow[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Molla Enterprise — sales records", 14, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.text("Receipt", 14, y);
  doc.text("Date", 52, y);
  doc.text("Payment", 100, y);
  doc.text("Items", 140, y);
  doc.text("Total", 196, y, { align: "right" });
  y += 3;
  doc.line(14, y, 196, y);
  y += 5;
  doc.setFont("helvetica", "normal");

  let total = 0;
  for (const row of rows) {
    if (y > 280) {
      doc.addPage();
      y = 18;
    }
    total += Number(row.total);
    doc.text(String(row.receipt_no).slice(0, 20), 14, y);
    doc.text(timeOf(row.created_at), 52, y);
    doc.text(
      `${paymentMethod(row.payment_method).label}${row.customer_number ? ` ${row.customer_number}` : ""}`.slice(
        0,
        24,
      ),
      100,
      y,
    );
    doc.text(String(row.item_count), 140, y);
    doc.text(money(row.total), 196, y, { align: "right" });
    y += 5;
  }

  y += 3;
  doc.line(14, y, 196, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text(`Transactions: ${rows.length}`, 14, y);
  doc.text(`Total: ${money(total)}`, 196, y, { align: "right" });
  doc.save(`molla-sales-${new Date().toISOString().slice(0, 10)}.pdf`);
}
