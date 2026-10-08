-- Production hardening indexes/constraints. Safe to apply to an existing v1 database.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_book_reservation_copy
  ON book_reservation(copy_id)
  WHERE status IN ('REQUESTED','READY_FOR_PICKUP');

CREATE INDEX IF NOT EXISTS idx_user_role_member ON user_role(member_id);
CREATE INDEX IF NOT EXISTS idx_class_member_member ON class_member(member_id);
CREATE INDEX IF NOT EXISTS idx_loan_item_loan ON loan_item(loan_id);
CREATE INDEX IF NOT EXISTS idx_reservation_member_status ON book_reservation(member_id,status);
CREATE INDEX IF NOT EXISTS idx_collective_loan_class_status ON collective_loan(class_id,status);
CREATE INDEX IF NOT EXISTS idx_collective_item_loan_status ON collective_loan_item(collective_loan_id,item_status);
CREATE INDEX IF NOT EXISTS idx_fine_member_status ON fine(member_id,status);
CREATE INDEX IF NOT EXISTS idx_payment_fine_created ON payment(fine_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_member_status ON book_incident(member_id,status);
CREATE INDEX IF NOT EXISTS idx_suggestion_member_created ON book_suggestion(member_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clearance_member_period ON library_clearance(member_id,period_id);
CREATE INDEX IF NOT EXISTS idx_integration_started ON integration_sync_log(started_at DESC);

-- One open key handover per reservation.
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_room_key_log
  ON room_key_log(room_reservation_id)
  WHERE returned_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_open_incident_copy
  ON book_incident(copy_id)
  WHERE status='OPEN';

CREATE TABLE IF NOT EXISTS system_runtime_state (
  state_key VARCHAR(100) PRIMARY KEY,
  state_value TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO system_runtime_state(state_key,state_value)
VALUES('last_housekeeping_at',NULL)
ON CONFLICT(state_key) DO NOTHING;
