-- Read-only, aggregate-only audit for legacy customer linkage.
-- Safe for production inspection: no identifiers, customer data, or money values are returned.
-- Run against the intended database after confirming the environment.
SELECT
  (SELECT count(*) FROM invoices) AS invoices_total,
  (SELECT count(*) FROM invoices WHERE customer_id IS NULL) AS invoices_missing_customer,
  (SELECT count(*) FROM invoices WHERE customer_id IS NULL AND status = 'draft') AS draft_invoices_missing_customer,
  (SELECT count(*) FROM invoices WHERE customer_id IS NULL AND status = 'issued') AS issued_invoices_missing_customer,
  (SELECT count(*) FROM invoices WHERE customer_id IS NULL AND status = 'void') AS void_invoices_missing_customer,
  (SELECT count(*) FROM invoices i
     LEFT JOIN customers c
       ON c.id = i.customer_id AND c.business_id = i.business_id
    WHERE i.customer_id IS NOT NULL AND c.id IS NULL) AS invoices_with_invalid_customer_link,
  (SELECT count(*) FROM payments) AS payments_total,
  (SELECT count(*) FROM payments WHERE customer_id IS NULL) AS payments_missing_customer,
  (SELECT count(*)
     FROM payment_allocations a
     JOIN payments p ON p.id = a.payment_id AND p.business_id = a.business_id
     JOIN invoices i ON i.id = a.invoice_id AND i.business_id = a.business_id
    WHERE p.customer_id IS DISTINCT FROM i.customer_id
       OR p.currency_code <> i.currency_code) AS allocations_with_customer_or_currency_mismatch;

-- Optional per-status breakdown without exposing business/customer identifiers.
SELECT status, count(*) AS invoices_total,
       count(*) FILTER (WHERE customer_id IS NULL) AS invoices_missing_customer
  FROM invoices
 GROUP BY status
 ORDER BY status;
