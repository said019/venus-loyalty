# Independent review corrections

Implemented locally after reviewing d2d8e0b. Not deployed by this change.

## Access

Card IDs are identifiers, not secrets: some existing cards use timestamps.
Both skin report endpoints now require a 256-bit random bearer credential.
The authenticated advisor issues it when sharing a report. Only its SHA-256
digest is stored in Settings, keyed to the card. Sending another link rotates
the credential and invalidates previous links for that card. A link grants
access to the card's visible skin history, not other cards.

The credential travels in the page URL fragment, then in an Authorization
header for API calls. The browser stores it in sessionStorage per card and
removes the fragment when storage succeeds. Without a credential, the loyalty
page hides skin history. Open the private link in the same tab/session first.
Old bare report links must be resent from the advisor. Ordinary loyalty card
operations are unchanged. Previously downloaded images cannot be revoked.

## Approved maps

Approval stores exact layerSetIds in the approval JSON within its transaction.
Public rendering fetches only those sets and verifies record/photo ownership.
Generating new sets cannot replace an approved report's maps. Legacy approvals
without this snapshot expose no maps; create and review a new assessment to
publish maps. There is no automatic backfill claiming old maps were reviewed.

## Imported reports

Phone matching is allowed only when the imported analysis has no cardId.
An explicit foreign card association always wins over a phone match.

## Rollout

No Prisma schema migration is required. Deploy backend and public assets
together. Re-send private links from the advisor after deployment. Verify on
the Moji and a client phone with test data; no physical device verification or
production database mutation was performed during this correction.

Legacy imported-report delivery endpoints and Cloudinary asset access are not
redesigned here. This hardens the new skin-reports routes, not every historical
public API in the application.
