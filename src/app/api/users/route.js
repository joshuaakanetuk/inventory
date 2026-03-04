import { NextResponse } from "next/server";
import getDb from "@/lib/db";

export function GET() {
  const db = getDb();
  const users = db.prepare("SELECT name FROM users ORDER BY name").all();
  return NextResponse.json(users.map((u) => u.name));
}

export async function POST(request) {
  const { name } = await request.json();
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const db = getDb();
  try {
    db.prepare("INSERT INTO users (name) VALUES (?)").run(name.trim());
    return NextResponse.json({ name: name.trim() }, { status: 201 });
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return NextResponse.json({ error: "User already exists" }, { status: 409 });
    }
    throw err;
  }
}
