require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { loadDb, saveDb } = require("./db");
const { getAllTasks, getTaskById, createTask, updateTask, deleteTask } = require("./taskDb");

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

function normalizeOperationType(type) {
  const value = String(type || "").toLowerCase();
  return ["receipts", "delivery", "internal", "adjustment"].includes(value) ? value : null;
}

function normalizeOperationStatus(status) {
  const value = String(status || "draft").toLowerCase();
  const allowed = {
    draft: "Draft",
    waiting: "Waiting",
    ready: "Ready",
    done: "Done",
    canceled: "Canceled",
  };

  return allowed[value] || null;
}

function getOperationLabel(type) {
  if (type === "receipts") {
    return "Receipt";
  }
  if (type === "delivery") {
    return "Delivery";
  }
  if (type === "internal") {
    return "Transfer";
  }
  return "Adjustment";
}

function getLocationStock(product, location) {
  return Number((product.stockByLocation || {})[location] || 0);
}

function ensureStockContainer(product) {
  if (!product.stockByLocation) {
    product.stockByLocation = {};
  }
}

function applyStockEffect(product, operation, reverse = false) {
  ensureStockContainer(product);

  const direction = reverse ? -1 : 1;
  const qty = Math.abs(Number(operation.quantity || 0));
  const from = operation.from;
  const to = operation.to;

  if (operation.type === "receipts") {
    const nextValue = getLocationStock(product, to) + direction * qty;
    if (nextValue < 0) {
      throw new Error("Cannot reverse receipt because stock has already been consumed from the destination location");
    }
    product.stockByLocation[to] = nextValue;
    return;
  }

  if (operation.type === "delivery") {
    product.stockByLocation[from] = getLocationStock(product, from) - direction * qty;
    return;
  }

  if (operation.type === "internal") {
    const sourceNext = getLocationStock(product, from) - direction * qty;
    const destinationNext = getLocationStock(product, to) + direction * qty;
    if (sourceNext < 0 || destinationNext < 0) {
      throw new Error("Cannot reverse transfer because one of the locations would become negative");
    }
    product.stockByLocation[from] = sourceNext;
    product.stockByLocation[to] = destinationNext;
    return;
  }

  if (operation.type === "adjustment") {
    const signedQty = Number(operation.quantity || 0);
    const nextValue = getLocationStock(product, from) + direction * signedQty;
    if (nextValue < 0) {
      throw new Error("Cannot reverse adjustment because stock would become negative");
    }
    product.stockByLocation[from] = nextValue;
  }
}

function getDashboardSummary(db) {
  const totalProductsInStock = db.products.reduce((sum, product) => sum + computeProductTotal(product), 0);
  const lowOrOut = db.products.filter((product) => computeProductTotal(product) <= Number(product.reorderLevel || 0)).length;
  const isOpenStatus = (op) => !["Done", "Canceled"].includes(op.status);
  const pendingReceipts = db.operations.filter((op) => op.type === "receipts" && isOpenStatus(op)).length;
  const pendingDeliveries = db.operations.filter((op) => op.type === "delivery" && isOpenStatus(op)).length;
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
  const { type, productId, quantity, from, to, warehouse, status, partnerName, note, operator, reason } = req.body || {};
  if (!type || !productId || quantity === undefined) {
    return res.status(400).json({ message: "type, productId, and quantity are required" });
  }

  const db = await loadDb();
  const product = db.products.find((item) => item.id === productId);
  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  const qty = Number(quantity);
  const opType = normalizeOperationType(type);
  const opStatus = normalizeOperationStatus(status);
  if (!opType) {
    return res.status(400).json({ message: "Invalid operation type" });
  }

  if (!Number.isFinite(qty) || qty === 0) {
    return res.status(400).json({ message: "Quantity must be a non-zero number" });
  }

  if (!opStatus) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const refPrefix = opType === "receipts" ? "RCPT" : opType === "delivery" ? "DLV" : opType === "internal" ? "INT" : "ADJ";
  const ref = `${refPrefix}-${Math.floor(1000 + Math.random() * 9000)}`;
  const now = new Date().toISOString();

  const locationFrom = from || "-";
  const locationTo = to || "-";

  if (!product.stockByLocation) {
    product.stockByLocation = {};
  }

  if (opType === "receipts") {
    if (!to) {
      return res.status(400).json({ message: "Destination warehouse is required for receipts" });
    }
    product.stockByLocation[locationTo] = Number(product.stockByLocation[locationTo] || 0) + Math.abs(qty);
  } else if (opType === "delivery") {
    if (!from || !to) {
      return res.status(400).json({ message: "Source warehouse and customer destination are required for deliveries" });
    }
    if (getLocationStock(product, locationFrom) < Math.abs(qty)) {
      return res.status(400).json({ message: "Not enough stock in the selected source location" });
    }
    product.stockByLocation[locationFrom] = Number(product.stockByLocation[locationFrom] || 0) - Math.abs(qty);
  } else if (opType === "internal") {
    if (!from || !to) {
      return res.status(400).json({ message: "Both source and destination locations are required for internal transfers" });
    }
    if (locationFrom === locationTo) {
      return res.status(400).json({ message: "Source and destination locations must be different" });
    }
    if (getLocationStock(product, locationFrom) < Math.abs(qty)) {
      return res.status(400).json({ message: "Not enough stock in the selected source location" });
    }
    product.stockByLocation[locationFrom] = Number(product.stockByLocation[locationFrom] || 0) - Math.abs(qty);
    product.stockByLocation[locationTo] = Number(product.stockByLocation[locationTo] || 0) + Math.abs(qty);
  } else if (opType === "adjustment") {
    if (!from) {
      return res.status(400).json({ message: "Location is required for stock adjustments" });
    }
    if (getLocationStock(product, locationFrom) + qty < 0) {
      return res.status(400).json({ message: "Adjustment would make stock negative" });
    }
    product.stockByLocation[locationFrom] = Number(product.stockByLocation[locationFrom] || 0) + qty;
  }

  const operation = {
    id: makeId("op"),
    ref,
    type: opType,
    warehouse: warehouse || locationTo || locationFrom,
    status: opStatus,
    eta: now,
    productId: product.id,
    product: product.name,
    quantity: opType === "delivery" ? -Math.abs(qty) : opType === "internal" ? Math.abs(qty) : qty,
    from: locationFrom,
    to: locationTo,
    partnerName: partnerName || "",
    operator: operator || "",
    reason: reason || "",
    note: note || "",
    createdAt: now,
  };

  const move = {
    id: makeId("mv"),
    ref,
    operation: getOperationLabel(opType),
    product: product.name,
    productId: product.id,
    from: locationFrom,
    to: locationTo,
    qty: opType === "delivery" ? -Math.abs(qty) : qty,
    status: opStatus,
    type: opType,
    warehouse: warehouse || locationTo || locationFrom,
    createdAt: now,
    partnerName: partnerName || "",
    operator: operator || "",
    reason: reason || "",
    note: note || "",
  };

  db.operations.unshift(operation);
  db.moves.unshift(move);
  await saveDb(db);

  return res.status(201).json({ operation, move, product });
});

app.put("/api/operations/:id", async (req, res) => {
  const db = await loadDb();
  const operation = db.operations.find((item) => item.id === req.params.id);
  if (!operation) {
    return res.status(404).json({ message: "Operation not found" });
  }

  if (operation.status === "Canceled") {
    return res.status(400).json({ message: "Canceled operations cannot be edited" });
  }

  const fields = ["partnerName", "operator", "reason", "note"];
  fields.forEach((field) => {
    if (req.body[field] !== undefined) {
      operation[field] = String(req.body[field] || "");
    }
  });

  if (req.body.status !== undefined) {
    const nextStatus = normalizeOperationStatus(req.body.status);
    if (!nextStatus || nextStatus === "Canceled") {
      return res.status(400).json({ message: "Invalid status update" });
    }
    operation.status = nextStatus;
  }

  const move = db.moves.find((item) => item.ref === operation.ref);
  if (move) {
    move.status = operation.status;
    move.partnerName = operation.partnerName || "";
    move.operator = operation.operator || "";
    move.reason = operation.reason || "";
    move.note = operation.note || "";
  }

  await saveDb(db);
  return res.json({ operation, move: move || null });
});

app.post("/api/operations/:id/cancel", async (req, res) => {
  const db = await loadDb();
  const operation = db.operations.find((item) => item.id === req.params.id);
  if (!operation) {
    return res.status(404).json({ message: "Operation not found" });
  }

  if (operation.status === "Canceled") {
    return res.status(400).json({ message: "Operation is already canceled" });
  }

  const product = db.products.find((item) => item.id === operation.productId);
  if (!product) {
    return res.status(404).json({ message: "Linked product not found" });
  }

  try {
    applyStockEffect(product, operation, true);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  operation.status = "Canceled";
  operation.note = operation.note ? `${operation.note} | Canceled` : "Canceled";

  const move = db.moves.find((item) => item.ref === operation.ref);
  if (move) {
    move.status = "Canceled";
    move.note = move.note ? `${move.note} | Canceled` : "Canceled";
  }

  await saveDb(db);
  return res.json({ operation, move: move || null, product });
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

app.put("/api/settings", async (req, res) => {
  const db = await loadDb();
  const payload = req.body || {};

  if (!db.settings) {
    db.settings = {
      alerts: { lowStock: 0, outOfStock: 0 },
      multiWarehouse: 0,
      skuSearchAccuracy: 0,
      version: "1.0.0",
    };
  }

  if (payload.alerts && typeof payload.alerts === "object") {
    db.settings.alerts = {
      ...db.settings.alerts,
      ...payload.alerts,
    };
  }

  if (payload.multiWarehouse !== undefined) {
    db.settings.multiWarehouse = Number(payload.multiWarehouse || 0);
  }

  if (payload.skuSearchAccuracy !== undefined) {
    db.settings.skuSearchAccuracy = Number(payload.skuSearchAccuracy || 0);
  }

  if (Array.isArray(payload.warehouses)) {
    db.warehouses = payload.warehouses.filter((item) => String(item || "").trim()).map((item) => String(item).trim());
    db.settings.multiWarehouse = db.warehouses.length;
  }

  await saveDb(db);
  return res.json({ settings: db.settings, warehouses: db.warehouses });
});

app.get("/api/tasks", async (req, res, next) => {
  try {
    const { status, priority, search } = req.query;
    const tasks = await getAllTasks({ status, priority, search });
    return res.json(tasks);
  } catch (error) {
    return next(error);
  }
});

app.get("/api/tasks/:id", async (req, res, next) => {
  try {
    const task = await getTaskById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }
    return res.json(task);
  } catch (error) {
    return next(error);
  }
});

app.post("/api/tasks", async (req, res) => {
  try {
    const task = await createTask(req.body || {});
    return res.status(201).json(task);
  } catch (error) {
    return res.status(400).json({ message: error.message || "Invalid task payload" });
  }
});

app.put("/api/tasks/:id", async (req, res) => {
  try {
    const updatedTask = await updateTask(req.params.id, req.body || {});
    if (!updatedTask) {
      return res.status(404).json({ message: "Task not found" });
    }
    return res.json(updatedTask);
  } catch (error) {
    return res.status(400).json({ message: error.message || "Invalid task payload" });
  }
});

app.delete("/api/tasks/:id", async (req, res, next) => {
  try {
    const removed = await deleteTask(req.params.id);
    if (!removed) {
      return res.status(404).json({ message: "Task not found" });
    }
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`CoreInventory backend running on http://localhost:${PORT}`);
});
