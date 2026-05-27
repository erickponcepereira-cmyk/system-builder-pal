export type AdminPermKey =
  | "dashboard" | "coaches" | "inactivity" | "students" | "users"
  | "orders" | "digital_products" | "coach_applications"
  | "payments" | "financeiro" | "reports" | "patents" | "settings" | "calendars" | "store" | "freebies" | "store_reports" | "products"
  | "product_orders" | "nutritionist_wallet" | "admin_wallet" | "career" | "library" | "partners" | "professionals" | "assessment_deletions";

export const ADMIN_PERMISSIONS: { key: AdminPermKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "coaches", label: "Coaches" },
  { key: "inactivity", label: "Inatividade" },
  { key: "students", label: "Alunos" },
  { key: "users", label: "Admins" },
  
  { key: "orders", label: "Pedidos" },
  { key: "digital_products", label: "Cursos" },
  { key: "coach_applications", label: "Formação Coach" },
  { key: "payments", label: "Pagamentos" },
  { key: "financeiro", label: "Financeiro" },
  { key: "reports", label: "Relatórios" },
  { key: "patents", label: "Patentes" },
  { key: "calendars", label: "Agendas" },
  { key: "store", label: "Loja" },
  { key: "freebies", label: "Gratuitos" },
  { key: "store_reports", label: "Relatórios da Loja" },
  { key: "products", label: "Motor Financeiro" },
  { key: "product_orders", label: "Painel de Pedidos" },
  { key: "nutritionist_wallet", label: "Carteira Nutricionista" },
  { key: "career", label: "Carreira" },
  { key: "library", label: "Biblioteca" },
  { key: "partners", label: "Empresas Parceiras" },
  { key: "professionals", label: "Profissionais" },
  { key: "assessment_deletions", label: "Exclusões de Avaliações" },
  { key: "settings", label: "Configurações" },
];

export interface AdminPerms {
  full?: boolean;
  [k: string]: boolean | undefined;
}

export function canAccess(
  perms: AdminPerms | null | undefined,
  isMaster: boolean,
  key: AdminPermKey,
): boolean {
  if (isMaster) return true;
  if (!perms) return false;
  if (perms.full) return true;
  return !!perms[key];
}
