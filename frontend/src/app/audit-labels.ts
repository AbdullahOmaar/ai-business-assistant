type TranslationKeyMap = Readonly<Record<string, string>>;

const AUDIT_ACTION_KEYS: TranslationKeyMap = {
  "invoice.issued": "audit.actions.m_1dgwo7k",
  "invoice.created": "audit.actions.m_s89hy1",
  "invoice.draft_updated": "audit.actions.m_1h1mtay",
  "invoice.voided": "audit.actions.m_1b7zju0",
  "payment.recorded": "audit.actions.m_1fzpn4c",
  "expense.created": "audit.actions.m_1eswv36",
  "customer.created": "audit.actions.m_7ayrnh",
  "product.created": "audit.actions.m_w0ko2p",
  "stock.movement_recorded": "audit.actions.m_1jl8qoq",
  "supplier.created": "audit.actions.m_n1vp0a",
  "customer.updated": "audit.actions.m_1j81wf0",
  "customer.deactivated": "audit.actions.m_11zlj4h",
  "product.updated": "audit.actions.m_bu5930",
  "product.deactivated": "audit.actions.m_8y4ee1",
  "purchase_order.created": "audit.actions.m_1ghnskj",
  "purchase_order.approved": "audit.actions.m_xyjlem",
  "purchase_order.received": "audit.actions.m_5cn0in",
  "sales_return.created": "audit.actions.m_6u7t2s",
  "sales_return.approved": "audit.actions.m_kb0bxp",
  "recurring_invoice_schedule.created": "audit.actions.m_xaohcb",
  "data_import.completed": "audit.actions.m_rs4k6j",
  "pricing_rule.created": "audit.actions.m_yytv5x",
  "notification.queued": "audit.actions.m_13n1z3d",
  "membership.role_changed": "audit.actions.m_l1k3nf",
  "membership.removed": "audit.actions.m_1tlmi9r",
  "employee.created": "audit.actions.m_5gb65j",
  "employee.updated": "audit.actions.m_s6fn06",
  "payroll.created": "audit.actions.m_9py368",
  "payroll.updated": "audit.actions.m_fwgers",
  "payroll.approved": "audit.actions.m_471o6f",
  "payroll.paid": "audit.actions.m_a3700r",
  "platform.business.activated": "audit.actions.m_1yeuyii",
  "platform.business.deactivated": "audit.actions.m_19x7oma",
  "platform.user_role.granted": "audit.actions.m_1g5x0l2",
  "platform.user_role.revoked": "audit.actions.m_1a0g454"
};

const AUDIT_TARGET_KEYS: TranslationKeyMap = {
  "invoice": "audit.targets.m_1nfhuv2",
  "payment": "audit.targets.m_p9fxzd",
  "expense": "audit.targets.m_q7obp1",
  "customer": "audit.targets.m_1uow5er",
  "product": "audit.targets.m_13rez2z",
  "supplier": "audit.targets.m_1ec9f70",
  "stock_movement": "audit.targets.m_1yixbf5",
  "purchase_order": "audit.targets.m_zu2vq6",
  "sales_return": "audit.targets.m_1b010yp",
  "recurring_invoice_schedule": "audit.targets.m_3pds34",
  "import_job": "audit.targets.m_g2eok7",
  "pricing_rule": "audit.targets.m_9ckn2u",
  "business": "audit.targets.m_1evo6p1",
  "notification": "audit.targets.m_1cj9t7u",
  "business_membership": "audit.targets.m_1ygj3zy",
  "membership": "audit.targets.m_5zgvw5",
  "employee": "audit.targets.m_13tf6tx",
  "payroll": "audit.targets.m_xby7uc"
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_KEYS[action] || action;
}

export function auditTargetLabel(target: string): string {
  return AUDIT_TARGET_KEYS[target] || target;
}
