require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { loadDb, saveDb } = require("./db");

const app = express();
const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

function computeProductTotal(product) {
  return Object.values(product.stockByLocation || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

function getDashboardSummary(db) {
  const totalProductsInStock = db.products.reduce((sum, product) => sum + computeProductTotal(product), 0);
  const lowOrOut = db.products.filter((product) => computeProductTotal(product) <= Number(product.reorderLevel || 0)).length;
  const pendingReceipts = db.operations.filter((op) => op.type === "receipts" && op.status !== "Done").length;
  const pendingDeliveries = db.operations.filter((op) => op.type === "delivery" && op.status !== "Done").length;
  const internalScheduled = db.operations.filter((op) => op.type === "internal" && ["Draft", "Waiting", "Ready"].includes(op.status)).length;

  return {
    kpis: {
      totalProductsInStock,
      lowOrOutOfStockItems: lowOrOut,
      pendingReceipts,
      pendingDeliveries,
      internalTransfersScheduled: internalScheduled,
    },
    queue: db.operations,
  };
}

app.get("/api/health", async (_req, res) => {
  res.json({ status: "ok", service: "coreinventory-backend" });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const db = await loadDb();
  const user = db.users.find((item) => item.email.toLowerCase() === String(email).toLowerCase());
  if (!user || user.password !== password) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  return res.json({
    token: `demo-token-${user.id}`,
    user: sanitizeUser(user),
  });
});

app.post("/api/auth/signup", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const displayName = String(name || "").trim() || normalizedEmail.split("@")[0] || "Warehouse User";
  if (!normalizedEmail.includes("@")) {
    return res.status(400).json({ message: "Please provide a valid email" });
  }

  const db = await loadDb();
  if (!Array.isArray(db.users)) {
    db.users = [];
  }

  const existing = db.users.find((item) => String(item.email).toLowerCase() === normalizedEmail);
  if (existing) {
    return res.status(409).json({ message: "Account already exists. Please sign in." });
  }

  const newUser = {
    id: makeId("u"),
    name: displayName,
    email: normalizedEmail,
    password: String(password),
    role: "Warehouse Staff",
  };

  db.users.push(newUser);
  await saveDb(db);

  return res.status(201).json({
    token: `demo-token-${newUser.id}`,
    user: sanitizeUser(newUser),
  });
});

app.post("/api/auth/request-otp", async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  return res.json({
    message: "OTP reset request accepted",
    otp: "123456",
  });
});

app.get("/api/dashboard", async (_req, res) => {
  const db = await loadDb();
  res.json(getDashboardSummary(db));
});

app.get("/api/products", async (req, res) => {
  const { category, search } = req.query;
  const db = await loadDb();
  let products = db.products;

  if (category) {
    products = products.filter((product) => String(product.category).toLowerCase() === String(category).toLowerCase());
  }

  if (search) {
    const q = String(search).toLowerCase();
    products = products.filter((product) =>
      [product.name, product.sku, product.category].some((value) => String(value).toLowerCase().includes(q))
    );
  }

  res.json(products);
});

app.post("/api/products", async (req, res) => {
  const { name, sku, category, uom, reorderLevel, stockByLocation } = req.body || {};
  if (!name || !sku || !category || !uom) {
    return res.status(400).json({ message: "name, sku, category, and uom are required" });
  }

  const db = await loadDb();
  const exists = db.products.some((product) => String(product.sku).toLowerCase() === String(sku).toLowerCase());
  if (exists) {
    return res.status(409).json({ message: "SKU already exists" });
  }

  const newProduct = {
    id: makeId("prd"),
    name,
    sku,
    category,
    uom,
    reorderLevel: Number(reorderLevel || 0),
    stockByLocation: stockByLocation || {},
  };

  db.products.push(newProduct);
  await saveDb(db);
  return res.status(201).json(newProduct);
});

app.put("/api/products/:id", async (req, res) => {
  const db = await loadDb();
  const product = db.products.find((item) => item.id === req.params.id);
  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  const updatable = ["name", "sku", "category", "uom", "reorderLevel", "stockByLocation"];
  updatable.forEach((field) => {
    if (req.body[field] !== undefined) {
      product[field] = req.body[field];
    }
  });

  await saveDb(db);
  return res.json(product);
});

app.get("/api/operations", async (req, res) => {
  const db = await loadDb();
  const { type, status, warehouse } = req.query;

  let operations = db.operations;
  if (type) {
    operations = operations.filter((item) => String(item.type).toLowerCase() === String(type).toLowerCase());
  }
  if (status) {
    operations = operations.filter((item) => String(item.status).toLowerCase() === String(status).toLowerCase());
  }
  if (warehouse) {
    operations = operations.filter((item) => String(item.warehouse).toLowerCase().includes(String(warehouse).toLowerCase()));
  }

  return res.json(operations);
});

app.post("/api/operations", async (req, res) => {
  const { type, productId, quantity, from, to, warehouse, status } = req.body || {};
  if (!type || !productId || quantity === undefined) {
    return res.status(400).json({ message: "type, productId, and quantity are required" });
  }

  const db = await loadDb();
  const product = db.products.find((item) => item.id === productId);
  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  const qty = Number(quantity);
  const opStatus = status || "Draft";
  const opType = String(type).toLowerCase();
  const refPrefix = opType === "receipts" ? "RCPT" : opType === "delivery" ? "DLV" : opType === "internal" ? "INT" : "ADJ";
  const ref = `${refPrefix}-${Math.floor(1000 + Math.random() * 9000)}`;
  const now = new Date().toISOString();

  const locationFrom = from || "-";
  const locationTo = to || "-";

  if (!product.stockByLocation) {
    product.stockByLocation = {};
  }

  if (opType === "receipts") {
    product.stockByLocation[locationTo] = Number(product.stockByLocation[locationTo] || 0) + Math.abs(qty);
  } else if (opType === "delivery") {
    product.stockByLocation[locationFrom] = Number(product.stockByLocation[locationFrom] || 0) - Math.abs(qty);
  } else if (opType === "internal") {
    product.stockByLocation[locationFrom] = Number(product.stockByLocation[locationFrom] || 0) - Math.abs(qty);
    product.stockByLocation[locationTo] = Number(product.stockByLocation[locationTo] || 0) + Math.abs(qty);
  } else if (opType === "adjustment") {
    product.stockByLocation[locationFrom] = Number(product.stockByLocation[locationFrom] || 0) + qty;
  }

  const operation = {
    id: makeId("op"),
    ref,
    type: opType,
    warehouse: warehouse || locationTo || locationFrom,
    status: opStatus,
    eta: now,
  };

  const move = {
    id: makeId("mv"),
    ref,
    operation: opType.charAt(0).toUpperCase() + opType.slice(1),
    product: product.name,
    from: locationFrom,
    to: locationTo,
    qty: opType === "delivery" ? -Math.abs(qty) : qty,
    status: opStatus,
    type: opType,
    warehouse: warehouse || locationTo || locationFrom,
    createdAt: now,
  };

  db.operations.unshift(operation);
  db.moves.unshift(move);
  await saveDb(db);

  return res.status(201).json({ operation, move, product });
});

app.get("/api/moves", async (req, res) => {
  const db = await loadDb();
  const { type, status, warehouse } = req.query;
  let moves = db.moves;

  if (type) {
    moves = moves.filter((item) => String(item.type).toLowerCase() === String(type).toLowerCase());
  }
  if (status) {
    moves = moves.filter((item) => String(item.status).toLowerCase() === String(status).toLowerCase());
  }
  if (warehouse) {
    moves = moves.filter((item) => String(item.warehouse).toLowerCase().includes(String(warehouse).toLowerCase()));
  }

  return res.json(moves);
});

app.get("/api/reports/overview", async (_req, res) => {
  const db = await loadDb();
  res.json({
    alerts: db.settings.alerts,
    multiWarehouse: db.settings.multiWarehouse,
    skuSearchAccuracy: db.settings.skuSearchAccuracy,
    version: db.settings.version,
  });
});

app.get("/api/settings/warehouses", async (_req, res) => {
  const db = await loadDb();
  res.json({ warehouses: db.warehouses });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`CoreInventory backend running on http://localhost:${PORT}`);
});
