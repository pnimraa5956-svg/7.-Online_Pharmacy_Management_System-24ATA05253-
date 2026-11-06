# Patan Nimraa Firdos — Online Pharmacy Management System

A full-stack pharmacy ordering and inventory project using HTML, CSS, vanilla JavaScript, Express.js and MySQL.

## Features
- Customer registration and login (passwords are hashed with bcrypt).
- Browse and search medicines by name, category or manufacturer.
- View price, stock and expiry availability.
- Cart with quantity controls and server-side stock/price validation.
- Place orders; stock is reduced in a MySQL transaction.
- Customer order history and order status.
- Admin dashboard with inventory totals and medicines expiring within 90 days.
- Admin can add, edit and delete medicines and update order statuses.

## 1. Requirements
Install Node.js (LTS) and MySQL Server. Open this folder in VS Code.

## 2. Create the database
1. Open MySQL Workbench or the MySQL command line.
2. Open `database.sql`.
3. Execute the complete script. It creates the `online_pharmacy` database and four required tables.

## 3. Configure the project
In the project root, create a file named `.env` by copying `.env.example`. Set your MySQL password in `DB_PASSWORD`. Set a long random value for `SESSION_SECRET`.

Example:
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_actual_mysql_password
DB_NAME=online_pharmacy
SESSION_SECRET=use_a_long_random_secret_here
PORT=3000
```

## 4. Install packages and run
Open the VS Code terminal in this project folder and run:
```bash
npm install
npm start
```
Open **http://localhost:3000** in your browser.

## 5. Create an administrator
1. Register an account using the website.
2. In MySQL Workbench, execute this command, replacing the email:
```sql
USE online_pharmacy;
UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
```
3. Log out and log back in. The admin dashboard will appear.

## Database tables
- `users`: customer/admin accounts.
- `medicines`: medicine catalogue, price, stock and expiry date.
- `orders`: customer order header and status.
- `order_items`: medicines and quantities in each order.

The table and column names follow the supplied project description, with corrected spelling and conventional underscore naming (`medicine_id`, `medicine_name`, `order_date`, `total_amount`, `order_id`).

## Important notes
- This is an academic/demo project. It does not process real payments, issue prescriptions, or replace professional medical advice.
- The sample medicines in `database.sql` are demonstration data. Replace them with verified catalogue data before any real use.
- For production deployment, use HTTPS, a persistent session store, CSRF protection, stricter validation, backups and secure secret management. Set the session cookie's `secure` option to `true` behind HTTPS.
