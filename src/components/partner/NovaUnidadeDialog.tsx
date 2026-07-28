import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { maskCNPJ, maskCPF, maskPhone } from "@/lib/masks";

interface Props {
  profileId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (partnerId: string) => void;
}

export function NovaUnidadeDialog({ profileId, open, onOpenChange, onCreated }: Props) {
  const [saving, setSaving] = useState(false);
  const [fantasyName, setFantasyName] = useState("");
  const [documentType, setDocumentType] = useState<"cnpj" | "cpf">("cnpj");
  const [documentValue, setDocumentValue] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [address, setAddress] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const salvar = async () => {
    if (!fantasyName.trim()) {
      toast.error("Informe o nome da unidade");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("partners" as never)
      .insert({
        profile_id: profileId,
        fantasy_name: fantasyName.trim(),
        document: documentValue || null,
        document_type: documentType,
        city: city || null,
        state: state ? state.toUpperCase().slice(0, 2) : null,
        address: address || null,
        whatsapp: whatsapp || null,
        status: "pending",
      } as never)
      .select("id")
      .maybeSingle();
    setSaving(false);

    if (error || !data) {
      toast.error(error?.message || "Não foi possível criar a unidade");
      return;
    }
    toast.success("Unidade criada! Aguarde a liberação do admin.");
    setFantasyName("");
    setDocumentValue("");
    setCity("");
    setState("");
    setAddress("");
    setWhatsapp("");
    onOpenChange(false);
    onCreated((data as unknown as { id: string }).id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Nova unidade
          </DialogTitle>
          <DialogDescription>
            Cadastre outra academia/loja no mesmo login. Cada unidade tem produtos,
            gratuitos e carteira próprios.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Nome da unidade *</Label>
            <Input
              value={fantasyName}
              onChange={(e) => setFantasyName(e.target.value)}
              placeholder="Ex: Mutação Fit - Unidade Centro"
            />
          </div>

          <div className="flex gap-2">
            <div className="w-32">
              <Label>Documento</Label>
              <select
                value={documentType}
                onChange={(e) => {
                  setDocumentType(e.target.value as "cnpj" | "cpf");
                  setDocumentValue("");
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="cnpj">CNPJ</option>
                <option value="cpf">CPF</option>
              </select>
            </div>
            <div className="flex-1">
              <Label>Número</Label>
              <Input
                value={documentValue}
                onChange={(e) =>
                  setDocumentValue(
                    documentType === "cnpj" ? maskCNPJ(e.target.value) : maskCPF(e.target.value),
                  )
                }
                placeholder={documentType === "cnpj" ? "00.000.000/0000-00" : "000.000.000-00"}
              />
            </div>
          </div>

          <div>
            <Label>Endereço</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número" />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <Label>Cidade</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="w-20">
              <Label>UF</Label>
              <Input value={state} onChange={(e) => setState(e.target.value)} maxLength={2} />
            </div>
          </div>

          <div>
            <Label>WhatsApp</Label>
            <Input
              value={whatsapp}
              onChange={(e) => setWhatsapp(maskPhone(e.target.value))}
              placeholder="(00) 00000-0000"
            />
          </div>

          <Button onClick={salvar} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar unidade"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default NovaUnidadeDialog;
