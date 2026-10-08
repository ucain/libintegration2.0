CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS library_member (
  member_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutional_id VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(200),
  member_type VARCHAR(30) NOT NULL CHECK (member_type IN ('STUDENT','LECTURER','EMPLOYEE','STAFF')),
  member_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (member_status IN ('ACTIVE','INACTIVE')),
  collective_eligibility VARCHAR(20) NOT NULL DEFAULT 'ELIGIBLE' CHECK (collective_eligibility IN ('ELIGIBLE','BLOCKED')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role (
  role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  active_flag BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS permission (
  permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_code VARCHAR(100) UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS user_role (
  member_id UUID NOT NULL REFERENCES library_member(member_id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES role(role_id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID NULL REFERENCES library_member(member_id),
  PRIMARY KEY(member_id, role_id)
);

CREATE TABLE IF NOT EXISTS academic_period (
  period_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year VARCHAR(20) NOT NULL,
  semester VARCHAR(20) NOT NULL,
  uas_regular_end_date DATE NOT NULL,
  UNIQUE(academic_year, semester)
);

CREATE TABLE IF NOT EXISTS class_master (
  class_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES academic_period(period_id),
  class_name VARCHAR(100) NOT NULL,
  program VARCHAR(150),
  concentration VARCHAR(150),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS class_member (
  class_id UUID NOT NULL REFERENCES class_master(class_id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES library_member(member_id),
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_status VARCHAR(30) DEFAULT 'ACTIVE',
  PRIMARY KEY(class_id, member_id)
);

CREATE TABLE IF NOT EXISTS book_title (
  book_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isbn VARCHAR(30),
  title VARCHAR(300) NOT NULL,
  author VARCHAR(300),
  edition VARCHAR(80),
  publisher VARCHAR(200),
  publication_year INT CHECK (publication_year IS NULL OR publication_year BETWEEN 1500 AND 2200),
  category VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS book_copy (
  copy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES book_title(book_id) ON DELETE CASCADE,
  barcode VARCHAR(100) UNIQUE NOT NULL,
  location VARCHAR(200),
  condition VARCHAR(30) NOT NULL DEFAULT 'GOOD' CHECK (condition IN ('GOOD','MINOR_DAMAGE','DAMAGED')),
  status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','RESERVED','BORROWED','LOST','DAMAGED','MAINTENANCE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS individual_loan (
  loan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES library_member(member_id),
  loan_date DATE NOT NULL,
  due_date DATE NOT NULL,
  period_status VARCHAR(30) NOT NULL DEFAULT 'NORMAL' CHECK (period_status IN ('NORMAL','PERPANJANGAN')),
  transaction_status VARCHAR(30) NOT NULL DEFAULT 'DIPINJAM' CHECK (transaction_status IN ('DIPINJAM','TERLAMBAT','DIKEMBALIKAN','HILANG_RUSAK')),
  created_by UUID NOT NULL REFERENCES library_member(member_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loan_item (
  loan_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES individual_loan(loan_id) ON DELETE CASCADE,
  copy_id UUID NOT NULL REFERENCES book_copy(copy_id),
  returned_at TIMESTAMPTZ NULL,
  return_condition VARCHAR(30) NULL CHECK (return_condition IS NULL OR return_condition IN ('GOOD','MINOR_DAMAGE','DAMAGED','LOST')),
  returned_by UUID NULL REFERENCES library_member(member_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_loan_copy
  ON loan_item(copy_id)
  WHERE returned_at IS NULL;

CREATE TABLE IF NOT EXISTS loan_extension (
  extension_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES individual_loan(loan_id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by UUID NULL REFERENCES library_member(member_id),
  approved_at TIMESTAMPTZ NULL,
  new_due_date DATE NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','APPROVED','REJECTED')),
  note TEXT
);

CREATE TABLE IF NOT EXISTS book_reservation (
  reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES library_member(member_id),
  copy_id UUID NOT NULL REFERENCES book_copy(copy_id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ready_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','READY_FOR_PICKUP','EXPIRED','CANCELLED','CONVERTED_TO_LOAN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_reservation_copy
  ON book_reservation(copy_id)
  WHERE status IN ('REQUESTED','READY_FOR_PICKUP');

CREATE TABLE IF NOT EXISTS collective_loan (
  collective_loan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES class_master(class_id),
  expected_book_count INT NOT NULL CHECK (expected_book_count > 0),
  loan_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DUE','OVERDUE','COMPLETED')),
  created_by UUID NOT NULL REFERENCES library_member(member_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS collective_loan_item (
  collective_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_loan_id UUID NOT NULL REFERENCES collective_loan(collective_loan_id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES library_member(member_id),
  copy_id UUID NOT NULL REFERENCES book_copy(copy_id),
  item_status VARCHAR(30) NOT NULL DEFAULT 'ASSIGNED' CHECK (item_status IN ('ASSIGNED','RETURNED')),
  UNIQUE(collective_loan_id, member_id),
  UNIQUE(collective_loan_id, copy_id)
);

CREATE TABLE IF NOT EXISTS collective_return (
  collective_return_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_loan_id UUID UNIQUE NOT NULL REFERENCES collective_loan(collective_loan_id),
  completed_at TIMESTAMPTZ NOT NULL,
  overdue_workdays INT NOT NULL DEFAULT 0 CHECK (overdue_workdays >= 0),
  fine_per_copy NUMERIC(14,2) NOT NULL DEFAULT 1000,
  total_fine NUMERIC(14,2) NOT NULL DEFAULT 0,
  verified_by UUID NOT NULL REFERENCES library_member(member_id)
);

CREATE TABLE IF NOT EXISTS fine (
  fine_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('INDIVIDUAL_LOAN','COLLECTIVE_LOAN')),
  source_id UUID NOT NULL,
  member_id UUID NULL REFERENCES library_member(member_id),
  overdue_workdays INT NOT NULL DEFAULT 0 CHECK (overdue_workdays >= 0),
  amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID','PAYMENT_PENDING','PAID_UNVERIFIED','VERIFIED','WAIVED')),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_type, source_id)
);

CREATE TABLE IF NOT EXISTS payment (
  payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fine_id UUID NOT NULL REFERENCES fine(fine_id),
  method VARCHAR(30) NOT NULL CHECK (method IN ('CASH','QRIS','GATEWAY')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  gateway_reference VARCHAR(200),
  gateway_status VARCHAR(30) CHECK (gateway_status IS NULL OR gateway_status IN ('PENDING','SUCCESS','FAILED')),
  paid_at TIMESTAMPTZ NULL,
  staff_verified_by UUID NULL REFERENCES library_member(member_id),
  staff_verified_at TIMESTAMPTZ NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUCCESS','FAILED','VERIFIED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS book_incident (
  incident_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES library_member(member_id),
  copy_id UUID NOT NULL REFERENCES book_copy(copy_id),
  incident_type VARCHAR(30) NOT NULL CHECK (incident_type IN ('LOST','DAMAGED')),
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','CLOSED')),
  resolution_reason VARCHAR(50),
  resolved_at TIMESTAMPTZ NULL,
  created_by UUID NOT NULL REFERENCES library_member(member_id)
);

CREATE TABLE IF NOT EXISTS book_replacement (
  replacement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES book_incident(incident_id),
  replacement_book_title VARCHAR(300) NOT NULL,
  replacement_edition VARCHAR(80),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_by UUID NOT NULL REFERENCES library_member(member_id),
  verification_result VARCHAR(30) NOT NULL CHECK (verification_result IN ('ACCEPTED','REJECTED'))
);

CREATE TABLE IF NOT EXISTS library_clearance (
  clearance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES library_member(member_id),
  period_id UUID NOT NULL REFERENCES academic_period(period_id),
  status VARCHAR(20) NOT NULL CHECK (status IN ('CLEAR','NOT_CLEAR')),
  reason TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ,
  UNIQUE(member_id, period_id)
);

CREATE TABLE IF NOT EXISTS discussion_room (
  room_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_name VARCHAR(100) NOT NULL,
  capacity INT NOT NULL CHECK (capacity >= 3),
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','MAINTENANCE')),
  location VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS room_reservation (
  room_reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES library_member(member_id),
  room_id UUID NOT NULL REFERENCES discussion_room(room_id),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  participant_count INT NOT NULL CHECK (participant_count >= 3),
  status VARCHAR(30) NOT NULL DEFAULT 'BOOKED' CHECK (status IN ('BOOKED','CHECKED_IN','COMPLETED','CANCELLED','NO_SHOW')),
  checkin_at TIMESTAMPTZ NULL,
  checkout_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

CREATE TABLE IF NOT EXISTS room_key_log (
  key_log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_reservation_id UUID NOT NULL REFERENCES room_reservation(room_reservation_id),
  handed_out_by UUID NULL REFERENCES library_member(member_id),
  handed_out_at TIMESTAMPTZ NULL,
  returned_to UUID NULL REFERENCES library_member(member_id),
  returned_at TIMESTAMPTZ NULL,
  condition_note TEXT
);

CREATE TABLE IF NOT EXISTS academic_calendar_event (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_event_id VARCHAR(100) UNIQUE,
  event_type VARCHAR(80) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  description TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS working_calendar (
  calendar_date DATE PRIMARY KEY,
  is_working_day BOOLEAN NOT NULL,
  event_type VARCHAR(80),
  description TEXT,
  source_event_id VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS notification (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES library_member(member_id),
  event_type VARCHAR(100) NOT NULL,
  reference_type VARCHAR(100),
  reference_id UUID,
  channel VARCHAR(30) NOT NULL DEFAULT 'IN_APP' CHECK (channel IN ('IN_APP','EMAIL_MOCK')),
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ NULL,
  read_at TIMESTAMPTZ NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENT','FAILED'))
);

CREATE TABLE IF NOT EXISTS book_suggestion (
  suggestion_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES library_member(member_id),
  title VARCHAR(300) NOT NULL,
  author VARCHAR(300) NOT NULL,
  isbn VARCHAR(30),
  publisher VARCHAR(200),
  edition VARCHAR(80),
  year INT,
  subject VARCHAR(200),
  reason TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  status VARCHAR(50) NOT NULL DEFAULT 'DIAJUKAN' CHECK (status IN ('DIAJUKAN','DITINJAU','DISETUJUI','DITOLAK','DALAM_PROSES_PENGADAAN','TERSEDIA')),
  reviewed_by UUID NULL REFERENCES library_member(member_id),
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id BIGSERIAL PRIMARY KEY,
  actor_id UUID NULL REFERENCES library_member(member_id),
  action VARCHAR(120) NOT NULL,
  object_type VARCHAR(120) NOT NULL,
  object_id VARCHAR(120),
  old_value JSONB,
  new_value JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  result VARCHAR(30) NOT NULL DEFAULT 'SUCCESS'
);

CREATE TABLE IF NOT EXISTS system_parameter (
  parameter_key VARCHAR(100) PRIMARY KEY,
  parameter_value VARCHAR(500) NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by UUID NULL REFERENCES library_member(member_id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration_sync_log (
  sync_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system VARCHAR(100) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  record_count INT NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL CHECK (status IN ('RUNNING','SUCCESS','FAILED')),
  error_summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_book_title_search ON book_title(title, author);
CREATE INDEX IF NOT EXISTS idx_book_copy_status ON book_copy(status);
CREATE INDEX IF NOT EXISTS idx_loan_member ON individual_loan(member_id, transaction_status);
CREATE INDEX IF NOT EXISTS idx_room_schedule ON room_reservation(room_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_notification_member ON notification(member_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
