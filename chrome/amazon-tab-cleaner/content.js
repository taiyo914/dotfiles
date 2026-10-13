const updateTitle = () => {
  const currentTitle = document.title;
  let newTitle = currentTitle;

  // 1. ページ判定
  const isHome = /^\/(ref=.*)?$/.test(location.pathname);
  const isSearch = location.pathname === "/s" || location.search.includes("k=");
  const isReview = location.pathname.includes("/product-reviews/");

  if (isHome) {
    // 1. ホーム
    newTitle = "ホーム";
  } else if (isReview) {
    // 2. レビューページ
    const reviewBrandElement = document.querySelector("#cr-arp-byline a");
    if (reviewBrandElement) {
      const brandName = reviewBrandElement.innerText.trim();
      newTitle = `${brandName}-レビュー`;
    }
  } else if (isSearch) {
    // 3. 検索ページ
    const pattern = /^Amazon.co.jp[ :　：]+/;
    newTitle = currentTitle.replace(pattern, "検索：");
  } else {
    // 4. 商品ページ
    const brandElement =
      document.querySelector("#bylineInfo") ||
      document.querySelector("#brand") ||
      document.querySelector(".po-brand .a-span9");

    let brand = brandElement ? brandElement.innerText.trim() : "";
    brand = brand.replace(/^(ブランド|Brand|メーカー|Manufacturer):\s*/, "");
    brand = brand.replace(/のストアを表示$/, "");

    const priceElement = document.querySelector(".a-price-whole");
    const price = priceElement ? priceElement.innerText.trim() : "";

    if (brand && price) {
      newTitle = `${brand}-${price}円`;
    }
  }

  document.title = newTitle;
};

updateTitle();
