# LMP Forecast

ASP.NET Core 9 Web API + React (Vite, TypeScript, MUI) + PostgreSQL.

Phase 1: registration and login, SuperAdmin user/role management, an interactive PJM node-network welcome dashboard, and admin uploads of FTR auction results ("Obligation Nodal Prices" sheet) and day-ahead hourly LMP CSVs, stored as-is.

## Prerequisites

- .NET 9 SDK — `dotnet --list-sdks`
- Node.js 20+ — `node -v`
- PostgreSQL 15+ running locally (default connection: `localhost:5432`, user `postgres`, password `postgres`)
- EF Core tool (once): `dotnet tool install --global dotnet-ef --version 9.0.9`

## 1. Database

Create an empty database:

```
psql -U postgres -c "CREATE DATABASE lmp_forecast;"
```

Create your local settings file from the template and put your postgres password in
`ConnectionStrings:Default`. The copy is git-ignored, so it never reaches the repo:

```
cd backend/LmpForecast.Api
copy appsettings.Development.example.json appsettings.Development.json
```

Apply the migration (creates all tables):

```
cd backend/LmpForecast.Api
dotnet ef database update
```

(In Development the API also applies pending migrations on startup.)

## 2. Backend

```
cd backend/LmpForecast.Api
dotnet run --launch-profile http
```

API: http://localhost:5080 · OpenAPI document: http://localhost:5080/openapi/v1.json

On first start it creates the roles (SuperAdmin, Admin, User) and a SuperAdmin from
`appsettings.Development.json` (defaults from the template):

- Email: `superadmin@lmpforecast.local`
- Password: `ChangeMe123`

Change these (and `Jwt:Key`) before using the app for real.

## 3. Frontend

```
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. To test on your phone, use `http://<your-PC-IP>:5173` on the same Wi-Fi.

## Welcome screen

Shows cleared FTR paths as a directed source → sink network.

- **Month / Day**: picks the auction covering that date (monthly, then annual, then long-term; for long-term the matching YR1/YR2/YR3) and loads day-ahead LMP for that month or day.
- **Auction, Class, Hedge**: narrow the paths; **Source / sink node** searches by name or PNODEID, with Either / Source / Sink.
- **Show top**: only the biggest N paths by cleared MW are drawn (the full count is shown).
- Node colour = auction nodal price (ranked among the nodes shown), size = MW; line width = MW, colour = MCP sign. Ringed nodes have day-ahead prices; for paths between two of them the table shows the DA congestion spread (sink − source).

## Roles

| Role | Can do |
|---|---|
| User | Sign in, see the welcome dashboard (default for new registrations) |
| Admin | + upload and delete data files, view stored rows |
| SuperAdmin | + list users, assign roles, enable/disable accounts |

## Uploads

- **FTR auction results** (.xlsx): choose Annual / Long Term / Monthly first, then the workbook. Only the sheet whose name starts with "Obligation Nodal Prices" is read. Its two header rows are merged into one: `node, pnode_id, period_type, lmp_24h, lmp_on_peak, lmp_off_peak, lmp_wknd_on_peak, lmp_daily_off_peak` (`lmp_off_peak` only exists in long-term files). Period and round are pre-filled from file names like `annual_2026-2027_round4.xlsx`.
- The same auction upload also reads the "… Results RD n" sheet (one cleared FTR per row: source, sink, class, hedge type, MW, MCP) into `auction_ftr_result`, and builds `auction_path_summary` (MW per source → sink path) for the welcome screen. Auctions uploaded before this existed are re-read from their saved file when the API starts.
- **Day-ahead hourly LMP** (.csv): columns `datetime_beginning_ept, pnode_id, pnode_name, type, zone, system_energy_price_da, congestion_price_da, marginal_loss_price_da, total_lmp_da`, stored row for row.
- The original file is kept under `backend/LmpForecast.Api/App_Data/uploads`. The same file (by SHA-256) cannot be uploaded twice; a failed upload of the same file can be retried.

## Project layout

```
backend/
  LmpForecast.sln
  LmpForecast.Api/
    Controllers/   Auth, Users (SuperAdmin), Uploads (Admin), Dashboard
    Data/          AppDbContext, seeder, Migrations/
    Models/        ApplicationUser, UploadBatch, AuctionNodalPrice, DaHourlyLmp
    Services/      JWT tokens, Excel/CSV readers, UploadService (PostgreSQL COPY)
frontend/
  src/
    api/           axios client + types
    auth/          AuthContext, route guard
    components/    AppLayout, NetworkGraph (react-force-graph-2d), WebBackground, UploadDropzone
    pages/         Login, Register, Welcome, Users, Uploads
```

## Annual auction analysis

Menu: **Annual analysis**. Pick a month range (From / To), one or more classes (24H, OnPeak, WkndOnPeak, DailyOffPeak), the auction round, and optionally a source and/or sink.

- **Auction price** of a path = sink nodal price − source nodal price from the annual auction (Obligation Nodal Prices sheet), prorated to the hours in the range that have DA data: `price × class hours with DA data ÷ class hours in the planning year`.
- **Actual price** = Σ over those hours of (sink − source) DA congestion price (`congestion_price_da`).
- **Error** = Actual − Auction.
- A range that crosses 1 June is split by planning year (Jun–May) and each part uses that year's annual auction.
- Class hours follow PJM: OnPeak = HE 08–23 (hour beginning 07–22) on weekdays that are not NERC holidays, WkndOnPeak = same hours on weekends/holidays, DailyOffPeak = hour beginning 23–06.
- Without a source/sink filter, the paths are the cleared Obligation FTR paths where both ends have DA data.
- **Error by node** shows each node as the path *reference → node* (default WESTERN HUB), because auction nodal prices and DA congestion do not share the same reference. Choose "None (raw)" to see raw node values.
- **Export to Excel** downloads the current run (sheets Paths, Nodes, Summary).

API: `GET /api/analysis/annual/options`, `GET /api/analysis/annual?from=2026-06&to=2026-09&classes=24H,OnPeak&round=&sourcePnodeId=&sinkPnodeId=`, `GET /api/analysis/annual/export?...`.
