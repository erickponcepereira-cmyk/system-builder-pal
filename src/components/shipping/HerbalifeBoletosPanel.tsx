import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listMyHerbalifeSales,
  submitHerbalifeBoleto,
  adminListHerbalifeBoletos,
  adminConfirmHerbalifeBoleto,
  type HerbalifeBoletoRow,
} from "@/lib/herbalife-boletos.functions";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Upload, FileText, CheckCircle2, Clock } from "lucide-react";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}

async function uploadFile(file: File, prefix: string): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("herbalife-boletos").upload(path, file, {
    upsert: false,
    contentType: file.type,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("herbalife-boletos").createSignedUrl
    ? await supabase.storage.from("herbalife-boletos").createSignedUrl(path, 60 * 60 * 24 * 365)
    : { data: null };
  return data?.signedUrl || path;
}

/** Painel do parceiro / profissional */
export function HerbalifeBoletosPanel() {
  const listFn = useServerFn(listMyHerbalifeSales);
  const submitFn = useServerFn(submitHerbalifeBoleto);
  const [rows, setRows] = useState<HerbalifeBoletoRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setRows(null);
    const r = await listFn();
    setRows(r);
  };
  useEffect(() => { load(); }, []);

  const handleSubmit = async (r: HerbalifeBoletoRow, file: File | null, barcode: string) => {
    setBusy(r.order_id);
    try {
      let fileUrl: string | null = null;
      if (file) fileUrl = await uploadFile(file, `submitted/${r.order_id}`);
      await submitFn({ data: { orderId: r.order_id, boletoFileUrl: fileUrl, boletoBarcode: barcode || null } });
      alert("Boleto enviado! Aguardando pagamento pelo admin.");
      await load();
    } catch (e: any) {
      alert("Erro: " + e.message);
    } finally {
      setBusy(null);
    }
  };

  if (rows === null) {
    return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!rows.length) {
    return <p className="text-sm text-white/60 py-6">Você ainda não tem vendas Herbalife.</p>;
  }

  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <SaleCard key={r.order_id} row={r} onSubmit={handleSubmit} busy={busy === r.order_id} />
      ))}
    </div>
  );
}

function SaleCard({ row, onSubmit, busy }: { row: HerbalifeBoletoRow; onSubmit: (r: HerbalifeBoletoRow, file: File | null, barcode: string) => void; busy: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [barcode, setBarcode] = useState(row.boleto_barcode || "");
  const inputRef = useRef<HTMLInputElement>(null);
  const isPaid = row.status === "paid";
  const isPending = row.status === "pending_admin_payment" && !!row.submitted_at;
  const needsSubmit = !row.submitted_at;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-white/60">{row.order_number} — {fmtDate(row.paid_at)}</p>
          <p className="font-semibold text-white">{row.product_name}</p>
          <p className="text-sm text-white/70">Cliente: {row.student_name}</p>
          <p className="text-sm text-white/70">Endereço: {row.shipping_summary || "—"}</p>
          <p className="text-sm text-white/70">Pgto: {row.payment_method} — {fmtBRL(row.gross_amount)}</p>
        </div>
        <div>
          {isPaid && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-300"><CheckCircle2 className="h-3 w-3" /> Pago pela Fitmind</span>}
          {isPending && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-300"><Clock className="h-3 w-3" /> Aguardando pagamento</span>}
          {needsSubmit && <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-3 py-1 text-xs font-medium text-red-300"><Upload className="h-3 w-3" /> Anexar boleto</span>}
        </div>
      </div>

      {isPaid ? (
        <div className="mt-3 space-y-1 text-sm text-white/80">
          {row.boleto_file_url && <a href={row.boleto_file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><FileText className="h-4 w-4" /> Boleto enviado</a>}
          {row.payment_proof_url && <a href={row.payment_proof_url} target="_blank" rel="noreferrer" className="ml-4 inline-flex items-center gap-1 text-emerald-300 hover:underline"><FileText className="h-4 w-4" /> Comprovante de pagamento</a>}
          <p className="text-xs text-white/50">Pago em {fmtDate(row.admin_paid_at)}</p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div>
            <label className="mb-1 block text-xs text-white/60">Arquivo do boleto (PDF/imagem)</label>
            <input ref={inputRef} type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-white file:mr-3 file:rounded-md file:border-0 file:bg-primary/20 file:px-3 file:py-1.5 file:text-primary" />
            {row.boleto_file_url && !file && <a href={row.boleto_file_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"><FileText className="h-3 w-3" /> Boleto atual</a>}
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/60">OU código de barras</label>
            <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="0000.00000 00000.000000 00000.000000 0 00000000000000" className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30" />
          </div>
          <button
            onClick={() => onSubmit(row, file, barcode)}
            disabled={busy || (!file && !barcode && !row.boleto_file_url && !row.boleto_barcode)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {row.submitted_at ? "Atualizar boleto" : "Enviar boleto para Fitmind"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Painel Admin */
export function AdminHerbalifeBoletosPanel() {
  const listFn = useServerFn(adminListHerbalifeBoletos);
  const confirmFn = useServerFn(adminConfirmHerbalifeBoleto);
  const [status, setStatus] = useState<"all" | "pending_admin_payment" | "paid">("pending_admin_payment");
  const [rows, setRows] = useState<HerbalifeBoletoRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setRows(null);
    const r = await listFn({ data: { status } });
    setRows(r);
  };
  useEffect(() => { load(); }, [status]);

  const handleConfirm = async (r: HerbalifeBoletoRow, file: File) => {
    setBusy(r.id);
    try {
      const url = await uploadFile(file, `proof/${r.order_id}`);
      await confirmFn({ data: { boletoId: r.id, paymentProofUrl: url } });
      alert("Pagamento confirmado.");
      await load();
    } catch (e: any) {
      alert("Erro: " + e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["pending_admin_payment", "paid", "all"] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-full px-3 py-1 text-xs font-medium ${status === s ? "bg-primary text-white" : "bg-white/10 text-white/70"}`}>
            {s === "pending_admin_payment" ? "Pendentes" : s === "paid" ? "Pagos" : "Todos"}
          </button>
        ))}
      </div>
      {rows === null ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !rows.length ? (
        <p className="text-sm text-white/60 py-6">Nenhum boleto {status === "pending_admin_payment" ? "pendente" : ""}.</p>
      ) : (
        rows.map((r) => <AdminBoletoCard key={r.id} row={r} onConfirm={handleConfirm} busy={busy === r.id} />)
      )}
    </div>
  );
}

function AdminBoletoCard({ row, onConfirm, busy }: { row: HerbalifeBoletoRow; onConfirm: (r: HerbalifeBoletoRow, file: File) => void; busy: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const isPaid = row.status === "paid";
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-white/60">{row.order_number} — {fmtDate(row.paid_at)}</p>
          <p className="font-semibold text-white">{row.product_name}</p>
          <p className="text-sm text-white/70">Cliente: {row.student_name} — {fmtBRL(row.gross_amount)}</p>
          <p className="text-sm text-white/70">Endereço: {row.shipping_summary || "—"}</p>
        </div>
        <div>
          {isPaid
            ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-300"><CheckCircle2 className="h-3 w-3" /> Pago</span>
            : <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-300"><Clock className="h-3 w-3" /> Pendente</span>}
        </div>
      </div>

      <div className="mt-3 space-y-1 text-sm">
        {row.boleto_file_url && <a href={row.boleto_file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><FileText className="h-4 w-4" /> Boleto anexado</a>}
        {row.boleto_barcode && <p className="text-white/70">Código: <code className="rounded bg-black/40 px-1">{row.boleto_barcode}</code></p>}
        {!row.boleto_file_url && !row.boleto_barcode && <p className="text-red-300">Nenhum boleto anexado ainda.</p>}
      </div>

      {isPaid ? (
        row.payment_proof_url && (
          <a href={row.payment_proof_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-emerald-300 hover:underline"><FileText className="h-4 w-4" /> Comprovante</a>
        )
      ) : (
        (row.boleto_file_url || row.boleto_barcode) && (
          <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-white/60">Comprovante de pagamento (PDF/imagem)</label>
              <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-white file:mr-3 file:rounded-md file:border-0 file:bg-primary/20 file:px-3 file:py-1.5 file:text-primary" />
            </div>
            <button onClick={() => file && onConfirm(row, file)} disabled={!file || busy} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirmar pagamento
            </button>
          </div>
        )
      )}
    </div>
  );
}
