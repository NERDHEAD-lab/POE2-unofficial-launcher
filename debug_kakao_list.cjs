const { parse } = require("node-html-parser");

async function debugKakaoList() {
  const url = "https://poe.game.daum.net/forum/view-forum/news2";
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  console.log(`[Debug] Fetching Kakao news list ${url}...`);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": userAgent },
    });

    const html = await response.text();
    const root = parse(html);

    const table =
      root.getElementById("view_forum_table") ||
      root.querySelector(".forumTable");
    console.log(`[Debug] Table found: ${!!table}`);

    if (table) {
      const rows = table.querySelectorAll("tr");
      console.log(`[Debug] Total rows: ${rows.length}`);

      for (let i = 0; i < Math.min(rows.length, 5); i++) {
        const row = rows[i];
        const titleAnchor = row.querySelector(".title a");
        const dateEl = row.querySelector(".post_date");

        console.log(
          `[Row ${i}] Title found: ${!!titleAnchor}, Date el found: ${!!dateEl}`,
        );
        if (titleAnchor)
          console.log(`  Title: ${titleAnchor.innerText.trim()}`);
        if (dateEl) console.log(`  Date Raw: ${dateEl.innerText.trim()}`);
      }
    }
  } catch (err) {
    console.error(`[Debug] Fetch error:`, err);
  }
}

debugKakaoList();
