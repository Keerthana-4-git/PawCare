# PawCare

PawCare is a responsive animal-care discovery prototype that helps pet owners explore local veterinary and related services. This project is a frontend-only MVP built with React, TypeScript, Vite, Tailwind CSS, Lucide icons, Framer Motion, and React Router.

## Features

- Discover veterinary clinics, animal hospitals, boarding, diagnostics, animal ambulances, and animal NGOs.
- Search and filter local illustrative provider listings by service, location, rating, and availability.
- View provider details, call links, map directions, and a local enquiry form.
- Submit, edit, and delete user-submitted demo business listings.
- Preview business images and store compressed image data in IndexedDB.
- Demo sign up, login, and logout using browser storage.
- Submit corrections through a local prototype form.
- Responsive layouts and client-side routing.

## Technology stack

- React and TypeScript
- Vite
- Tailwind CSS
- React Router DOM
- Framer Motion
- Lucide React

## Installation

Use Node.js 20.19+ or 22.12+ and npm.

```sh
npm ci
```

## Run locally

```sh
npm run dev
```

Vite prints the local development URL after startup.

Useful checks:

```sh
npm run build
npm run lint
npm run preview
```

## Project structure

```text
.
├── public/             Static assets
├── src/
│   ├── assets/         App images and source assets
│   ├── App.tsx         Routes, UI, local demo data and interactions
│   ├── index.css       Tailwind directives and shared styles
│   └── main.tsx        React entry point
├── index.html
├── tailwind.config.js
├── vite.config.ts
└── package.json
```

## Screenshots

No screenshots are included yet. Add current screenshots here when available, for example:

```md
![PawCare homepage](docs/screenshots/homepage.png)
```

## Deployment

The project is configured for Vercel with `npm run build` as the build command and `dist` as the output directory. A rewrite sends client-side routes to the Vite app entry point for React Router navigation. Connect the GitHub repository to Vercel and deploy the production branch; no environment variables are required for the current prototype.

## Prototype limitations

PawCare is a frontend demonstration, not a production service. Authentication, user-submitted listings, enquiries, and corrections are stored in the user's browser (`localStorage` and `IndexedDB`) and are not synchronized to a server. Demo passwords are not securely hashed, and browser-side data can be changed or deleted by the user. Provider details and ratings are illustrative and must not be treated as verified. Do not use this prototype to store sensitive or real customer information.
