import { NextResponse } from "next/server";

// GET /api/tmdb?query=Movie+Title  — search TMDB for a movie by title
export async function GET(request) {
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "TMDB_API_KEY not configured" },
      { status: 501 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");

  if (!query) {
    return NextResponse.json(
      { error: "query is required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(query)}&page=1`
    );

    if (!res.ok) {
      return NextResponse.json({ error: "TMDB request failed" }, { status: 502 });
    }

    const data = await res.json();

    if (data.results && data.results.length > 0) {
      const movie = data.results[0];
      // Include year for disambiguation
      const year = movie.release_date ? ` (${movie.release_date.slice(0, 4)})` : "";
      return NextResponse.json({ name: `${movie.title}${year}` });
    }

    return NextResponse.json({ name: null });
  } catch {
    return NextResponse.json({ error: "TMDB lookup failed" }, { status: 502 });
  }
}
