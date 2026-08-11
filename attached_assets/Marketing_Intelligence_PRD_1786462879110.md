# Product Requirements Document (PRD)
## Marketing Intelligence Module for Agency Project Management App

**Version:** 1.0
**Date:** August 11, 2026
**Status:** Draft
**Owner:** [Product Owner Name]

---

## 1. Overview

### 1.1 Summary
The **Marketing Intelligence** module extends the agency's existing internal project-management application into a full "marketing command center." It consolidates ad performance and analytics data from Meta Ads, Google Ads, and Google Analytics 4 (GA4) into a single system with two distinct experiences:

- An **Internal Dashboard** for the agency team to monitor all clients, campaigns, spend, and performance in one place.
- A **Client-Facing Dashboard** where each client can log in and see only their own marketing performance data, isolated from other clients.

### 1.2 Problem Statement
The agency currently reports performance to clients manually (e.g., screenshots from Ads Manager), which is time-consuming, inconsistent, and not scalable as the client roster grows. There is no single internal view that ties campaign performance back to clients, projects, and tasks already tracked in the existing PM app.

### 1.3 Goals
- Give the internal team a unified, real-time(ish) view of performance across all clients and ad platforms.
- Give each client a self-serve, branded dashboard showing only their own data.
- Automate recurring reporting (weekly/monthly) instead of manual report creation.
- Lay the foundation for AI-generated insights and recommendations.
- Integrate marketing data directly into the existing Client → Projects → Tasks structure.

### 1.4 Non-Goals (Phase 1)
- Real-time (sub-minute) data streaming — periodic sync (every 2–4 hours) is sufficient.
- Support for platforms beyond Meta, Google Ads, and GA4 in the initial release.
- Automated bid management or campaign optimization actions (insights only, no write-back to ad platforms).

---

## 2. Target Users

| User Type | Description | Key Needs |
|---|---|---|
| Agency Admin/Manager | Oversees all client accounts | Cross-client visibility, team performance overview |
| Account Manager / Media Buyer | Manages specific client campaigns | Detailed campaign-level metrics, quick sync, alerts |
| Client (external) | Agency's customer | Simple, clear performance summary for their own brand only |

---

## 3. System Architecture

### 3.1 High-Level Architecture

```
                    YOUR AGENCY APP
                          │
             ┌────────────┴────────────┐
             │                         │
        INTERNAL DASHBOARD        CLIENT DASHBOARD
             │                         │
       ┌─────┴─────┐             Client-specific
       │           │             reports only
    Clients     Projects
       │
       └───────────────┐
                        │
                 ADS INTEGRATION
                        │
        ┌───────────────┼───────────────┐
        │               │               │
      Meta          Google Ads         GA4
        │               │               │
        └───────────────┼───────────────┘
                         │
                  Your Database
```

### 3.2 Application Layers

```
Frontend (React / Vite)
        │
        ▼
Backend API (Node.js)
        │
   ┌────┴─────┬──────────────┬──────────────┐
   │           │              │              │
Meta Service  Google Ads    GA4 Service   Reporting Service
              Service
   │           │              │              │
   └───────────┴──────────────┴──────────────┘
                         │
                         ▼
                   Database (Supabase/Postgres)
```

**Key architectural principle:** API credentials/tokens must remain server-side. The React frontend never calls Meta/Google APIs or holds tokens directly.

### 3.3 Data Flow / Sync Strategy
- Data is **not** fetched live from Meta/Google/GA4 on every dashboard load.
- A scheduled sync job pulls data into the internal database on a fixed interval.
- Dashboards always read from the database, ensuring fast load times and reduced API rate-limit risk.

```
Meta / Google / GA4
        │
   Scheduled Sync (every 2–4 hrs)
        │
        ▼
   Your Database
        │
        ▼
    Dashboard (instant load)
```

- **Default sync schedule:** 08:00, 12:00, 16:00, 20:00 daily.
- **Manual override:** "Sync Now" button available to force an immediate refresh, with a visible "Last synced" timestamp.

---

## 4. Functional Requirements

### 4.1 Platform Integrations (via OAuth — no client passwords required)

| Platform | Connection Method | Data Pulled |
|---|---|---|
| Meta Ads | Meta Marketing API via OAuth | Ad account, campaigns, ad sets, ads, spend, impressions, reach, clicks, CTR, CPC, CPM, leads, CPL, purchases, conversion value, ROAS, frequency, video views, engagement, creative performance |
| Google Ads | Google Ads API via OAuth | Account (name, customer ID, currency), campaign (name, status, budget, spend, impressions, clicks, CTR, CPC, conversions, conversion value, CPA, ROAS) |
| GA4 | Google Analytics Data API via OAuth | Users, new users, sessions, engagement, landing pages, traffic sources, campaigns, conversions, conversion rate, events, revenue, geographic data, device data |

Connection flow:
```
Client's Ad Account
        │
  OAuth / Permissions
        │
   Your Application
        │
  Platform API (Meta / Google)
        │
   Your Database
        │
     Dashboard
```

### 4.2 Internal Dashboard
- Cross-client overview: total spend, leads, CPL, ROAS across all managed accounts.
- Per-client drill-down into campaign-level performance.
- Platform comparison view (Meta vs. Google Ads) per client.
- Connect/manage ad account integrations per client.
- View sync status and manually trigger a sync.

### 4.3 Client-Facing Dashboard
- Client logs into `app.yourcompany.com` and sees **only their own data**.
- Summary KPIs: Total Spend, Leads, CPL, ROAS.
- Platform breakdown (Meta vs. Google Ads spend).
- Campaign-level performance table (Campaign, Spend, Leads, CPL).
- Strict tenant isolation enforced at the database/query layer — no client can access another client's data under any circumstance.

**Example client view:**

| KPI | This Month |
|---|---:|
| Ad Spend | ₹1,24,500 |
| Impressions | 1.84M |
| Reach | 920K |
| Clicks | 38,400 |
| Leads | 1,240 |
| CPL | ₹100 |
| Purchases | 428 |
| Revenue | ₹7.8L |
| ROAS | 6.27x |

**Meta vs Google example:**

| Metric | Meta | Google | Total |
|---|---:|---:|---:|
| Spend | ₹75K | ₹49.5K | ₹1.24L |
| Impressions | 1.4M | 440K | 1.84M |
| Clicks | 29K | 9.4K | 38.4K |
| Leads | 820 | 420 | 1,240 |
| CPL | ₹91 | ₹118 | ₹100 |

### 4.4 Automated Reporting
- On-demand report generation with configurable parameters:
  - Period: Last 7 days / Last 30 days / This month / Custom range
  - Platforms to include: Meta / Google Ads / GA4 (multi-select)
- Report includes: Executive Summary, Spend, Reach, Impressions, Traffic, Leads, CPL, Conversions, Revenue, ROAS, Campaign performance, Platform comparison, Best/worst performing campaigns, Recommendations.
- Output as PDF and/or shareable web link.
- Future: scheduled/recurring report delivery (e.g., auto-email every Monday).

### 4.5 AI Performance Insights (later phase)
Rather than only displaying raw numbers, the system generates natural-language insights:
- **What's working** — e.g., identifying top-performing campaigns and why.
- **What's underperforming** — e.g., flagging rising CPL with flat conversions.
- **Recommended actions** — e.g., budget reallocation or creative refresh suggestions.

This turns the module from a passive reporting tool into a decision-support tool.

### 4.6 Data Model (Extension to Existing Client Structure)

Existing structure:
```
Client
 ├── Projects
 ├── Tasks
 ├── Team
 └── Campaigns
```

New structure:
```
Client
 ├── Projects
 ├── Campaigns
 ├── Meta Ads
 ├── Google Ads
 ├── GA4
 ├── SEO (future)
 ├── Leads
 ├── Reports
 └── Performance
```

### 4.7 Proposed Database Schema (Supabase/Postgres)

**clients**
```
id
name
company_name
status
```

**ad_connections**
```
id
client_id
platform
account_id
access_token
refresh_token
expires_at
status
```

**campaigns**
```
id
client_id
platform
external_campaign_id
campaign_name
status
```

**campaign_daily_metrics**
```
id
client_id
campaign_id
platform
date
spend
impressions
reach
clicks
conversions
revenue
```

---

## 5. Module Structure

```
Marketing Intelligence
│
├── Overview
├── Clients
│
├── Meta Ads
│   ├── Accounts
│   ├── Campaigns
│   ├── Ad Sets
│   └── Ads
│
├── Google Ads
│   ├── Accounts
│   ├── Campaigns
│   ├── Ad Groups
│   └── Keywords
│
├── Analytics
│   └── GA4
│
├── Performance
│
├── AI Insights
│
└── Client Reports
    ├── Generate
    ├── Schedule
    └── Share
```

---

## 6. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Security | OAuth tokens stored server-side only; never exposed to frontend. Encrypted at rest. |
| Data Isolation | Strict client/tenant isolation enforced at the database layer for all client-facing queries. |
| Performance | Dashboards must load from the database, not live API calls, to ensure sub-second response times. |
| Reliability | Sync jobs must handle API rate limits, token expiry/refresh, and partial failures gracefully. |
| Scalability | Architecture should support adding new ad platforms (LinkedIn, TikTok, YouTube, Search Console, Bing) without redesign. |
| Auditability | "Last synced" timestamp visible on all dashboards; manual sync actions logged. |

---

## 7. Phased Rollout Plan

| Phase | Scope |
|---|---|
| **Phase 1** | Meta integration: connect account → select ad account → sync campaigns → sync daily metrics → dashboard |
| **Phase 2** | Google Ads integration: connect → select customer account → sync campaigns → sync metrics → dashboard |
| **Phase 3** | GA4 integration: connect → select GA4 property → sync analytics → dashboard |
| **Phase 4** | Automated reporting: dashboard → generate report → PDF/web link → deliver to client |
| **Phase 5** | AI insights: raw metrics → analysis engine → insights → recommendations |

---

## 8. Future Platform Roadmap

| Platform | Priority |
|---|---|
| Meta Ads | Must have (Phase 1) |
| Google Ads | Must have (Phase 2) |
| GA4 | Must have (Phase 3) |
| Google Search Console | High |
| YouTube Ads | High |
| LinkedIn Ads | Medium |
| TikTok Ads | Medium |
| Snapchat Ads | Later |
| Bing Ads | Later |

---

## 9. Open Questions
- Which team members/roles should have access to which clients' data internally (RBAC granularity)?
- Do clients need multi-user access (e.g., multiple stakeholders per client account) or a single login?
- Should reports be white-labeled with the agency's branding, the client's branding, or both?
- What is the retention policy for historical daily metrics data?
- Should there be alerting (e.g., email/Slack) when a metric crosses a threshold (CPL spike, budget pacing issue), or is that out of scope until a later phase?

---

## 10. Success Metrics
- Reduction in hours/week spent manually compiling client reports.
- Number of clients actively using the self-serve dashboard.
- Time-to-report generation (target: under 1 minute for standard report).
- Client-reported satisfaction with reporting transparency (survey/NPS).
