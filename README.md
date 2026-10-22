# Monalisa Smart Wall Paint Visualizer

Monalisa helps customers preview paint colors and wall designs on their own room photos. Upload an image, outline wall areas, try colors and finishes, then save or download the result.

## Features

- JWT authentication with customer and administrator roles
- Room image upload and canvas-based editing
- Polygon-based wall selection with adjustable corners
- Paint color visualization, brush, and eraser tools
- Matte, satin, glossy, and textured finishes
- Built-in and administrator-managed themes
- Before-and-after preview
- Save, reopen, and download room projects
- Customer project history and protected admin dashboard

## Tech stack

- Angular, TypeScript, HTML, and SCSS
- Node.js and Express.js REST API
- MongoDB Atlas with Mongoose
- JWT authentication with HTTP-only cookies
- HTML5 Canvas for image and paint rendering
- Optional Cloudinary image uploads

## Administrator and contact

Administrator setup is at `/admin-register` and requires the `ADMIN_REGISTRATION_KEY` configured in the backend environment. Once registered, administrators can sign in and use `/admin` to manage accounts, customer projects, and the available visualizer themes.

For account access, project support, or feedback, email the project administrator at [admin@monalisa.com](mailto:admin@monalisa.com).

## Local full-stack setup

### Prerequisites

- Node.js 22.12 or newer and npm
- A local MongoDB server or a MongoDB Atlas database

The Angular development server proxies `/api` requests to the Express API on port `5000`. The API uses the `monalisa_paints` database.

### Start the application

Open two terminals in the project directory.

**Terminal 1 — API**

```powershell
cd Backend
npm ci
Copy-Item .env.example .env
```

Edit `Backend\.env` and set `MONGO_URI` to your MongoDB connection string, `JWT_SECRET` to a unique random value of at least 32 characters, and `ADMIN_REGISTRATION_KEY` to a separate secret. Keep `.env` private; it is ignored by Git. Cloudinary credentials (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`) are optional and enable image uploads.

Start the API:

```powershell
npm start
```

**Terminal 2 — Angular**

From the project root:

```powershell
npm ci
npm start
```

Open `http://localhost:4200/`. Customer registration is at `/register`. Administrator setup is at `/admin-register` and requires `ADMIN_REGISTRATION_KEY`; successful admin registration redirects to the protected `/admin` dashboard. Admin access is checked by the API as well as the Angular route.

The login session is a JWT in an HTTP-only cookie. The API health endpoint is `GET /api/health`.

### Production deployment

1. Build the frontend from the project root with `npm ci` and `npm run build`. The static production files are written to `dist/smt-wall-paint-vis`.
2. Deploy the `Backend` folder as a Node.js service using `npm ci` followed by `npm start`. Configure `MONGO_URI`, `JWT_SECRET` (at least 32 characters), `ADMIN_REGISTRATION_KEY`, `CLIENT_ORIGIN` (the exact HTTPS frontend origin), `NODE_ENV=production`, and the hosting provider's `PORT`. Configure MongoDB to accept connections from the API host.
3. Serve the Angular build over HTTPS and configure the frontend host or a reverse proxy to forward `/api` requests to the API service. The app uses same-origin `/api` paths and credentialed HTTP-only cookies; forwarding the API path through the frontend origin keeps the browser session same-site.
4. Set the optional Cloudinary environment variables on the API service if uploaded room and theme images should use Cloudinary. Never put API secrets in frontend build variables.
5. Confirm `https://<your-domain>/api/health` returns `{"status":"ok","database":"monalisa_paints"}`, then test customer registration, login, project saving, and admin setup on the deployed site.

Use HTTPS in production. The API marks the authentication cookie secure when `NODE_ENV=production`. The MongoDB Node driver uses its standard pool defaults for this small demo; monitor Atlas/server connection usage and request latency before tuning pool settings for a larger deployment.

### Admin dashboard

Administrators can use `/admin` to browse registered accounts, review and remove customer projects, and manage the visualizer's theme library. The theme editor supports built-in and custom motifs, descriptions, wall/accent colors, and visibility controls. Built-in themes can be edited or hidden but not deleted. Active themes appear in the Home visualizer; saved projects retain each theme's stable ID even if its display name changes.

Theme artwork upload is optional and uses Cloudinary. Configure the Cloudinary credentials in `Backend\.env` to enable uploads; otherwise themes can still be created with the built-in canvas motifs and colors. Uploads are restricted to JPEG, PNG, or WebP and 5 MB. Only upload images you own or have permission to use.

### Saved room projects

Signed-in customers can save a named room design from the Home visualizer. The project gallery shows a preview thumbnail, date, and number of painted areas; opening a card restores its original room image and polygon color, finish, and design settings. Customers can delete their own saved projects. The API scopes list, detail, and delete operations to the authenticated user, and the gallery loads lightweight thumbnail records rather than every full-size image.

Project images are rendered as 1200×600 JPEG data URLs and stored with project metadata and polygon coordinates in MongoDB's `projects` collection. The saved original supports before/after comparison; a separate working-canvas image preserves brush and eraser strokes for editing; a 320×160 thumbnail keeps the gallery lightweight. Full-size image data is limited to 9 MB combined per saved project to stay within MongoDB document limits. For a production deployment with many or larger images, store originals/previews in Cloudinary or another object store and keep only their URLs in MongoDB.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
npm run build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
npm test -- --watch=false
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional resources

For Angular CLI documentation, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli).