// Simple affiliate helper to append Amazon affiliate tag to Amazon links inside HTML

function addTagToUrl(url, tag){
  try{
    const u = new URL(url);

    // If tag already present, skip
    if(u.searchParams.get("tag")) return u.toString();

    if(tag){
      u.searchParams.set("tag", tag);
    }

    return u.toString();
  }catch(e){
    // not a full URL (maybe a short amzn.to), just append tag if possible
    if(tag && url.includes("amzn.to")){
      return url + (url.includes("?") ? `&tag=${tag}` : `?tag=${tag}`);
    }
    return url;
  }
}

export function applyAmazonAffiliate(html, tag){
  if(!tag) return html;

  // find href="..." and href='...'
  return html.replace(/href=("|')(.*?)\1/gi, (m, q, href) => {
    const lower = href.toLowerCase();

    if(lower.includes('amazon.') || lower.includes('amzn.to')){
      const newUrl = addTagToUrl(href, tag);
      return `href=${q}${newUrl}${q}`;
    }

    return m;
  });

}

export default { applyAmazonAffiliate };
