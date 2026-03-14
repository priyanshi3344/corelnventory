const fs = require("fs/promises");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const TASK_STORE_PATH = path.join(DATA_DIR, "tasks.json");
const TASK_SEED_PATH = path.join(DATA_DIR, "tasks.seed.json");

const VALID_STATUSES = new Set(["todo", "in_progress", "done"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high"]);

function makeTaskId() {
  return `tsk_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

async function ensureTasksFile() {
  try {
    await fs.access(TASK_STORE_PATH);
  } catch (_error) {
    const seed = await fs.readFile(TASK_SEED_PATH, "utf8");
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(TASK_STORE_PATH, seed, "utf8");
  }
}

async function loadTasks() {
  await ensureTasksFile();
  const raw = await fs.readFile(TASK_STORE_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function saveTasks(tasks) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(TASK_STORE_PATH, JSON.stringify(tasks, null, 2), "utf8");
}

function normalizeStatus(status) {
  const normalized = String(status || "todo").toLowerCase();
  return VALID_STATUSES.has(normalized) ? normalized : null;
}

function normalizePriority(priority) {
  const normalized = String(priority || "medium").toLowerCase();
  return VALID_PRIORITIES.has(normalized) ? normalized : null;
}

async function getAllTasks(filters = {}) {
  const tasks = await loadTasks();
  let result = tasks;

  if (filters.status) {
    const status = normalizeStatus(filters.status);
    if (status) {
      result = result.filter((task) => task.status === status);
    }
  }

  if (filters.priority) {
    const priority = normalizePriority(filters.priority);
    if (priority) {
      result = result.filter((task) => task.priority === priority);
    }
  }

  if (filters.search) {
    const query = String(filters.search).toLowerCase();
    result = result.filter((task) => {
      return [task.title, task.description, task.assignee].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }

  return result;
}

async function getTaskById(id) {
  const tasks = await loadTasks();
  return tasks.find((task) => task.id === id) || null;
}

async function createTask(payload) {
  const title = String(payload.title || "").trim();
  if (!title) {
    throw new Error("title is required");
  }

  const status = normalizeStatus(payload.status || "todo");
  if (!status) {
    throw new Error("invalid status");
  }

  const priority = normalizePriority(payload.priority || "medium");
  if (!priority) {
    throw new Error("invalid priority");
  }

  const now = new Date().toISOString();
  const newTask = {
    id: makeTaskId(),
    title,
    description: String(payload.description || "").trim(),
    status,
    priority,
    assignee: String(payload.assignee || "").trim(),
    dueDate: payload.dueDate ? String(payload.dueDate) : null,
    createdAt: now,
    updatedAt: now,
  };

  const tasks = await loadTasks();
  tasks.unshift(newTask);
  await saveTasks(tasks);
  return newTask;
}

async function updateTask(id, updates) {
  const tasks = await loadTasks();
  const task = tasks.find((item) => item.id === id);
  if (!task) {
    return null;
  }

  if (updates.title !== undefined) {
    const title = String(updates.title).trim();
    if (!title) {
      throw new Error("title cannot be empty");
    }
    task.title = title;
  }

  if (updates.description !== undefined) {
    task.description = String(updates.description || "").trim();
  }

  if (updates.assignee !== undefined) {
    task.assignee = String(updates.assignee || "").trim();
  }

  if (updates.dueDate !== undefined) {
    task.dueDate = updates.dueDate ? String(updates.dueDate) : null;
  }

  if (updates.status !== undefined) {
    const status = normalizeStatus(updates.status);
    if (!status) {
      throw new Error("invalid status");
    }
    task.status = status;
  }

  if (updates.priority !== undefined) {
    const priority = normalizePriority(updates.priority);
    if (!priority) {
      throw new Error("invalid priority");
    }
    task.priority = priority;
  }

  task.updatedAt = new Date().toISOString();
  await saveTasks(tasks);
  return task;
}

async function deleteTask(id) {
  const tasks = await loadTasks();
  const idx = tasks.findIndex((item) => item.id === id);
  if (idx === -1) {
    return false;
  }

  tasks.splice(idx, 1);
  await saveTasks(tasks);
  return true;
}

module.exports = {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
};
