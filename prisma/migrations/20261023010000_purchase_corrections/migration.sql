ALTER TABLE "purchase_allocations" DROP CONSTRAINT "purchase_allocations_quantity_check";
ALTER TABLE "purchase_allocations" ADD CONSTRAINT "purchase_allocations_quantity_check" CHECK ("quantity" <> 0);
