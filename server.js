require("dotenv").config();
const express = require("express");
const session = require("express-session");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "online_pharmacy",
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  name: "pharmacy.sid",
  secret: process.env.SESSION_SECRET || "change-this-development-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: false, maxAge: 1000 * 60 * 60 * 4 }
}));
app.use(express.static(path.join(__dirname, "public")));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ message: "Please log in first." });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ message: "Administrator access required." });
  }
  next();
}

app.get("/api/session", (req, res) => res.json({ user: req.session.user || null }));

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
      return res.status(400).json({ message: "Enter your name, email and a password of at least 6 characters." });
    }
    const [existing] = await pool.execute("SELECT user_id FROM users WHERE email = ?", [email.trim().toLowerCase()]);
    if (existing.length) return res.status(409).json({ message: "An account with this email already exists." });
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      "INSERT INTO users (name,email,password,phone,role) VALUES (?,?,?,?, 'customer')",
      [name.trim(), email.trim().toLowerCase(), hash, phone || null]
    );
    req.session.user = { user_id: result.insertId, name: name.trim(), email: email.trim().toLowerCase(), role: "customer" };
    res.status(201).json({ message: "Account created successfully.", user: req.session.user });
  } catch (err) { console.error(err); res.status(500).json({ message: "Could not create account." }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.execute("SELECT * FROM users WHERE email = ?", [(email || "").trim().toLowerCase()]);
    if (!rows.length || !(await bcrypt.compare(password || "", rows[0].password))) {
      return res.status(401).json({ message: "Incorrect email or password." });
    }
    const u = rows[0];
    req.session.user = { user_id: u.user_id, name: u.name, email: u.email, role: u.role };
    res.json({ message: "Welcome back.", user: req.session.user });
  } catch (err) { console.error(err); res.status(500).json({ message: "Login failed." }); }
});

app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ message: "Logged out." })));

app.get("/api/medicines", async (req, res) => {
  try {
    const q = `%${(req.query.q || "").trim()}%`;
    const [rows] = await pool.execute(
      `SELECT medicine_id, medicine_name, category, manufacturer, price, stock, expiry_date
       FROM medicines WHERE medicine_name LIKE ? OR category LIKE ? OR manufacturer LIKE ?
       ORDER BY medicine_name`, [q, q, q]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ message: "Unable to load medicines." }); }
});

app.post("/api/medicines", requireAdmin, async (req, res) => {
  try {
    const { medicine_name, category, manufacturer, price, stock, expiry_date } = req.body;
    if (!medicine_name || !category || !(Number(price) >= 0) || !Number.isInteger(Number(stock)) || !expiry_date) {
      return res.status(400).json({ message: "Please provide valid medicine details." });
    }
    const [r] = await pool.execute(
      "INSERT INTO medicines (medicine_name,category,manufacturer,price,stock,expiry_date) VALUES (?,?,?,?,?,?)",
      [medicine_name, category, manufacturer || null, Number(price), Number(stock), expiry_date]
    );
    res.status(201).json({ medicine_id: r.insertId, message: "Medicine added." });
  } catch (err) { console.error(err); res.status(500).json({ message: "Could not add medicine." }); }
});

app.put("/api/medicines/:id", requireAdmin, async (req, res) => {
  try {
    const { medicine_name, category, manufacturer, price, stock, expiry_date } = req.body;
    await pool.execute(
      "UPDATE medicines SET medicine_name=?,category=?,manufacturer=?,price=?,stock=?,expiry_date=? WHERE medicine_id=?",
      [medicine_name, category, manufacturer || null, Number(price), Number(stock), expiry_date, req.params.id]
    );
    res.json({ message: "Medicine updated." });
  } catch (err) { console.error(err); res.status(500).json({ message: "Could not update medicine." }); }
});

app.delete("/api/medicines/:id", requireAdmin, async (req, res) => {
  try {
    await pool.execute("DELETE FROM medicines WHERE medicine_id=?", [req.params.id]);
    res.json({ message: "Medicine deleted." });
  } catch (err) {
    if (err.code === "ER_ROW_IS_REFERENCED_2") return res.status(409).json({ message: "This medicine is part of an order and cannot be deleted. Set its stock to zero instead." });
    console.error(err); res.status(500).json({ message: "Could not delete medicine." });
  }
});

app.post("/api/orders", requireAuth, async (req, res) => {
  const items = req.body.items;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: "Your cart is empty." });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let total = 0;
    const verified = [];
    for (const item of items) {
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty < 1) throw new Error("Invalid item quantity.");
      const [rows] = await conn.execute("SELECT medicine_id, medicine_name, price, stock, expiry_date FROM medicines WHERE medicine_id=? FOR UPDATE", [item.medicine_id]);
      if (!rows.length) throw new Error("A selected medicine is no longer available.");
      const med = rows[0];
      if (med.expiry_date < new Date().toISOString().slice(0,10)) throw new Error(`${med.medicine_name} has expired and cannot be ordered.`);
      if (med.stock < qty) throw new Error(`Only ${med.stock} unit(s) of ${med.medicine_name} are available.`);
      total += Number(med.price) * qty;
      verified.push({ medicine_id: med.medicine_id, quantity: qty, price: Number(med.price) });
    }
    const [order] = await conn.execute(
      "INSERT INTO orders (user_id,order_date,total_amount,status) VALUES (?,CURDATE(),?,'Pending')",
      [req.session.user.user_id, total]
    );
    for (const item of verified) {
      await conn.execute("INSERT INTO order_items (order_id,medicine_id,quantity,price) VALUES (?,?,?,?)",
        [order.insertId, item.medicine_id, item.quantity, item.price]);
      await conn.execute("UPDATE medicines SET stock=stock-? WHERE medicine_id=?", [item.quantity, item.medicine_id]);
    }
    await conn.commit();
    res.status(201).json({ message: "Your order has been placed.", order_id: order.insertId, total_amount: total });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ message: err.message || "Could not place order." });
  } finally { conn.release(); }
});

app.get("/api/orders/mine", requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT o.order_id,o.order_date,o.total_amount,o.status,
       GROUP_CONCAT(CONCAT(m.medicine_name,' × ',oi.quantity) SEPARATOR ', ') AS items
       FROM orders o JOIN order_items oi ON o.order_id=oi.order_id
       JOIN medicines m ON oi.medicine_id=m.medicine_id
       WHERE o.user_id=? GROUP BY o.order_id ORDER BY o.order_id DESC`, [req.session.user.user_id]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ message: "Unable to load your orders." }); }
});

app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT o.order_id,o.order_date,o.total_amount,o.status,u.name,u.email,u.phone,
       GROUP_CONCAT(CONCAT(m.medicine_name,' × ',oi.quantity) SEPARATOR ', ') AS items
       FROM orders o JOIN users u ON o.user_id=u.user_id
       JOIN order_items oi ON o.order_id=oi.order_id JOIN medicines m ON oi.medicine_id=m.medicine_id
       GROUP BY o.order_id ORDER BY o.order_id DESC`
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ message: "Unable to load orders." }); }
});

app.patch("/api/admin/orders/:id", requireAdmin, async (req, res) => {
  const allowed = ["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ message: "Invalid order status." });
  try {
    await pool.execute("UPDATE orders SET status=? WHERE order_id=?", [req.body.status, req.params.id]);
    res.json({ message: "Order status updated." });
  } catch (err) { console.error(err); res.status(500).json({ message: "Could not update order." }); }
});

app.get("/api/admin/summary", requireAdmin, async (req, res) => {
  try {
    const [[meds]] = await pool.query("SELECT COUNT(*) AS medicine_count, COALESCE(SUM(stock),0) AS units FROM medicines");
    const [[orders]] = await pool.query("SELECT COUNT(*) AS order_count, COALESCE(SUM(total_amount),0) AS revenue FROM orders");
    const [[users]] = await pool.query("SELECT COUNT(*) AS customer_count FROM users WHERE role='customer'");
    const [[expiring]] = await pool.query("SELECT COUNT(*) AS expiring_count FROM medicines WHERE expiry_date <= DATE_ADD(CURDATE(), INTERVAL 90 DAY)");
    res.json({ ...meds, ...orders, ...users, ...expiring });
  } catch (err) { console.error(err); res.status(500).json({ message: "Unable to load dashboard." }); }
});

app.listen(PORT, () => console.log(`Online Pharmacy running at http://localhost:${PORT}`));
