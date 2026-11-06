CREATE DATABASE IF NOT EXISTS online_pharmacy;
USE online_pharmacy;

CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(100) NOT NULL,
  phone VARCHAR(15),
  role VARCHAR(20) NOT NULL DEFAULT 'customer'
);

CREATE TABLE IF NOT EXISTS medicines (
  medicine_id INT AUTO_INCREMENT PRIMARY KEY,
  medicine_name VARCHAR(150) NOT NULL,
  category VARCHAR(50) NOT NULL,
  manufacturer VARCHAR(100),
  price DECIMAL(10,2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  expiry_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  order_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  order_date DATE NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Pending',
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS order_items (
  item_id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  medicine_id INT NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
  CONSTRAINT fk_items_medicine FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id)
);

-- Create an administrator account through the Register page, then change its role:
-- UPDATE users SET role = 'admin' WHERE email = 'your-admin-email@example.com';

INSERT INTO medicines (medicine_name, category, manufacturer, price, stock, expiry_date) VALUES
('Paracetamol 500mg', 'Pain Relief', 'PharmaCare', 18.00, 120, '2027-12-31'),
('Cetirizine 10mg', 'Allergy', 'MediLife', 25.00, 80, '2027-08-31'),
('Vitamin C 500mg', 'Vitamins', 'Wellness Labs', 65.00, 60, '2027-10-31'),
('Antacid Tablets', 'Digestive Health', 'HealthPlus', 32.00, 90, '2027-06-30'),
(' ORS Sachet', 'Electrolytes', 'ReHydrate', 22.00, 100, '2027-11-30');
