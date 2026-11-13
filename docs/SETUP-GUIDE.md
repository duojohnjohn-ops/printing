# Setup Guide — Printing Shop Management System

Follow these steps in order. Total time: about 20 minutes.

## 1. Create the Supabase project
1. Go to <https://supabase.com> → **New project**. Choose a region close to you and save the database password.
2. Open **Project Settings → API** and keep this tab open. You need three values:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (**secret** — only ever stored in Netlify/.env, never in frontend code)

## 2. Run the SQL files (SQL Editor → New query)
Run each file's full contents, in this order:
0. `supabase/00_reset.sql` — **only if an older version is already installed.** It deletes the old PSMS tables, functions, triggers and sequences (and all their data) so the new schema starts clean. Skip it on a brand-new project. Back up first if the old data matters. Read the note at the bottom of that file about old login accounts.
1. `supabase/schema.sql` — tables, indexes, triggers, pricing/payment/inventory functions, owner-setup functions
2. `supabase/policies.sql` — Row Level Security and private storage buckets
3. `supabase/seed.sql` — sample services, **sample** prices (PHP), expense categories, inventory, settings

The three storage buckets (`order-files` private, `expense-receipts` private, `branding` public) are created by `policies.sql`.
Edit prices afterwards in **Admin → Pricing** — nothing is hardcoded in the app.

## 3. Authentication settings (Authentication → Providers/URL Configuration)
- **Email** provider enabled.
- **Site URL**: your Netlify URL (e.g. `https://your-shop.netlify.app`) — needed for password-reset links. Add `http://localhost:8888` for local testing.
- Optional: turn off "Confirm email" while testing so new customers can sign in immediately.

## 4. Set up the owner account (first visit)
No SQL needed. Until an owner exists, the login page shows only **Set up the owner account** (customer sign-up and sign-in are hidden).
1. Deploy/run the site (steps 5–6) and open `/pages/login.html`.
2. Enter the business name, your name, email and a password, then **Create owner account**. You are signed in straight to the Admin portal.
3. Add Cashier and Printing Staff accounts under **Users → Add staff user**. Customers can now register themselves.

The setup works only once: after the owner exists, the function refuses any further attempt. The owner account cannot be demoted or deactivated. If you ever need to start over, run `00_reset.sql` again.

## 5. Run locally in VS Code
```bash
npm install
cp .env.example .env      # fill in the values
npx netlify login         # once
npm run dev               # = netlify dev  → http://localhost:8888
```
Use `netlify dev` (not a plain static server) because the app calls Netlify Functions.

## 6. Deploy to Netlify via GitHub
1. Push the project to a GitHub repository (`.env` is git-ignored).
2. Netlify → **Add new site → Import from Git** → choose the repo. Build command: *(empty)*. Publish directory: `.` (already set in `netlify.toml`).
3. **Site configuration → Environment variables**, add:
   | Variable | Required | Purpose |
   |---|---|---|
   | `SUPABASE_URL` | yes | Project URL |
   | `SUPABASE_ANON_KEY` | yes | Public key, served to the browser by a function |
   | `SUPABASE_SERVICE_ROLE_KEY` | yes | Secret key, used only inside functions |
   | `RESEND_API_KEY` | optional | Email notifications ([resend.com](https://resend.com)) |
   | `EMAIL_FROM` | optional | Verified sender, e.g. `Shop <orders@yourdomain.com>` |
   | `NOTIFY_EMAIL` | optional | Owner address that receives "new online order" emails |
4. Trigger a deploy. Open the site URL and sign in.

## 7. Your logo
Replace `assets/images/business-logo.png` with your own file (keep the name), or upload it in **Admin → Settings → Business logo**. It appears on login, sidebar, receipts, invoices, job-order slips and printed reports. Tweak the colour variables at the top of `css/style.css` (`--brand`, `--accent`) to match it.

## 8. First-run checklist
- Settings: business name, address, phone, order prefix, receipt footer.
- Pricing: review the sample prices, rush-order %, quantity discounts.
- Inventory → Usage rules: map services to materials if you want automatic stock deduction on completion.
- Place a test order as a customer, approve it as Cashier/Admin, assign Staff, take a payment, print the receipt.

## How the main business rules work
- **Pricing** is computed in the database (`calc_line`). The browser preview and the server use the same function, so totals can't be tampered with.
- **Prices per item**: unit price × (pages × copies) + service extra charge − quantity discount + rush fee. For per-piece items use 1 page and enter the quantity as copies.
- **Payments** support partial/multiple payments per order; overpayment is rejected; cash change is computed server-side.
- **Inventory deduction** happens only when an order becomes *Completed* and only for services with a usage rule; a unique index prevents duplicate deductions.
- **Profit** = payments received − recorded expenses. Dashboard and reports label gross sales, payments received, outstanding balances and estimated profit separately.
- **Notifications** appear in the bell icon (new online order, payment, ready for pickup, delayed order, low stock, unpaid balance). Delayed/low-stock/unpaid alerts refresh when an admin opens the Dashboard.
- **PDFs** show amounts as `PHP 1,234.00` (the PDF font cannot draw ₱); on-screen and print versions use ₱.

## Security notes
- The service-role key exists only in Netlify environment variables and is used only inside functions that first verify the caller's session and role.
- Orders, payments and inventory movements can only be written through functions (`create-order`, `process-payment`, `update-inventory`) which call database functions that run in a single transaction. Browser clients have no direct insert rights on those tables.
- Row Level Security: customers see only their own orders, files and payments; staff see only jobs assigned to them; cashiers have no access to expenses, users or settings; admins have full access.
- Customer files are in a private bucket; access is via short-lived signed URLs and follows order visibility. Uploads are limited to PDF/DOC/DOCX/JPG/PNG/TIFF, 25 MB each.

## Troubleshooting
| Symptom | Fix |
|---|---|
| "Could not load configuration" | Environment variables missing in Netlify / `.env` |
| Login page says the database is not set up | Run the SQL files in order (step 2) and reload |
| Owner setup says "already registered" | Old login accounts survived the reset — delete them in Authentication → Users |
| Login works but page bounces back to login | Profile row missing/inactive — check `profiles` table |
| "No price is configured for the selected options" | Add a matching row in Admin → Pricing |
| Dashboard errors | Re-run `schema.sql` (functions are `create or replace`; safe to re-run) |
| Password reset link goes to wrong site | Fix Site URL in Supabase Auth settings |
