-- Schema for Electrical Company Order Management System

DROP TABLE IF EXISTS order_department_statuses CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS cart_items CASCADE;
DROP TABLE IF EXISTS carts CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS catalogs CASCADE;
DROP TABLE IF EXISTS company_settings CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

-- 1. Roles
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    role_id INT REFERENCES roles(id) DEFAULT 1,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    birth_date DATE NOT NULL,
    state VARCHAR(100) NOT NULL,
    whatsapp_number VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Categories
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Products
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    category_id INT REFERENCES categories(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    main_image TEXT NOT NULL,
    view_details_image TEXT NOT NULL,
    minimum_order_quantity INT NOT NULL DEFAULT 1,
    price DECIMAL(10, 2) NOT NULL,
    live_from_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Carts & Cart Items
CREATE TABLE carts (
    id SERIAL PRIMARY KEY,
    user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cart_items (
    id SERIAL PRIMARY KEY,
    cart_id INT REFERENCES carts(id) ON DELETE CASCADE,
    product_id INT REFERENCES products(id) ON DELETE CASCADE,
    quantity INT NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cart_id, product_id)
);

-- 6. Orders
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    serial_number VARCHAR(50) UNIQUE,
    user_id INT REFERENCES users(id) ON DELETE RESTRICT,
    transport_name VARCHAR(200) NOT NULL,
    total_amount DECIMAL(12, 2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending Admin Approval',
    payment_status VARCHAR(50) DEFAULT 'Pending',
    payment_proof VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Order Items (Freezes historical name, category, and unit price at order time)
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INT REFERENCES orders(id) ON DELETE CASCADE,
    product_id INT REFERENCES products(id),
    product_name VARCHAR(200) NOT NULL,
    category_name VARCHAR(100) NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(12, 2) NOT NULL
);

-- 8. Order Department Statuses (Dynamic breakdown per department)
CREATE TABLE order_department_statuses (
    id SERIAL PRIMARY KEY,
    order_id INT REFERENCES orders(id) ON DELETE CASCADE,
    department_name VARCHAR(100) NOT NULL,
    status VARCHAR(100) NOT NULL DEFAULT 'Pending',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(order_id, department_name)
);

-- 9. Notifications
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE, -- Nullable for system-wide broadcasts
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    link VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Catalogs
CREATE TABLE catalogs (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    pdf_url VARCHAR(500) NOT NULL,
    version VARCHAR(50) DEFAULT '1.0',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Company Settings (Payment, bank, contact details)
CREATE TABLE company_settings (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(150) DEFAULT 'VoltCraft Electrical Systems',
    tagline VARCHAR(255) DEFAULT 'Reliable Electrical Products Built for Performance & Quality',
    support_phone VARCHAR(20) DEFAULT '9227677800',
    bank_name VARCHAR(150) DEFAULT 'HDFC Bank Ltd.',
    account_name VARCHAR(150) DEFAULT 'VoltCraft Industrial Solutions Pvt Ltd',
    account_number VARCHAR(50) DEFAULT '50200088912345',
    ifsc_code VARCHAR(20) DEFAULT 'HDFC0001234',
    upi_id VARCHAR(100) DEFAULT 'voltcraft@hdfcbank',
    qr_code_image VARCHAR(500) DEFAULT '/uploads/payment-qr.png',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexing for performance
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_live_date ON products(live_from_date, is_active);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
