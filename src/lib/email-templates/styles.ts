/**
 * Estilos compartilhados dos e-mails de autenticação.
 * Paleta FitMind: laranja vibrante sobre fundo claro (e-mail sempre claro,
 * mesmo com o app em dark mode, por compatibilidade com clientes de e-mail).
 */
export const BRAND = {
  primary: '#F04E23',
  primaryDark: '#C93A15',
  ink: '#171314',
  body: '#55575d',
  muted: '#9a9a9a',
  border: '#ececec',
  surface: '#fafafa',
}

export const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
}

export const container = {
  padding: '32px 28px',
  maxWidth: '520px',
  margin: '0 auto',
}

export const card = {
  border: `1px solid ${BRAND.border}`,
  borderRadius: '16px',
  padding: '28px 24px',
  backgroundColor: '#ffffff',
}

export const brandBar = {
  height: '4px',
  backgroundColor: BRAND.primary,
  borderRadius: '999px',
  margin: '0 0 24px',
}

export const brandName = {
  fontSize: '13px',
  fontWeight: 'bold' as const,
  letterSpacing: '1.5px',
  textTransform: 'uppercase' as const,
  color: BRAND.primary,
  margin: '0 0 8px',
}

export const h1 = {
  fontSize: '23px',
  fontWeight: 'bold' as const,
  color: BRAND.ink,
  lineHeight: '1.25',
  margin: '0 0 18px',
}

export const text = {
  fontSize: '15px',
  color: BRAND.body,
  lineHeight: '1.6',
  margin: '0 0 22px',
}

export const link = { color: BRAND.primaryDark, textDecoration: 'underline' }

export const button = {
  backgroundColor: BRAND.primary,
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  borderRadius: '12px',
  padding: '14px 26px',
  textDecoration: 'none',
  display: 'inline-block',
}

export const codeStyle = {
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: '28px',
  fontWeight: 'bold' as const,
  letterSpacing: '6px',
  color: BRAND.ink,
  backgroundColor: BRAND.surface,
  border: `1px solid ${BRAND.border}`,
  borderRadius: '12px',
  padding: '16px 20px',
  textAlign: 'center' as const,
  margin: '0 0 26px',
}

export const divider = {
  borderColor: BRAND.border,
  margin: '26px 0 18px',
}

export const footer = {
  fontSize: '12px',
  color: BRAND.muted,
  lineHeight: '1.6',
  margin: '0',
}
