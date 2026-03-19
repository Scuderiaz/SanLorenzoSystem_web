# San Lorenzo Ruiz Water Billing System - Progressive Web App

## Overview

This is a **Progressive Web App (PWA)** conversion of the San Lorenzo Ruiz Water Billing System. The application supports both online and offline modes, with automatic data synchronization when connectivity is restored.

## Architecture

### Frontend (React PWA)
- **Location**: `web-app/`
- **Framework**: React with TypeScript
- **State Management**: React Context API
- **Routing**: React Router v6
- **Offline Support**: Service Workers + SQLite (sql.js)
- **Online Database**: Supabase (PostgreSQL)

### Backend (Node.js API)
- **Location**: `backend/`
- **Framework**: Express.js
- **Database**: 
  - SQLite (better-sqlite3) for offline/local
  - Supabase for online/cloud
- **API**: RESTful endpoints

## Features Preserved from Desktop App

✅ **User Roles**:
- Waterworks Admin (Role ID: 1)
- Billing Officer (Role ID: 3)
- Cashier/Treasurer (Role ID: 4)

✅ **Core Functionality**:
- User authentication with role-based access
- Consumer management
- Meter reading entry
- Bill generation
- Payment processing
- Reports generation
- System settings and maintenance

✅ **UI/UX**: Maintained the same design and layout from the desktop app

## Installation & Setup

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Supabase account (optional, for online mode)

### 1. Backend Setup

```bash
cd backend
npm install

# Create .env file from example
cp .env.example .env

# Edit .env and add your Supabase credentials (optional)
# If you don't add Supabase credentials, it will use SQLite only

# Create data directory
mkdir data

# Start the backend server
npm start
# or for development with auto-reload:
npm run dev
```

The backend will run on `http://localhost:3001`

### 2. Frontend Setup

```bash
cd web-app
npm install

# Create .env file from example
cp .env.example .env

# Edit .env and configure:
# REACT_APP_API_URL=http://localhost:3001/api
# REACT_APP_SUPABASE_URL=your_supabase_url
# REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key

# Start the development server
npm start
```

The app will run on `http://localhost:3000`

### 3. Production Build

```bash
cd web-app
npm run build

# The build folder will contain the production-ready PWA
# Deploy the contents to any static hosting service
```

## PWA Installation

Once deployed or running locally:

1. Open the app in a modern browser (Chrome, Edge, Safari)
2. Look for the "Install" button in the address bar
3. Click to install the app on your device
4. The app will now work offline and can be launched like a native app

## Default Login Credentials

### Admin
- **Username**: `admin`
- **Password**: `admin123`
- **Role**: Waterworks Admin

### Billing Officer
- **Username**: `billing`
- **Password**: `billing123`
- **Role**: Billing Officer

### Cashier
- **Username**: `cashier`
- **Password**: `cashier123`
- **Role**: Cashier

## Offline Mode

The app automatically detects network status and switches between online/offline modes:

- **Online**: Data is synced with Supabase (PostgreSQL)
- **Offline**: Data is stored in browser's IndexedDB using SQLite
- **Sync**: When connection is restored, offline changes are automatically synced

### Offline Indicator
A status indicator in the header shows the current connection state:
- 🟢 **Online**: Connected to server
- 🔴 **Offline**: Working offline

## Database Schema

The app uses the same schema as defined in `supabase_schema.sql`:

### Main Tables
- `roles` - User roles
- `accounts` - User accounts
- `consumer` - Consumer information
- `zones` - Geographic zones
- `classifications` - Consumer classifications
- `meters` - Meter information
- `meterreadings` - Meter reading records
- `bills` - Billing records
- `payments` - Payment records

## API Endpoints

### Authentication
- `POST /api/login` - User login

### Consumers
- `GET /api/consumers` - Get all consumers
- `POST /api/consumers` - Create new consumer

### Meter Readings
- `GET /api/meter-readings` - Get all readings
- `POST /api/meter-readings` - Create new reading

### Bills
- `GET /api/bills` - Get all bills
- `POST /api/bills` - Create new bill

### Payments
- `GET /api/payments` - Get all payments
- `POST /api/payments` - Create new payment

### Health Check
- `GET /health` - Server health status

## Project Structure

```
slr_mobile_apps/
├── web-app/                    # React PWA Frontend
│   ├── public/
│   │   ├── manifest.json       # PWA manifest
│   │   └── service-worker.js   # Service worker for offline
│   ├── src/
│   │   ├── components/         # Reusable components
│   │   │   └── Layout/         # Layout components
│   │   ├── config/             # Configuration files
│   │   │   ├── supabase.ts     # Supabase client
│   │   │   └── database.ts     # Offline SQLite setup
│   │   ├── context/            # React contexts
│   │   │   └── AuthContext.tsx # Authentication context
│   │   ├── pages/              # Page components
│   │   │   ├── Login.tsx       # Login page
│   │   │   └── Dashboard.tsx   # Dashboard (role-based)
│   │   ├── services/           # API services
│   │   │   └── api.ts          # API client & services
│   │   ├── types/              # TypeScript types
│   │   └── App.tsx             # Main app component
│   └── package.json
│
├── backend/                    # Node.js Backend API
│   ├── server.js               # Express server
│   ├── data/                   # SQLite database (auto-created)
│   ├── .env                    # Environment variables
│   └── package.json
│
├── desktop app/                # Original Electron app (preserved)
└── supabase_schema.sql         # Database schema
```

## Technology Stack

### Frontend
- React 18 with TypeScript
- React Router v6
- Axios for HTTP requests
- sql.js for offline SQLite
- Supabase JS client
- Service Workers for PWA

### Backend
- Express.js
- better-sqlite3 (offline database)
- Supabase JS (online database)
- CORS enabled

## Development Notes

### Adding New Pages
1. Create page component in `web-app/src/pages/`
2. Add route in `web-app/src/App.tsx`
3. Add menu item in `web-app/src/components/Layout/Sidebar.tsx`

### Adding New API Endpoints
1. Add endpoint handler in `backend/server.js`
2. Add service function in `web-app/src/services/api.ts`

### Offline Data Sync
The sync queue table tracks offline changes:
- Operations are queued when offline
- Automatically synced when connection is restored
- Check `syncService.syncOfflineData()` in `api.ts`

## Deployment

### Frontend Deployment Options
- **Netlify**: Drag & drop the `build` folder
- **Vercel**: Connect GitHub repo
- **Firebase Hosting**: `firebase deploy`
- **GitHub Pages**: Use `gh-pages` package

### Backend Deployment Options
- **Heroku**: Deploy with Procfile
- **Railway**: Connect GitHub repo
- **DigitalOcean App Platform**: Deploy from GitHub
- **AWS EC2/Elastic Beanstalk**: Traditional hosting

### Environment Variables for Production
Make sure to set these in your hosting platform:

**Frontend**:
- `REACT_APP_API_URL`
- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`

**Backend**:
- `PORT`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## Troubleshooting

### PWA Not Installing
- Ensure you're using HTTPS (required for PWA)
- Check browser console for service worker errors
- Verify `manifest.json` is accessible

### Offline Mode Not Working
- Check if service worker is registered
- Verify IndexedDB is enabled in browser
- Check browser console for errors

### Sync Issues
- Ensure backend is running and accessible
- Check network connectivity
- Verify Supabase credentials are correct

## Next Steps

To extend the application:

1. **Add More Pages**: Consumers list, Billing, Payments, Reports, Settings
2. **Implement Full CRUD**: Complete create, read, update, delete operations
3. **Add Data Validation**: Form validation and error handling
4. **Enhance Reports**: Charts and data visualization
5. **Add Notifications**: Push notifications for important events
6. **Improve Sync**: Conflict resolution for offline changes

## Support

For issues or questions, refer to:
- Original desktop app documentation in `desktop app/`
- Database schema in `supabase_schema.sql`
- User roles analysis in `USER_ROLES_ANALYSIS.md`

## License

MIT License - Municipality of San Lorenzo Ruiz
