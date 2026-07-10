# RetailPulse Backend

Spring Boot 3.2 REST API for the RetailPulse AI-powered retail analytics dashboard.

## Tech stack

- Java 17
- Spring Boot 3.2 (Web, Security, JPA, Validation, Mail)
- PostgreSQL 15
- JWT authentication with 2FA
- Maven + Lombok

## Prerequisites

- JDK 17+
- Maven 3.9+
- PostgreSQL 15

## Database setup

```sql
CREATE DATABASE retailpulse;
```

Hibernate auto-creates/updates tables (`ddl-auto: update`). Demo data is seeded on first startup via `DataInitializer`.

## Configuration

Environment variables (or defaults in `application.yml`):

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `retailpulse` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | `postgres` | Database password |
| `JWT_SECRET` | (dev default) | JWT signing secret (min 32 chars) |
| `SERVER_PORT` | `8080` | API port |

## Run

```bash
cd backend
mvn spring-boot:run
```

API base URL: `http://localhost:8080/api`

## Demo accounts

| Email | Password | Role |
|-------|----------|------|
| admin@retailpulse.rw | admin123 | Administrator |
| manager@retailpulse.rw | manager123 | Manager |
| analyst@retailpulse.rw | analyst123 | Analyst |
| viewer@retailpulse.rw | viewer123 | Viewer |

2FA demo code: **123456**

## Auth flow

1. `POST /api/auth/login` — returns `{ requires2FA, tempToken }`
2. `POST /api/auth/verify-2fa` — returns `{ accessToken, refreshToken, user }`
3. `POST /api/auth/refresh` — refresh access token
4. All other endpoints: `Authorization: Bearer <accessToken>`

## Frontend integration

Set in `frontend/.env`:

```
VITE_API_BASE_URL=http://localhost:8080/api
```

CORS is enabled for `http://localhost:5173`.

## Test

```bash
mvn test
```

Tests use an in-memory H2 database with the same schema.
