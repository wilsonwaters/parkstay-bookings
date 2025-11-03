-- WA ParkStay Bookings Database Schema
-- SQLite database for local data storage

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    encrypted_password TEXT NOT NULL,
    encryption_key TEXT NOT NULL,
    encryption_iv TEXT NOT NULL,
    encryption_auth_tag TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    booking_reference TEXT UNIQUE NOT NULL,
    park_name TEXT NOT NULL,
    campground_name TEXT NOT NULL,
    site_number TEXT,
    site_type TEXT,
    arrival_date DATE NOT NULL,
    departure_date DATE NOT NULL,
    num_nights INTEGER NOT NULL,
    num_guests INTEGER NOT NULL,
    total_cost DECIMAL(10,2),
    currency TEXT DEFAULT 'AUD',
    status TEXT NOT NULL CHECK(status IN ('confirmed', 'cancelled', 'pending')),
    booking_data JSON,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    synced_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_reference ON bookings(booking_reference);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_arrival_date ON bookings(arrival_date);
CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(arrival_date, departure_date);

-- Watches table
CREATE TABLE IF NOT EXISTS watches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    park_id TEXT NOT NULL,
    park_name TEXT NOT NULL,
    campground_id TEXT NOT NULL,
    campground_name TEXT NOT NULL,
    arrival_date DATE NOT NULL,
    departure_date DATE NOT NULL,
    num_guests INTEGER NOT NULL,
    preferred_sites JSON,
    site_type TEXT,
    check_interval_minutes INTEGER DEFAULT 5,
    is_active BOOLEAN DEFAULT 1,
    last_checked_at DATETIME,
    next_check_at DATETIME,
    last_result TEXT,
    found_count INTEGER DEFAULT 0,
    auto_book BOOLEAN DEFAULT 0,
    notify_only BOOLEAN DEFAULT 1,
    max_price DECIMAL(10,2),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_watches_user_id ON watches(user_id);
CREATE INDEX IF NOT EXISTS idx_watches_active ON watches(is_active);
CREATE INDEX IF NOT EXISTS idx_watches_next_check ON watches(next_check_at);
CREATE INDEX IF NOT EXISTS idx_watches_dates ON watches(arrival_date, departure_date);

-- Skip The Queue entries table
CREATE TABLE IF NOT EXISTS skip_the_queue_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    booking_id INTEGER NOT NULL,
    booking_reference TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    check_interval_minutes INTEGER DEFAULT 2,
    last_checked_at DATETIME,
    next_check_at DATETIME,
    attempts_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 1000,
    last_result TEXT,
    success_date DATETIME,
    new_booking_reference TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stq_user_id ON skip_the_queue_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_stq_booking_id ON skip_the_queue_entries(booking_id);
CREATE INDEX IF NOT EXISTS idx_stq_active ON skip_the_queue_entries(is_active);
CREATE INDEX IF NOT EXISTS idx_stq_next_check ON skip_the_queue_entries(next_check_at);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('watch_found', 'stq_success', 'booking_confirmed', 'error', 'warning', 'info')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    related_id INTEGER,
    related_type TEXT CHECK(related_type IN ('booking', 'watch', 'stq')),
    action_url TEXT,
    is_read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- Job logs table
CREATE TABLE IF NOT EXISTS job_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_type TEXT NOT NULL CHECK(job_type IN ('watch_poll', 'stq_check', 'cleanup')),
    job_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('success', 'failure', 'error')),
    message TEXT,
    error_details TEXT,
    duration_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_job_logs_type ON job_logs(job_type);
CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON job_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_logs_status ON job_logs(status);
CREATE INDEX IF NOT EXISTS idx_job_logs_created_at ON job_logs(created_at);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    value_type TEXT NOT NULL CHECK(value_type IN ('string', 'number', 'boolean', 'json')),
    category TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);

-- Triggers for auto-updating timestamps
CREATE TRIGGER IF NOT EXISTS update_users_timestamp
AFTER UPDATE ON users
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_bookings_timestamp
AFTER UPDATE ON bookings
BEGIN
    UPDATE bookings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_watches_timestamp
AFTER UPDATE ON watches
BEGIN
    UPDATE watches SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_stq_timestamp
AFTER UPDATE ON skip_the_queue_entries
BEGIN
    UPDATE skip_the_queue_entries SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_settings_timestamp
AFTER UPDATE ON settings
BEGIN
    UPDATE settings SET updated_at = CURRENT_TIMESTAMP WHERE key = NEW.key;
END;
