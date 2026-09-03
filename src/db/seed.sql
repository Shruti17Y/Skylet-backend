-- Seed data for Electrical Company Order Management System

-- 1. Roles
INSERT INTO roles (id, name) VALUES 
(1, 'customer'),
(2, 'admin')
ON CONFLICT (id) DO NOTHING;

-- 2. Categories
INSERT INTO categories (id, name, slug, description, image_url, is_active) VALUES
(1, 'Water Level', 'water-level', 'Automatic water level controllers, sensors, and tank management units for industrial and commercial use.', 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80', true),
(2, 'Panel', 'panel', 'Industrial distribution panels, APFC panels, starter panels, and heavy-duty electrical control boxes.', 'https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?auto=format&fit=crop&w=600&q=80', true),
(3, 'Premium Product', 'premium-product', 'High-end surge protection devices, smart energy meters, and precision power monitoring modules.', 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=600&q=80', true),
(4, 'Auto Switch', 'auto-switch', 'Phase preventers, automatic transfer switches (ATS), and digital motor protection switches.', 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=600&q=80', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Products
INSERT INTO products (id, category_id, name, description, main_image, view_details_image, minimum_order_quantity, price, live_from_date, is_active) VALUES
(1, 1, 'VoltGuard Dual-Sensor Water Level Controller', 'Microprocessor-based automatic water level controller with dry-run protection and magnetic float sensor inputs. Ideal for overhead tanks and sumps.', 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=1200&q=80', 100, 1850.00, NOW() - INTERVAL '10 days', true),
(2, 1, 'HydroSense Wireless Water Level Indicator', 'Long-range wireless water level transmitter unit with LED depth bar display and audible high/low alarm alerts.', 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80', 50, 2400.00, NOW() - INTERVAL '5 days', true),

(3, 2, 'ElectroStar 3-Phase APFC Control Panel 50kVAr', 'Automated Power Factor Correction panel with digital capacitor bank switching, high harmonic suppression, and IP55 enclosure.', 'https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1200&q=80', 10, 28500.00, NOW() - INTERVAL '30 days', true),
(4, 2, 'MegaPower Heavy-Duty Star-Delta Motor Starter Panel', 'Heavy-duty 25HP motor starter panel featuring thermal overload relays, phase failure detection, and emergency stop lockout.', 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?auto=format&fit=crop&w=1200&q=80', 15, 14200.00, NOW() - INTERVAL '15 days', true),

(5, 3, 'VoltPro Smart Multi-Function Energy Meter', 'Class 0.5S accuracy digital energy meter with RS485 Modbus communications, THD measurement, and real-time load logging.', 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80', 25, 6800.00, NOW() - INTERVAL '2 days', true),
(6, 3, 'SurgeShield Type 1+2 Industrial Surge Protector', '4-Pole SPD for main distribution boards with 40kA surge withstand capacity and status indicator window.', 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=1200&q=80', 30, 4950.00, NOW() - INTERVAL '1 day', true),

(7, 4, 'PhaseFlex Automatic Changeover Transfer Switch (ATS) 100A', 'Seamless dual-power auto switch unit for mains-to-generator transfer with programmable delay timer and voltage sensing.', 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?auto=format&fit=crop&w=1200&q=80', 20, 9600.00, NOW() - INTERVAL '20 days', true),
(8, 4, 'SafePhase Digital Single-Phase Preventer Switch', 'Compact DIN-rail auto switch protecting 3-phase motors against single phasing, phase reversal, and voltage imbalance.', 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=1200&q=80', 100, 1150.00, NOW() - INTERVAL '12 days', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Company Settings
INSERT INTO company_settings (id, company_name, tagline, support_phone, bank_name, account_name, account_number, ifsc_code, upi_id, qr_code_image) VALUES
(1, 'VoltCraft Electrical Systems', 'Reliable Electrical Products Built for Performance & Quality', '9227677800', 'HDFC Bank Ltd.', 'VoltCraft Industrial Solutions Pvt Ltd', '50200088912345', 'HDFC0001234', 'voltcraft@hdfcbank', 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=voltcraft@hdfcbank&pn=VoltCraft%20Electrical')
ON CONFLICT (id) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  support_phone = EXCLUDED.support_phone,
  bank_name = EXCLUDED.bank_name,
  account_name = EXCLUDED.account_name,
  account_number = EXCLUDED.account_number,
  ifsc_code = EXCLUDED.ifsc_code,
  upi_id = EXCLUDED.upi_id,
  qr_code_image = EXCLUDED.qr_code_image;

-- 5. Catalogs
INSERT INTO catalogs (id, title, pdf_url, version, is_active) VALUES
(1, 'VoltCraft Product Catalog & Technical Datasheet 2026', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', 'v2026.1', true)
ON CONFLICT (id) DO NOTHING;

-- 6. Broadcast Notifications
INSERT INTO notifications (id, user_id, title, message, is_read, link) VALUES
(1, NULL, 'Welcome to VoltCraft Electrical Portal', 'Thank you for registering. You can now browse our full industrial electrical product range, check minimum quantities, and place bulk orders seamlessly.', false, '/catalog')
ON CONFLICT (id) DO NOTHING;

-- Reset primary key sequences for PostgreSQL tables
SELECT setval('roles_id_seq', (SELECT COALESCE(MAX(id), 1) FROM roles));
SELECT setval('categories_id_seq', (SELECT COALESCE(MAX(id), 1) FROM categories));
SELECT setval('products_id_seq', (SELECT COALESCE(MAX(id), 1) FROM products));
SELECT setval('company_settings_id_seq', (SELECT COALESCE(MAX(id), 1) FROM company_settings));
SELECT setval('catalogs_id_seq', (SELECT COALESCE(MAX(id), 1) FROM catalogs));
SELECT setval('notifications_id_seq', (SELECT COALESCE(MAX(id), 1) FROM notifications));
