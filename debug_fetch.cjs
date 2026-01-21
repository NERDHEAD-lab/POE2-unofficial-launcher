const { parse } = require("node-html-parser");

async function debugFetch() {
  const url = "https://www.pathofexile.com/forum/view-forum/2211";
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  console.log(`[Debug] Fetching ${url}...`);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": userAgent },
    });

    console.log(`[Debug] Status: ${response.status} ${response.statusText}`);
    const html = await response.text();
    console.log(`[Debug] HTML length: ${html.length}`);
    console.log(
      `[Debug] HTML Preview (first 500 chars): \n${html.substring(0, 500)}`,
    );

    if (
      html.includes("cf-browser-verification") ||
      html.includes("Cloudflare")
    ) {
      console.log("[Debug] Cloudflare/Bot protection detected!");
    }

    const root = parse(html);
    const table = root.querySelector("table.forumTable");
    console.log(`[Debug] table.forumTable found: ${!!table}`);

    if (table) {
      const rows = table.querySelectorAll("tr");
      console.log(`[Debug] Rows count: ${rows.length}`);

      const firstRow = rows[1]; // Skip header
      if (firstRow) {
        const titleAnchor = firstRow.querySelector(".title a");
        console.log(`[Debug] First Row .title a found: ${!!titleAnchor}`);
        if (titleAnchor) {
          console.log(`[Debug] Title Text: ${titleAnchor.innerText.trim()}`);
          console.log(`[Debug] Link: ${titleAnchor.getAttribute("href")}`);
        }

        const dateEl = firstRow.querySelector(".post_date");
        console.log(`[Debug] First Row .post_date found: ${!!dateEl}`);
        if (dateEl) {
          console.log(`[Debug] Date Text: ${dateEl.innerText.trim()}`);
        }
      }
    }
  } catch (err) {
    console.error(`[Debug] Fetch error:`, err);
  }
}

debugFetch();
