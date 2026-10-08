# REST API Reference

Base path: `/api/v1`

Browser authentication uses an HttpOnly cookie named `pknstan_session`. API clients such as Postman may also send `Authorization: Bearer <token>` if a token is issued through a custom integration; the built-in web UI does not store tokens in `localStorage`.

## Diagnostics

- `GET /health` — runtime/database connectivity
- `GET /api/v1/system/status` — database migrations, demo seed status, runtime information

## Authentication

- `POST /auth/mock-login` — demo login with `{ "institutionalId": "..." }`; only available when `DEMO_MODE=true`
- `GET /auth/me` — current session profile and roles
- `POST /auth/logout` — clear session cookie

## Member

- `GET /me/dashboard`
- `GET /me/loans`
- `GET /me/collective`
- `GET /me/clearance`

## Catalog & copies

- `GET /books?q=&available=true`
- `GET /books/:bookId`
- `GET /copies/:copyId`
- `POST /admin/books` — `LIBRARY_ADMIN`
- `POST /admin/books/:bookId/copies` — `LIBRARY_ADMIN`
- `PATCH /admin/copies/:copyId` — `LIBRARY_ADMIN`

## Individual circulation

- `POST /staff/loans` — `BOOK_STAFF`
- `POST /staff/returns` — `BOOK_STAFF`
- `POST /loans/:loanId/extensions` — owner of loan
- `GET /staff/extensions` — `BOOK_STAFF`
- `POST /staff/extensions/:extensionId/approve` — `BOOK_STAFF`
- `POST /staff/extensions/:extensionId/reject` — `BOOK_STAFF`

Create loan:

```json
{
  "institutionalId": "230012345",
  "barcodes": ["BK00129"]
}
```

Due date is always calculated by the backend from `working_calendar`; client-supplied due dates are not accepted.

## Book reservation

- `GET /reservations/me`
- `POST /reservations`
- `DELETE /reservations/:reservationId`
- `GET /staff/reservations` — `BOOK_STAFF`
- `POST /staff/reservations/:reservationId/ready` — `BOOK_STAFF`
- `POST /staff/reservations/:reservationId/convert-to-loan` — `BOOK_STAFF`

Create reservation:

```json
{ "copyId": "41000000-0000-0000-0000-000000000001" }
```

## Collective literature

Prefix `/staff/collective` — all endpoints require `BOOK_STAFF`.

- `GET /classes`
- `GET /classes/:classId/eligibility`
- `POST /loans`
- `GET /loans/:collectiveLoanId`
- `POST /loans/:collectiveLoanId/scan-return`
- `POST /loans/:collectiveLoanId/complete-return`

If a member is `BLOCKED`, that member is rejected without blocking the new class as a whole. Completion is rejected until `returned_items = expected_book_count`.

## Room

- `GET /rooms`
- `GET /rooms/availability?startAt=&endAt=&participants=`
- `POST /room-reservations`
- `GET /room-reservations/me`
- `DELETE /room-reservations/:id`
- `GET /staff/room-reservations?date=YYYY-MM-DD` — `ROOM_STAFF`
- `POST /staff/room-reservations/:id/check-in` — `ROOM_STAFF`
- `POST /staff/room-reservations/:id/key-out` — `ROOM_STAFF`
- `POST /staff/room-reservations/:id/check-out` — `ROOM_STAFF`

Datetime without timezone is interpreted as Asia/Jakarta (WIB). The service rejects cross-date reservations and applies blackout 12.00-13.00 WIB.

## Fine & payment

- `GET /fines/me`
- `POST /payments`
- `GET /staff/fines` — `BOOK_STAFF`
- `POST /staff/payments/:paymentId/verify` — `BOOK_STAFF`

When `DEMO_MODE=true`, non-cash payment is simulated. When `DEMO_MODE=false`, gateway payment returns `PAYMENT_GATEWAY_NOT_CONFIGURED` until the official payment integration is implemented. Cash recording requires `BOOK_STAFF`.

## Incident

- `GET /staff/incidents` — `BOOK_STAFF`
- `POST /staff/incidents` — `BOOK_STAFF`
- `POST /staff/incidents/:id/book-found` — `BOOK_STAFF`
- `POST /staff/incidents/:id/replacement` — `BOOK_STAFF`

Book-found/replacement resolution also settles the associated active loan item so it does not remain as a false outstanding obligation.

## Suggestion

- `GET /suggestions/me`
- `POST /suggestions`
- `GET /admin/suggestions` — `LIBRARY_ADMIN`
- `PATCH /admin/suggestions/:id` — `LIBRARY_ADMIN`

## Notification

- `GET /notifications`
- `POST /notifications/:id/read`

## Reporting, audit, integration

- `GET /reports/summary` — `LIBRARY_ADMIN`, `HEAD_UNIT`
- `GET /audit?limit=100` — `LIBRARY_ADMIN`, `HEAD_UNIT`, `SYSTEM_ADMIN`
- `GET /system/integrations` — `SYSTEM_ADMIN`
- `GET /system/parameters` — `LIBRARY_ADMIN`, `SYSTEM_ADMIN`
- `PATCH /system/parameters/:key` — `LIBRARY_ADMIN`

## Library clearance

- `POST /staff/clearance/recalculate` — `BOOK_STAFF`, `LIBRARY_ADMIN`

Only the member's own unresolved collective item counts as that member's collective obligation; another class member's missing copy does not make everyone `NOT_CLEAR`.

## Cron

- `GET /api/cron/housekeeping`

Requires header:

```text
Authorization: Bearer <CRON_SECRET>
```

## Standard response

```json
{
  "success": true,
  "message": "OK",
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "code": "COPY_NOT_AVAILABLE",
  "message": "Eksemplar tidak tersedia untuk dibooking.",
  "details": null,
  "requestId": "..."
}
```
