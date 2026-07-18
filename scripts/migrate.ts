/**
 * scripts/migrate.ts — Script CLI para correr migraciones de BD.
 *
 * Una "migración" es un archivo SQL versionado que modifica el esquema
 * (crea tablas, añade columnas...). Este script:
 *   1. Conecta a Postgres con un Client (no Pool: no necesita concurrencia).
 *   2. Crea una tabla `migrations` si no existe (lleva el registro de qué
 *      migraciones ya se aplicaron).
 *   3. Lee la lista de archivos en `db/migrations/` y, para cada uno que
 *      NO esté en la tabla `migrations`, lo ejecuta dentro de una transacción
 *      y registra el filename como aplicado.
 *
 * Se ejecuta con: `npm run db:migrate`
 *
 * Notas TS:
 *  - `import.meta.url` es la URL del archivo actual (formato file://...).
 *  - `fileURLToPath` la convierte a path del sistema de ficheros.
 *  - `__dirname` y `__filename` NO existen en módulos ES, hay que recrearlos.
 */
import { Client } from 'pg';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config, getDatabaseUrl } from '../src/composition/config.js';

// Recreamos __filename y __dirname (no existen en ES Modules).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  // Client (no Pool) porque solo vamos a hacer queries secuenciales.
  const client = new Client({
    connectionString: getDatabaseUrl(),
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Crea la tabla que registra qué migraciones se han aplicado.
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    // Cargamos las migraciones ya aplicadas (Set para lookup O(1)).
    const executedResult = await client.query(
      'SELECT filename FROM migrations ORDER BY executed_at'
    );
    const executedMigrations = new Set(executedResult.rows.map(row => row.filename));

    // Lista "hardcoded" de migraciones a aplicar, en orden.
    // En un proyecto real leerías los archivos del directorio y los ordenarías.
    const migrationFiles = ['001_init.sql'];

    for (const filename of migrationFiles) {
      if (executedMigrations.has(filename)) {
        console.log(`Skipping already executed migration: ${filename}`);
        continue;
      }

      console.log(`Running migration: ${filename}`);

      // Construimos la ruta absoluta al archivo .sql.
      const migrationPath = join(__dirname, '..', 'db', 'migrations', filename);
      const migrationSql = await readFile(migrationPath, 'utf-8');

      // Cada migración corre dentro de SU transacción.
      // Si falla, ROLLBACK y nada queda a medias.
      await client.query('BEGIN');

      try {
        await client.query(migrationSql);
        await client.query(
          'INSERT INTO migrations (filename) VALUES ($1)',
          [filename]
        );
        await client.query('COMMIT');
        console.log(`✅ Migration ${filename} completed successfully`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`❌ Migration ${filename} failed:`, error);
        throw error;
      }
    }

    console.log('All migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    // SIEMPRE cerramos el client (no es un Pool; sin esto quedan conexiones colgadas).
    await client.end();
  }
}

runMigrations();