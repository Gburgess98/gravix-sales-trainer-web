"use client";

import { useEffect, useState } from "react";

export default function AdminRepsPage() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("rep");
  const [managerId, setManagerId] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<{ used: number; max: number } | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [visibilityScope, setVisibilityScope] = useState("team");
  const [officeId, setOfficeId] = useState(() => {
    if (typeof window === "undefined") return "office_1";

    return (
      localStorage.getItem("active_office_id") ||
      "office_1"
    );
  });

  const uid =
    typeof window !== "undefined"
      ? localStorage.getItem("uid") || ""
      : "";

  useEffect(() => {
    fetch("/api/proxy/v1/admin/users", {
      headers: { "x-user-id": uid, "x-active-office-id": officeId },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.users) setUsers(d.users);
        const savedOffice = localStorage.getItem("active_office_id");

        if (savedOffice) {
          setOfficeId(savedOffice);
        }
        fetch("/api/proxy/v1/admin/usage", {
          headers: { "x-user-id": uid, "x-active-office-id": officeId },
        })
          .then((r) => r.json())
          .then((d) => {
            if (d?.usage) setUsage(d.usage);
          });
      });

    if (officeId) {
      localStorage.setItem("active_office_id", officeId);
    }
  }, []);

  async function createUser() {
    if (!email) {
      alert("Email required");
      return;
    }

    if (role === "rep" && !managerId) {
      alert("Please assign a manager for reps");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/proxy/v1/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": uid,
        "x-active-office-id": officeId,
      },
      body: JSON.stringify({
        email,
        role,
        manager_id: role === "rep" ? managerId : null,
        visibility_scope:
          role === "office_manager" || role === "company_manager"
            ? visibilityScope
            : "team",
        office_id: officeId,
      }),
    });

    const data = await res.json();

    if (data.ok) {
      alert("User created successfully");
      setEmail("");
      setManagerId("");
      setVisibilityScope("team");

      const r = await fetch("/api/proxy/v1/admin/users", {
        headers: { "x-user-id": uid, "x-active-office-id": officeId },
      });
      const d = await r.json();
      setUsers(d.users || []);

      const u = await fetch("/api/proxy/v1/admin/usage", {
        headers: { "x-user-id": uid, "x-active-office-id": officeId },
      });
      const uData = await u.json();
      if (uData?.usage) setUsage(uData.usage);
    } else {
      alert(data.error || "Failed to create user");
    }

    setLoading(false);
  }

  return (
    <div className="p-6 space-y-6 text-white">
      <h1 className="text-2xl font-semibold">Admin • User Management</h1>

      {usage && (
        <div className="p-4 border border-neutral-700 rounded bg-neutral-800 flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-400">Seat Usage</div>
            <div className="text-lg font-semibold">
              {usage.used} / {usage.max} users
            </div>
          </div>

          {usage.used >= usage.max && (
            <button
              onClick={() => setShowUpgrade(true)}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded text-sm font-medium"
            >
              Upgrade Plan
            </button>
          )}
        </div>
      )}

      <div className="p-4 border border-blue-900/40 rounded-xl bg-blue-950/20 flex items-center justify-between">
        <div>
          <div className="text-xs text-blue-300 uppercase tracking-wide">
            Active Office Context
          </div>

          <div className="text-sm text-white font-medium">
            {officeId.replace("_", " ")}
          </div>
        </div>

        <select
          value={officeId}
          onChange={(e) => {
            setOfficeId(e.target.value);
            localStorage.setItem("active_office_id", e.target.value);
          }}
          className="border border-neutral-700 bg-neutral-800 px-3 py-2 rounded text-white"
        >
          <option value="office_1">Office 1</option>
          <option value="office_2">Office 2</option>
          <option value="office_3">Office 3</option>
        </select>
      </div>

      <div className="p-6 border border-neutral-700 rounded-xl bg-neutral-900 space-y-4 shadow-lg">
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border border-neutral-700 bg-neutral-800 px-3 py-2 w-full rounded text-white placeholder-gray-400"
        />

        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);

            if (e.target.value !== "rep") {
              setManagerId("");
            }

            if (
              e.target.value !== "office_manager" &&
              e.target.value !== "company_manager"
            ) {
              setVisibilityScope("team");
            }
          }}
          className="border border-neutral-700 bg-neutral-800 px-3 py-2 w-full rounded text-white"
        >
          <option value="rep">Rep</option>
          <option value="office_manager">Office Manager</option>
          <option value="company_manager">Company Manager</option>
        </select>

        <div className="space-y-2">
          <label className="text-sm text-gray-400">
            Office / Branch
          </label>

          <select
            value={officeId}
            onChange={(e) => setOfficeId(e.target.value)}
            className="border border-neutral-700 bg-neutral-800 px-3 py-2 w-full rounded text-white"
          >
            <option value="office_1">Office 1</option>
            <option value="office_2">Office 2</option>
            <option value="office_3">Office 3</option>
          </select>
        </div>

        <select
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
          disabled={role !== "rep"}
          className="border border-neutral-700 bg-neutral-800 px-3 py-2 w-full rounded text-white disabled:opacity-50"
        >
          <option value="">
            {role === "rep" ? "Select Manager" : "Not required"}
          </option>

          {users.filter(
            (u) =>
              u.role === "office_manager" ||
              u.role === "company_manager"
          ).length === 0 && (
            <option disabled>No managers yet</option>
          )}

          {users
            .filter((u) => {
              // only managers/admins can manage reps
              const validRole =
                u.role === "office_manager" ||
                u.role === "company_manager";

              // office-aware filtering
              const sameOffice =
                !u.office_id ||
                !officeId ||
                u.office_id === officeId;

              return validRole && sameOffice;
            })
            .sort((a, b) =>
              String(a.email || "").localeCompare(
                String(b.email || "")
              )
            )
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
                {u.office_id
                  ? ` (${String(u.office_id).replace("_", " ")})`
                  : ""}
              </option>
            ))}
        </select>

        {(role === "office_manager" ||
          role === "company_manager") && (
          <div className="space-y-2">
            <label className="text-sm text-gray-400">
              Manager Visibility
            </label>

            <select
              value={visibilityScope}
              onChange={(e) => setVisibilityScope(e.target.value)}
              className="border border-neutral-700 bg-neutral-800 px-3 py-2 w-full rounded text-white"
            >
              <option value="team">Team Only</option>
              <option value="company">Entire Company</option>
            </select>

            <p className="text-xs text-gray-500">
              Team Only = office manager only sees assigned reps.
              Entire Company = company manager can view all reps in the organisation.
            </p>
          </div>
        )}

        {usage && usage.used >= usage.max && (
          <div className="text-sm text-red-400">
            You’ve reached your user limit. Upgrade to add more users.
          </div>
        )}

        <button
          onClick={createUser}
          disabled={loading || (usage ? usage.used >= usage.max : false)}
          className="bg-white text-black px-4 py-2 rounded font-medium hover:bg-gray-200 transition"
        >
          {loading
            ? "Creating..."
            : usage && usage.used >= usage.max
              ? "User Limit Reached"
              : "Create User"}
        </button>
      </div>

      <div>
        <h2 className="font-semibold mb-3 text-lg">Users</h2>

        <div className="space-y-2">
          {users.map((u) => {
            const manager = users.find((m) => m.id === u.manager_id);

            return (
              <div
                key={u.id}
                className="p-4 border border-neutral-700 rounded bg-neutral-900 flex justify-between items-center"
              >
                <div>
                  <div className="font-medium">{u.email}</div>
                  <div className="text-xs text-gray-400 flex items-center gap-2 flex-wrap">
                    <span>{u.role}</span>

                    {(u.role === "office_manager" ||
                      u.role === "company_manager") && (
                      <span className="text-xs px-2 py-1 rounded bg-neutral-700 text-gray-300">
                        {u.visibility_scope === "company"
                          ? "Company Access"
                          : "Team Access"}
                      </span>
                    )}

                    {u.office_id && (
                      <span className="text-xs px-2 py-1 rounded bg-blue-900/40 text-blue-300">
                        {u.office_id.replace("_", " ")}
                      </span>
                    )}

                    {manager && <span>• Manager: {manager.email}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showUpgrade && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-xl font-semibold">Upgrade Your Plan</h2>
            <p className="text-sm text-gray-400">
              You’ve reached your user limit. Choose a plan to continue.
            </p>

            <div className="space-y-3">
              <div className="p-4 border border-neutral-700 rounded bg-neutral-800">
                <div className="font-medium">Starter</div>
                <div className="text-sm text-gray-400">Up to 3 users</div>
              </div>

              <div className="p-4 border border-neutral-700 rounded bg-neutral-800">
                <div className="font-medium">Pro</div>
                <div className="text-sm text-gray-400">Up to 10 users</div>
              </div>

              <div className="p-4 border border-neutral-700 rounded bg-neutral-800">
                <div className="font-medium">Team</div>
                <div className="text-sm text-gray-400">Up to 25 users</div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <button
                onClick={() => setShowUpgrade(false)}
                className="px-4 py-2 text-sm text-gray-400"
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  alert("Stripe integration coming next");
                  setShowUpgrade(false);
                }}
                className="bg-white text-black px-4 py-2 rounded text-sm font-medium"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}