const BASE = "http://localhost:5000";

async function request(path, opts = {}) {
  const res = await fetch(BASE + path, opts);
  let body;
  try {
    body = await res.json();
  } catch (e) {
    body = await res.text();
  }
  return { status: res.status, body };
}

async function login(email, password) {
  return await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

async function main() {
  console.log("Logging in seeded users...");
  const userLogin = await login("user@expenseapp.io", "user123");
  const managerLogin = await login("manager@expenseapp.io", "manager123");
  const adminLogin = await login("admin@expenseapp.io", "admin123");

  const userToken = userLogin.body.token;
  const managerToken = managerLogin.body.token;
  const adminToken = adminLogin.body.token;

  console.log("User token present:", !!userToken);
  console.log("Manager token present:", !!managerToken);
  console.log("Admin token present:", !!adminToken);

  // Manager creates an expense (to be edited/approved)
  console.log("\nManager creating an expense...");
  const newExpense = await request("/api/expenses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${managerToken}`,
    },
    body: JSON.stringify({
      title: "Manager Test Expense",
      amount: 50,
      category: "travel",
    }),
  });
  console.log("Create expense:", newExpense.status, newExpense.body);
  const expenseId = newExpense.body._id;

  // Tests as regular user
  console.log("\n1) Regular user attempts to APPROVE expense (should be 403)");
  const t1 = await request(`/api/expenses/${expenseId}/approve`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  console.log(t1.status, t1.body);

  console.log("\n2) Regular user attempts to DELETE expense (should be 403)");
  const t2 = await request(`/api/expenses/${expenseId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  console.log(t2.status, t2.body);

  console.log(
    "\n3) Regular user attempts to CHANGE role of manager (should be 403)",
  );
  const t3 = await request(`/api/users/${managerLogin.body._id}/role`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({ role: "admin" }),
  });
  console.log(t3.status, t3.body);

  console.log(
    "\n4) Regular user attempts to EDIT manager-owned expense (should be 403)",
  );
  const t4 = await request(`/api/expenses/${expenseId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({ title: "Malicious edit" }),
  });
  console.log(t4.status, t4.body);

  // Manager approves expense (should be 200)
  console.log("\n5) Manager approves expense (should be 200)");
  const t5 = await request(`/api/expenses/${expenseId}/approve`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${managerToken}` },
  });
  console.log(t5.status, t5.body);

  // Manager tries to change a user's role (should be 403)
  console.log(
    "\n6) Manager attempts to change regular user role (should be 403)",
  );
  const t6 = await request(`/api/users/${userLogin.body._id}/role`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${managerToken}`,
    },
    body: JSON.stringify({ role: "manager" }),
  });
  console.log(t6.status, t6.body);

  // Admin deletes expense (should be 200)
  console.log("\n7) Admin deletes expense (should be 200)");
  const t7 = await request(`/api/expenses/${expenseId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log(t7.status, t7.body);

  // Admin changes a user's role (should be 200)
  console.log(
    "\n8) Admin changes regular user role to manager (should be 200)",
  );
  const t8 = await request(`/api/users/${userLogin.body._id}/role`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ role: "manager" }),
  });
  console.log(t8.status, t8.body);

  // Extra: regular user trying to view all expenses (should be 403)
  console.log("\n9) Regular user GET /api/expenses (should be 403)");
  const t9 = await request("/api/expenses", {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  console.log(t9.status, t9.body);

  // Extra: manager GET /api/expenses (should be 200)
  console.log("\n10) Manager GET /api/expenses (should be 200)");
  const t10 = await request("/api/expenses", {
    headers: { Authorization: `Bearer ${managerToken}` },
  });
  console.log(
    t10.status,
    Array.isArray(t10.body) ? `array(${t10.body.length})` : t10.body,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
