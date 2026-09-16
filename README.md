# College Print Portal

A simple QR-based file submission portal for college printing.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the student upload page.  
Open [http://localhost:3000/admin](http://localhost:3000/admin) for the admin dashboard.

## Default Admin Login

| Field    | Value               |
|----------|---------------------|
| Email    | admin@college.edu   |
| Password | admin123            |

> ⚠️ Change these credentials after first login by updating the database.

## How It Works

### Student Flow
1. Scan the counter QR code (or open the link)
2. Enter name and choose a photo or PDF
3. Click Submit → receive a token number (e.g. `PRINT-20260916-0042`)
4. Files are **ephemeral** and automatically deleted within 30 minutes for privacy

### Admin Live Counter Flow
1. Log in at `/admin/login` (admin@college.edu / admin123)
2. The **Counter QR Code** is displayed directly on the screen for students to scan
3. When a student uploads, the system plays an audio chime 🔔 and the submission appears instantly (3.5s refresh)
4. Admin can click:
   - **🖨️ Print Direct**: Immediately triggers the print dialog on the file
   - **⬇️ Download**: Saves file locally
   - **✅ Mark Done**: Marks printed
   - **🗑️ Delete File Now**: Immediately wipes the file from disk
5. Files are automatically purged from disk after the configured retention time (default: 30 mins)

## Generating the QR Code
1. Log in to the admin dashboard
2. Click **📱 QR Code** in the sidebar
3. Download the PNG and print it

## File Structure

```
app/
  page.tsx              ← Student upload form
  success/page.tsx      ← Token success page
  admin/
    page.tsx            ← Admin dashboard
    login/page.tsx      ← Admin login
  api/
    submit/route.ts     ← POST: student submission
    submissions/        ← GET/PATCH: submission management
    files/[id]/route.ts ← Secure file download (auth required)
    qr/route.ts         ← QR code generation
lib/
  prisma.ts             ← Database client
  auth.ts               ← NextAuth config
  tokens.ts             ← PRINT-YYYYMMDD-XXXX token generation
prisma/
  schema.prisma         ← SQLite schema
  seed.js               ← Default admin seed
uploads/                ← Uploaded files (created automatically)
```

## Environment Variables (.env)

```
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="change-this-in-production"
NEXTAUTH_URL="http://localhost:3000"
```

For production, set `NEXTAUTH_URL` to your actual server URL (e.g. `http://192.168.1.100:3000` for LAN).

## Accepted File Types
- PDF
- JPG / JPEG
- PNG

Max 20 MB per file.

## Re-seeding the Database

```bash
node prisma/seed.js
```
