# FACTURE · INVOICE

**{{company_legal_name}}**  
{{company_address}}  
NEQ : {{neq}}  
{{tax_registration_lines}}

---

| | |
|---|---|
| **Facture n° / Invoice #** | {{invoice_number}} |
| **Date** | {{invoice_date}} |
| **Échéance / Due** | {{due_date}} |
| **Projet / Project** | {{project_name}} |

## Facturer à · Bill to

**{{client_legal_name}}**  
{{client_address}}  
{{client_contact_line}}

---

## Détail · Line items

| Date | Description | {{hours_label}} | Taux / Rate | Montant / Amount |
|------|-------------|-----------------|-------------|------------------|
{{line_items}}

---

| | Montant / Amount |
|---|--:|
| Sous-total / Subtotal | {{subtotal}} |
| TPS / GST ({{gst_rate_display}}) | {{gst}} |
| TVQ / QST ({{qst_rate_display}}) | {{qst}} |
| **Total** | **{{total}}** |

---

**Modalités / Terms** : Net {{payment_terms_days}} jours / days  
{{payment_instructions}}

*Les montants sont en dollars canadiens (CAD). / Amounts in Canadian dollars (CAD).*
