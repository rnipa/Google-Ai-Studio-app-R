# Security Specification & Invariants — Rasidul Premium ERP

## 1. Data Invariants
1. Every document lives strictly under `/users/{userId}/...` where `userId == request.auth.uid`.
2. Unauthenticated users or users without `request.auth.token.email_verified == true` cannot write any document.
3. Every `ownerId` / `uid` field in incoming payloads MUST match `request.auth.uid` on create and remain immutable on update.
4. Every `createdAt` field MUST equal `request.time` on create and remain immutable on update; `updatedAt` MUST equal `request.time` on create and update.
5. Every document ID path variable (`userId`, `historyId`, `clientId`, `txId`, `archiveId`, `expenseId`, `budgetId`) MUST match `^[a-zA-Z0-9_\\-]+$` and be <= 128 chars on single-doc operations.
6. Every string field has strict `.size()` upper bounds matching `firebase-blueprint.json` to prevent resource exhaustion.
7. Subcollection writes (`/ledgerClients/{clientId}/transactions/{txId}` and `/ledgerArchives/{archiveId}/transactions/{txId}`) verify parent document existence (`exists()` or `existsAfter()`) and enforce matching `clientId`/`archiveId`.
8. Settled archives (`ledgerArchives` and their `transactions`) are immutable once created (no update).
9. No shadow/ghost fields allowed: every create checks `hasAll` + `hasOnly` and every update checks `affectedKeys().hasOnly(...)` inside an `isValid[Entity](incoming())` gated rule.

## 2. The "Dirty Dozen" Attack Payloads (All MUST fail with PERMISSION_DENIED)
1. **Unauthenticated Write**: Creating `/users/u1/expenses/e1` with `auth = null`.
2. **Unverified Email Write**: Creating `/users/u1/expenses/e1` with `email_verified = false`.
3. **Cross-Tenant Read/Write (IDOR)**: User `u2` reading or writing `/users/u1/workspace/current`.
4. **OwnerId Spoofing**: User `u1` creating `/users/u1/expenses/e1` with `ownerId: "u2"`.
5. **Shadow / Ghost Field Injection**: User `u1` creating `/users/u1/expenses/e1` with extra field `isAdmin: true`.
6. **Immutable Field Tampering**: User `u1` updating `/users/u1/dailyHistories/h1` while modifying `createdAt` or `ownerId`.
7. **Timestamp Forgery**: User `u1` creating `/users/u1/expenses/e1` with a past client timestamp instead of `request.time`.
8. **ID Poisoning**: User `u1` creating `/users/u1/expenses/bad$id..with..chars` or a 200-char ID.
9. **String Exhaustion (DoW)**: User `u1` creating `/users/u1/expenses/e1` with a 50,000-char `note`.
10. **Orphaned Transaction**: User `u1` creating `/users/u1/ledgerClients/nonexistent/transactions/t1` where parent client does not exist.
11. **Archive Tampering**: User `u1` attempting to `update` an immutable `/users/u1/ledgerArchives/a1` document.
12. **Type Poisoning on Update**: User `u1` updating `/users/u1/workspace/current` with `mfsCapital: "not-a-number"`.
