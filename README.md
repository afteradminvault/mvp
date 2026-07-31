This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Two-brand local development

This app serves two brands — AfterAdmin.co and AfterVault.co — from one
shared backend, selected by request hostname (see
`src/config/brand-config.ts` and `src/proxy.ts`). Since real DNS isn't
needed to develop against either brand locally:

- `http://localhost:3000/?brand=afteradmin` — one-time query override.
- `http://localhost:3000/?brand=aftervault` — same, for the other brand.

Visiting once with the query param persists the choice in a cookie, so it
survives navigating away from `/`. No component should ever hardcode
"AfterAdmin" or "AfterVault" — everything brand-specific comes from the
resolved `BrandConfig` (`getBrandConfig()` server-side, `useBrand()` in
Client Components).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
