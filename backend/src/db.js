const fs = require("fs/promises");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const SEED_PATH = path.join(DATA_DIR, "seed.json");

async function ensureStoreFile() {
  try {
    await fs.access(STORE_PATH);
  } catch (_error) {
    const seed = await fs.readFile(SEED_PATH, "utf8");
    await fs.writeFile(STORE_PATH, seed, "utf8");
  }
}

async function loadDb() {
  await ensureStoreFile();
  const raw = await fs.readFile(STORE_PATH, "utf8");
  return JSON.parse(raw);
}

async function saveDb(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2), "utf8");
}

module.exports = {
  loadDb,
  saveDb,
};
