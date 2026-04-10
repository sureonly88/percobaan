-- Change item_code unique constraint from global to per-request
-- Allows same item_code across different payment requests (e.g. prepaid repeated purchases)
ALTER TABLE multi_payment_items
  DROP INDEX uq_multi_payment_item_code,
  ADD UNIQUE KEY uq_multi_payment_item_per_request (multi_payment_id, item_code);
