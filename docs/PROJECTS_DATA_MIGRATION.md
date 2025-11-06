## Project Catalog Database Migration

The project catalog now persists in Postgres (`projects` table) instead of relying solely on `data/projects.json`. Follow these steps when rolling out the change:

1. **Deploy migration** – run `pnpm db:migrate` (or the platform-specific migration runner) so migration `0020_projects_table.sql` creates the new table.
2. **Seed existing projects** – sync the current JSON catalog into the database:
   ```bash
   pnpm projects:sync
   ```
   The script reads `data/projects.json`, validates it with the existing Zod schema, and upserts records into the table.
3. **Verify via cron/commands** – exercise `/project-standup run` or the stand-up cron in a staging environment to confirm the new DB-backed loader is serving data.
4. **Decommission JSON when ready** – once all environments rely on the database, treat `data/projects.json` as seed data only. Future edits should happen through the DB, followed by updating the JSON seed file if you want to keep a portable snapshot.

If `DATABASE_URL` is not configured, the application falls back to the JSON file so local development without a database still works.
