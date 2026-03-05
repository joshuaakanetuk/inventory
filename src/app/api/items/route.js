import { NextResponse } from "next/server";
import { query, queryOne, run } from "@/lib/db";

// GET /api/items  — returns all items (optionally filtered by ?user=)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const user = searchParams.get("user");

  let items;
  if (user) {
    items = await query(
      "SELECT * FROM items WHERE added_by = ? ORDER BY added_at DESC",
      [user]
    );
  } else {
    items = await query("SELECT * FROM items ORDER BY added_at DESC");
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

  // If barcode provided, check for existing item
  if (barcode) {
    const existing = await queryOne(
      "SELECT * FROM items WHERE barcode = ?",
      [barcode]
    );

    if (existing) {
      await run("UPDATE items SET qty = qty + 1 WHERE id = ?", [existing.id]);
      const updated = await queryOne("SELECT * FROM items WHERE id = ?", [
        existing.id,
      ]);
      return NextResponse.json({ item: updated, incremented: true });
    }
  }

  const result = await run(
    "INSERT INTO items (name, barcode, qty, added_by) VALUES (?, ?, 1, ?)",
    [name, barcode || null, added_by]
  );

  const item = await queryOne("SELECT * FROM items WHERE id = ?", [
    result.lastId,
  ]);

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

  // GREATEST works in Postgres; in SQLite 3.35+ MAX works the same way.
  // Both support MAX() in this context.
  await run("UPDATE items SET qty = MAX(0, qty + ?) WHERE id = ?", [delta, id]);

  const item = await queryOne("SELECT * FROM items WHERE id = ?", [id]);
  return NextResponse.json(item);
}

// DELETE /api/items?id=123
export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await run("DELETE FROM items WHERE id = ?", [id]);
  return NextResponse.json({ deleted: true });
}
