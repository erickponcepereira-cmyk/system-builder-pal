// Client-side helper: opens a printable HTML receipt in a new window.

const METHOD_LABEL: Record<string, string> = {
  pix: "PIX",
  card: "Cartão",
  wallet: "Carteira interna",
  auto_debit: "Débito automático",
  manual_admin: "Manual (admin)",
};

const fmtBRL = (n: number) => `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const fmtDateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtMonth = (d: string) => {
  const m = /^(\d{4})-(\d{2})/.exec(d);
  if (!m) return d;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

export function openInvoiceReceipt(payload: {
  invoice: { id: string; reference_month: string; due_date: string; amount: number; status: string; paid_at: string | null; payment_method: string | null; wallet_source: string | null; mp_payment_id: string | null };
  profile: { name: string | null; email: string | null; cpf: string | null } | null;
}) {
  const { invoice, profile } = payload;
  const method = invoice.wallet_source && invoice.payment_method === "wallet"
    ? `Carteira interna (${invoice.wallet_source})`
    : METHOD_LABEL[invoice.payment_method ?? ""] ?? "—";

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>Recibo — Mensalidade FitMind Club</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 40px; background: #f5f5f5; color: #111; }
  .card { max-width: 720px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
  h1 { margin: 0 0 4px 0; font-size: 22px; }
  .subtitle { color: #666; font-size: 13px; margin-bottom: 24px; }
  .brand { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #f97316; padding-bottom: 16px; margin-bottom: 24px; }
  .brand .label { font-weight: 700; color: #f97316; font-size: 18px; letter-spacing: 0.5px; }
  .amount-block { background: #f97316; color: white; padding: 24px; border-radius: 8px; text-align: center; margin: 20px 0; }
  .amount-block .amt { font-size: 36px; font-weight: 700; margin: 0; }
  .amount-block .lbl { font-size: 12px; opacity: 0.9; text-transform: uppercase; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; color: #888; padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600; }
  td { padding: 12px 0; border-bottom: 1px solid #f5f5f5; font-size: 14px; }
  td.label { color: #666; width: 40%; }
  td.value { font-weight: 500; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; text-align: center; font-size: 11px; color: #999; }
  .status-badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .status-paid { background: #dcfce7; color: #166534; }
  .status-exempt { background: #dbeafe; color: #1e40af; }
  .print-btn { position: fixed; top: 20px; right: 20px; padding: 10px 18px; background: #f97316; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
  @media print { .print-btn { display: none; } body { background: white; padding: 0; } .card { box-shadow: none; } }
</style></head><body>
<button class="print-btn" onclick="window.print()">Imprimir / Salvar PDF</button>
<div class="card">
  <div class="brand">
    <div>
      <div class="label">FITMIND CLUB</div>
      <div style="font-size: 11px; color: #999;">Recibo de mensalidade</div>
    </div>
    <div style="text-align: right; font-size: 11px; color: #666;">
      Emitido em<br /><strong>${fmtDateTime(new Date().toISOString())}</strong>
    </div>
  </div>

  <h1>Recibo #${invoice.id.slice(0, 8).toUpperCase()}</h1>
  <p class="subtitle">Referente à mensalidade de ${fmtMonth(invoice.reference_month)}</p>

  <div class="amount-block">
    <div class="lbl">${invoice.status === "exempted" ? "Valor isento" : "Valor pago"}</div>
    <p class="amt">${fmtBRL(invoice.amount)}</p>
    <span class="status-badge ${invoice.status === "paid" ? "status-paid" : "status-exempt"}">${invoice.status === "paid" ? "Pago" : "Isenta"}</span>
  </div>

  <table>
    <thead><tr><th colspan="2">Detalhes do pagador</th></tr></thead>
    <tbody>
      <tr><td class="label">Nome</td><td class="value">${profile?.name ?? "—"}</td></tr>
      <tr><td class="label">E-mail</td><td class="value">${profile?.email ?? "—"}</td></tr>
      ${profile?.cpf ? `<tr><td class="label">CPF</td><td class="value">${profile.cpf}</td></tr>` : ""}
    </tbody>
  </table>

  <table>
    <thead><tr><th colspan="2">Detalhes do pagamento</th></tr></thead>
    <tbody>
      <tr><td class="label">Mês de referência</td><td class="value">${fmtMonth(invoice.reference_month)}</td></tr>
      <tr><td class="label">Vencimento</td><td class="value">${fmtDate(invoice.due_date)}</td></tr>
      <tr><td class="label">Data de pagamento</td><td class="value">${fmtDateTime(invoice.paid_at)}</td></tr>
      <tr><td class="label">Forma de pagamento</td><td class="value">${method}</td></tr>
      ${invoice.mp_payment_id ? `<tr><td class="label">ID Mercado Pago</td><td class="value">${invoice.mp_payment_id}</td></tr>` : ""}
      <tr><td class="label">Número da fatura</td><td class="value" style="font-family: monospace; font-size: 11px;">${invoice.id}</td></tr>
    </tbody>
  </table>

  <div class="footer">
    FitMind Club · Comprovante gerado automaticamente. Guarde para sua conferência.
  </div>
</div>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
