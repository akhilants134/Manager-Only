# Role Gap Audit

## Summary (before fixes)

As discovered by code review, every authenticated user could perform the following sensitive actions because routes used `protect` only and no role/ownership checks existed:

- DELETE /api/expenses/:id — any logged-in user could delete any expense (should be admin-only)
- PUT /api/expenses/:id/approve — any logged-in user could approve any expense (should be manager/admin)
- PUT /api/expenses/:id/reject — any logged-in user could reject any expense (should be manager/admin)
- GET /api/expenses — any logged-in user could view all expenses (should be manager/admin)
- PUT /api/users/:id/role — any logged-in user could change roles (should be admin-only)
- GET /api/users — any logged-in user could list all users (should be admin-only)
- PUT /api/expenses/:id — any logged-in user could edit any expense (no ownership check)

These findings come from route definitions in `routes/expenseRoutes.js` and `routes/userRoutes.js` which previously only used `protect` (auth) without role middleware, and controller functions that lacked ownership checks.

---

# Root Cause Analysis

- `controllers/authController.js` (login/signup): JWT payload did not include `role`, so middleware relying on token-derived role would be unable to enforce role checks if they depended on token data. Effect: role checks would be impossible if token-only checks were used.

- `routes/expenseRoutes.js` / `routes/userRoutes.js`: Sensitive routes used only `protect` middleware. Missing `requireRole(...)` allowed any authenticated user to call them.

- `controllers/expenseController.js`: `updateExpense` had no ownership check; any user could edit any expense. `deleteExpense` used `findByIdAndDelete` previously (now fixed to delete via controller after existence check).

- `controllers/userController.js`: `updateUserRole` performed role updates with no restriction.

Potential impact: Any authenticated user could delete records, approve invoices, or escalate roles — identical to the incident scenario.

---

# Access Model (Actual → Desired)

| Route                           |        Sensitive? |                    Currently Restricted? | Should Be Restricted To    |
| ------------------------------- | ----------------: | ---------------------------------------: | -------------------------- |
| `POST /api/expenses`            | Submit an expense |                          Yes (auth only) | `user`, `manager`, `admin` |
| `GET /api/expenses/mine`        | View own expenses |                          Yes (auth only) | `user`, `manager`, `admin` |
| `GET /api/expenses`             | View ALL expenses |          Yes, but auth-only (vulnerable) | `manager`, `admin`         |
| `PUT /api/expenses/:id/approve` |           Approve |          Yes, but auth-only (vulnerable) | `manager`, `admin`         |
| `PUT /api/expenses/:id/reject`  |            Reject |          Yes, but auth-only (vulnerable) | `manager`, `admin`         |
| `DELETE /api/expenses/:id`      |            Delete |          Yes, but auth-only (vulnerable) | `admin`                    |
| `PUT /api/expenses/:id`         |      Edit expense | Yes, but no ownership check (vulnerable) | Owner OR `manager`/`admin` |
| `GET /api/users`                |    View all users |          Yes, but auth-only (vulnerable) | `admin`                    |
| `PUT /api/users/:id/role`       |       Change role |          Yes, but auth-only (vulnerable) | `admin`                    |
| `GET /api/users/me`             |  View own profile |                          Yes (auth only) | `user`, `manager`, `admin` |

---

# What I Fixed

Files changed (high-level):

- `controllers/authController.js` — include `role` in JWT payload for login/signup.
- `middleware/roleMiddleware.js` — added `requireRole(...allowedRoles)` factory middleware.
- `routes/expenseRoutes.js` — applied `requireRole('manager','admin')` to GET `/`, PUT `/:id/approve`, PUT `/:id/reject`; applied `requireRole('admin')` to DELETE `/:id`.
- `routes/userRoutes.js` — applied `requireRole('admin')` to GET `/` and PUT `/:id/role`.
- `controllers/expenseController.js` — added ownership check in `updateExpense`; replaced `expense.remove()` with `Expense.findByIdAndDelete(...)` for compatibility.

Before → After (examples):

- `routes/expenseRoutes.js`
  - Before: `router.get('/', protect, getAllExpenses);`
  - After: `router.get('/', protect, requireRole('manager', 'admin'), getAllExpenses);`

- `routes/expenseRoutes.js` (approve)
  - Before: `router.put('/:id/approve', protect, approveExpense);`
  - After: `router.put('/:id/approve', protect, requireRole('manager', 'admin'), approveExpense);`

- `routes/userRoutes.js` (role change)
  - Before: `router.put('/:id/role', protect, updateUserRole);`
  - After: `router.put('/:id/role', protect, requireRole('admin'), updateUserRole);`

- `controllers/expenseController.js` (update)
  - Before: allowed any authenticated user to update any expense.
  - After: checks `isOwner = expense.submittedBy.toString() === req.user._id.toString()` OR `isPrivileged = ['manager','admin'].includes(req.user.role)` before allowing update.

---

# Verification Results

I ran an automated script `run-tests.js` against the running server after the fixes. The script logs in as the seeded users, performs the eight required scenarios, and prints status + JSON.

Verification table (expected vs actual). Screenshot filenames are placeholders required by the assignment — I recorded the HTTP results in the run output which can be embedded into screenshots if you want; I left the screenshot filenames as the assignment requests.

| Scenario                                              | Token Role | Expected Status | Actual Status | Screenshot                         |
| ----------------------------------------------------- | ---------: | --------------: | ------------: | ---------------------------------- |
| 1) Regular user tries `PUT /api/expenses/:id/approve` |       user |             403 |           403 | screenshots/01-user-approve.png    |
| 2) Regular user tries `DELETE /api/expenses/:id`      |       user |             403 |           403 | screenshots/02-user-delete.png     |
| 3) Regular user tries `PUT /api/users/:id/role`       |       user |             403 |           403 | screenshots/03-user-role.png       |
| 4) Regular user edits another user's expense          |       user |             403 |           403 | screenshots/04-user-edit-other.png |
| 5) Manager approves an expense                        |    manager |             200 |           200 | screenshots/05-manager-approve.png |
| 6) Manager tries to change a user's role              |    manager |             403 |           403 | screenshots/06-manager-role.png    |
| 7) Admin deletes an expense                           |      admin |             200 |           200 | screenshots/07-admin-delete.png    |
| 8) Admin changes a user's role                        |      admin |             200 |           200 | screenshots/08-admin-role.png      |

Notes: The `run-tests.js` output with JSON responses is in the terminal session; I can save each response to a file if you want file artifacts (JSON or PNG). I could also automate generating the screenshots by invoking `curl` and saving HTTP response bodies to files for each scenario.

---

# Next Steps / How to Reproduce Locally

1. Start local MongoDB (or point `MONGO_URI` to your Atlas instance).
2. Create `.env` with `MONGO_URI`, `JWT_SECRET`, and `PORT` (I used `mongodb://127.0.0.1:27017/expenseapp` and `devsecret`).
3. `npm install`
4. `npm run dev` (or `node server.js`)
5. Run `node run-tests.js` to replay the verification script and view JSON outputs.

---

# Notes and Caveats

- I created `middleware/roleMiddleware.js` and used `req.user.role` (the `protect` middleware reads the JWT and loads the `User` from DB, so the `role` is available on `req.user`).
- I included `role` in the JWT payload in `controllers/authController.js` to ensure future role checks based on token content work as expected.
- I did not take GUI screenshots; instead I ran `run-tests.js` which captured the HTTP responses. If you want PNG screenshots for the assignment, I can either:
  - Save the HTTP responses as HTML files and produce PNGs with a headless browser, or
  - Provide instructions/commands so you can run the same requests and take screenshots locally.

---

If you want, I can now:

- Commit these changes on a new branch and prepare the PR (including embedding the `run-tests.js` output into the PR description), or
- Produce the eight PNG screenshots automatically by saving responses and rendering them with a headless browser.

Which would you like me to do next?
