# Deploying College Print Portal to Vercel (100% Free)

This guide walks you through deploying the portal to **Vercel** with a free cloud database and cloud storage so any student can scan the QR code and submit documents from their phones.

---

## Step 1: Create a Free Cloud Database (Neon.tech)

Vercel functions are serverless and need an external database. Neon provides a free, instant cloud PostgreSQL database:

1. Sign up at [https://neon.tech](https://neon.tech).
2. Click **New Project** → Name: `college-print-db`.
3. Under **Dashboard**, copy your **Connection String**:
   ```
   postgresql://alex:AbC123XyZ@ep-cool-frost-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

---

## Step 2: Update Prisma Schema for PostgreSQL

In `prisma/schema.prisma`, change:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Then in your terminal, push the tables and seed the admin user:
```bash
# Set your Neon connection string in your .env:
# DATABASE_URL="postgresql://username:password@your-neon-host/neondb?sslmode=require"

npx prisma db push
node prisma/seed.js
```

---

## Step 3: Push Your Project to GitHub

1. Create a repository on [https://github.com/new](https://github.com/new) named `college-print-portal`.
2. Push your project from your computer:
   ```bash
   git add .
   git commit -m "Configure for Vercel deployment"
   git remote add origin https://github.com/YOUR_USERNAME/college-print-portal.git
   git branch -M main
   git push -u origin main
   ```

---

## Step 4: Deploy on Vercel

1. Go to [https://vercel.com](https://vercel.com) and log in with GitHub.
2. Click **Add New...** → **Project**.
3. Import your `college-print-portal` repository.
4. Under **Environment Variables**, add:

   | Variable Name | Value |
   |---|---|
   | `DATABASE_URL` | *(Your Neon Postgres connection string from Step 1)* |
   | `NEXTAUTH_SECRET` | *(Generate any random 32-character string)* |
   | `NEXTAUTH_URL` | *(Leave blank initially or put your Vercel URL e.g. `https://college-print-portal.vercel.app`)* |

5. Click **Deploy**. Vercel will build and deploy your project!

---

## Step 5: Enable Vercel Blob (Cloud File Storage)

Once your project is deployed on Vercel:

1. Open your project on the Vercel dashboard.
2. Go to the **Storage** tab.
3. Click **Connect Store** → Select **Blob**.
4. Choose a name (e.g. `college-print-blob`) and click **Create**.
5. Connect it to your production environment. Vercel will automatically configure the `BLOB_READ_WRITE_TOKEN` variable!
6. Click **Redeploy** to apply the storage token.

---

## That's it! 🎉

- Your app is now live at `https://your-app.vercel.app`.
- The QR code on the admin screen automatically points to your live URL.
- Students can scan the QR code from any phone on 4G/5G mobile data.
- Uploaded files are securely stored in Vercel Blob and auto-purged every 30 minutes!
