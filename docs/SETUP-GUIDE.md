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
- **Site URL** (important — otherwise email links open `localhost:3000` and fail): your Netlify URL (e.g. `https://your-shop.netlify.app`) — needed for password-reset links. Under **Redirect URLs** add `https://your-shop.netlify.app/**` and `http://localhost:8888/**` (this app runs on port 8888, not 3000). Email links are single-use and expire after about an hour.
- No email setup is needed: customers register through the app (accounts are created already confirmed, no verification email), and the owner resets forgotten passwords under **Users → Reset password**. Email links (Site URL / SMTP) are no longer used.

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

## 9. Phone notifications (Android app) — free
Your Android app can ring the phone for every new notification (new online order, payment, ready for pickup, low stock…) **even when the app is closed**. This uses Google Firebase (free). Do this once.

**A. Create the Firebase project**
1. Go to https://console.firebase.google.com → **Add project** → name it (e.g. `mjs-printing`). Google Analytics can be turned off.
2. In the project, click the **Android icon** (Add app). Android package name: **`com.mjsprinting.app`** (must be exactly this). Click **Register app**.
3. Click **Download google-services.json**, then Next/Continue until done.

**B. Give GitHub the app file**
1. Open the downloaded `google-services.json` in Notepad and copy everything.
2. In your GitHub repo: **Settings → Secrets and variables → Actions → Secrets → New repository secret**.
3. Name: `GOOGLE_SERVICES_JSON` — Value: paste the file contents — **Add secret**.

**C. Give Netlify the sending key**
1. Firebase → ⚙ **Project settings → Service accounts → Generate new private key** → download the JSON file.
2. Netlify → **Site configuration → Environment variables** → add:
   - `FCM_SERVICE_ACCOUNT` = the full contents of that JSON file
   - `PUSH_WEBHOOK_SECRET` = any long random text (e.g. 30 random letters/numbers). Remember it for step D.
3. **Deploys → Trigger deploy** so the new variables and the new function go live.

**D. Connect the database**
1. Open `supabase/push.sql`. Edit the two lines marked `<<< EDIT ME`: your Netlify address, and the same `PUSH_WEBHOOK_SECRET` text.
2. Supabase → **SQL Editor** → paste the whole file → **Run**.

**E. Rebuild the APK** (GitHub → Actions → Build Android APK → Run workflow). In the log, the step "Add Firebase config" should say *push notifications ON*.

**F. On each phone**: install the new APK (uninstall the old one first if it refuses), sign in, and tap **Allow** when asked to send notifications. Done — place a test order from a customer account and the admin/cashier phones should ring.

Notes
- Each person gets the notifications meant for their role (e.g. admins and cashiers get new orders; customers get updates about their own orders). Signing out stops notifications on that phone.
- If you skip this section the app still shows a phone notification while it is open, but cannot wake a closed app.
- Troubleshooting: Netlify → Functions → `send-push` → logs. "Unauthorized" = the secret in `push.sql` and Netlify don't match. Phone silent but function says `sent: 0` = nobody has signed in on a phone with the new APK yet.

## 10. Notification update (customer updates + automatic admin alerts)
1. Supabase → **SQL Editor** → paste all of `supabase/notifications_update.sql` → **Run**. (Fresh installs already include it in `schema.sql`.)
2. Upload the project to GitHub so Netlify redeploys. The new `alerts-cron` function then runs every 5 minutes by itself (Netlify → Functions → `alerts-cron` shows it as *Scheduled*).
3. Result: customers are notified at every step of their order and on payments; admins/cashiers are notified of delayed orders, low stock and unpaid balances within about 5 minutes (only between 8 AM and 9 PM), without opening the Dashboard. New orders and payments are still notified instantly.
4. Customers only get notifications if they placed the order while logged in (walk-in customers without an account have no phone to notify).
5. Some phones (OPPO/Realme/Xiaomi/Vivo) stop background apps. On each phone set the app's **Battery → Unrestricted / Allow background activity** and turn on **Auto-start**, otherwise alerts can arrive late when the app is closed.

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

## 8. Android app (APK) from GitHub — free
1. Upload this whole project to a GitHub repository (the `.github` folder must be included).
2. Deploy the site on Netlify first and copy its address (e.g. `https://your-shop.netlify.app`).
3. In GitHub open **Actions → Build Android APK → Run workflow**, paste your Netlify address, and run. (Or save it once under **Settings → Secrets and variables → Actions → Variables** as `SITE_URL`.)
4. After about 5–10 minutes open **Releases** — download `MJs-Printing.apk` and share that link with your staff and customers.
5. On the phone: open the APK, allow "Install unknown apps" when asked, then Install.

The app opens your live site, so website updates reach the app automatically — you only rebuild the APK to change the app icon or name. The APK is debug-signed (fine for sideloading); publishing on Google Play needs a signed release build.
