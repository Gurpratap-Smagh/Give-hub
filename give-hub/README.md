# GiveHub - Decentralized Donation Platform

Welcome to GiveHub, a modern, decentralized platform for fundraising and donations, built with Next.js and integrated with blockchain technology.

## Overview

GiveHub allows users to create fundraising campaigns, explore existing ones, and donate to causes they care about. The platform is designed to be transparent and secure, leveraging smart contracts for handling donations.

This repository contains the frontend application built with the Next.js App Router (currently v15). The codebase is annotated with concise migration notes and TODOs to guide the swap from the JSON mock DB to MongoDB. It is production-structured and self-sufficient without any external test references.

## Tech Stack

- **Framework:** [Next.js 15](https://nextjs.org/) (App Router)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **UI Components:** [Shadcn UI](https://ui.shadcn.com/) (using Radix UI and Tailwind CSS)
- **Blockchain Integration (Planned):** [ZetaChain](https://www.zetachain.com/) via [viem](https://viem.sh/)
- **Database (Planned):** [MongoDB](https://www.mongodb.com/)
- **AI Integration:** Campaign image generation via Gemini API (Gemini image model or Imagen) with `/api/ai/generate-image` and client integration on `app/create/page.tsx`.

## Getting Started

To run the development server locally, follow these steps:

1.  **Install Dependencies:**

    ```bash
    npm install
    ```

2.  **Run the Development Server:**

    ```bash
    npm run dev
    ```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

Environment is automatically loaded from `.env.local` when present.

### AI Image Generation Configuration

Add the following to `.env.local` to enable image generation:

```bash
GEMINI_API_KEY=your_google_gemini_api_key
# Optional: enable Imagen via Gemini API (preferred if you have access)
USE_IMAGEN=true
IMAGEN_MODEL=imagen-4.0-generate-preview-06-06
```

Notes:
- Gemini image generation requires `responseModalities` to include both TEXT and IMAGE; the API route handles this.
- If your key only has access to text models (e.g., 2.5 Flash), enable `USE_IMAGEN=true` for Imagen.

## Project Structure

-   `app/`: Contains all pages and layouts, following the Next.js App Router structure.
-   `components/`: Reusable React components used across the application (e.g., `Nav`, `CampaignCard`).
-   `lib/`: Core logic, types, auth, and data access.
    -   `types.ts`: Centralized TypeScript type definitions.
    -   `auth.ts`, `auth-context.tsx`: JWT auth utilities and client context.
    -   `mock-db/`: JSON-based mock database (drop-in path to MongoDB).
      -   `database.ts`: CRUD helpers and search across schema fields.
      -   `users.json`, `campaigns.json`, `donations.json`: Persistent JSON stores.
    -   `contracts.ts`: Stub functions for smart contract interactions.

## Current Features

-   Campaigns list API: `GET /api/campaigns`
-   Campaign detail API: `GET /api/campaigns/[id]`
-   Campaign creation API: `POST /api/campaigns`
    -   Persists to JSON mock DB and links created campaign to creator
    -   Supports optional `category`, including custom values
-   Authentication (JWT): signup/signin/signout, client context, role-based UI
-   AI image generation on create page (✦ button) calling `POST /api/ai/generate-image`
-   Home page uses server-side data (`db.getAllCampaigns()`) and passes to a client grid
    -   Grid shows 6 cards fully + next 3 blurred before "See more" (sticky button)
    -   On expand, remaining items render unblurred
    -   Grid resets to props when navigating (e.g., leaving search or clicking home), ensuring search results do not persist
-   Campaign creation UI with category dropdown and "Other" free text
    -   Stylish "Edit with AI" button (alerts for now)
-   Campaign cards show category as a small grey pill
-   Search:
    -   Navbar search supports parameter selection (Title, Creator, Category)
    -   Regex pattern input (case-insensitive) on the home page; only matching cards are rendered
    -   "Back to all campaigns" and home navigation reset the grid to show all campaigns
-   DB search helper `db.searchCampaigns(query)` for filtering by any schema field and text query `q`

## Payments (Adapter)

Payments are routed through a small adapter at `lib/payments/index.ts` so future ZetaChain integration is easy. By default it uses a mock REST endpoint.

Configure provider (now or later):

```bash
NEXT_PUBLIC_PAYMENT_PROVIDER=mock # future: zetachain
```

To integrate ZetaChain later, implement `processWithZetaChain()` in `lib/payments/index.ts` and set the provider accordingly.

## Search Usage

- Enter a regex in the navbar search, pick a parameter, and press Enter.
- Examples:
  - Title: `^Edu.*`
  - Creator: `john\\d+`
  - Category: `health|medical`
- Click the logo or "Back to all campaigns" to reset to the full list.

## Migration Roadmap

The app uses a JSON-backed mock DB that can be replaced with MongoDB by swapping implementations in `lib/mock-db/database.ts` while keeping API contracts the same.

1.  **MongoDB Integration:** Replace file read/write with MongoDB collections in `database.ts`.
2.  **Contracts:** Implement `lib/contracts.ts` with viem / ZetaChain.
3.  **AI:** Add `/api/ai` and integrate content assistance where TODOs indicate.
4.  **Rate limiting & emails:** Add production-grade infra.

Developer TODOs are intentionally left in code as placeholders to guide the next steps. No external test references are required.
