# Auth module: every file, the syntax, and why it exists

This document walks through the authentication code in `backend/src`. Read it with the files open. The goal is to understand the JavaScript and TypeScript you are looking at, then understand why each file is separate.

The routes live under `/api/auth`:

| Method | Path | Who can call it |
|---|---|---|
| POST | `/api/auth/register` | anyone |
| POST | `/api/auth/login` | anyone |
| GET | `/api/auth/me` | a valid access token |
| POST | `/api/auth/refresh-token` | a valid refresh token |
| POST | `/api/auth/logout` | a valid access token |
| POST | `/api/auth/logout-alldevices` | a valid access token |

---

## 1. What happens when a request arrives

Express is a chain of functions. Each function is called middleware. A middleware receives the request (`req`), the response (`res`), and `next`. Calling `next()` hands the request to the next function. Calling `next(error)` jumps to the error middleware.

`backend/src/app.ts` builds that chain:

1. Helmet sets security headers.
2. CORS allows the frontend origin and allows cookies (`credentials: true`).
3. The HTTP logger records the request.
4. `express.json()` reads a JSON body into `req.body`.
5. `express.urlencoded()` reads form bodies.
6. `cookieParser()` reads the `Cookie` header into `req.cookies`.
7. `app.use("/api/auth", authRouter)` runs the auth routes for any path that starts with `/api/auth`.
8. `errorMiddleware` runs only when something called `next(error)` or threw in a synchronous middleware.

A register request then goes through the route's own chain:

```ts
router.post("/register", validate(registerSchema), controller.register);
```

That means: parse and check the body, then run `controller.register`. Login is the same shape. `/me`, `/logout`, and `/logout-alldevices` insert two more functions before the controller: `authenticate`, then `authorize("USER")`. `/refresh-token` skips those two because the access token is often already expired when the client needs a new one. The refresh token is the credential for that route.

---

## 2. JavaScript you need before the classes

### Values, objects, and functions

A function is a value. You can store it in a variable and pass it to another function. Express works because of that. `router.post` does not call your handler immediately. It stores the function and calls it later, when a matching request arrives.

```ts
router.post("/login", validate(loginSchema), controller.login);
```

Three values are stored for that route: the path, the validator, and the login handler.

An object is a bag of properties. `req` is an object. `req.body` is one property. `req.user` is another property we add ourselves.

### `this`

`this` is not a special variable you declare. It is the object a function was called on.

```js
const user = {
  email: "a@b.com",
  greet() {
    return this.email;
  },
};

user.greet(); // this === user, so the result is "a@b.com"
```

The call `user.greet()` sets `this` to `user` for that call. The function does not own `this`. The call site does.

Take the same function off the object and call it alone:

```js
const greet = user.greet;
greet(); // this is undefined, because class code and modules run in strict mode
```

There is no object to the left of the dot, so there is no `this`.

That is the bug class methods hit in Express. This code stores the function and Express calls it later as a bare function:

```ts
router.post("/login", controller.login);
// later Express does something equivalent to: storedLogin(req, res, next)
```

If `login` were a normal method, `this` inside it would be `undefined`, and `this.service` would crash.

### Arrow functions keep the surrounding `this`

A normal function gets `this` from how it is called. An arrow function does not get its own `this`. It uses `this` from the place it was written.

```js
const user = {
  email: "a@b.com",
  greet: () => this.email, // this is NOT user; it is the outer scope
};
```

Inside a class field, the outer scope is the instance being constructed. So this pattern freezes `this` to the controller object:

```ts
export class AuthController {
  constructor(private readonly service: AuthService) {}

  login = catchAsync(async (req, res) => {
    const result = await this.service.login(req.body, requestMeta(req));
    // this.service still works when Express calls login as a bare function
  });
}
```

`AuthService` methods are ordinary methods (`async login(...) { ... this.repository ... }`). They stay correct because the controller calls them as `this.service.login(...)`. There is an object on the left of the dot, so `this` inside `login` is the service.

Rule used in this module:

- Controller handlers are arrow fields, because Express detaches them.
- Service and repository methods are normal methods, because our own code calls them on the object.

### Classes

A class is a factory for objects that share the same methods.

```ts
const repository = new PrismaAuthRepository();
const service = new AuthService(repository);
const controller = new AuthController(service);
```

`new` does three things:

1. Create a blank object.
2. Run the constructor with `this` set to that object.
3. Return the object.

`constructor(private readonly repository: AuthRepository)` is TypeScript shorthand. It means all of this:

```ts
class AuthService {
  private readonly repository: AuthRepository;

  constructor(repository: AuthRepository) {
    this.repository = repository;
  }
}
```

The constructor argument is saved on the object. Later, `this.repository` reads it back.

### `private` and `readonly`

`private` is a TypeScript rule: code outside the class is not allowed to write `service.repository`. The compiler deletes that keyword. At runtime the property is a normal property. It is not a security boundary. It keeps other files from depending on internals.

`readonly` is also a TypeScript rule: after the constructor, you cannot write `this.repository = somethingElse`. The service keeps the same repository for its whole life.

`private async openSession(...)` is a method only this class may call. Register and login both need "create a session and return tokens". That shared step is a method so it is not copy-pasted. Callers outside the class must go through `register` or `login`, which contain the extra rules (duplicate email, password check).

JavaScript also has real runtime privacy with a `#` prefix (`#repository`). This code uses TypeScript's `private`, which is the compile-time version.

### `implements` and `interface`

An interface is a list of method names and their input and output types. It disappears when TypeScript compiles. It exists so one file can promise a shape and another file can require that shape.

```ts
export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  // ...
}

export class PrismaAuthRepository implements AuthRepository {
  async findUserByEmail(email: string): Promise<UserRecord | null> {
    // ...
  }
}
```

`implements AuthRepository` makes the compiler check that the class has every method in the list, with compatible types. `AuthService` asks for `AuthRepository` in its constructor. It never mentions Prisma. Any object with those methods can be passed in, including a fake object in a test.

### `async`, `await`, and `Promise`

A database call does not finish on the same line. `await` pauses that function until the promise settles, then continues with the result. Other requests keep running while this one waits.

```ts
const user = await db.orm.public.User.first({ email });
```

`async` makes the function return a promise. `throw` inside an `async` function rejects that promise. Express does not see that rejection unless something catches it and calls `next(error)`. That is what `catchAsync` does.

### Modules and the `.js` in imports

Each file is a module. `export` makes a name available. `import` reads it. Nothing is global unless we deliberately attach it to a global type, which `auth.types.ts` does for `req.user`.

The imports end in `.js` even though the files on disk are `.ts`:

```ts
import { AuthService } from "./auth.service.js";
```

This project compiles TypeScript in a mode that keeps import paths as written, and Node loads ES modules. Node wants the extension it will actually load. TypeScript understands that `.js` in source refers to the `.ts` file beside it.

### Types versus runtime

`UserRecord`, `AuthTokens`, and `RegisterInput` exist only for the compiler. They are erased. `class`, `function`, `await`, `bcrypt`, and `jwt` exist at runtime.

`import type { AuthService }` is a type-only import. The compiler uses it and emits no runtime import. `auth.route.ts` uses that for `AuthController` because the route file only needs the type in its signature. The actual controller object is passed in as an argument from `auth.container.ts`.

---

## 3. Why the files are split

One file could hold all of this. It would be hard to change and hard to explain in an interview. The split follows one rule: each file has one reason to change.

| File | Reason it exists |
|---|---|
| `auth.constants.ts` | Names and numbers used in more than one place |
| `auth.types.ts` | Shapes of the logged-in user and the token contents |
| `auth.schema.ts` | What a valid request body looks like |
| `auth.interface.ts` | The data shapes and the database contract |
| `auth.helper.ts` | Crypto, cookies, and reading tokens off the request |
| `auth.repository.ts` | The only file that talks to Prisma for auth |
| `auth.service.ts` | The rules: who may register, when a refresh is trusted, what logout deletes |
| `auth.controller.ts` | HTTP: status codes, JSON, cookies |
| `auth.route.ts` | Which URL runs which chain of functions |
| `auth.container.ts` | Builds the objects and connects them once |
| `validate.middleware.ts` | Rejects bad input before a controller runs |
| `authentication.middleware.ts` | Decides "is this a logged-in user?" |
| `authorization.middleware.ts` | Decides "is this user allowed to do this?" |
| `error.middleware.ts` | Turns a thrown error into a JSON response |
| `AppError.ts` | An error that already knows its HTTP status |
| `catchAsync.ts` | Forwards async failures into that error middleware |

A useful interview sentence: the controller speaks HTTP, the service speaks business rules, the repository speaks the database. The helper speaks cryptography. Middleware speaks the cross-cutting checks that many routes share.

---

## 4. `auth.constants.ts`

```ts
export const ACCESS_COOKIE = "accessToken";
export const REFRESH_COOKIE = "refreshToken";
export const BCRYPT_ROUNDS = 12;
```

These are names, not logic. The cookie name has to match between the function that sets the cookie and the function that reads it. A shared constant keeps those from drifting apart. `12` is the bcrypt work factor. Keeping it here means a future change does not require hunting through the hash function.

---

## 5. `auth.types.ts`

```ts
export type UserRole = "USER" | "ADMIN";
```

A type alias gives a shape a name. `"USER" | "ADMIN"` means the value can be one of those two strings and no others. The compiler rejects `role: "EDITOR"`.

`AuthUser` is what we hang on `req.user` after a token is accepted: id, email, session id, role.

`AccessTokenPayload` and `RefreshTokenPayload` are the objects we put inside JWTs. `sub` is the JWT standard name for "who this token is about". We set it to the user id. `type` is our own field so a refresh token cannot be mistaken for an access token.

### Adding `req.user` to Express

Express's `Request` type does not have `user`. This block tells TypeScript that it might:

```ts
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
```

`declare global` adds to the global type scope. `namespace Express` plus `interface Request` merges with the `Request` interface that `@types/express` already declared. Interface merging is TypeScript combining two interface declarations of the same name. The `?` means `req.user` might be absent. Public routes never set it. Protected routes set it in `authenticate`.

This is a type-only change. It does not create the property at runtime. `authenticate` creates it by assignment: `req.user = { ... }`.

---

## 6. `auth.schema.ts`

Zod describes a value and checks it at runtime. TypeScript types cannot do that, because they are gone by the time a request arrives.

```ts
export const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(72),
});
```

`z.object` requires those keys. `z.email()` checks the email shape. The password length is 8 to 72 characters. The upper bound matches bcrypt, which only uses the first 72 bytes of a password. A longer password would be silently truncated by bcrypt, so the schema rejects it first.

Login allows a password of length 1. A stored account might have been created under an older rule, and a wrong password should fail the password check with 401, not fail validation with 400.

```ts
export type RegisterInput = z.infer<typeof registerSchema>;
```

`typeof registerSchema` is the type of the schema object. `z.infer` turns that schema into the TypeScript type of a successful parse: `{ email: string; password: string }`. The service uses that name so the body type and the schema cannot diverge.

`refreshTokenSchema` is defined. The refresh route does not currently pass it to `validate`. The controller reads the token from the body or the cookie with `readRefreshToken`. The schema is ready for a route that wants the body checked by Zod.

---

## 7. `validate.middleware.ts`

```ts
export const validate =
  (schema: ZodType, target: ValidateTarget = "body") =>
  (req, _res, next) => { ... };
```

This is a function that returns a function. `validate(registerSchema)` runs at startup and returns the middleware Express will call per request. The inner function closes over `schema` and `target`. "Closes over" means the inner function keeps those variables after the outer function has returned.

`target` defaults to `"body"`. `req[target]` uses a variable as a property name, so the same middleware can check `req.body`, `req.query`, or `req.params`.

`safeParse` never throws. It returns `{ success: true, data }` or `{ success: false, error }`. On failure we map Zod issues into `field: message` strings and throw `AppError` with status 400. On success we replace `req.body` with `result.data`. Zod strips unknown keys by default, so the controller sees the parsed value, not the raw untrusted object.

`validateParams` is a one-line wrapper that fixes the target to `"params"`.

`_res` starts with an underscore because this middleware does not write the response. The underscore tells the unused-parameter check that the omission is deliberate. Express still passes `res` in, because every middleware has the same three parameters.

Throwing works here because `validate`'s inner function is synchronous. Express catches a throw in synchronous middleware and forwards it to `errorMiddleware`.

---

## 8. `AppError` and `error.middleware.ts`

```ts
export class AppError extends Error {
  readonly statusCode: number;
  readonly isOperational = true;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}
```

`extends Error` means an `AppError` is an `Error`. `super(message)` runs the `Error` constructor, which sets `.message` and the stack trace. Then we store the HTTP status on the object.

`isOperational = true` is a field initialized on every instance. It marks "this was an expected failure" (bad password, bad input) as opposed to a bug. The error middleware currently branches on `instanceof AppError` rather than on this flag. `instanceof` walks the prototype chain and is true for `AppError` because of `extends`.

The error middleware has four parameters. Express uses the parameter count to recognize an error handler. It only runs this function when `next` was called with an error.

If the error is an `AppError`, the client gets that status and message. Any other error is logged and answered with 500 and a generic message. The generic message matters: a database error can contain table names and queries, and that text should not be sent to the client.

---

## 9. `catchAsync.ts`

```ts
export const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
```

The controller methods are `async`. If `this.service.login` throws, that becomes a rejected promise. Express 5 does handle rejected promises from async middleware in many cases, and `catchAsync` makes the handoff explicit: the rejection is passed to `next`, which lands in `errorMiddleware`.

The generics (`P`, `ResBody`, `ReqBody`, `ReqQuery`) copy Express's handler types so wrapping a function does not erase the types of `req.params`, `req.body`, and the response. You can read the wrapper as "take an async handler, return a normal handler".

---

## 10. `auth.interface.ts`

These types are the words the service and the repository share.

`PublicUser` is safe to send to the client: id, email, createdAt. `UserRecord` adds `passwordHash`. The intersection `PublicUser & { passwordHash: string }` means "everything in PublicUser, plus the hash". The hash stays inside the server.

`SessionRecord` is one row of the `sessions` table, reduced to the fields the service needs. `expiresAt` is a `Temporal.Instant` because Prisma 8 reads `DateTime` columns that way in this project.

`RequestMeta` is the extra request information we store on a new session: user agent and IP. Both are optional because a client might omit the user-agent header, and `req.ip` can be undefined.

`AuthTokens` is what register, login, and refresh return internally: the public user, the access token, and the refresh token. The controller then decides what of that goes into JSON and what goes into cookies.

`AuthRepository` is the contract in section 2. It has no Prisma types in it. That is intentional. The service file can be read without knowing the ORM.

---

## 11. `auth.helper.ts`

This file is functions, not a class. None of them need stored state. They take inputs and return outputs, and they read `env` for secrets and durations. A class would add `this` without giving us anything.

### Durations

`JWT_ACCESS_EXPIRES_IN` looks like `"15m"`. `jsonwebtoken` wants seconds. Cookies want milliseconds. The database wants a `Temporal.Instant`. `durationMs` turns `"15m"` into `900000` using the unit table. `signAccessToken` divides by 1000. `cookieOptions` uses the milliseconds as `maxAge`. `refreshExpiry` adds the milliseconds to the current instant.

### Passwords

```ts
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}
```

`bcrypt.hash` returns a promise. The function returns that promise directly, so the caller `await`s it. `verifyPassword` is `bcrypt.compare`, which checks a plaintext password against a stored hash and returns a boolean.

### Token hashing and the placeholder

```ts
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function randomToken(): string {
  return randomBytes(32).toString("hex");
}
```

`hashToken` is a fast fingerprint of a refresh token. `randomToken` is 32 cryptographically random bytes, written as 64 hex characters. The service uses it once, as a temporary value, before the real refresh token exists. Section 13 explains that two-step write.

### Signing

`signAccessToken` builds the payload object, then calls `jwt.sign(payload, secret, { expiresIn })`. The secret is `JWT_ACCESS_SECRET`. The refresh token uses a different secret, `JWT_REFRESH_SECRET`. `expiresIn` is in seconds.

`verifyAccessToken` calls `jwt.verify`. That function throws if the signature is wrong or the token is expired. The `catch` turns those library errors into `AppError` with status 401, so the client sees "Unauthorized" instead of a stack trace. After verify succeeds, the function checks `type`, `sub`, `email`, and `sessionId` itself. `jwt.verify` proves the token was signed by us. It does not prove the payload has the shape we expect, so the type guard does.

`isRecord` is a type predicate: `value is Record<string, unknown>`. After it returns true, TypeScript lets us read `decoded.type`, `decoded.sub`, and so on.

### Cookies

`cookieOptions` returns:

- `httpOnly: true` so browser JavaScript cannot read the cookie.
- `secure: true` only when `NODE_ENV` is `production`, so local HTTP still works.
- `sameSite: "lax"`.
- `maxAge` so the browser deletes the cookie on its own.
- `path: "/"` so the cookie is sent to every path on this API.

`setAuthCookies` writes both cookies. `clearAuthCookies` clears both. Clearing uses the same path and flags, because browsers match a cookie by name plus path and security flags.

### Reading tokens

`readAccessToken` looks at the `Authorization` header first. If it starts with `"Bearer "`, the rest of the string is the token. Otherwise it looks at the `accessToken` cookie.

`readRefreshToken` looks at `req.body.refreshToken` first, then the `refreshToken` cookie. Body support lets a non-browser client refresh without cookies. The cookie is what the browser will use.

---

## 12. `auth.repository.ts`

The repository is the only auth file that imports `db`. Its methods are thin: call Prisma, then map the result into `UserRecord` or `SessionRecord`.

```ts
async findUserByEmail(email: string): Promise<UserRecord | null> {
  const user = await db.orm.public.User.first({ email });
  return user ? toUser(user) : null;
}
```

`db.orm.public.User` means the `User` model in the `public` Postgres schema. `.first({ email })` returns the row or a null-like empty result. The ternary returns `null` so the service can write `if (!user)`.

`toUser` copies four fields and turns `createdAt` into a string with `.toString()`. Prisma 8 gives dates back as `Temporal.Instant`. The rest of the app, and the JSON response, wants a string. Doing that conversion here means the service never mentions Temporal for users.

`toSession` keeps `expiresAt` as an `Instant`, because the service compares it with `Date.now()`.

The writes:

- `createUser` inserts email and password hash. The id and timestamps are filled by the database from the Prisma contract (`@onCreate(cuid(2))`, `@default(now())`).
- `createSession` inserts the session fields, including optional user agent and IP.
- `updateSession` changes the refresh hash and expiry for one id.
- `deleteSession` deletes one row.
- `deleteAllSessions` deletes every session with that `userId`. `deleteAndCount` is the Prisma 8 call that deletes the matching set.

`implements AuthRepository` is what makes a missing method a compile error. If the interface gains a method and this class forgets it, `tsc` fails.

---

## 13. `auth.service.ts`

This is the policy. It decides what is allowed. It does not know about status lines, JSON, or cookies.

```ts
export class AuthService {
  constructor(private readonly repository: AuthRepository) {}
```

The service receives the repository. `auth.container.ts` passes `new PrismaAuthRepository()`. Inside every method, `this.repository` is that object.

### `register`

1. Look up the email.
2. If a user exists, throw 409.
3. Hash the password, insert the user.
4. Call `this.openSession`, which logs them in immediately.

`throw new AppError(...)` rejects the async function. `catchAsync` passes it to the error middleware. The controller does not have a try/catch.

### `login`

1. Look up the email.
2. If the user exists, compare the password. If they do not, the comparison result is `false`.
3. One error covers both cases: "Invalid email or password", status 401.

A single message stops the endpoint from answering "that email is not registered", which would let someone probe which addresses have accounts.

### `me`

Loads the user by id and returns the public fields. The id came from the access token, via `req.user`. If the row was deleted after the token was issued, this throws 401.

### `refresh`

1. `verifyRefreshToken` checks the signature, the expiry inside the JWT, and the payload shape.
2. Load the session id that is inside the token.
3. Reject the token if the session is missing or belongs to a different user.
4. Hash the presented token and compare it to `session.refreshTokenHash`.
5. If the hashes differ, delete every session for that user and throw. That presented token was validly signed, and it names a real session, but it is not the current token. The service treats that as reuse.
6. If the database expiry has passed, delete that one session and throw.
7. If the user row is gone, delete the session and throw.
8. Build a new access token and a new refresh token for the same session id.
9. Save the hash of the new refresh token and a new expiry.
10. Return the new tokens.

Step 8 happens before step 9. If the process crashed between them, the client would have tokens the database does not recognize yet. The next refresh would look like reuse and revoke every session. That is the safe direction: a crash logs the user out everywhere rather than accepting two live refresh tokens.

### `logout` and `logoutAll`

`logout` deletes the one session id from the access token. `logoutAll` deletes every session for the user id. Neither method clears cookies. The controller does that, because cookies are HTTP.

### `openSession` (private)

Register and login both end here.

The session id is created by Postgres when the row is inserted. The refresh JWT has to contain that id. The hash we store has to be the hash of that JWT. Those two facts depend on each other, so the method writes twice:

1. Insert a session with `hashToken(randomToken())`. That value is a unique placeholder. The column is `UNIQUE`, so it cannot be a constant.
2. Read `session.id` from the insert result.
3. Sign the real access and refresh tokens with that id.
4. Update the row so `refreshTokenHash` is the hash of the real refresh token.

`tokensFor` is the small private method that builds the three-part `AuthTokens` object. It is private because choosing the payload fields is part of the service, and no route should sign tokens on its own.

---

## 14. `auth.controller.ts`

The controller translates HTTP into service calls and service results into HTTP.

```ts
export class AuthController {
  constructor(private readonly service: AuthService) {}

  register = catchAsync(async (req, res) => {
    const result = await this.service.register(req.body, requestMeta(req));
    setAuthCookies(res, result);
    res.status(201).json({ ... });
  });
```

`req.body` on register and login has already been parsed by `validate`, so it matches `RegisterInput` or `LoginInput`.

`requestMeta` reads `req.get("user-agent")` and `req.ip`. `?? undefined` turns a missing header into `undefined` so the type matches `RequestMeta`.

The JSON body includes `user` and `accessToken`. It leaves out `refreshToken`. The refresh token is written only as an httpOnly cookie. A browser frontend can still refresh, because the browser stores the cookie and sends it back. JavaScript on the page cannot read it.

`requireUser` throws if `req.user` is missing. On `/me`, `/logout`, and `/logout-alldevices`, `authenticate` already set `req.user` or already failed the request. The check is there so the controller does not trust a route setup that forgot `authenticate`, and so TypeScript narrows `req.user` from `AuthUser | undefined` to `AuthUser` after the throw.

Refresh returns 401 with "Refresh token missing" when neither the body nor the cookie has a token. A successful refresh sets new cookies, same as login.

Logout and logout-all clear the cookies after the database delete. The response is a message with no user object.

Status codes used here: 201 for a created account, 200 for the other successes. Failures are status codes on `AppError` (400, 401, 403, 409, 500).

---

## 15. `auth.route.ts`

```ts
export const createAuthRouter = (controller: AuthController) => {
  const router = Router();
  router.post("/register", validate(registerSchema), controller.register);
  // ...
  return router;
};
```

A `Router` is a mini Express app. Paths here are relative. `app.use("/api/auth", authRouter)` prefixes them.

The order of functions in `router.get` is the order they run:

```ts
router.get("/me", authenticate, authorize("USER"), controller.me);
```

1. `authenticate` sets `req.user` or fails with 401.
2. `authorize("USER")` checks the role or fails with 403.
3. `controller.me` loads the profile.

`authorize("USER")` has parentheses because it is the outer function. It runs once, at startup, and the function it returns is what Express stores. `authenticate` has no parentheses because it already is the middleware.

Refresh is registered with only `controller.refresh`. No access-token check.

---

## 16. `authentication.middleware.ts`

```ts
export const authenticate = (req, _res, next) => {
  try {
    const token = readAccessToken(req);
    if (!token) throw new AppError("Unauthorized", 401);

    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      sessionId: payload.sessionId,
      role: "USER",
    };
    next();
  } catch (error) {
    next(error instanceof AppError ? error : new AppError("Unauthorized", 401));
  }
};
```

This middleware does not look at the `sessions` table. A valid signature and an unexpired access token are enough. Logout deletes the session row, and the access token still passes this function until its own `exp` (15 minutes). Refresh and reuse detection are what consult the database.

`role` is the string `"USER"` for every token. There is no role column on `User`. The field exists so `authorize` has something to check, and so an admin role can be added later without changing `req.user`'s shape.

The `try/catch` calls `next(error)` instead of throwing out of an unknown state. `verifyAccessToken` already converts JWT failures into `AppError`. The catch is a second belt so any unexpected throw still becomes 401 rather than 500.

---

## 17. `authorization.middleware.ts`

```ts
export const authorize =
  (...roles: UserRole[]) =>
  (req, _res, next) => {
    if (!req.user) {
      next(new AppError("Unauthorized", 401));
      return;
    }
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      next(new AppError("Forbidden", 403));
      return;
    }
    next();
  };
```

`...roles` is a rest parameter. `authorize("USER")` makes `roles` equal `["USER"]`. `authorize("USER", "ADMIN")` would make `roles` equal `["USER", "ADMIN"]`.

Missing `req.user` is 401: we do not know who they are. A known user with the wrong role is 403: we know who they are, and the answer is no.

`return` after `next(...)` stops the function. Without it, a request could send an error and also call `next()` again, which runs the controller anyway.

Today every protected route passes `"USER"`, and every token gets role `"USER"`, so this check always passes after `authenticate`. The split is still the right shape. Authentication answers "who are you?". Authorization answers "what may you do?".

---

## 18. `auth.container.ts`

```ts
const repository = new PrismaAuthRepository();
const service = new AuthService(repository);
const controller = new AuthController(service);

export const authRouter = createAuthRouter(controller);
```

This is the composition root for auth. It is the one place that knows the concrete classes. The service knows the interface. The route knows the controller. `app.ts` only imports `authRouter`.

Construction happens once, when the module is first imported. Node caches modules, so later imports of `app.ts` do not create a second service. There is one repository, one service, and one controller for the process.

Wiring it by hand, instead of a dependency-injection framework, keeps the graph visible in ten lines.

---

## 19. The database rows these files use

From `backend/prisma/contract.prisma`:

`User` stores `email` and `passwordHash`. The id is a CUID2 generated on insert. Email is unique.

`Session` stores:

- `userId`, with a foreign key to `User` and `onDelete: Cascade` (deleting a user deletes their sessions)
- `refreshTokenHash`, unique
- `userAgent` and `ipAddress`, both optional
- `expiresAt`
- `createdAt`

The service never writes SQL. The repository never decides whether a login is valid. That is the split you should be able to point at in an interview.

---

## 20. A register request, end to end

1. The client sends `POST /api/auth/register` with `{ "email", "password" }`.
2. `express.json()` fills `req.body`. `cookieParser()` fills `req.cookies`.
3. `validate(registerSchema)` parses the body or throws 400.
4. `controller.register` runs with `this` bound to the controller, because it is an arrow field.
5. `this.service.register` looks up the email, hashes the password, inserts the user.
6. `openSession` inserts a session with a placeholder hash, signs both JWTs with the new session id, then replaces the hash.
7. The controller sets both cookies and responds `201` with the user and the access token.
8. If any `AppError` was thrown, `catchAsync` called `next(error)` and `errorMiddleware` wrote `{ success: false, message }` with the matching status.

Login is the same path with a password comparison instead of an insert. `/me` stops at step 3's equivalent, which is `authenticate` then `authorize`, then reads the user. Refresh starts from the cookie, rotates the hash, and issues a new pair. Logout deletes one session row and clears cookies. Logout-all deletes every session row for that user and clears cookies on this device.
