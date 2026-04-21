# Supabase Setup

## 1. Create a project

Go to [supabase.com](https://supabase.com), create a new project, and note your **project URL** and **anon key** from Settings → API.

## 2. Run the schema

In your Supabase dashboard, go to **SQL Editor** and run the contents of `schema.sql`.

This creates:
- `persons` table with all fields scraped from Org Explorer
- Indexes on `manager_aad_object_id` and `email`
- RLS policies (authenticated users can read/write, anon can read)

## 3. Configure environment variables

Copy `.env.example` to `.env.development` in the `fe/` directory and fill in your values:

```bash
cp .env.example ../fe/.env.development
```

Then edit `fe/.env.development`:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## 4. Table structure

| Column | Type | Notes |
|---|---|---|
| `aad_object_id` | uuid | Primary key, from Entra ID |
| `full_name` | text | |
| `email` | text | |
| `job_title` | text | |
| `department` | text | |
| `location` | text | |
| `manager_aad_object_id` | uuid | Self-referencing FK |
| `is_manager` | boolean | |
| `profile_picture_url` | text | |
| `transitive_reports_count` | int | May be 0 due to permissions |
| `direct_reports_count` | int | May be 0 due to permissions |
| `scraped_at` | timestamptz | Auto-set on insert |
