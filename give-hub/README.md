# GiveHub - Decentralized Donation Platform

Welcome to GiveHub, a modern, decentralized platform for fundraising and donations, built with Next.js and integrated with blockchain technology.

## Overview

GiveHub allows users to create fundraising campaigns, explore existing ones, and donate to causes they care about. The platform is designed to be transparent and secure, leveraging smart contracts for handling donations.

This repository contains the frontend application built with the Next.js App Router. The codebase is heavily annotated with developer comments, migration notes, and TODOs to guide the transition from mock data to a full-fledged backend.

## Tech Stack

- **Framework:** [Next.js 13](https://nextjs.org/) (App Router)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **UI Components:** [Shadcn UI](https://ui.shadcn.com/) (using Radix UI and Tailwind CSS)
- **Blockchain Integration (Planned):** [ZetaChain](https://www.zetachain.com/) via [viem](https://viem.sh/)
- **Database (Planned):** [MongoDB](https://www.mongodb.com/)
- **AI Integration (Planned):** Campaign creation assistance via Gemini AI.

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

## Project Structure

-   `app/`: Contains all pages and layouts, following the Next.js App Router structure.
-   `components/`: Reusable React components used across the application (e.g., `Nav`, `CampaignCard`).
-   `lib/`: Core logic, type definitions, and placeholder data.
    -   `types.ts`: Centralized TypeScript type definitions.
    -   `mock.ts`: Temporary mock data for development.
    -   `contracts.ts`: Stub functions for smart contract interactions.

## Migration Roadmap

This project is currently in a pre-alpha stage, using mock data for rapid prototyping. The next phases involve:

1.  **Backend Integration:** Replace mock data in `lib/mock.ts` with API calls to a MongoDB database. API routes will be created under `app/api/`.
2.  **Smart Contract Integration:** Implement the stubbed functions in `lib/contracts.ts` to interact with deployed ZetaChain smart contracts using `viem`.
3.  **AI-Powered Features:** Build out the `/api/ai` endpoint to parse user intents for campaign creation, adding validation and security checks.
4.  **Authentication:** Implement user login and wallet connection to manage campaigns and donations.

Developer notes and `TODO` comments are embedded throughout the code to pinpoint exactly where these changes need to occur.
