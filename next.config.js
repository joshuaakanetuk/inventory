/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow better-sqlite3 native module
  serverExternalPackages: ["better-sqlite3", "pg"],
};

module.exports = nextConfig;
