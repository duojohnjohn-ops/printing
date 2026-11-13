# Printing Shop Management System (PSMS)

A complete web system for a printing business: Admin, Cashier, Printing Staff and Customer portals with POS, automatic pricing, order tracking, private file uploads, receipts/invoices/job-order slips, inventory, expenses, reports (PDF/Excel/print), notifications and activity logs.

**Stack:** HTML + CSS + vanilla JavaScript · Supabase (PostgreSQL, Auth, Storage, RLS) · Netlify (hosting + Functions). No always-on server.

## Quick start
1. Follow **[docs/SETUP-GUIDE.md](docs/SETUP-GUIDE.md)** (Supabase SQL — `00_reset.sql` first if replacing an old install — Netlify env vars, then set up the owner account on first visit).
2. `npm install` → copy `.env.example` to `.env` → `npm run dev` (Netlify CLI, http://localhost:8888).
3. Replace `assets/images/business-logo.png` with your logo.

## Structure
```
index.html, netlify.toml, package.json, .env.example
assets/images/business-logo.png      <- your logo (placeholder included)
css/        style.css (design tokens) · components.css · dashboard.css · responsive.css
js/         supabase.js (client+API) · ui.js (helpers) · auth.js · app.js (shell/router)
            dashboard · orders · pos · customers · services · pricing · inventory · payments
            expenses · employees · reports · settings · users (+logs, account) · notifications · receipts
pages/      login · admin · cashier · staff · customer
netlify/functions/  public-config · create-order · process-payment · update-inventory
                    generate-report · admin-users · setup-owner · _lib (shared auth/validation)
supabase/   00_reset.sql · schema.sql · policies.sql · seed.sql
docs/       SETUP-GUIDE.md
```

## Portals
| Portal | URL | Access |
|---|---|---|
| Admin | `/pages/admin.html` | Everything |
| Cashier | `/pages/cashier.html` | POS, orders, customers, payments, price list |
| Staff | `/pages/staff.html` | Assigned jobs, files, progress, notes |
| Customer | `/pages/customer.html` | Order, upload, track, payments, receipts |

Everyone signs in at `/pages/login.html` and is routed to their portal.

## Notes
- Seed prices are **samples**; set your real prices under Admin → Pricing.
- Never commit `.env`; the service-role key must only live in Netlify environment variables.
- This was built without access to a live Supabase project, so syntax was checked but the SQL and screens have not been run end-to-end. Do a test pass (setup guide §8) before going live.
