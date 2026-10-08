# Test Cases

| ID | Scenario | Expected result |
|---|---|---|
| TC-001 | Vercel deployment without `DATABASE_URL` | `/health` degraded; API returns configuration/database error, not opaque login 500 |
| TC-002 | Database connected but schema absent and `AUTO_MIGRATE=true` | Schema/migrations applied once |
| TC-003 | `DEMO_MODE=true` + `AUTO_SEED_DEMO=true` on empty DB | Demo accounts seeded |
| TC-004 | Mock login active user | HttpOnly session cookie created; login succeeds |
| TC-005 | Login unknown user | `MEMBER_NOT_FOUND` |
| TC-006 | Login INACTIVE member | `MEMBER_INACTIVE` |
| TC-007 | Member endpoint without session | `UNAUTHENTICATED` |
| TC-008 | Student calls staff endpoint | `FORBIDDEN` |
| TC-009 | Loan copy AVAILABLE | Success; copy `BORROWED` |
| TC-010 | Third active copy | `LOAN_LIMIT_REACHED` |
| TC-011 | Concurrent allocation of same copy | Only one commit succeeds |
| TC-012 | Due date calculation | Loan date counts as working day #1 |
| TC-013 | Extension first request before overdue | `REQUESTED` |
| TC-014 | Second approved extension | `EXTENSION_LIMIT_REACHED` |
| TC-015 | Extension after overdue | `LOAN_ALREADY_OVERDUE` |
| TC-016 | Booking copy AVAILABLE | Reservation created; copy `RESERVED` |
| TC-017 | Concurrent booking same copy | Unique active reservation prevents double allocation |
| TC-018 | READY booking exceeds 3 calendar days | `EXPIRED`, copy released |
| TC-019 | Convert expired booking to loan before cron runs | `RESERVATION_EXPIRED` and copy released |
| TC-020 | Collective assignment all eligible | Success |
| TC-021 | One member BLOCKED | Only that member causes rejection; class itself is not globally blocked |
| TC-022 | Overdue collective member with own item missing | Member becomes `BLOCKED` |
| TC-023 | That member returns outstanding item | Eligibility restored if no other overdue collective obligation |
| TC-024 | Collective return incomplete | Completion rejected |
| TC-025 | Collective return complete | `COMPLETED` |
| TC-026 | Collective overdue | Fine = expected copy × overdue workdays × Rp1.000 |
| TC-027 | Individual return on time | Fine Rp0 |
| TC-028 | Individual overdue | Rp1.000 × overdue working days per copy |
| TC-029 | Demo QRIS with `DEMO_MODE=true` | Payment `SUCCESS`, fine `PAID_UNVERIFIED` |
| TC-030 | Gateway payment with `DEMO_MODE=false` | `PAYMENT_GATEWAY_NOT_CONFIGURED` |
| TC-031 | Cash payment by student | `CASH_STAFF_ONLY` |
| TC-032 | Staff verifies payment | Payment/fine `VERIFIED` |
| TC-033 | Open lost-book incident | Copy `LOST`, loan `HILANG_RUSAK` |
| TC-034 | Open second incident for same copy | `INCIDENT_ALREADY_OPEN` |
| TC-035 | Lost book found and accepted | Incident resolved, loan item settled, copy available |
| TC-036 | Replacement accepted | Incident closed, loan item settled, original copy remains lost/damaged |
| TC-037 | Clearance member has returned own collective copy but class incomplete because another member | That classmate's missing copy does not block this member's clearance |
| TC-038 | Room 2 participants | `MIN_PARTICIPANTS` |
| TC-039 | Room above capacity | `ROOM_CAPACITY_EXCEEDED` |
| TC-040 | Room >2 hours | `DURATION_EXCEEDED` |
| TC-041 | Room crosses date boundary | `ROOM_CROSS_DATE_NOT_ALLOWED` |
| TC-042 | Room overlaps 12.00-13.00 WIB | `BLACKOUT_PERIOD` |
| TC-043 | Room more than H-1 | `BOOKING_DATE_NOT_ALLOWED` |
| TC-044 | Two concurrent bookings same room/slot | Room row lock prevents double booking |
| TC-045 | No check-in after 15 minutes | Lazy housekeeping/cron marks `NO_SHOW` |
| TC-046 | Suggestion required fields absent | `REQUIRED_FIELD` |
| TC-047 | Duplicate active suggestion | `DUPLICATE_SUGGESTION` |
| TC-048 | Notification from another member marked read | 404/row-level protection |
| TC-049 | Critical mutation | Audit row created |
| TC-050 | Vercel runtime | Node 24.x |

Automated tests in `tests/business-rules.test.js` cover calendar-day expiry, WIB timezone interpretation, room H-1, minimum participants, maximum duration, blackout, and cross-date rejection. Database/API integration tests should be executed against a dedicated test database before UAT.
