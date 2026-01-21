const { parse } = require("node-html-parser");

async function debugThreadFetch() {
  const url = "https://www.pathofexile.com/forum/view-thread/3907125"; // Example thread from earlier
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  console.log(`[Debug] Fetching thread ${url}...`);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": userAgent },
    });

    console.log(`[Debug] Status: ${response.status}`);
    const html = await response.text();
    console.log(`[Debug] HTML length: ${html.length}`);

    const root = parse(html);

    // Test various possible selectors
    const selectors = [
      ".forumPost .content",
      "tr:first-child .content",
      ".content",
      ".forumPostContainer .content",
    ];

    for (const selector of selectors) {
      const el = root.querySelector(selector);
      console.log(`[Debug] Selector '${selector}' found: ${!!el}`);
      if (el) {
        console.log(
          `[Debug] Preview: ${el.innerText.trim().substring(0, 100)}...`,
        );
      }
    }
  } catch (err) {
    console.error(`[Debug] Fetch error:`, err);
  }
}

debugThreadFetch();
