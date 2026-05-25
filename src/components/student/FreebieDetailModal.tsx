import { X, MapPin, Instagram, Globe, Calendar, Clock, MessageCircle } from "lucide-react";

export interface FreebieDetail {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  address?: string | null;
  event_date?: string | null;
  event_time?: string | null;
  sponsor_name?: string | null;
  sponsor_bio?: string | null;
  sponsor_avatar?: string | null;
  sponsor_whatsapp?: string | null;
  sponsor_instagram?: string | null;
  sponsor_website?: string | null;
  image_url?: string | null;
}

interface Props {
  freebie: FreebieDetail;
  onClose: () => void;
  onAttend?: () => void;
  attendLabel?: string;
  attendDisabled?: boolean;
}

export function FreebieDetailModal({ freebie, onClose, onAttend, attendLabel, attendDisabled }: Props) {
  const waUrl = freebie.sponsor_whatsapp
    ? `https://wa.me/55${freebie.sponsor_whatsapp.replace(/\D/g, "")}`
    : null;
  const mapsUrl = freebie.address
    ? `https://maps.google.com/?q=${encodeURIComponent(freebie.address)}`
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        {freebie.image_url ? (
          <div className="relative h-48 overflow-hidden rounded-t-2xl">
            <img src={freebie.image_url} alt={freebie.title} className="h-full w-full object-cover" />
            <button
              onClick={onClose}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between p-5 pb-0">
            <h2 className="text-lg font-bold text-foreground">{freebie.title}</h2>
            <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
          </div>
        )}

        <div className="p-5 space-y-4">
          {freebie.image_url && (
            <h2 className="text-lg font-bold text-foreground">{freebie.title}</h2>
          )}

          {freebie.description && (
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{freebie.description}</p>
          )}

          {(freebie.event_date || freebie.event_time) && (
            <div className="flex items-center gap-4">
              {freebie.event_date && (
                <div className="flex items-center gap-1.5 text-sm text-foreground">
                  <Calendar className="h-4 w-4 text-primary" />
                  {new Date(freebie.event_date).toLocaleDateString("pt-BR")}
                </div>
              )}
              {freebie.event_time && (
                <div className="flex items-center gap-1.5 text-sm text-foreground">
                  <Clock className="h-4 w-4 text-primary" />
                  {freebie.event_time}
                </div>
              )}
            </div>
          )}

          {(freebie.address || freebie.location) && (
            <a
              href={mapsUrl || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2.5 hover:bg-accent transition-colors"
            >
              <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Localização</p>
                <p className="text-sm font-medium text-foreground">{freebie.address || freebie.location}</p>
                {mapsUrl && <p className="text-[10px] text-primary mt-0.5">Abrir no Google Maps →</p>}
              </div>
            </a>
          )}

          {freebie.sponsor_name && (
            <div className="rounded-xl border border-border p-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Patrocinado por</p>
              <div className="flex items-center gap-3">
                {freebie.sponsor_avatar ? (
                  <img src={freebie.sponsor_avatar} alt={freebie.sponsor_name} className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary">
                    {freebie.sponsor_name[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold text-foreground">{freebie.sponsor_name}</p>
                  {freebie.sponsor_bio && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{freebie.sponsor_bio}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {waUrl && (
                  <a href={waUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-full bg-[#25D366]/15 px-3 py-1.5 text-[11px] font-bold text-[#25D366]">
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                )}
                {freebie.sponsor_instagram && (
                  <a href={`https://instagram.com/${freebie.sponsor_instagram.replace("@", "")}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-full bg-pink-500/15 px-3 py-1.5 text-[11px] font-bold text-pink-400">
                    <Instagram className="h-3.5 w-3.5" /> Instagram
                  </a>
                )}
                {freebie.sponsor_website && (
                  <a href={freebie.sponsor_website} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[11px] font-bold text-muted-foreground">
                    <Globe className="h-3.5 w-3.5" /> Website
                  </a>
                )}
              </div>
            </div>
          )}

          {onAttend && (
            <button
              onClick={onAttend}
              disabled={attendDisabled}
              className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
            >
              {attendLabel || "✓ Marcar Presença"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
