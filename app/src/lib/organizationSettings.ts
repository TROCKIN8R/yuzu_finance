import type { OrganizationSettings } from './types'

export type OrganizationSettingsForm = Omit<OrganizationSettings, 'user_id'>

/** Columns persisted to organization_settings — keep in sync with setup.sql */
export function buildOrganizationSettingsRow(
  userId: string,
  form: OrganizationSettingsForm,
  paymentInstructionsFr: string,
  paymentInstructionsEn: string
): OrganizationSettings {
  return {
    user_id: userId,
    company_legal_name: form.company_legal_name,
    company_operating_name: form.company_operating_name || null,
    address_line1: form.address_line1 || null,
    city: form.city || null,
    province: form.province || null,
    postal_code: form.postal_code || null,
    country: form.country || null,
    neq: form.neq || null,
    gst_number: form.gst_number || null,
    qst_number: form.qst_number || null,
    email: form.email || null,
    phone: form.phone || null,
    charge_gst: form.charge_gst,
    charge_qst: form.charge_qst,
    gst_rate: form.gst_rate,
    qst_rate: form.qst_rate,
    invoice_prefix: form.invoice_prefix,
    payment_terms_days: form.payment_terms_days,
    late_penalty_monthly_pct: form.late_penalty_monthly_pct,
    payment_instructions: paymentInstructionsFr || null,
    interac_email: form.interac_email?.trim() || null,
    bank_institution: form.bank_institution?.trim() || null,
    bank_transit: form.bank_transit?.trim() || null,
    bank_account: form.bank_account?.trim() || null,
    billing_inquiries_email: form.billing_inquiries_email?.trim() || null,
    payment_instructions_fr: paymentInstructionsFr || null,
    payment_instructions_en: paymentInstructionsEn || null,
    share_capital: form.share_capital,
    opening_retained_earnings: form.opening_retained_earnings,
    opening_cash_balance: form.opening_cash_balance,
    opening_balance_date: form.opening_balance_date || null,
    fiscal_year_end_month: form.fiscal_year_end_month,
    fiscal_year_end_day: form.fiscal_year_end_day,
    estimated_corp_tax_rate: form.estimated_corp_tax_rate,
    wip_accrual_enabled: form.wip_accrual_enabled,
    hsf_rate: form.hsf_rate,
    cnesst_rate: form.cnesst_rate,
  }
}

/** Legacy row without billing columns — used if migration 20260630140000 was not applied yet. */
export function buildOrganizationSettingsRowLegacy(
  userId: string,
  form: OrganizationSettingsForm,
  paymentInstructionsFr: string
): Partial<OrganizationSettings> & { user_id: string } {
  return {
    user_id: userId,
    company_legal_name: form.company_legal_name,
    company_operating_name: form.company_operating_name || null,
    address_line1: form.address_line1 || null,
    city: form.city || null,
    province: form.province || null,
    postal_code: form.postal_code || null,
    country: form.country || null,
    neq: form.neq || null,
    gst_number: form.gst_number || null,
    qst_number: form.qst_number || null,
    email: form.email || null,
    phone: form.phone || null,
    charge_gst: form.charge_gst,
    charge_qst: form.charge_qst,
    gst_rate: form.gst_rate,
    qst_rate: form.qst_rate,
    invoice_prefix: form.invoice_prefix,
    payment_terms_days: form.payment_terms_days,
    late_penalty_monthly_pct: form.late_penalty_monthly_pct,
    payment_instructions: paymentInstructionsFr || null,
    share_capital: form.share_capital,
    opening_retained_earnings: form.opening_retained_earnings,
    opening_cash_balance: form.opening_cash_balance,
    opening_balance_date: form.opening_balance_date || null,
    fiscal_year_end_month: form.fiscal_year_end_month,
    fiscal_year_end_day: form.fiscal_year_end_day,
    estimated_corp_tax_rate: form.estimated_corp_tax_rate,
  }
}

export function settingsSaveErrorMessage(error: { message: string; code?: string }): string {
  const msg = error.message ?? ''
  if (
    msg.includes('interac_email') ||
    msg.includes('payment_instructions_fr') ||
    msg.includes('payment_instructions_en') ||
    msg.includes('bank_institution')
  ) {
    return (
      'Colonnes de paiement manquantes dans Supabase. Exécutez la migration ' +
      '20260630140000_billing_payment_settings.sql (SQL Editor), puis réessayez.'
    )
  }
  if (msg.includes('opening_balance_date')) {
    return (
      'Colonne opening_balance_date manquante. Exécutez la migration ' +
      '20260630150000_opening_balance_date.sql, puis réessayez.'
    )
  }
  if (msg.includes('wip_accrual_enabled') || msg.includes('hsf_rate')) {
    return (
      'Colonnes comptabilité P4 manquantes. Exécutez la migration ' +
      '20260703150000_p4_accounting_features.sql, puis réessayez.'
    )
  }
  if (msg.includes('share_capital') || msg.includes('opening_retained_earnings')) {
    return (
      'Colonnes comptables manquantes. Exécutez la migration 20260702000000_accounting_v3.sql ' +
      '(ou setup.sql sur un projet neuf), puis réessayez.'
    )
  }
  return msg || 'Enregistrement impossible.'
}

export function mapSettingsRowToForm(data: OrganizationSettings): OrganizationSettingsForm {
  return {
    company_legal_name: data.company_legal_name ?? '',
    company_operating_name: data.company_operating_name ?? '',
    address_line1: data.address_line1 ?? '',
    city: data.city ?? '',
    province: data.province ?? 'QC',
    postal_code: data.postal_code ?? '',
    country: data.country ?? 'Canada',
    neq: data.neq ?? '',
    gst_number: data.gst_number ?? '',
    qst_number: data.qst_number ?? '',
    email: data.email ?? '',
    phone: data.phone ?? '',
    charge_gst: data.charge_gst ?? false,
    charge_qst: data.charge_qst ?? false,
    gst_rate: Number(data.gst_rate ?? 0.05),
    qst_rate: Number(data.qst_rate ?? 0.09975),
    invoice_prefix: data.invoice_prefix ?? 'YUZU',
    payment_terms_days: Number(data.payment_terms_days ?? 30),
    late_penalty_monthly_pct: Number(data.late_penalty_monthly_pct ?? 0.02),
    payment_instructions: data.payment_instructions ?? null,
    interac_email: data.interac_email ?? null,
    bank_institution: data.bank_institution ?? '',
    bank_transit: data.bank_transit ?? '',
    bank_account: data.bank_account ?? '',
    billing_inquiries_email: data.billing_inquiries_email ?? null,
    payment_instructions_fr: data.payment_instructions_fr ?? null,
    payment_instructions_en: data.payment_instructions_en ?? null,
    share_capital: Number(data.share_capital ?? 0),
    opening_retained_earnings: Number(data.opening_retained_earnings ?? 0),
    opening_cash_balance: Number(data.opening_cash_balance ?? 0),
    opening_balance_date: data.opening_balance_date ?? null,
    fiscal_year_end_month: Number(data.fiscal_year_end_month ?? 6),
    fiscal_year_end_day: Number(data.fiscal_year_end_day ?? 30),
    estimated_corp_tax_rate: Number(data.estimated_corp_tax_rate ?? 0.12),
    wip_accrual_enabled: Boolean(data.wip_accrual_enabled ?? false),
    hsf_rate: Number(data.hsf_rate ?? 0.0165),
    cnesst_rate: Number(data.cnesst_rate ?? 0.01),
  }
}
