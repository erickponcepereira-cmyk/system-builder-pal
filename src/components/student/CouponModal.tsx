import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { X, Ticket, Clock, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface CouponData {
  token: string;
  productName: string;
  discountPercent?: number | null;
  benefitWindow?: string | null;
}

export function CouponModal({ coupon, onClose }: { coupon: CouponData; onClose: () => void }) {
  const [used, setUsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const check = async () => {
      const { data } = await supabase
        .from("partner_coupons" as never)
        .select("status" as never)
        .eq("token" as never, coupon.token)
        .maybeSingle();
      if (cancelled) return;
      const status = (data as unknown as { status?: string } | null)?.status;
      if (status === "used") {
        setUsed(true);
        if (timer) clearInterval(timer);
      }
    };

    check();
    timer = setInterval(check, 2500);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [coupon.token]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1A1A1A] rounded-2xl p-6 max-w-sm w-full text-center relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-white/60 hover:text-white"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>

        {used ? (
          <div className="py-6 flex flex-col items-center gap-3">
            <div className="h-16 w-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-400" />
            </div>
            <h3 className="text-lg font-bold text-white">Cupom utilizado com sucesso!</h3>
            <p className="text-sm text-white/70">{coupon.productName}</p>
            {coupon.discountPercent ? (
              <p className="inline-block bg-emerald-500/20 text-emerald-300 text-xs font-extrabold px-3 py-1 rounded">
                {coupon.discountPercent}% OFF aplicado
              </p>
            ) : null}
            <button
              onClick={onClose}
              className="mt-2 w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground"
            >
              Fechar
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <Ticket className="h-8 w-8 text-primary" />
            <h3 className="mt-2 text-lg font-bold text-white">Seu Cupom</h3>
            <p className="text-sm text-white/70 mt-1">{coupon.productName}</p>
            {coupon.discountPercent ? (
              <p className="mt-2 inline-block bg-primary text-primary-foreground text-sm font-extrabold px-3 py-1 rounded">
                {coupon.discountPercent}% OFF
              </p>
            ) : null}
            {coupon.benefitWindow ? (
              <p className="mt-2 inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                <Clock className="h-3.5 w-3.5" /> {coupon.benefitWindow}
              </p>
            ) : null}

            <div className="my-4 bg-white p-3 rounded-xl flex items-center justify-center">
              <QRCodeSVG value={`COUPON:${coupon.token}`} size={200} />
            </div>

            <p className="text-[10px] text-white/40 break-all font-mono w-full">{coupon.token}</p>
            <p className="text-[11px] text-white/60 mt-3">
              Apresente este QR no parceiro para validar. O cupom é único e expira após o uso.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default CouponModal;
