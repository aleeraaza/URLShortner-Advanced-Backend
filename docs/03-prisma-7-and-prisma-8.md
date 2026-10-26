# Prisma 7 and Prisma 8

This is the setup guide for this backend and the reference for the next project. Prisma ORM 8 is a release candidate. Prisma ORM 7 is still supported. This repo uses Prisma 8 with Neon PostgreSQL.

Official pages this was checked against:

- [Prisma 8 from scratch](https://www.prisma.io/docs/prisma-orm/from-scratch)
- [Prisma 8 core concepts](https://www.prisma.io/docs/orm/core-concepts)
- [Coming from Prisma ORM 7](https://www.prisma.io/docs/orm/coming-from-prisma-orm-7)
- [PSL contract syntax](https://www.prisma.io/docs/orm/contract-authoring/psl-syntax)
- [Prisma 7 PostgreSQL quickstart](https://www.prisma.io/docs/v7/prisma-orm/quickstart/postgresql)

The docs often show `bunx`. Every command below is the `npm` form. Run them from the folder that contains `package.json`. On PowerShell, run one command at a time.

---

## 1. Add Prisma 8 to a project

### What you need

- Node `22.18` or newer on the 22 line, `24.11` or newer on the 24 line, or `26` or newer. Check with `node --version`. Node 24 is what Prisma recommends. This machine is `22.14`, which is below that floor. The CLI still ran and printed an `EBADENGINE` warning. Move to `22.18+` when you can.
- An existing Node project with `"type": "module"` in `package.json`. Prisma 8's packages use `import`.
- A Neon Postgres database.

### Neon URLs

Neon gives you two hostnames for the same database.

| URL | Host contains | Who uses it |
|---|---|---|
| Pooled | `-pooler` | the running app, many short queries |
| Direct | no `-pooler` | Prisma CLI, migrations, `db init` |

Example shapes, with the password replaced:

```text
DATABASE_URL="postgresql://USER:PASSWORD@ep-example-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@ep-example.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

Rules that bit this project:

- Keep `sslmode=require`. The `pg` driver prints a warning that this mode will later mean certificate verification. The command still succeeds. `sslmode=verify-full` silences that warning once the host certificate checks out.
- Delete `channel_binding=require` if Neon put it on the URL. The `pg` driver rejects that parameter.
- The user, password, and database name are the same on both URLs. Only the host changes.
- Put both in `.env`. Do not commit `.env`.

In this repo the app connects with `DATABASE_URL` (pooled). `prisma.config.ts` prefers `DIRECT_URL` and falls back to `DATABASE_URL`.

### Install

From the backend folder:

```powershell
npm pkg set type=module
npm install @prisma/orm-postgres dotenv
npm install --save-dev prisma typescript tsx
```

`@prisma/orm-postgres` is the library your code imports. It includes the Postgres driver. `prisma` is the CLI. Their version numbers do not match, and that is expected. This repo has `prisma@8.0.0-rc.27` and `@prisma/orm-postgres@8.0.0-rc.20`.

`temporal-polyfill` is a peer of `@prisma/orm-postgres`. npm installs it for you. Yarn does not, so with Yarn you add it yourself. Node 22 and Node 24 do not ship a global `Temporal`. Prisma 8's date defaults throw `RUNTIME.TEMPORAL_UNAVAILABLE` until the polyfill is loaded. The import is in `db.ts` below.

TypeScript 5.9 or newer is a peer. This repo is on TypeScript 6.

### `prisma.config.ts`

Put this next to `package.json`. The CLI reads this file. It does not read a `datasource` block, because Prisma 8 has none.

```ts
/// <reference types="node" />
import "dotenv/config";
import { defineConfig as ormConfig } from "@prisma/orm-postgres/config";
import { definePrismaConfig } from "prisma/config";

const connection = process.env["DIRECT_URL"] || process.env["DATABASE_URL"];

if (!connection) {
  throw new Error("Set DATABASE_URL in .env before running Prisma.");
}

export default definePrismaConfig({
  orm: ormConfig({
    contract: "./prisma/contract.prisma",
    output: "./src/generated/prisma",
    migrations: {
      dir: "./prisma/migrations",
    },
    db: {
      connection,
    },
  }),
  skills: {
    check: false,
  },
});
```

What each piece is:

| Piece | Meaning |
|---|---|
| `definePrismaConfig` | Prisma 8 config entry. Prisma 7's `defineConfig` is a different function. Mixing them throws `definePrismaConfig is not a function`. |
| `defineConfig` from `@prisma/orm-postgres/config` | This import is what makes the project PostgreSQL. There is no `provider = "postgresql"` setting. |
| `contract` | The file you edit. Official examples use `src/prisma/contract.prisma`. This repo uses `prisma/contract.prisma`. |
| `output` | Where `contract emit` writes `contract.json` and `contract.d.ts`. Default is next to the contract. This repo sends them to `src/generated/prisma` so the app can import them. |
| `migrations.dir` | Root for migration files. Your migrations land in `<dir>/app/`. |
| `db.connection` | The URL the CLI uses. Here that is the Neon direct URL. |
| `skills.check: false` | Stops every CLI command from nagging about agent skill files. |

The `/// <reference types="node" />` line is required in this repo. `tsconfig.json` only includes `src`, so `prisma.config.ts` cannot see `@types/node` and `process` errors with "Cannot find name 'process'". Adding the config file to `include` would also pull it into `rootDir: "src"` and break the `dist` layout. The triple-slash reference fixes the type without moving the file.

### The contract

Create `prisma/contract.prisma`. The first line is required. Without it, `contract emit` fails with `CONTRACT.SOURCE_LOAD_FAILED` and `PSL_NO_OPTED_IN_SCHEMA_FILES`.

```prisma
// use prisma-8

model User {
  id           String   @id @onCreate(cuid(2))
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @onCreate(now()) @onUpdate(now())

  @@index([email])
  @@map("users")
}
```

There is no `generator` block and no `datasource` block. Those moved into `prisma.config.ts`.

### The client

`src/config/db.ts` in this repo:

```ts
import "temporal-polyfill/global";
import postgres from "@prisma/orm-postgres/runtime";
import { contractFromJson } from "@prisma/orm-postgres/static";
import type { Contract } from "../generated/prisma/contract.js";
import contractJson from "../generated/prisma/contract.json" with { type: "json" };
import { env } from "./env.config.js";

const contract = contractFromJson<Contract>(contractJson);

export const db = postgres({
  contract,
  url: env.DATABASE_URL,
});
```

The polyfill import has to run before the first query. `contractFromJson` checks `contract.json` and attaches the types from `contract.d.ts`. `postgres(...)` does not connect until the first query. The app uses the pooled `DATABASE_URL`. The CLI uses the direct URL from the config.

A generated model type is not imported from `@prisma/client`. That package does not exist in Prisma 8. The row type for `ShortUrl` is `Models.public_ShortUrl` in `src/generated/prisma/contract.d.ts`:

```ts
import type { Models } from "../../generated/prisma/contract.js";

export type ShortUrl = Models.public_ShortUrl;
```

The same namespace has `public_User`, `public_Session`, and `public_ClickAnalytics`. `DateTime` fields on those types are `Temporal.Instant`, not JavaScript `Date`. `instant.toString()` gives an ISO string. `new Date(instant.epochMilliseconds)` gives a `Date` and drops microseconds.

### Scripts

```json
{
  "scripts": {
    "db:emit": "prisma contract emit",
    "db:init": "prisma db init",
    "db:plan": "prisma migration plan",
    "db:migrate": "prisma db migrate --advance-ref db",
    "db:status": "prisma migration status"
  }
}
```

npm only forwards extra arguments after `--`.

### First database, empty

```powershell
npm run db:emit
npm run db:init
npm run db:status
```

`db:emit` writes `src/generated/prisma/contract.json` and `contract.d.ts`. Commit both. They are generated, and you do not edit them. Every later command reads those files, not `contract.prisma`. If you forget to emit, the editor keeps the old types and `migration plan` plans the old contract.

`db:init` creates the missing tables, then signs the database. The signature is a row in `prisma_contract.marker` storing the hash of this contract. It also writes:

- `prisma/migrations/app/refs/db.json`, the `db` ref, a file that records which contract hash your dev database is on
- `prisma/migrations/snapshots/<hash>/`, a copy of that contract

Commit the ref and the snapshot. `db init` only adds. If an existing table would have to be destroyed to match the contract, it stops.

### Every later model change

Edit `prisma/contract.prisma`, then:

```powershell
npm run db:emit
npm run db:plan -- --name add_session_table
npm run db:migrate
npm run db:status
```

`migration plan` does not connect to the database. It diffs the emitted contract against the `db` ref and writes a folder under `prisma/migrations/app/`. Read that folder before you migrate. `db migrate` applies it inside one Postgres transaction. `--advance-ref db` moves `db.json` to the new hash so the next plan starts from here. A deploy should run `prisma db migrate` without `--advance-ref`, so production does not rewrite a file in the repo.

### Database that already has tables

This Neon database already had `users` and `short_urls` before Prisma 8 owned the migration history. `migration status` then reported `MIGRATION.MARKER_NOT_IN_HISTORY`. The command that matched that state was:

```powershell
npx prisma db update --dry-run
npx prisma db update --advance-ref db
```

`db update` changes the live database to match the emitted contract and signs it. It does not write a migration you can replay. Use it to iterate, or when the database was created outside this migration graph. After it, a later `db migrate` can stop with `MIGRATION.MARKER_MISMATCH` because no committed migration ends at that hash. The durable loop is still emit, plan, migrate.

If the database already matches the contract and you only want to record that fact:

```powershell
npx prisma contract infer
npx prisma contract emit
npx prisma db sign
```

`contract infer` drafts a contract from the live tables. Review it before you trust it. `db sign` writes the marker and the `db` ref and does not change tables. If the database does not match, it exits with code `4` and writes nothing.

### Commands you will actually type

| Goal | Command |
|---|---|
| Refresh types after a contract edit | `npm run db:emit` |
| Create tables on an empty database | `npm run db:init` |
| Write a reviewable migration | `npm run db:plan -- --name the_change` |
| Apply committed migrations on the dev database | `npm run db:migrate` |
| Apply migrations on deploy | `npx prisma db migrate` |
| See pending and applied migrations | `npm run db:status` |
| Push a contract onto a dev database with no migration file | `npx prisma db update` |
| Preview that push | `npx prisma db update --dry-run` |
| Adopt a database that already matches | `npx prisma db sign` |
| Check contract against the live database | `npx prisma db verify` |
| Draft a contract from an existing database | `npx prisma contract infer` |
| Format the contract | `npx prisma contract format` |
| Point the dev ref at a hash by hand | `npx prisma migration ref set db <hash-or-folder>` |

Only `db ...` commands change the database. `contract ...` and `migration plan` work on files. `migration status` reads the database and changes nothing.

Passing `--db "postgresql://..."` overrides the URL in `prisma.config.ts` for that one command. `db migrate` updates `db.json` only when you also pass `--advance-ref db`.

### A query, so you know the client works

```ts
const user = await db.orm.public.User.create({
  email: "ada@example.com",
  passwordHash: "hash-goes-here",
});

const found = await db.orm.public.User.first({ email: "ada@example.com" });

await db.orm.public.User.where({ id: user.id }).update({
  email: "ada.lovelace@example.com",
});

await db.orm.public.User.where({ id: user.id }).delete();
```

`public` is the PostgreSQL schema. `User` is the model name. `@@map("users")` changes the table name, not this path. Close a one-off script with `await db.close()` so the pool does not keep Node alive.

---

## 2. Add Prisma 7 to a project

Use this when you want the version the older course videos show: `schema.prisma`, `prisma generate`, `prisma migrate dev`, and `prisma.user.findMany`.

Pin version 7. The Prisma 7 docs say `prisma@prev` because, while 8 is `latest`, `prev` means 7. Writing `@7` does not depend on that.

```powershell
npm install --save-dev prisma@7
npm install @prisma/client@7 @prisma/adapter-pg pg dotenv
npm install --save-dev @types/pg
```

| Package | Role |
|---|---|
| `prisma` | CLI: init, migrate, generate |
| `@prisma/client` | The library you import. Prisma 7 still has this package. |
| `@prisma/adapter-pg` | Required in Prisma 7. The client no longer opens Postgres by itself. |
| `pg` | The node-postgres driver the adapter uses |

Initialize:

```powershell
npx prisma init --datasource-provider postgresql --output ../generated/prisma
```

That creates:

- `prisma/schema.prisma`
- `.env`
- `prisma.config.ts`, or `prisma7.config.ts` on 7.10 and later so it does not collide with a Prisma 8 config

The config looks like this:

```ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
```

The schema starts like this. The URL is not in the schema. It is in the config.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model User {
  id        Int     @id @default(autoincrement())
  email     String  @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Put the Neon direct URL in `.env` for migrations. You can point the app's adapter at the pooled URL.

```text
DATABASE_URL="postgresql://USER:PASSWORD@ep-example.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

Create the tables and the client:

```powershell
npx prisma migrate dev --name init
npx prisma generate
```

`migrate dev` writes `prisma/migrations/<timestamp>_init/migration.sql`, applies it, and is the command you rerun after every schema edit during development. `migrate deploy` is the one for production: it applies existing folders and does not create new ones. `generate` builds the client into `generated/prisma`. Run it after every schema change. Commit the `migrations` folder. The generated client can be committed or rebuilt in CI. Do not commit `.env`.

The client:

```ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({
  connectionString: process.env["DATABASE_URL"],
});

export const prisma = new PrismaClient({ adapter });
```

```ts
const user = await prisma.user.create({
  data: { email: "ada@example.com", name: "Ada" },
});

const found = await prisma.user.findUnique({
  where: { email: "ada@example.com" },
});

await prisma.user.update({
  where: { id: user.id },
  data: { name: "Ada Lovelace" },
});

await prisma.user.delete({
  where: { id: user.id },
});
```

`prisma.user` is the model name with the first letter lowercased. Dates come back as JavaScript `Date`.

Other Prisma 7 commands:

| Command | What it does |
|---|---|
| `npx prisma migrate dev --name <name>` | Create a SQL migration and apply it on your machine |
| `npx prisma migrate deploy` | Apply committed migrations |
| `npx prisma migrate status` | Show which migrations have run |
| `npx prisma generate` | Rebuild the client |
| `npx prisma db push` | Push the schema with no migration file |
| `npx prisma db pull` | Rewrite `schema.prisma` from the live database |
| `npx prisma studio` | Open the data browser |
| `npx prisma db seed` | Run the seed script from `package.json` |
| `npx prisma validate` | Check the schema file |
| `npx prisma format` | Format the schema file |
| `npx prisma migrate reset` | Drop the database, reapply every migration, run the seed |

Do not install Prisma 7 and Prisma 8 CLIs into the same `prisma` package. `prisma.config.ts` means a different thing to each of them.

---

## 3. The ideas, once, then what changed

### The file you write and the database you have

You describe models in a file. Prisma turns that description into tables and into TypeScript types. Your queries are checked against those types.

Prisma 7 calls the file `schema.prisma` and also calls the live database the schema. Prisma 8 splits the words:

| Word | Meaning |
|---|---|
| Contract | The file you write, `contract.prisma` |
| Schema | What the database has right now |
| Emit | Compile the contract into `contract.json` and `contract.d.ts` |
| Hash | The id of one exact emitted contract |
| Signature, or marker | The hash stored in the database, saying which contract it matches |
| Drift | The contract and the database disagree |
| Ref | A named pointer at a hash. `db` is the one for your dev database |
| Plan | Either a query built as data before it runs, or the `migration plan` command that writes a migration |

Prisma 7 trusted that the database matched the schema. Prisma 8 records the hash in the database and checks it before a migration.

### Models, fields, and relations

A model is a table. A field is a column. These parts are the same idea in both versions:

- A scalar field: `email String`, `isActive Boolean`, `count Int`.
- Optional: `title String?` allows `NULL`.
- List: `tags String[]` is a Postgres array.
- `@id` is the primary key. `@@id([a, b])` is a composite key.
- `@unique` and `@@unique([userId, title])` reject duplicate values.
- `@@index([email])` speeds lookups and does not enforce uniqueness.
- `@map("column_name")` and `@@map("users")` rename the column or table. The model name in code stays `User`.
- A relation needs a foreign key and both sides. `onDelete: Cascade` deletes the children when the parent row goes away.

```prisma
model User {
  id        String    @id @onCreate(cuid(2))
  email     String    @unique
  shortUrls ShortUrl[]
  @@map("users")
}

model ShortUrl {
  id     String @id @onCreate(cuid(2))
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("short_urls")
}
```

`ShortUrl[]` on `User` does not create a column. It tells Prisma that the foreign key on `ShortUrl` points back here.

An enum lists allowed values. In a new Prisma 8 database the column is text, not a Postgres enum type:

```prisma
enum Role {
  USER
  ADMIN
}
```

A database that already has a Postgres enum from Prisma 7 needs `native_enum` and `pg.enum(...)`. That is an upgrade detail, not the syntax for a new table.

### Defaults: who fills the column

`@default` is a database default. The database fills the column when an insert omits it. These stay valid:

- `@default(now())`
- `@default(autoincrement())`
- `@default(false)`, `@default(0)`, `@default("guest")`
- `@default(sql`gen_random_uuid()`)` for any other SQL expression

`@onCreate` and `@onUpdate` run in the Prisma process, not in Postgres. A row inserted by raw SQL or another app does not get those values.

| You want | Write |
|---|---|
| Id generated by Prisma, CUID2, 24 characters | `String @id @onCreate(cuid(2))` |
| UUID v4 or v7 | `@onCreate(uuid())` or `@onCreate(uuid(7))` |
| Created timestamp from the database | `DateTime @default(now())` |
| Updated timestamp from Prisma | `DateTime @onCreate(now()) @onUpdate(now())` |
| Integer id from Postgres | `Int @id @default(autoincrement())` |

`@default(cuid())` and `@default(uuid())` fail emit with `PSL_GENERATOR_IN_DEFAULT`. Plain `cuid()` fails too. The version argument is required, and only `cuid(2)` is accepted. `@updatedAt` is gone. `@onUpdate(now())` without `@onCreate(now())` does not fill the field on insert.

This repo uses `@onCreate(cuid(2))` for every id, `@default(now())` for `createdAt`, and `@onCreate(now()) @onUpdate(now())` for `updatedAt`.

### What a query is allowed to say

Both versions stop you from selecting a field that does not exist, filtering on the wrong type, or forgetting a required field on create. The check happens in TypeScript, from the generated types.

Prisma 7 puts every option in one object: `where`, `data`, `select`, `include`, `orderBy`, `take`, `skip`. Prisma 8 is a chain. The last call runs it: `.all()`, `.first()`, `.create()`, `.update()`, `.delete()`.

```ts
const page = await db.orm.public.User
  .where({ email: "ada@example.com" })
  .select("id", "email")
  .orderBy((user) => user.createdAt.desc())
  .limit(20)
  .offset(20)
  .all();
```

Comparisons use a function: `.where((user) => user.createdAt.gt(someInstant))`. A unique lookup is `.whereUnique({ email }).first()`. `.first()` returns `null` when nothing matches. `.all()` can be awaited into an array, or streamed with `for await`. Use a result one of those ways, not both.

Relations load with `.include("shortUrls")`. A nested filter is `.include("shortUrls", (urls) => urls.where({ isActive: true }))`.

Writes do not wrap the payload in `data`:

```ts
await db.orm.public.Session.where({ userId }).deleteAndCount();
await db.orm.public.Session.where({ id }).update({
  refreshTokenHash: nextHash,
  expiresAt: nextExpiry,
});
```

`.createAll` inserts many rows. `.updateAll` and `.deleteAll` return the rows. The `AndCount` forms return how many changed. `{ onConflict: "skip" }` is the Prisma 8 form of `skipDuplicates`.

An upsert names the unique value that causes an update instead of an insert:

```ts
await db.orm.public.User.upsert({
  create: { email: "ada@example.com", passwordHash: "hash" },
  update: { passwordHash: "hash" },
  conflictOn: { email: "ada@example.com" },
});
```

A transaction gives you a client that shares one Postgres transaction. Use `tx` inside it, not `db`.

```ts
await db.transaction(async (tx) => {
  const user = await tx.orm.public.User.create({
    email: "ada@example.com",
    passwordHash: "hash",
  });
  await tx.orm.public.Session.create({
    userId: user.id,
    refreshTokenHash: "hash",
    expiresAt,
  });
});
```

Raw SQL is `db.raw.sql`. A query that returns rows needs `.returnsRow(...)` and `.build()`, then `db.query(...)`. A statement that only writes uses `.affectedCount()`, `.build()`, and `db.execute(...)`. Values inside `${...}` are parameters, not pasted into the SQL string. `db.sql` is the typed SQL builder for joins and grouping that the ORM chain cannot express. `db.toSql(plan)` prints the SQL without connecting.

### Migrations

A migration is a saved step from one contract hash to another. Prisma 8 stores that step as a folder with `migration.ts`, `ops.json`, and `migration.json`. The graph uses `from` and `to` hashes, so two branches can each add a migration and still merge. You do not renumber folders.

Prisma 7 stores a timestamped folder of SQL. Order is the timestamp. `migrate dev` both writes the folder and applies it. Prisma 8 splits those: `migration plan` writes the folder and does not connect, `db migrate` applies it.

`db init` on a new database creates tables and writes no migration. The first later `migration plan` writes a baseline for those tables plus your new change. The dev database already has the baseline, so `db migrate` applies only the new change. An empty database in CI gets both.

On Postgres, a failed `db migrate` rolls back that run. Earlier successful runs stay applied. Fix the cause and run it again.

### The generated files

| Prisma 7 | Prisma 8 |
|---|---|
| `prisma generate` builds a client package | `prisma contract emit` writes two files |
| Import `PrismaClient` from `@prisma/client` or the custom output | Import `postgres` from `@prisma/orm-postgres/runtime` and construct `db` yourself |
| Types such as `User`, `Prisma.UserCreateInput` | `Models.public_User` in `contract.d.ts` |
| `Date` | `Temporal.Instant` for `DateTime` |

`contract.json` is what the app loads at runtime. `contract.d.ts` is what TypeScript reads. The same contract always emits the same bytes, so the files diff cleanly. Commit them.

### Connection management

Both clients are lazy. The pool opens on the first query. Create one client for the process and import it. Creating a client per request exhausts Postgres connections.

Prisma 7 closes with `prisma.$disconnect()`. Prisma 8 closes with `db.close()`.

Neon pooling exists because Postgres connections are heavy and serverless or many Node processes would open too many. The app should use the pooler. Migrations and `db init` should use the direct host, because the pooler is a poor fit for session-level migration work. That is why this repo has two URLs.

---

## 4. Side-by-side

### Files

| | Prisma 7 | Prisma 8 |
|---|---|---|
| Models | `prisma/schema.prisma` | `prisma/contract.prisma` |
| First line | nothing special | `// use prisma-8` |
| Generator and datasource | inside the schema | `prisma.config.ts` |
| Config function | `defineConfig` from `prisma/config` | `definePrismaConfig` from `prisma/config`, plus `defineConfig` from `@prisma/orm-postgres/config` |
| Config filename on 7.10+ | `prisma7.config.ts` or `prisma.config.ts` | `prisma.config.ts` only |
| Migrations | `prisma/migrations/<timestamp>_name/migration.sql` | `prisma/migrations/app/<id>_name/` plus `refs/db.json` and `snapshots/` |
| Client | generated `PrismaClient` | `contract.json` + a `postgres({ contract, url })` call you write |

### Packages

| | Prisma 7 | Prisma 8 |
|---|---|---|
| CLI | `prisma@7` | `prisma@8` |
| Runtime | `@prisma/client@7` | `@prisma/orm-postgres` |
| Driver | `pg` + `@prisma/adapter-pg`, passed as `adapter` | included in `@prisma/orm-postgres` |
| Dates | JavaScript `Date` | `Temporal`, with `temporal-polyfill` on current Node |

### Commands

| Prisma 7 | Prisma 8 |
|---|---|
| `prisma generate` | `prisma contract emit` |
| `prisma migrate dev` | `prisma contract emit`, then `prisma migration plan --name ...`, then `prisma db migrate --advance-ref db` |
| `prisma migrate deploy` | `prisma db migrate` |
| `prisma migrate status` | `prisma migration status` |
| `prisma db push` | `prisma db init` the first time, `prisma db update` after that |
| `prisma db pull` | `prisma contract infer` |
| `prisma db seed` | no command. Write a script and run it with `tsx` |
| `prisma studio` | not in the Prisma 8 CLI |
| `prisma validate` | `prisma contract emit` fails on a bad contract. `prisma db verify` compares it with the database |
| `prisma format` | `prisma contract format` |
| `prisma migrate reset` | drop the database yourself, then `prisma db migrate` |
| marking an existing database as already migrated | `prisma db sign` |

Typing `prisma migrate dev` on the Prisma 8 CLI exits with `CLI.COMMAND_MOVED` and tells you the new command.

### Queries

| Prisma 7 | Prisma 8 |
|---|---|
| `prisma.user` | `db.orm.public.User` |
| `findMany({ where })` | `.where(...).all()` |
| `findFirst({ where })` | `.where(...).first()` |
| `findUnique({ where: { email } })` | `.whereUnique({ email }).first()` |
| `select: { id: true, email: true }` | `.select("id", "email")` |
| `include: { posts: true }` | `.include("posts")` |
| `orderBy: { createdAt: "desc" }` | `.orderBy((u) => u.createdAt.desc())` |
| `take` / `skip` | `.limit(n)` / `.offset(n)` |
| `create({ data })` | `.create({ ... })` |
| `createMany({ data })` | `.createAll([...])` |
| `update({ where, data })` | `.where(...).update({ ... })` |
| `updateMany` | `.updateAll` or `.updateAndCount` |
| `delete({ where })` | `.where(...).delete()` |
| `deleteMany` | `.deleteAll` or `.deleteAndCount` |
| `upsert` | `.upsert({ create, update, conflictOn })` |
| `count` | `.aggregate((agg) => ({ total: agg.count() }))` |
| `$transaction(async (tx) => ...)` | `db.transaction(async (tx) => ...)` with `tx.orm` |
| `$queryRaw` | `db.raw.sql` + `.returnsRow()` + `db.query()` |
| `$executeRaw` | `db.raw.sql` + `.affectedCount()` + `db.execute()` |
| `$disconnect()` | `db.close()` |

`where: { name: { contains: "ada" } }` becomes `.where((u) => u.name.like("%ada%"))`.

### Schema attributes that moved

| Prisma 7 | Prisma 8 |
|---|---|
| `String @id @default(cuid())` | `String @id @onCreate(cuid(2))` |
| `String @id @default(uuid())` | `String @id @onCreate(uuid())` |
| `DateTime @updatedAt` | `DateTime @onCreate(now()) @onUpdate(now())`, or the type `temporal.updatedAt()` |
| `DateTime @default(now())` | still valid |
| `@default(dbgenerated("gen_random_uuid()"))` | `@default(sql`gen_random_uuid()`)` |
| `String @db.VarChar(255)` | `VarChar(255)` |
| `String @db.Uuid` | `Uuid` |
| `Json` stored as `jsonb` | write `Jsonb`. In Prisma 8, `Json` means the older Postgres `json` type |
| `@id`, `@unique`, `@relation`, `@map`, `@@map`, `@@index`, `@@unique` | unchanged |

---

## 5. What this repo is doing

- Contract: `backend/prisma/contract.prisma`, first line `// use prisma-8`.
- Config: `backend/prisma.config.ts`, direct Neon URL for the CLI, generated output in `backend/src/generated/prisma`.
- Client: `backend/src/config/db.ts`, pooled URL, Temporal polyfill imported first.
- Models: `User`, `Session`, `ShortUrl`, `ClickAnalytics`. Ids are `@onCreate(cuid(2))`. Tables are mapped to `users`, `sessions`, `short_urls`, `click_analytics`.
- Auth queries go through `db.orm.public.User` and `db.orm.public.Session`.
- The `sessions` table was applied with `npx prisma db update --advance-ref db` because this database was not created by `db init`.

Day to day in this repo: edit the contract, `npm run db:emit`, then either `npm run db:plan -- --name ...` and `npm run db:migrate`, or `npx prisma db update` when you are only pushing a dev database that is already outside the migration history.

---

## 6. Failures already seen here

| Symptom | Cause | Fix |
|---|---|---|
| `definePrismaConfig is not a function` | The installed CLI is Prisma 7 | Install `prisma@8` and `@prisma/orm-postgres` |
| `CONTRACT.SOURCE_LOAD_FAILED` / `PSL_NO_OPTED_IN_SCHEMA_FILES` | The contract is missing `// use prisma-8` as the first line | Put that line back |
| `PSL_GENERATOR_IN_DEFAULT` | `@default(cuid())` or `@default(uuid())` | `@onCreate(cuid(2))` or `@onCreate(uuid())` |
| `cuid()` missing a version | The version argument is required | `cuid(2)` |
| `@updatedAt` is invalid | Removed in Prisma 8 | `@onCreate(now()) @onUpdate(now())` |
| Cannot find `@prisma/client` | That package is Prisma 7 | Import `Models` from `src/generated/prisma/contract.ts` |
| `Cannot find name 'process'` in `prisma.config.ts` | The file is outside `tsconfig` `include` | `/// <reference types="node" />` at the top |
| `RUNTIME.TEMPORAL_UNAVAILABLE` | Node has no global `Temporal` | `import "temporal-polyfill/global"` before queries |
| `channel_binding` rejected | Neon added it and `pg` does not accept it | Remove it. Keep `sslmode=require` |
| `EBADENGINE` during install | Node is older than `22.18` | The RC still ran here. Upgrade Node when you can |
| `MIGRATION.MARKER_NOT_IN_HISTORY` | Tables were created outside this migration graph | `db update` or `db sign`, depending on whether the database already matches |
| `Cannot find module '.../contract.json'` | `contract emit` was not run | `npm run db:emit` |
