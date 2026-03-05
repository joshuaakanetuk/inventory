import { NextResponse } from "next/server";
import { query, run } from "@/lib/db";

export async function GET() {
  const users = await query("SELECT name FROM users ORDER BY name");
  return NextResponse.json(users.map((u) => u.name));
}

export async function POST(request) {
  const { name } = await request.json();
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    await run("INSERT INTO users (name) VALUES (?)", [name.trim()]);
    return NextResponse.json({ name: name.trim() }, { status: 201 });
  } catch (err) {
    // SQLite: SQLITE_CONSTRAINT_UNIQUE, Postgres: error code 23505
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE" || err.code === "23505") {
      return NextResponse.json(
        { error: "User already exists" },
        { status: 409 }
      );
    }
    throw err;
  }
}
