# Angular frontend

This is the first responsive UI shell for AI Business Assistant. It currently uses clearly labeled sample data and local-only interactions; it is **not connected to the API or a real business workspace**.

## Run locally

Requires a supported Node.js version for the selected Angular CLI release.

```bash
npm install
npm start
```

Open the local URL printed by Angular CLI. To create a production build:

```bash
npm run build
```

## Current scope

- Responsive navigation and dashboard layout.
- Sample sales, collected-payment, outstanding, and expense cards.
- Illustrative revenue chart, review prompts, and searchable sample activity.
- CSV export of sample activity only.
- Placeholder routes for the first 20 product areas.

Authentication, API contracts, live reports, business CRUD, and AI responses are intentionally not wired yet. Do not treat the displayed values as real business data. Protected API endpoints must wait until a trusted identity verifier and server-side business authorization are implemented.
