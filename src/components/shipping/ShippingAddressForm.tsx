import { useEffect, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getMyShippingProfile } from "@/lib/shipping-orders.functions";

export type ShippingAddress = {
  shipping_zip: string;
  shipping_address: string;
  shipping_number: string;
  shipping_reference: string;
  shipping_location_url?: string;
};

export function ShippingAddressForm({
  value,
  onChange,
  onValidityChange,
  deliveryDays,
  autoLoadProfile = true,
  compact = false,
}: {
  value: ShippingAddress;
  onChange: (v: ShippingAddress) => void;
  onValidityChange?: (valid: boolean) => void;
  deliveryDays?: number | null;
  autoLoadProfile?: boolean;
  compact?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptCorrect, setAcceptCorrect] = useState(false);
  const loadProfile = useServerFn(getMyShippingProfile);

  useEffect(() => {
    if (!autoLoadProfile) return;
    if (value.shipping_zip || value.shipping_address) return;
    setLoading(true);
    loadProfile()
      .then((p: any) => {
        if (p && (p.shipping_zip || p.shipping_address)) {
          onChange({
            shipping_zip: p.shipping_zip || "",
            shipping_address: p.shipping_address || "",
            shipping_number: p.shipping_number || "",
            shipping_reference: p.shipping_reference || "",
            shipping_location_url: p.shipping_location_url || "",
          });
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const filled =
      !!value.shipping_zip.trim() &&
      !!value.shipping_address.trim() &&
      !!value.shipping_number.trim() &&
      !!value.shipping_reference.trim();
    onValidityChange?.(filled && acceptTerms && acceptCorrect);
  }, [value, acceptTerms, acceptCorrect, onValidityChange]);

  const inputCls = "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-primary focus:outline-none";

  return (
    <div className={`space-y-3 ${compact ? "" : "rounded-xl border border-primary/20 bg-primary/5 p-4"}`}>
      {!compact && (
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Endereço de entrega</p>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" />}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-1">
          <label className="mb-1 block text-[10px] text-white/50">CEP *</label>
          <input
            className={inputCls}
            value={value.shipping_zip}
            maxLength={20}
            onChange={(e) => onChange({ ...value, shipping_zip: e.target.value })}
            placeholder="00000-000"
          />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-[10px] text-white/50">Número *</label>
          <input
            className={inputCls}
            value={value.shipping_number}
            maxLength={20}
            onChange={(e) => onChange({ ...value, shipping_number: e.target.value })}
            placeholder="123 / Apto 45"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[10px] text-white/50">Logradouro *</label>
        <input
          className={inputCls}
          value={value.shipping_address}
          maxLength={255}
          onChange={(e) => onChange({ ...value, shipping_address: e.target.value })}
          placeholder="Rua, bairro, cidade — UF"
        />
      </div>

      <div>
        <label className="mb-1 block text-[10px] text-white/50">Referência *</label>
        <input
          className={inputCls}
          value={value.shipping_reference}
          maxLength={255}
          onChange={(e) => onChange({ ...value, shipping_reference: e.target.value })}
          placeholder="Ex.: em frente à padaria, portão azul"
        />
      </div>

      <div>
        <label className="mb-1 block text-[10px] text-white/50">Link do mapa (opcional)</label>
        <input
          className={inputCls}
          value={value.shipping_location_url || ""}
          maxLength={500}
          onChange={(e) => onChange({ ...value, shipping_location_url: e.target.value })}
          placeholder="https://maps.google.com/?q=..."
        />
      </div>

      <div className="space-y-2 rounded-lg border border-white/10 bg-black/30 p-3">
        <label className="flex items-start gap-2 text-[11px] text-white/70">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Aceito que o produto será entregue no endereço acima
            {deliveryDays ? (
              <>
                {" "}
                em um prazo médio de <b className="text-primary">{deliveryDays} dia(s)</b> úteis
              </>
            ) : null}
            .
          </span>
        </label>
        <label className="flex items-start gap-2 text-[11px] text-white/70">
          <input
            type="checkbox"
            checked={acceptCorrect}
            onChange={(e) => setAcceptCorrect(e.target.checked)}
            className="mt-0.5"
          />
          <span>Declaro que preenchi corretamente os dados de localização.</span>
        </label>
      </div>
    </div>
  );
}
