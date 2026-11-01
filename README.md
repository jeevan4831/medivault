# MediVault

A secure, consent-based personal document management and temporary sharing
system. Store Aadhaar, PAN, driving licences, passports, medical records,
certificates, insurance, vehicle and employment documents, and share them
temporarily with explicit consent.

## Tech stack
- **Frontend:** React, Vite, Tailwind CSS, React Router, Axios
- **Backend:** Python, FastAPI, SQLAlchemy, Pydantic, MySQL (PyMySQL)
- **Security (planned):** JWT auth, hashed passwords, encrypted file storage

## Structure
```
MediVault/
├── frontend/   React app
├── backend/    FastAPI app
├── storage/    Private document storage (git-ignored, never served publicly)
├── docs/       Project documentation
└── README.md
```

## Prerequisites
Python 3.10+, Node.js 18+, MySQL 8+

## 1. Create the database
```sql
CREATE DATABASE medivault CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'medivault_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON medivault.* TO 'medivault_user'@'localhost';
FLUSH PRIVILEGES;
```

## 2. Run the backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # Windows: copy .env.example .env
# edit .env and set DB_USER / DB_PASSWORD / DB_NAME
uvicorn app.main:app --reload --port 8000
```
- API: http://localhost:8000
- Health: http://localhost:8000/api/health
- DB health: http://localhost:8000/api/health/db
- Swagger docs: http://localhost:8000/docs

## 3. Run the frontend
```bash
cd frontend
npm install
cp .env.example .env               # Windows: copy .env.example .env
npm run dev
```
- App: http://localhost:5173

The two apps run independently. Without the backend, the home page still
loads and shows the API and database as "Unreachable".

## Security notes
- Never commit `.env` files.
- Uploaded files live in `storage/`, outside the frontend, and will be
  encrypted and served only through authenticated, consent-checked endpoints.

## Roadmap
1. ~~Project setup~~ (this step)
2. Auth: registration, login, JWT
3. Encrypted document upload/download
4. Consent-based temporary sharing with expiry and revocation
5. Access logs and audit trail
