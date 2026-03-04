import { NextResponse } from "next/server";
import getDb from "@/lib/db";

// GET /api/items  — returns all items (optionally filtered by ?user=)
export function GET(request) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const user = searchParams.get("user");

  let items;
  if (user) {
    items = db
      .prepare("SELECT * FROM items WHERE added_by = ? ORDER BY added_at DESC")
      .all(user);
  } else {
    items = db.prepare("SELECT * FROM items ORDER BY added_at DESC").all();
  }

  return NextResponse.json(items);
}

// POST /api/items  — create item or increment qty if barcode exists
export async function POST(request) {
  const { name, barcode, added_by } = await request.json();

  if (!name || !added_by) {
    return NextResponse.json(
      { error: "name and added_by are required" },
      { status: 400 }
    );
  }

  const db = getDb();

  // If barcode provided, check for existing item
  if (barcode) {
    const existing = db
      .prepare("SELECT * FROM items WHERE barcode = ?")
      .get(barcode);

    if (existing) {
      db.prepare("UPDATE items SET qty = qty + 1 WHERE id = ?").run(existing.id);
      const updated = db.prepare("SELECT * FROM items WHERE id = ?").get(
        existing.id
      );
      return NextResponse.json({ item: updated, incremented: true });
    }
  }

  const result = db
    .prepare(
      "INSERT INTO items (name, barcode, qty, added_by) VALUES (?, ?, 1, ?)"
    )
    .run(name, barcode || null, added_by);

  const item = db
    .prepare("SELECT * FROM items WHERE id = ?")
    .get(result.lastInsertRowid);

  return NextResponse.json({ item, incremented: false }, { status: 201 });
}

// PUT /api/items  — update quantity: { id, delta } where delta is +1 or -1
export async function PUT(request) {
  const { id, delta } = await request.json();

  if (!id || delta === undefined) {
    return NextResponse.json(
      { error: "id and delta are required" },
      { status: 400 }
    );
  }

  const db = getDb();
  db.prepare(
    "UPDATE items SET qty = MAX(0, qty + ?) WHERE id = ?"
  ).run(delta, id);

  const item = db.prepare("SELECT * FROM items WHERE id = ?").get(id);
  return NextResponse.json(item);
}

// DELETE /api/items?id=123
export function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getDb();
  db.prepare("DELETE FROM items WHERE id = ?").run(id);
  return NextResponse.json({ deleted: true });
}
