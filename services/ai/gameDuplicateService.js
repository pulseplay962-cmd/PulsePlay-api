const EDITION_TERMS = new Set(["remastered","remaster","remake","definitive","director","cut","deluxe","ultimate","complete","gold","goty","anniversary","enhanced","collector","collectors","edition"]);
function normalizeTitle(value) { return String(value || "").toLowerCase().replace(/[’']/g,"").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim(); }
function titleParts(value) { const tokens=normalizeTitle(value).split(" ").filter(Boolean); return {base:tokens.filter(t=>!EDITION_TERMS.has(t)).join(" "),edition:tokens.filter(t=>EDITION_TERMS.has(t)).sort().join(" ")}; }
function platformTokens(value) {
 const v=String(value||"").toLowerCase(), found=new Set();
 const patterns=[[/\b(?:ps5|playstation 5)\b/g,"ps5"],[/\b(?:ps4|playstation 4)\b/g,"ps4"],[/\b(?:xbox series x|xbox series s|xbox series x s|xbox series xs)\b/g,"xbox-series"],[/\b(?:xbox one)\b/g,"xbox-one"],[/\b(?:nintendo switch 2|switch 2)\b/g,"switch-2"],[/\b(?:nintendo switch|switch)\b/g,"switch"],[/\b(?:pc|windows|steam)\b/g,"pc"]];
 for(const [re,key] of patterns) if(re.test(v)) found.add(key); return found;
}
function platformRelation(a,b) { const x=platformTokens(a),y=platformTokens(b); if(!String(a||"").trim()||!String(b||"").trim()) return "unknown"; if(!x.size||!y.size) return String(a).trim().toLowerCase()===String(b).trim().toLowerCase()?"same":"unknown"; return [...x].some(k=>y.has(k))?"overlap":"different"; }
function tokenSimilarity(a,b) { const x=new Set(normalizeTitle(a).split(" ").filter(Boolean)),y=new Set(normalizeTitle(b).split(" ").filter(Boolean)); if(!x.size||!y.size)return 0; let n=0; for(const t of x)if(y.has(t))n++; return n/new Set([...x,...y]).size; }
function result(status,game) { return {status,match:game?{id:game.id,title:game.title,release_date:game.release_date||null,platform:game.platform||null}:null}; }
function compare(candidate,game) {
 const a=titleParts(candidate.title),b=titleParts(game.title); if(!a.base||a.base!==b.base)return null;
 if(a.edition!==b.edition)return "different";
 const ad=String(candidate.release_date||"").slice(0,10),bd=String(game.release_date||"").slice(0,10),p=platformRelation(candidate.platform,game.platform);
 if(p==="different")return "different";
 if(ad&&bd&&ad!==bd)return "possible";
 if(!ad||!bd||p==="unknown")return "possible";
 return "duplicate";
}
export function findGameDuplicate(candidate,games=[]) {
 if(!normalizeTitle(candidate?.title))return {status:"new",match:null};
 for(const game of games){const relation=compare(candidate,game||{});if(relation==="duplicate")return result("already_listed",game);if(relation==="possible")return result("possible_match",game);}
 const possible=games.map(game=>({game,similarity:tokenSimilarity(candidate.title,game?.title)})).filter(({game,similarity})=>{const a=titleParts(candidate.title),b=titleParts(game?.title);return similarity>=0.8&&normalizeTitle(game?.title).split(" ").filter(Boolean).length>=2&&a.edition===b.edition&&platformRelation(candidate.platform,game?.platform)!=="different";}).sort((a,b)=>b.similarity-a.similarity)[0];
 return possible?result("possible_match",possible.game):{status:"new",match:null};
}
