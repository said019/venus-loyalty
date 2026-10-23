# Admin Form Surfaces

Audited with two agents on 2026-10-23. Scope is form/dialog presentation, not financial or scheduling rules.

## Covered Surfaces

| Area | Roots |
| --- | --- |
| Appointments | newApptDialog, editApptDialog, reschedule-dialog |
| Packages and credit | packageDialog, sellPackageDialog, creditDialog |
| Schedule blocks | blocksDialog |
| Payments and sales | paymentDialog, directSaleDialog, modal-cobrar-cita .cobro-modal |
| Income and expenses | manualIncomeDialog, expenseDialog, editarIngresoDialog |
| Receivables | receivable-dialog (new balance, installment, correction) |
| Inventory and invoice assignment | .ci-dialog, including .pi-dialog |
| Product and service editors | modal-product .modal-card, modal-service .modal-card |
| Clinical sessions | newSessionDialog |
| Client forms | card-modal-backdrop .cmx-card |
| Confirmations and prompts | venus-dialog-root .vd-card only, not the top-layer root |

Shared CSS controls typography, field sizes, theme-aware surfaces, focus and button hierarchy. The explicit JS allowlist decorates static and dynamically inserted forms without changing form values or event handlers. Product/service overlays are moved to body to escape page stacking contexts.

Edit appointment has a dedicated compact grid, scrollable body and fixed action footer. The submit button retains its form association; its existing handler now finds that external button.

## Preserved Exceptions

Scanners, signature canvases, photo viewers, payment-detail presentation, page-level navigation and underlying transaction rules are unchanged. Hidden controls, checkbox/radio sizes, monetary prefixes, searchable dropdowns and date-picker positioning retain their feature-specific behavior.

## Verification

- Node tests cover allowlist decoration, dynamic insertion, excluded viewers and edit form identifiers/submit association.
- Browser checks exercise 11 native dialogs and 6 dynamic/editor surfaces at 1440, 390 and 320px, with horizontal-bound checks and screenshots.
- Edit is checked in dark theme and reduced viewport height; cancel and submit validation are exercised without saving records.
- Browser verification blocks all non-GET requests and uses synthetic appointment data for payment/consumption previews.
