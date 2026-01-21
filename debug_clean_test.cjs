const { parse } = require("node-html-parser");

async function testCleanContent() {
  const url = "https://poe.game.daum.net/forum/view-thread/302485"; // Kakao thread
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  const html = await response.text();
  const root = parse(html);

  const content =
    root.querySelector(".forumPost .content") ||
    root.querySelector(".content-container .content") ||
    root.querySelector(".content");

  if (!content) {
    console.log("Content not found");
    return;
  }

  console.log("--- BEFORE CLEANING ---");
  // console.log(content.innerHTML);

  const unwantedSelectors = [
    ".post_author_info",
    ".report_button",
    ".content-footer",
    ".social-buttons",
    "script",
    "style",
    ".post_author", // Possible Kakao selector
    ".posted-by", // Possible GGG selector
  ];

  unwantedSelectors.forEach((sel) => {
    content.querySelectorAll(sel).forEach((el) => {
      console.log(`Removing ${sel}`);
      el.remove();
    });
  });

  console.log("--- AFTER CLEANING ---");
  console.log(
    content.innerHTML.trim().substring(content.innerHTML.trim().length - 500),
  );
}

testCleanContent();
