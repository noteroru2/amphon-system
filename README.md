# AMPHON System (Starter)

โปรเจกต์ตัวอย่างตาม Blueprint ที่คุณให้ไว้ แยกเป็น backend (Node.js/Express) และ frontend (React + Vite + Tailwind)

## วิธีเริ่มต้น

### 1) Backend

```bash
cd backend
npm install
cp .env.example .env   # แก้ DATABASE_URL ให้ตรงกับ PostgreSQL ของคุณ หรือใช้แบบไม่ต่อ DB ก่อนก็ได้
npm run dev
```

API จะรันที่ `http://localhost:4000`

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

เปิดเบราว์เซอร์ที่ `http://localhost:5173`

### Login Demo

* 087376 → ADMIN
* 064257 → STAFF

> ตอนนี้ยังเป็นโครง (skeleton) และเก็บข้อมูลตัวอย่างใน memory ก่อน คุณสามารถต่อยอดเชื่อม PostgreSQL / Prisma และเพิ่มฟีเจอร์ตาม Blueprint ได้ต่อไป
