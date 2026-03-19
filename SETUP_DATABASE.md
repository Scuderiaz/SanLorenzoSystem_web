# 🗄️ Database Setup Guide

## ✅ Step 1: Environment Files Created

The `.env` files have been created with your Supabase credentials:

### Backend `.env`
```
PORT=3001
SUPABASE_URL=https://uangletmgnayidzlxiwu.supabase.co
SUPABASE_ANON_KEY=sb_publishable_4_QbyEQ8wPZDquEzGUep9g_3qVihtTP
```

### Frontend `.env`
```
REACT_APP_API_URL=http://localhost:3001/api
REACT_APP_SUPABASE_URL=https://uangletmgnayidzlxiwu.supabase.co
REACT_APP_SUPABASE_ANON_KEY=sb_publishable_4_QbyEQ8wPZDquEzGUep9g_3qVihtTP
```

---

## 📊 Step 2: Create Database Tables in Supabase

You need to run the SQL schema in your Supabase project:

### Option A: Via Supabase Dashboard (Easiest)

1. **Go to Supabase Dashboard**
   - Visit: https://uangletmgnayidzlxiwu.supabase.co

2. **Open SQL Editor**
   - Click **SQL Editor** in the left sidebar
   - Click **New Query**

3. **Run Schema SQL**
   - Copy the entire contents of `supabase_schema.sql`
   - Paste into the SQL Editor
   - Click **Run** or press `Ctrl+Enter`

4. **Run Seed Data (Optional)**
   - Create another new query
   - Copy contents of `supabase_seed_data.sql`
   - Click **Run**

### Option B: Using Supabase CLI

```bash
# Install Supabase CLI (if not installed)
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref uangletmgnayidzlxiwu

# Run migrations
supabase db push
```

---

## 🚀 Step 3: Install Dependencies & Run

### Backend Setup
```bash
cd backend
npm install
npm start
```

**Expected Output:**
```
Server running on port 3001
Connected to Supabase successfully
```

### Frontend Setup (New Terminal)
```bash
cd web-app
npm install
npm start
```

**Expected Output:**
```
Compiled successfully!
Local: http://localhost:3000
```

---

## 🧪 Step 4: Test the Connection

1. **Open Browser**: http://localhost:3000
2. **Login Page**: Should load without errors
3. **Test Login**: Use credentials from seed data

**Default Test Users** (after running seed data):
- **Admin**: 
  - Username: `admin`
  - Password: `admin123`
  
- **Billing Officer**: 
  - Username: `billing`
  - Password: `billing123`

- **Treasurer**: 
  - Username: `treasurer`
  - Password: `treasurer123`

---

## ✅ Verification Checklist

- [ ] `.env` files created in both `backend/` and `web-app/`
- [ ] Supabase schema SQL executed successfully
- [ ] Seed data imported (optional but recommended)
- [ ] Backend server running on port 3001
- [ ] Frontend running on port 3000
- [ ] Can access login page
- [ ] Can login with test credentials
- [ ] Dashboard loads after login

---

## 🔍 Troubleshooting

### Backend won't start
- Check if port 3001 is already in use
- Verify `.env` file exists in `backend/` folder
- Check Supabase credentials are correct

### Frontend won't connect
- Ensure backend is running first
- Check `.env` file exists in `web-app/` folder
- Verify `REACT_APP_API_URL` points to `http://localhost:3001/api`

### Database connection errors
- Verify Supabase URL and API key are correct
- Check if schema was created successfully in Supabase
- Ensure you're using the **anon key**, not the service key

---

## 📝 Next Steps After Setup

1. **Create Users**: Add real user accounts
2. **Import Data**: Import existing consumer data
3. **Configure Zones**: Set up your water zones
4. **Test Features**: Test all pages and functionality
5. **Deploy**: Prepare for production deployment

---

## 🆘 Need Help?

If you encounter issues:
1. Check the browser console for errors (F12)
2. Check backend terminal for error messages
3. Verify all tables were created in Supabase dashboard
4. Ensure both servers are running simultaneously
