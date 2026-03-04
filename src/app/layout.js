export const metadata = {
  title: "Hominventory",
  description: "Home inventory tracker with barcode scanning.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
