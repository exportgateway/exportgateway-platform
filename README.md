# ExportGateway Platform

AI-powered SaaS platform for international trade, customs compliance, freight logistics, and export documentation.

## Tech Stack

- **Next.js 15** — App Router, React Server Components
- **TypeScript** — Full type safety
- **Tailwind CSS** — Utility-first styling
- **Framer Motion** — Smooth animations
- **Lucide React** — Icon library

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the site.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Homepage with hero, features, testimonials, pricing teaser |
| `/features` | Full feature breakdown |
| `/pricing` | Pricing plans with comparison table |
| `/faq` | Frequently asked questions |
| `/contact` | Contact form |
| `/security` | Security practices |
| `/privacy` | Privacy policy |
| `/terms` | Terms & conditions |
| `/login` | Sign in |
| `/register` | Create account |
| `/dashboard` | Main dashboard (dark theme) |
| `/dashboard/freight-calculator` | Freight calculator module |
| `/dashboard/customs-wizard` | Customs classification module |
| `/dashboard/export-documents` | Export documentation module |
| `/dashboard/saved-projects` | Saved projects list |
| `/dashboard/account-settings` | Account & billing settings |

## Deploy on Vercel

```bash
npm run build
```

Push to GitHub and import the repository in [Vercel](https://vercel.com). No additional configuration required.

## Project Structure

```
src/
├── app/                  # Next.js App Router pages
│   ├── dashboard/        # Dashboard modules (dark theme)
│   ├── features/
│   ├── pricing/
│   └── ...
├── components/
│   ├── contact/
│   ├── dashboard/
│   ├── home/             # Homepage sections
│   ├── layout/           # Navbar, Footer, layouts
│   └── ui/               # Reusable UI components
└── lib/
    ├── constants.ts      # Site config, pricing, content
    └── utils.ts          # Utility functions
```

## Notes

This is the **frontend-only** structure. Backend logic (authentication, API routes, database) is not yet implemented. Login/register forms redirect to the dashboard as placeholders.
