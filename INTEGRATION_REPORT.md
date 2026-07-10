# RetailPulse — Integration Report

**Date:** 16 June 2026  
**Project:** Quincaillerie du Rwamagana — Retail Analytics Platform

---

## 1. Architecture (Two-Side Design)

RetailPulse is split into **two independent stacks** that communicate over HTTP:

```
┌─────────────────────────────────────────────────────────────┐
│  APPLICATION STACK (Business + UI)                          │
│  ┌──────────────┐    ┌──────────────────────────────────┐   │
│  │  Frontend    │───▶│  Spring Boot Backend  :8080      │   │
│  │  React/Vite  │    │  PostgreSQL · Auth · CRUD · API  │   │
│  │  :5173       │    └──────────────┬───────────────────┘   │
└───────────────────────────────────│─────────────────────────┘
                                    │ REST (AIServiceClient)
                                    ▼
┌─────────────────────────────────────────────────────────────┐
│  AI / ML STACK (Predictions only)                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Python FastAPI  :8000                               │   │
│  │  scikit-learn · TensorFlow · Apriori · Poisson       │   │
│  │  /ml/forecast · /ml/churn · /ml/recommend · /ml/stockout│
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

| Layer | Path | Port | Responsibility |
|-------|------|------|----------------|
| Frontend | `/frontend` | 5173 | UI, dashboards, auth flow |
| Backend | `/backend` | 8080 | API, database, JWT, OTP email |
| AI Service | `/ai-service` | 8000 | ML predictions only |

**Config:** `backend/src/main/resources/application.yml`

```yaml
retailpulse:
  ai-service:
    base-url: http://localhost:8000/ml
    enabled: true
```

---

## 2. What Was Fixed

### Backend → AI wiring (previously only Forecast used AI)

| Service | Endpoint | AI integration |
|---------|----------|----------------|
| `ForecastService` | `/api/forecast/demand` | Calls `/ml/forecast` |
| `CustomerService` | `/api/customers/churn-risks` | Calls `/ml/churn` with customer RFM payload |
| `InventoryService` | `/api/inventory/stockout-risks` | Calls `/ml/stockout` |
| `InventoryService` | `/api/inventory/reorder-recommendations` | Calls `/ml/stockout` |
| `RecommendationService` | `/api/recommendations/cross-sell` | Calls `/ml/recommend` |
| `RecommendationService` | `/api/recommendations/seasonal` | Calls `/ml/recommend` |
| `AdminController` | `/api/admin/system-health` | Reports AI service health |

### `AIServiceClient.java` enhancements

- Health check: `GET http://localhost:8000/health`
- Sends structured payloads (customers, products) to AI endpoints
- Parses `data`, `predictions`, `risks`, `recommendations` from AI responses
- Graceful fallback to database/demo data when AI service is down

### OTP / 2FA (Application stack only — no AI)

- Real 6-digit OTP via Gmail SMTP
- HTML email template with digit boxes
- 3 failed attempts → OTP invalidated
- Demo code `123456` removed

---

## 3. AI Service Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Service + models status |
| GET | `/ml/models/status` | Model accuracy details |
| POST | `/ml/forecast` | Demand forecasting (GBoost + LSTM ensemble) |
| POST | `/ml/churn` | Churn probability + RFM segments |
| POST | `/ml/recommend` | Cross-sell / seasonal recommendations |
| POST | `/ml/stockout` | Stockout risk + reorder quantities |

**Trained models:** `ai-service/models/saved/`  
**Retrain:** `.\.venv\Scripts\python.exe train\train_all.py`

---

## 4. How to Run (3 terminals)

### Terminal 1 — AI / ML (start first)

```powershell
cd "c:\Users\THOTI\Desktop\Auca notes\Final year project\RetailPulse\ai-service"
.\.venv\Scripts\uvicorn.exe main:app --host 0.0.0.0 --port 8000
```

Or: `.\scripts\start-ai-service.ps1`

### Terminal 2 — Backend

```powershell
cd "c:\Users\THOTI\Desktop\Auca notes\Final year project\RetailPulse\backend"
mvn spring-boot:run
```

Or: `.\scripts\start-backend.ps1`

### Terminal 3 — Frontend

```powershell
cd "c:\Users\THOTI\Desktop\Auca notes\Final year project\RetailPulse\frontend"
npm run dev
```

Or: `.\scripts\start-frontend.ps1`

> **Important:** Always use `.\.venv\Scripts\pip.exe` and `.\.venv\Scripts\python.exe` for AI work — not global `pip` (Python 3.14 does not support TensorFlow 2.15).

---

## 5. Verification (Run Session)

| Check | Result |
|-------|--------|
| AI health `GET :8000/health` | `{"status":"ok","models_loaded":true}` |
| AI models loaded | demand, churn, recommendation, stockout — all loaded |
| Backend `POST :8080/api/auth/login` | HTTP 200 |
| Frontend | `http://localhost:5173` |
| TensorFlow in venv | 2.15.0 installed |

### Quick tests

```powershell
curl.exe http://localhost:8000/health
curl.exe http://localhost:8000/ml/models/status
curl.exe -X POST http://localhost:8000/ml/churn -H "Content-Type: application/json" -d "{}"
```

---

## 6. Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@retailpulse.rw | admin123 |
| Manager | manager@retailpulse.rw | manager123 |

2FA: real OTP sent to registered email (check inbox, 10 min expiry).

---

## 7. Fallback Behaviour

If AI service (`:8000`) is **not running**:

- Login, dashboard, sales, inventory CRUD → **still work**
- Forecast / churn / recommendations / stockout → use **PostgreSQL seed data** or built-in Java fallbacks
- API responses omit `aiPowered: true` flag

If AI service **is running**:

- Backend enriches responses with ML predictions
- Responses include `aiPowered: true` where applicable

---

## 8. File Map

```
RetailPulse/
├── frontend/          → React UI (:5173)
├── backend/           → Spring Boot API (:8080)
│   └── service/AIServiceClient.java   → bridge to AI
├── ai-service/        → FastAPI ML (:8000)
│   ├── main.py
│   ├── models/
│   ├── services/
│   ├── data/raw/      → training CSVs
│   └── train/train_all.py
└── scripts/
    ├── start-ai-service.ps1
    ├── start-backend.ps1
    └── start-frontend.ps1
```

---

## 9. Status Summary

| Component | Status |
|-----------|--------|
| Frontend | Complete |
| Backend API | Complete |
| PostgreSQL + seed data | Complete |
| Real OTP email | Complete |
| AI service (Python) | Complete |
| Backend ↔ AI integration | **Fixed this session** |
| All 3 services running | **Verified this session** |

**RetailPulse is ready for demo with full AI/ML integration when all three services are running.**

---

## 10. Latest Verification (Continue Session)

| Service | Port | Status |
|---------|------|--------|
| AI / ML (FastAPI) | 8000 | Running — `models_loaded: true`, TensorFlow 2.15 |
| Backend (Spring Boot) | 8080 | Running |
| Frontend (Vite) | 5173 | Running |

**Quick check:** `.\scripts\check-status.ps1`

**Demo URL:** http://localhost:5173

**Note:** If AI start fails with `Errno 10048`, port 8000 is already in use — an instance is already running; no need to start again.
