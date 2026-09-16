export default async function handler(req: any, res: any) {
  const url = req.query.url as string;
  if (!url) {
    return res.status(400).json({ error: "Missing url parameter" });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
      },
    });

    if (!response.ok) {
      return res.status(response.status).send(`Failed to fetch PDF: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", response.headers.get("content-type") || "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="document.pdf"');
    return res.send(buffer);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Failed to proxy download PDF" });
  }
}
