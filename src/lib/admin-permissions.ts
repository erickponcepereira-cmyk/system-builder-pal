export type AdminPermKey =
  | "dashboard" | "coaches" | "inactivity" | "students" | "users"
  | "products" | "orders" | "digital_products" | "coach_applications"
  | "payments" | "reports" | "patents" | "settings" | "calendars" | "store";

export const ADMIN_PERMISSIONS: { key: AdminPermKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "coaches", label: "Coaches" },
  { key: "inactivity", label: "Inatividade" },
  { key: "students", label: "Alunos" },
  { key: "users", label: "Admins" },
  { key: "products", label: "Produtos" },
  { key: "orders", label: "Pedidos" },
  { key: "digital_products", label: "Cursos" },
  { key: "coach_applications", label: "Formação Coach" },
  { key: "payments", label: "Pagamentos" },
  { key: "reports", label: "Relatórios" },
  { key: "patents", label: "Patentes" },
  { key: "calendars", label: "Agendas" },
  { key: "store", label: "Loja" },
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
