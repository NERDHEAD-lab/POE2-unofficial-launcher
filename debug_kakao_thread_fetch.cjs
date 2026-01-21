const { parse } = require("node-html-parser");

async function debugKakaoThreadFetch() {
  const url = "https://poe.game.daum.net/forum/view-thread/302485"; // Example Kakao thread
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  console.log(`[Debug] Fetching Kakao thread ${url}...`);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        Referer: "https://poe.game.daum.net/forum/view-forum/news2",
      },
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

debugKakaoThreadFetch();
