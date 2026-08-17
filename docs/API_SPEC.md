# Notch — API Specification

> **Base URL:** `/api/v1`
> **Content-Type:** `application/json`
> **Authentication:** JWT Bearer Token (required on protected routes)

---

## Table of Contents

- [User Endpoints](#user-endpoints)
  - [Register](#1-register)
  - [Login](#2-login)
  - [Update User](#3-update-user)
  - [Delete User](#4-delete-user)
- [Notes Endpoints](#notes-endpoints)
  - [Create Note](#1-create-note)
  - [Get All Notes](#2-get-all-notes)
  - [Get Note by ID](#3-get-note-by-id)
  - [Update Note](#4-update-note)
  - [Delete Note](#5-delete-note)
- [Health Check](#health-check)
- [Data Schemas](#data-schemas)
- [Error Responses](#error-responses)

---

## User Endpoints

### 1. Register

| Field        | Value                    |
|--------------|--------------------------|
| **Method**   | `POST`                   |
| **Endpoint** | `/api/v1/users/register` |
| **Auth**     | Not required             |
| **Status**   | `201 Created`            |

#### Request Body

| Field      | Type     | Required | Description                                        |
|------------|----------|----------|----------------------------------------------------|
| `name`     | `string` | Yes      | Display name (2–50 chars)                          |
| `email`    | `string` | Yes      | Valid, unique email address                        |
| `password` | `string` | Yes      | Plaintext password (hashed on server, min 8 chars) |

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securePassword123"
}
```

#### Response Body

| Field     | Type      | Description                     |
|-----------|-----------|---------------------------------|
| `success` | `boolean` | `true`                          |
| `data`    | `object`  | `{ name, email }` of new user   |
| `message` | `string`  | Confirmation message            |

```json
{
  "success": true,
  "data": { "name": "John Doe", "email": "john@example.com" },
  "message": "User Registered Successfully"
}
```

#### Errors

| Status | When                          |
|--------|-------------------------------|
| `400`  | Validation failure            |
| `409`  | Email is already registered   |

---

### 2. Login

| Field        | Value                 |
|--------------|-----------------------|
| **Method**   | `POST`                |
| **Endpoint** | `/api/v1/users/login` |
| **Auth**     | Not required          |
| **Status**   | `200 OK`              |

#### Request Body

| Field      | Type     | Required | Description       |
|------------|----------|----------|-------------------|
| `email`    | `string` | Yes      | Registered email  |
| `password` | `string` | Yes      | Account password  |

```json
{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

#### Response Body

| Field     | Type      | Description                                            |
|-----------|-----------|--------------------------------------------------------|
| `success` | `boolean` | `true`                                                 |
| `data`    | `object`  | `{ name, email, token }` — JWT expires per `JWT_EXPIRY` |
| `message` | `string`  | Confirmation message                                   |

```json
{
  "success": true,
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "token": "<jwt_token>"
  },
  "message": "User Logged In Successfully"
}
```

The JWT payload contains `id`, `email`, and `role`.

#### Errors

| Status | When                                        |
|--------|---------------------------------------------|
| `400`  | Validation failure                          |
| `401`  | Unknown email or wrong password (generic message) |

---

### 3. Update User

| Field        | Value           |
|--------------|-----------------|
| **Method**   | `PUT`           |
| **Endpoint** | `/api/v1/users` |
| **Auth**     | Required        |
| **Status**   | `200 OK`        |

Users may only update their own profile — `id` must match the authenticated user's id.

#### Request Body

| Field      | Type      | Required | Description                              |
|------------|-----------|----------|------------------------------------------|
| `id`       | `integer` | Yes      | Own user `id` (must match the JWT)       |
| `name`     | `string`  | No       | New display name (min 2 chars)           |
| `email`    | `string`  | No       | New email address                        |
| `password` | `string`  | No       | New password (min 8 chars, re-hashed)    |

```json
{
  "id": 1,
  "name": "John Updated",
  "email": "newemail@example.com"
}
```

#### Response Body

| Field         | Type      | Description                            |
|---------------|-----------|----------------------------------------|
| `success`     | `boolean` | `true`                                 |
| `updatedUser` | `object`  | Updated user record (password omitted) |
| `message`     | `string`  | Confirmation message                   |

```json
{
  "success": true,
  "updatedUser": {
    "id": 1,
    "name": "John Updated",
    "email": "newemail@example.com",
    "createdAt": "2026-07-02T10:00:00.000Z"
  },
  "message": "User Updated Successfully"
}
```

#### Errors

| Status | When                                       |
|--------|--------------------------------------------|
| `400`  | Validation failure                         |
| `401`  | Missing or invalid token                   |
| `403`  | `id` does not match the authenticated user |
| `404`  | User not found                             |

---

### 4. Delete User

| Field        | Value           |
|--------------|-----------------|
| **Method**   | `DELETE`        |
| **Endpoint** | `/api/v1/users` |
| **Auth**     | Required        |
| **Status**   | `200 OK`        |

Deletes the authenticated user's own account (identified by the JWT — no body needed).

#### Request Body

_None_

#### Response Body

```json
{
  "success": true,
  "message": "User Account Deleted Successfully"
}
```

#### Errors

| Status | When                     |
|--------|--------------------------|
| `401`  | Missing or invalid token |
| `404`  | User not found           |

---

## Notes Endpoints

> All Notes endpoints require a **JWT Bearer Token** in the `Authorization` header,
> and only operate on notes owned by the authenticated user.
> ```
> Authorization: Bearer <token>
> ```

---

### 1. Create Note

| Field        | Value           |
|--------------|-----------------|
| **Method**   | `POST`          |
| **Endpoint** | `/api/v1/notes` |
| **Auth**     | Required        |
| **Status**   | `201 Created`   |

#### Request Body

| Field     | Type     | Required | Description                       |
|-----------|----------|----------|-----------------------------------|
| `title`   | `string` | Yes      | Title of the note (1–200 chars)   |
| `content` | `string` | Yes      | Body content (non-empty)          |

```json
{
  "title": "My First Note",
  "content": "This is the note content."
}
```

#### Response Body

| Field     | Type      | Description          |
|-----------|-----------|----------------------|
| `success` | `boolean` | `true`               |
| `data`    | `object`  | The created note     |
| `message` | `string`  | Confirmation message |

```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "My First Note",
    "content": "This is the note content.",
    "userId": 1,
    "createdAt": "2026-07-05T09:00:00.000Z",
    "updatedAt": "2026-07-05T09:00:00.000Z"
  },
  "message": "Note Created Successfully"
}
```

---

### 2. Get All Notes

| Field        | Value           |
|--------------|-----------------|
| **Method**   | `GET`           |
| **Endpoint** | `/api/v1/notes` |
| **Auth**     | Required        |
| **Status**   | `200 OK`        |

Returns the authenticated user's notes, paginated and sorted.

#### Query Parameters

| Param   | Type      | Required | Default     | Description                                          |
|---------|-----------|----------|-------------|------------------------------------------------------|
| `page`  | `integer` | No       | `1`         | Page number for pagination                           |
| `limit` | `integer` | No       | `10`        | Number of notes per page                             |
| `sort`  | `string`  | No       | `createdAt` | Field to sort by (e.g. `createdAt`, `title`)         |
| `order` | `string`  | No       | `desc`      | Sort direction: `asc` or `desc`                      |
| `filter`| `object`  | No       | `{}`        | Case-insensitive regex filter on `title` / `content` |

> **Note:** Express 5's default query parser is `simple`, which does not parse
> bracketed keys like `filter[title]=x` into nested objects — so the `filter`
> parameter is currently not reachable via query string. Enable the extended
> parser (`app.set('query parser', 'extended')`) to use it.

**Example Request:**
```
GET /api/v1/notes?page=1&limit=10&sort=createdAt&order=desc
```

#### Response Body

| Field        | Type       | Description                                  |
|--------------|------------|----------------------------------------------|
| `success`    | `boolean`  | `true`                                       |
| `count`      | `integer`  | Number of notes in this page                 |
| `totalCount` | `integer`  | Total notes matching the query               |
| `totalPages` | `integer`  | Total number of pages                        |
| `page`       | `integer`  | Current page number                          |
| `limit`      | `integer`  | Notes per page                               |
| `notes`      | `object[]` | Array of note objects                        |
| `fromCache`  | `boolean`  | `true` if served from the Redis cache        |
| `message`    | `string`   | Confirmation message                         |

```json
{
  "success": true,
  "count": 1,
  "totalCount": 1,
  "totalPages": 1,
  "page": 1,
  "limit": 10,
  "notes": [
    {
      "id": 1,
      "title": "My First Note",
      "content": "This is the note content.",
      "userId": 1,
      "createdAt": "2026-07-05T09:00:00.000Z",
      "updatedAt": "2026-07-05T09:00:00.000Z"
    }
  ],
  "fromCache": false,
  "message": "Notes Fetched Successfully"
}
```

---

### 3. Get Note by ID

| Field        | Value               |
|--------------|---------------------|
| **Method**   | `GET`               |
| **Endpoint** | `/api/v1/notes/:id` |
| **Auth**     | Required            |
| **Status**   | `200 OK`            |

#### URL Parameters

| Param | Type      | Required | Description     |
|-------|-----------|----------|-----------------|
| `id`  | `integer` | Yes      | The note's `id` |

#### Response Body

| Field       | Type      | Description                           |
|-------------|-----------|---------------------------------------|
| `success`   | `boolean` | `true`                                |
| `note`      | `object`  | The requested note                    |
| `fromCache` | `boolean` | `true` if served from the Redis cache |
| `message`   | `string`  | Confirmation message                  |

```json
{
  "success": true,
  "note": {
    "id": 1,
    "title": "My First Note",
    "content": "This is the note content.",
    "userId": 1,
    "createdAt": "2026-07-05T09:00:00.000Z",
    "updatedAt": "2026-07-05T09:00:00.000Z"
  },
  "fromCache": false,
  "message": "Note Fetched Successfully"
}
```

#### Errors

| Status | When                                             |
|--------|--------------------------------------------------|
| `400`  | `id` is not a positive integer                   |
| `404`  | Note does not exist or belongs to another user   |

---

### 4. Update Note

| Field        | Value               |
|--------------|---------------------|
| **Method**   | `PUT`               |
| **Endpoint** | `/api/v1/notes/:id` |
| **Auth**     | Required            |
| **Status**   | `200 OK`            |

#### URL Parameters

| Param | Type      | Required | Description     |
|-------|-----------|----------|-----------------|
| `id`  | `integer` | Yes      | The note's `id` |

#### Request Body

Both fields are required (full replacement, not a patch).

| Field     | Type     | Required | Description                     |
|-----------|----------|----------|---------------------------------|
| `title`   | `string` | Yes      | Updated title (1–200 chars)     |
| `content` | `string` | Yes      | Updated body content (non-empty) |

```json
{
  "title": "Updated Title",
  "content": "Updated content goes here."
}
```

#### Response Body

| Field         | Type      | Description          |
|---------------|-----------|----------------------|
| `success`     | `boolean` | `true`               |
| `updatedNote` | `object`  | The updated note     |
| `message`     | `string`  | Confirmation message |

```json
{
  "success": true,
  "updatedNote": {
    "id": 1,
    "title": "Updated Title",
    "content": "Updated content goes here.",
    "userId": 1,
    "createdAt": "2026-07-05T09:00:00.000Z",
    "updatedAt": "2026-07-05T10:00:00.000Z"
  },
  "message": "Note Updated Successfully"
}
```

#### Errors

| Status | When                                             |
|--------|--------------------------------------------------|
| `400`  | Validation failure or invalid `id`               |
| `403`  | Note belongs to another user                     |
| `404`  | Note does not exist                              |

---

### 5. Delete Note

| Field        | Value               |
|--------------|---------------------|
| **Method**   | `DELETE`            |
| **Endpoint** | `/api/v1/notes/:id` |
| **Auth**     | Required            |
| **Status**   | `200 OK`            |

#### URL Parameters

| Param | Type      | Required | Description     |
|-------|-----------|----------|-----------------|
| `id`  | `integer` | Yes      | The note's `id` |

#### Response Body

```json
{
  "success": true,
  "message": "Note Deleted Successfully"
}
```

#### Errors

| Status | When                             |
|--------|----------------------------------|
| `400`  | `id` is not a positive integer   |
| `403`  | Note belongs to another user     |
| `404`  | Note does not exist              |

---

## Health Check

Three unauthenticated, non-rate-limited endpoints:

| Endpoint  | Purpose   | Success | Body |
|-----------|-----------|---------|------|
| `GET /`       | Basic ping   | `200`   | plain text `API Server Running` |
| `GET /health` | Liveness (process up; no dependencies touched) | `200` | `{ "status": "ok", "uptime": <seconds>, "timestamp": "<iso>" }` |
| `GET /ready`  | Readiness (checks PostgreSQL; Redis reported but not fatal) | `200` ready / `503` not ready | `{ "status": "ready", "checks": { "database": "up", "redis": "up" } }` |

`/health` is the probe wired into `railway.json`, the Dockerfile `HEALTHCHECK`, and the Compose `api` healthcheck. Use `/ready` in a load balancer to gate traffic until the database is reachable.

---

## Data Schemas

Both entities live in PostgreSQL and are managed by Prisma. See
[`prisma/schema.prisma`](../prisma/schema.prisma) for the authoritative definition.

### User

| Field       | Type       | Description                                     |
|-------------|------------|-------------------------------------------------|
| `id`        | `Int`      | Auto-incrementing primary key                   |
| `name`      | `String`   | Display name                                    |
| `email`     | `String`   | Unique email address (stored lowercase)         |
| `password`  | `String`   | bcrypt-hashed password (never returned)         |
| `createdAt` | `DateTime` | Timestamp when user was created                 |

### Note

| Field       | Type       | Description                                     |
|-------------|------------|-------------------------------------------------|
| `id`        | `Int`      | Auto-incrementing primary key                   |
| `title`     | `String`   | Title of the note (trimmed, max 200 chars)      |
| `content`   | `String`   | Body content of the note                        |
| `userId`    | `Int`      | Foreign key to the owning user (`ON DELETE CASCADE`) |
| `createdAt` | `DateTime` | Timestamp when note was created                 |
| `updatedAt` | `DateTime` | Timestamp when note was last updated            |

---

## Error Responses

All errors — route errors, auth failures, validation failures, unknown routes —
flow through a central error handler and share a consistent shape:

| Field     | Type       | Description                                            |
|-----------|------------|--------------------------------------------------------|
| `success` | `boolean`  | Always `false` on error                                |
| `message` | `string`   | Human-readable error description                       |
| `errors`  | `object[]` | Validation failures only: `{ field, message }` entries |
| `stack`   | `string`   | Development only (`NODE_ENV !== 'production'`)         |

```json
{
  "success": false,
  "message": "Validation Error",
  "errors": [
    { "field": "email", "message": "Invalid email address" }
  ]
}
```

Requests to undefined routes return `404` with `"Route <METHOD> <path> not found"`.

### HTTP Status Codes Used

| Status | Meaning                                                        |
|--------|----------------------------------------------------------------|
| `400`  | Bad Request — validation failure or malformed `id`             |
| `401`  | Unauthorized — missing/invalid/expired JWT, or bad credentials |
| `403`  | Forbidden — attempting to modify another user's profile or note |
| `404`  | Not Found — resource or route does not exist                   |
| `409`  | Conflict — email already registered / duplicate value          |
| `500`  | Internal Server Error — unexpected server error                |
