# corelnventory
Hackathon project - CoreInventory

## Frontend
Static pages are under `client/`.

## Backend
Backend API is under `backend/` using Node.js + Express with JSON file persistence.

### Run backend
1. Open terminal in `backend/`
2. Install dependencies: `npm install`
3. Start server: `npm run dev`

API base URL:
- `http://localhost:5050/api`

Health endpoint:
- `GET http://localhost:5050/api/health`

### Demo login
- Email: `manager@coreinventory.com`
- Password: `demo123`

### Main endpoints
- `POST /api/auth/login`
- `POST /api/auth/request-otp`
- `GET /api/dashboard`
- `GET /api/products`
- `POST /api/products`
- `PUT /api/products/:id`
- `GET /api/operations`
- `POST /api/operations`
- `GET /api/moves`
- `GET /api/reports/overview`
- `GET /api/settings/warehouses`
