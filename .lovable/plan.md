# Recorte 1:1 obrigatório em todos os uploads de imagem

## Objetivo
Toda imagem enviada no sistema passa por uma etapa de **ajuste/recorte 1:1** antes do upload, mostrando exatamente como vai aparecer no card/avatar/produto. Vale para produtos de parceiros, profissionais, Fitmind, e também avatares, badges, capas, eventos, evolução, etc.

## Como vai funcionar (UX)
1. Usuário clica em "Enviar imagem".
2. Abre um modal com a imagem escolhida dentro de um quadro **quadrado (1:1)**.
3. Usuário pode arrastar/pinch-zoom para posicionar. Um overlay mostra "assim vai aparecer".
4. Botões: Cancelar / Confirmar.
5. Ao confirmar, a imagem é **recortada 1:1 no cliente** (canvas) e só então enviada ao storage. O que sobe já é o recorte final — sem "surpresas" no card.

## Componentes novos

- `src/components/ui/ImageCropDialog.tsx`
  - Modal com cropper 1:1, zoom, drag. Sem dependência nova pesada: implementação leve com canvas + gestos, ou `react-easy-crop` (lib pequena, ~15kb, já compatível). Vou usar `react-easy-crop`.
  - Recebe um `File`, devolve um `Blob` recortado quadrado (com limite de resolução, ex.: 1024×1024, JPEG qualidade 0.9).

- `src/components/ui/ImageUploadField.tsx`
  - Wrapper padrão: botão + preview quadrado + remover.
  - Props: `value`, `onChange(url|null)`, `bucket`, `folder`, `label`, `size` (sm/md/lg), `maxMB` (default 2).
  - Fluxo: seleciona arquivo → abre `ImageCropDialog` → sobe o blob recortado → chama `onChange(publicUrl)`.
  - Substitui a lógica ad-hoc espalhada nos formulários.

## Refactor dos uploads existentes
Trocar cada ponto de upload de imagem pelo novo `ImageUploadField` (ou usar o `ImageCropDialog` antes do upload, quando o componente atual for muito específico):

- Produtos e lojas
  - `src/components/admin/StoreImageUpload.tsx` (base — vira wrapper do novo)
  - `src/components/admin/StoreManager.tsx`, `StoreItemsManager.tsx`, `ProductDownloadsManager.tsx`
  - `src/components/professional/ProfessionalProductsPanel.tsx`
  - `src/components/coach/tabs/ProfessionalProductsApprovalTab.tsx` (revisão) — só garante preview 1:1
  - Parceiros: `src/routes/_authenticated/partner.tsx`, `src/components/partners/PartnerDetailsModal.tsx`
  - Fitmind: `src/routes/_authenticated/admin.fitmind-events.tsx`, `FitmindCalendar.tsx`

- Perfis e identidade
  - `src/routes/_authenticated/student.profile.edit.tsx`
  - `src/components/professional/SettingsTab.tsx`
  - `src/components/coach/tabs/CoachProfileTab.tsx`
  - `src/components/coach/CoachProfileModal.tsx`
  - `src/routes/onboarding.tsx`

- Outros (badges, freebies, biblioteca, carreira, patents, evolução, grupo, referências)
  - `admin.freebies.tsx`, `student.freebies.tsx`, `FreebieDetailModal.tsx`
  - `admin.library.tsx`, `admin.patents.tsx`, `admin.career.tsx`
  - `admin.partners.tsx`, `admin.professional-products.tsx`
  - `BadgeImageUploader.tsx`
  - `student.evolution.tsx`, `student.group.tsx`
  - `StudentReferralModal.tsx`, `HerbalifeBoletosPanel.tsx` (só se for imagem — comprovantes de boleto continuam livres, ver ressalva abaixo)

## Ressalvas
- **Comprovantes/documentos** (boletos Herbalife, PDFs) **não** são recortados — continuam upload livre. O recorte 1:1 aplica-se apenas a imagens de produto/perfil/capa. O `ImageUploadField` só é usado onde faz sentido visual.
- **Imagens já cadastradas** ficam como estão; o recorte vale a partir de novos uploads e edições.
- Nenhuma mudança em RLS ou buckets — mantém `store-images` e demais buckets existentes.

## Detalhes técnicos
- Adicionar dependência: `react-easy-crop` (via `bun add react-easy-crop`).
- Recorte no cliente com `<canvas>`: gera `Blob` JPEG/PNG (mantém PNG se original for PNG com transparência, senão JPEG q=0.9), lado máximo 1024px.
- Upload continua no bucket atual de cada contexto (não muda naming nem paths).
- Estilo do modal: mesmo dark + laranja do sistema (tokens de `src/styles.css`).
- Acessibilidade: foco preso no modal, ESC cancela, botão confirmar destacado.

## Entregáveis
- 2 componentes novos (`ImageCropDialog`, `ImageUploadField`).
- 1 dependência nova (`react-easy-crop`).
- Substituições nos ~20 pontos listados acima.
- Sem migração de banco.