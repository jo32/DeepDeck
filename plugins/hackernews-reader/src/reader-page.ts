export function renderHackerNewsReaderPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>Hacker News · DeepDeck</title>
  <style>
    :root {
      color-scheme: light;
      --orange:#f26419;--orange-strong:#aa3a00;--orange-soft:#fff0e7;
      --paper:#f7f5f1;--panel:#fff;--panel-soft:#fbfaf7;--ink:#171714;
      --muted:#625f59;--faint:#77736c;--line:#e5e1d9;--line-strong:#d4cfc5;
      --shadow:0 18px 50px rgba(48,38,25,.09);--focus:#2563eb;
      font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    }
    *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:var(--paper);color:var(--ink)}
    button,input,select,textarea{font:inherit;color:inherit}button,a{outline:none}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
    button{border:0;background:none;cursor:pointer}a{color:inherit}.app{height:100%;display:flex;flex-direction:column}
    .topbar{height:64px;flex:none;display:grid;grid-template-columns:minmax(190px,1fr) minmax(320px,640px) minmax(190px,1fr);align-items:center;gap:22px;padding:0 22px;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--panel) 94%,transparent);backdrop-filter:blur(18px);z-index:20}
    .brand{display:flex;align-items:center;gap:11px;min-width:0}.brandMark{display:grid;place-items:center;width:31px;height:31px;border-radius:8px;background:var(--orange);color:#fff;font:800 19px/1 Georgia,serif;box-shadow:0 7px 18px rgba(242,100,25,.25)}
    .brandCopy{min-width:0}.brandName{font-size:14px;font-weight:760;letter-spacing:-.02em}.brandSub{margin-top:2px;color:var(--muted);font-size:11px;white-space:nowrap}
    .searchForm{height:38px;display:grid;grid-template-columns:1fr auto auto;align-items:center;border:1px solid var(--line-strong);border-radius:11px;background:var(--panel);box-shadow:0 2px 10px rgba(40,32,20,.04);overflow:hidden}
    .searchForm:focus-within{border-color:var(--orange);box-shadow:0 0 0 3px color-mix(in srgb,var(--orange) 14%,transparent)}
    .searchInput{min-width:0;height:100%;padding:0 14px;border:0;background:transparent;outline:none!important}.searchInput::placeholder{color:var(--faint)}
    .searchSort{height:26px;margin-right:3px;padding:0 7px;border:0;border-left:1px solid var(--line);background:transparent;color:var(--muted);font-size:12px;outline:none!important}
    .searchButton{height:30px;margin-right:4px;padding:0 13px;border-radius:8px;background:var(--ink);color:var(--panel);font-size:12px;font-weight:700}
    .topActions{display:flex;justify-content:flex-end;align-items:center;gap:8px}.shortcut{flex:none;color:var(--muted);font-size:11px;white-space:nowrap}.refreshButton{display:grid;place-items:center;width:34px;height:34px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--muted)}.refreshButton:hover{color:var(--orange);border-color:var(--orange)}
    .accountButton{height:34px;display:flex;align-items:center;gap:7px;max-width:150px;padding:0 10px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--muted);font-size:11px;font-weight:650}.accountButton:hover{border-color:var(--orange);color:var(--orange)}.accountButton.signedIn{color:var(--ink)}.accountDot{width:7px;height:7px;flex:none;border-radius:50%;background:var(--faint)}.accountButton.signedIn .accountDot{background:#2eaa65;box-shadow:0 0 0 3px color-mix(in srgb,#2eaa65 14%,transparent)}.accountLabel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .layout{min-height:0;flex:1;display:grid;grid-template-columns:218px minmax(330px,410px) minmax(0,1fr);grid-template-rows:minmax(0,1fr)}
    .feeds{min-width:0;min-height:0;padding:20px 13px;border-right:1px solid var(--line);background:var(--panel-soft);overflow:auto}.sectionLabel{padding:0 10px 9px;color:var(--faint);font-size:10px;font-weight:760;letter-spacing:.13em;text-transform:uppercase}
    .feedButton{width:100%;display:grid;grid-template-columns:27px 1fr;align-items:center;gap:8px;margin:2px 0;padding:9px 10px;border-radius:9px;color:var(--muted);text-align:left}.feedButton:hover{background:var(--panel);color:var(--ink)}.feedButton.active{background:var(--orange-soft);color:var(--orange-strong);font-weight:700}.feedIcon{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;background:color-mix(in srgb,var(--muted) 9%,transparent);font-size:11px;font-weight:800}.feedButton.active .feedIcon{background:var(--orange);color:#fff}.feedText{font-size:13px}.feedHint{display:block;margin-top:2px;color:var(--faint);font-size:10px;font-weight:500}.feedButton.active .feedHint{color:var(--muted)}
    .aboutCard{margin:24px 7px 0;padding:13px;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--muted);font-size:11px;line-height:1.55}.aboutCard strong{display:block;margin-bottom:4px;color:var(--ink);font-size:12px}.aboutCard a{color:var(--orange-strong);text-decoration:underline;text-underline-offset:2px}
    .storiesPane{min-width:0;min-height:0;display:flex;flex-direction:column;border-right:1px solid var(--line);background:var(--panel)}.paneHeader{height:60px;flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 16px;border-bottom:1px solid var(--line)}.paneTitle{min-width:0}.paneTitle h1{margin:0;font-size:15px;letter-spacing:-.02em}.paneTitle p{margin:3px 0 0;color:var(--muted);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.resultCount{flex:none;color:var(--faint);font-size:10px}
    .storyList{min-height:0;flex:1;overflow:auto;overscroll-behavior:contain}.storyCard{position:relative;width:100%;display:block;padding:14px 16px 13px;border-bottom:1px solid var(--line);text-align:left;background:var(--panel)}.storyCard:hover{background:var(--panel-soft)}.storyCard.active{background:var(--orange-soft)}.storyCard.active::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:var(--orange)}
    .storyRank{float:left;width:25px;padding-top:1px;color:var(--faint);font:600 11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}.storyBody{display:block;margin-left:25px}.storyTitle{display:block;font-family:Georgia,"Times New Roman",serif;font-size:15px;line-height:1.32;letter-spacing:-.012em}.storyDomain{display:inline;margin-left:6px;color:var(--faint);font-family:inherit;font-size:9px;letter-spacing:0}.storyMeta{display:flex;flex-wrap:wrap;gap:5px 11px;margin-top:8px;color:var(--muted);font-size:10px}.storyMeta span{white-space:nowrap}
    .pager{height:49px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 15px;border-top:1px solid var(--line);background:var(--panel-soft)}.pagerButton{padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel);font-size:11px}.pagerButton:hover:not(:disabled){border-color:var(--orange);color:var(--orange)}.pagerButton:disabled{cursor:default;opacity:.38}.pageLabel{color:var(--muted);font-size:10px}
    .readerPane{min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain;background:var(--paper)}.readerEmpty{height:100%;display:grid;place-items:center;padding:32px;text-align:center}.emptyInner{max-width:320px}.emptyMark{display:grid;place-items:center;width:52px;height:52px;margin:0 auto 15px;border-radius:15px;background:var(--orange-soft);color:var(--orange);font:800 24px/1 Georgia,serif}.emptyInner h2{margin:0 0 8px;font:600 20px/1.25 Georgia,serif}.emptyInner p{margin:0;color:var(--muted);font-size:12px;line-height:1.6}
    .readerArticle{max-width:860px;margin:0 auto;padding:36px clamp(24px,5vw,64px) 70px}.storyEyebrow{display:flex;align-items:center;gap:8px;margin-bottom:13px;color:var(--orange-strong);font-size:10px;font-weight:760;letter-spacing:.1em;text-transform:uppercase}.storyHeading{margin:0;font:600 clamp(25px,3vw,38px)/1.1 Georgia,"Times New Roman",serif;letter-spacing:-.03em}.storySource{margin-top:10px;color:var(--muted);font-size:11px}.storySource a{color:inherit;text-decoration:none}.storySource a:hover{color:var(--orange);text-decoration:underline}.detailMeta{display:flex;flex-wrap:wrap;align-items:center;gap:8px 15px;margin-top:20px;padding-bottom:20px;border-bottom:1px solid var(--line);color:var(--muted);font-size:11px}.userLink{padding:0;color:inherit;text-decoration:underline;text-decoration-color:color-mix(in srgb,var(--muted) 38%,transparent);text-underline-offset:3px}.userLink:hover{color:var(--orange)}
    .storyActions{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}.actionButton,.actionLink{display:inline-flex;align-items:center;justify-content:center;min-height:33px;padding:0 12px;border:1px solid var(--line-strong);border-radius:9px;background:var(--panel);color:var(--ink);font-size:11px;font-weight:650;text-decoration:none}.actionButton:hover,.actionLink:hover{border-color:var(--orange);color:var(--orange)}.actionButton.primary{border-color:var(--orange-strong);background:var(--orange-strong);color:#fff}.actionButton.primary:hover{background:color-mix(in srgb,var(--orange-strong) 84%,black)}
    .storyText{margin:22px 0 28px;padding:18px 20px;border:1px solid var(--line);border-radius:13px;background:var(--panel);font:15px/1.65 Georgia,"Times New Roman",serif;white-space:pre-wrap;overflow-wrap:anywhere}.discussionHead{display:flex;align-items:end;justify-content:space-between;margin:34px 0 13px}.discussionHead h2{margin:0;font:600 19px/1.2 Georgia,serif}.discussionHead span{color:var(--muted);font-size:10px}
    .commentList{display:flex;flex-direction:column;gap:9px}.comment{margin-left:min(calc(var(--depth) * 18px),108px);padding:12px 14px;border:1px solid var(--line);border-left:2px solid color-mix(in srgb,var(--orange) calc(28% + var(--depth) * 5%),var(--line));border-radius:10px;background:var(--panel)}.comment.dead{opacity:.55}.commentMeta{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:9px}.commentDepth{color:var(--faint);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.commentText{margin-top:8px;color:var(--ink);font-size:12px;line-height:1.58;white-space:pre-wrap;overflow-wrap:anywhere}.commentActions{display:flex;justify-content:flex-end;margin-top:6px}.commentAgent{padding:3px 5px;color:var(--faint);font-size:9px}.commentAgent:hover{color:var(--orange)}.truncated{margin-top:12px;padding:11px;border-radius:9px;background:var(--orange-soft);color:var(--orange-strong);font-size:10px;text-align:center}
    .loading{padding:18px}.skeleton{height:13px;margin:9px 0;border-radius:6px;background:linear-gradient(90deg,var(--line) 24%,var(--panel-soft) 38%,var(--line) 52%);background-size:300% 100%;animation:shimmer 1.4s infinite}.skeleton:nth-child(2n){width:78%}.skeleton:nth-child(3n){width:55%}@keyframes shimmer{to{background-position:-300% 0}}
    .errorState{max-width:420px;margin:70px auto;padding:22px;border:1px solid #e0b4a3;border-radius:13px;background:#fff5f1;color:#9b3212;text-align:center}.errorState h2{margin:0 0 7px;font:600 18px Georgia,serif}.errorState p{font-size:11px;line-height:1.5}.errorState button{margin-top:8px;padding:8px 11px;border-radius:8px;background:var(--orange-strong);color:white;font-size:11px}
    .contextMenu{position:fixed;z-index:80;width:178px;padding:5px;border:1px solid var(--line-strong);border-radius:10px;background:var(--panel);box-shadow:var(--shadow)}.contextMenu[hidden]{display:none}.contextMenu button{width:100%;padding:9px 10px;border-radius:7px;text-align:left;font-size:11px}.contextMenu button:hover{background:var(--orange-soft);color:var(--orange)}
    .scrim{position:fixed;inset:0;z-index:70;display:grid;place-items:center;padding:24px;background:rgba(12,12,10,.45);backdrop-filter:blur(5px)}.scrim[hidden]{display:none}.profileCard{width:min(440px,100%);max-height:min(620px,90vh);overflow:auto;padding:22px;border:1px solid var(--line);border-radius:17px;background:var(--panel);box-shadow:var(--shadow)}.profileTop{display:flex;align-items:center;justify-content:space-between}.profileName{font:600 22px Georgia,serif}.closeButton{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:var(--panel-soft);color:var(--muted)}.profileStats{display:flex;gap:22px;margin:17px 0;padding:14px 0;border-block:1px solid var(--line)}.profileStat b{display:block;font-size:16px}.profileStat span{color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.08em}.profileAbout{font-size:12px;line-height:1.6;white-space:pre-wrap}.profileLink{display:inline-block;margin-top:18px;color:var(--orange);font-size:11px}
    .authCard{width:min(430px,100%);overflow:hidden;border:1px solid var(--line);border-radius:17px;background:var(--panel);box-shadow:var(--shadow)}.authHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:22px 22px 18px;border-bottom:1px solid var(--line)}.authHeader h2{margin:0;font:600 22px/1.2 Georgia,serif}.authHeader p{margin:6px 0 0;color:var(--muted);font-size:11px;line-height:1.5}.authBody{padding:20px 22px 22px}.authForm{display:flex;flex-direction:column;gap:13px}.authField{display:flex;flex-direction:column;gap:6px;color:var(--muted);font-size:10px;font-weight:650;text-transform:uppercase;letter-spacing:.06em}.authField input{height:39px;padding:0 11px;border:1px solid var(--line-strong);border-radius:9px;background:var(--panel-soft);font-size:13px;text-transform:none;letter-spacing:0;outline:none}.authField input:focus{border-color:var(--orange);box-shadow:0 0 0 3px color-mix(in srgb,var(--orange) 14%,transparent)}.authSubmit{height:39px;margin-top:2px;border-radius:9px;background:var(--orange-strong);color:#fff;font-size:12px;font-weight:750}.authSubmit:hover{background:color-mix(in srgb,var(--orange-strong) 84%,black)}.authSubmit:disabled{cursor:wait;opacity:.65}.authError{min-height:16px;color:#c4471c;font-size:10px;line-height:1.5}.authNotice{margin:15px 0 0;padding:11px 12px;border:1px solid var(--line);border-radius:9px;background:var(--panel-soft);color:var(--muted);font-size:10px;line-height:1.55}.authLinks{display:flex;gap:14px;margin-top:14px;color:var(--orange-strong);font-size:10px}.authLinks a{text-decoration:none}.accountHero{display:flex;align-items:center;gap:13px}.accountAvatar{display:grid;place-items:center;width:44px;height:44px;border-radius:13px;background:var(--orange-soft);color:var(--orange);font:700 20px Georgia,serif}.accountName{font:600 20px Georgia,serif}.accountStatus{display:flex;align-items:center;gap:6px;margin-top:4px;color:var(--muted);font-size:10px}.accountStatus::before{content:"";width:6px;height:6px;border-radius:50%;background:#2eaa65}.accountStatus.unverified::before{background:#d59a2e}.accountActions{display:flex;gap:8px;margin-top:20px;padding-top:17px;border-top:1px solid var(--line)}.accountActions a,.accountActions button{display:inline-flex;align-items:center;justify-content:center;min-height:35px;padding:0 11px;border:1px solid var(--line-strong);border-radius:9px;font-size:11px;text-decoration:none}.accountActions button{margin-left:auto;color:#b13c18}.accountActions a:hover,.accountActions button:hover{border-color:var(--orange);color:var(--orange)}
    .toast{position:fixed;right:20px;bottom:20px;z-index:100;max-width:360px;padding:11px 14px;border:1px solid var(--line);border-radius:10px;background:var(--ink);color:var(--panel);box-shadow:var(--shadow);font-size:11px;transform:translateY(12px);opacity:0;pointer-events:none;transition:.2s ease}.toast.show{transform:none;opacity:1}
    @media(max-width:980px){.topbar{grid-template-columns:auto 1fr auto}.brandCopy,.shortcut{display:none}.layout{grid-template-columns:350px minmax(0,1fr);padding-top:49px}.feeds{position:fixed;z-index:15;top:64px;left:0;right:0;height:49px;display:flex;align-items:center;gap:3px;padding:6px 12px;border-right:0;border-bottom:1px solid var(--line);overflow-x:auto}.feeds .sectionLabel,.aboutCard,.feedHint{display:none}.feedButton{flex:none;width:auto;grid-template-columns:22px auto;margin:0;padding:5px 9px}.feedIcon{width:22px;height:22px;border-radius:6px}.feedText{font-size:11px}.storiesPane{grid-column:1}.readerPane{grid-column:2}.comment{margin-left:min(calc(var(--depth) * 12px),60px)}.accountButton{width:34px;padding:0;justify-content:center}.accountLabel{display:none}}
    @media(max-width:760px){.topbar{gap:10px;padding:0 12px}.brandMark{width:29px;height:29px}.searchForm{grid-template-columns:1fr auto}.searchSort{display:none}.layout{grid-template-columns:310px minmax(0,1fr)}.readerArticle{padding:28px 20px 60px}.storyHeading{font-size:25px}.comment{margin-left:min(calc(var(--depth) * 7px),35px)}}
    @media(prefers-color-scheme:dark){:root{color-scheme:dark;--paper:#161614;--panel:#1d1d1a;--panel-soft:#191917;--ink:#f1efe9;--muted:#a6a199;--faint:#736f68;--line:#32312d;--line-strong:#45423d;--orange-soft:#342116;--shadow:0 18px 55px rgba(0,0,0,.34);--focus:#79a7ff}.searchButton{background:#ece8df;color:#171714}.errorState{background:#301b15;color:#ffad90;border-color:#68402f}.toast{background:#f0ede5;color:#171714}}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
  </style>
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="brand"><div class="brandMark" aria-hidden="true">Y</div><div class="brandCopy"><div class="brandName">Hacker News</div><div class="brandSub">Reader for DeepDeck</div></div></div>
      <form class="searchForm" id="searchForm" role="search"><input class="searchInput" id="searchInput" type="search" maxlength="240" autocomplete="off" placeholder="Search stories, products, ideas…" aria-label="Search Hacker News"><select class="searchSort" id="searchSort" aria-label="Search order"><option value="relevance">Relevant</option><option value="date">Newest</option></select><button class="searchButton" type="submit">Search</button></form>
      <div class="topActions"><span class="shortcut">/ search · J/K move · R refresh</span><button class="accountButton" id="accountButton" type="button" aria-label="Sign in to Hacker News" aria-expanded="false"><span class="accountDot" aria-hidden="true"></span><span class="accountLabel" id="accountLabel">Sign in</span></button><button class="refreshButton" id="refreshButton" type="button" aria-label="Refresh current view" title="Refresh">↻</button></div>
    </header>
    <div class="layout">
      <nav class="feeds" id="feeds" aria-label="Hacker News feeds"></nav>
      <section class="storiesPane" aria-label="Stories">
        <header class="paneHeader"><div class="paneTitle"><h1 id="listTitle">Top stories</h1><p id="listSubtitle">The current Hacker News front page</p></div><span class="resultCount" id="resultCount"></span></header>
        <div class="storyList" id="storyList" tabindex="0"></div>
        <footer class="pager"><button class="pagerButton" id="previousPage" type="button">← Previous</button><span class="pageLabel" id="pageLabel">Page 1</span><button class="pagerButton" id="nextPage" type="button">Next →</button></footer>
      </section>
      <main class="readerPane" id="readerPane" tabindex="-1"><div class="readerEmpty"><div class="emptyInner"><div class="emptyMark">Y</div><h2>Choose a story</h2><p>Read the source, follow the discussion, or ask DeepDeck AI to explain and summarize it.</p></div></div></main>
    </div>
  </div>
  <div class="contextMenu" id="contextMenu" hidden><button id="selectionExplain" type="button">Explain selection</button><button id="selectionSummarize" type="button">Summarize selection</button><button id="selectionCopy" type="button">Copy selection</button></div>
  <div class="scrim" id="profileScrim" hidden><section class="profileCard" role="dialog" aria-modal="true" aria-labelledby="profileName"><div class="profileTop"><div class="profileName" id="profileName">User</div><button class="closeButton" id="profileClose" type="button" aria-label="Close user profile">×</button></div><div id="profileBody"></div></section></div>
  <div class="scrim" id="authScrim" hidden><section class="authCard" role="dialog" aria-modal="true" aria-labelledby="authTitle"><header class="authHeader"><div><h2 id="authTitle">Hacker News account</h2><p id="authSubtitle">Sign in with your Hacker News account.</p></div><button class="closeButton" id="authClose" type="button" aria-label="Close account dialog">×</button></header><div class="authBody"><div id="signedOutView"><form class="authForm" id="loginForm" autocomplete="on"><label class="authField">Username<input id="loginUsername" name="username" maxlength="64" autocomplete="username" autocapitalize="none" spellcheck="false" required></label><label class="authField">Password<input id="loginPassword" name="password" type="password" maxlength="1024" autocomplete="current-password" required></label><div class="authError" id="authError" role="alert"></div><button class="authSubmit" id="loginButton" type="submit">Sign in securely</button></form><p class="authNotice">Your password is sent once to Hacker News to create a session. DeepDeck stores only the returned session cookie in its local credential store.</p><div class="authLinks"><a href="https://news.ycombinator.com/login" target="_blank" rel="noopener noreferrer">Create account ↗</a><a href="https://news.ycombinator.com/forgot" target="_blank" rel="noopener noreferrer">Forgot password ↗</a></div></div><div id="signedInView" hidden><div class="accountHero"><div class="accountAvatar" id="accountAvatar">H</div><div><div class="accountName" id="accountName">Account</div><div class="accountStatus" id="accountStatus">Session verified</div></div></div><div class="accountActions"><a id="accountProfile" href="https://news.ycombinator.com" target="_blank" rel="noopener noreferrer">Open HN profile ↗</a><button id="logoutButton" type="button">Sign out</button></div></div></div></section></div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <script>
  (() => {
    'use strict';
    const API = '/api/hackernews-reader';
    const CHANNEL = 'deepdeck-app-conversations-v1';
    const APP_ID = 'hackernews-reader';
    const feedDefinitions = [
      { id:'top', icon:'▲', label:'Top', title:'Top stories', hint:'Front page', subtitle:'The current Hacker News front page' },
      { id:'new', icon:'✦', label:'New', title:'New stories', hint:'Just submitted', subtitle:'The newest submissions across Hacker News' },
      { id:'best', icon:'◆', label:'Best', title:'Best stories', hint:'Strong signal', subtitle:'Stories with the strongest recent response' },
      { id:'ask', icon:'?', label:'Ask HN', title:'Ask HN', hint:'Questions', subtitle:'Questions and conversations from the community' },
      { id:'show', icon:'▣', label:'Show HN', title:'Show HN', hint:'Things people made', subtitle:'Projects, demos, and launches from builders' },
      { id:'jobs', icon:'●', label:'Jobs', title:'Jobs', hint:'YC companies', subtitle:'Hiring posts from the Hacker News community' }
    ];
    const state = { mode:'feed', feed:'top', query:'', sort:'relevance', page:1, pages:1, total:0, stories:[], selectedId:0, loading:false, account:{ configured:false, username:'', verified:false } };
    const feeds = document.getElementById('feeds');
    const storyList = document.getElementById('storyList');
    const readerPane = document.getElementById('readerPane');
    const listTitle = document.getElementById('listTitle');
    const listSubtitle = document.getElementById('listSubtitle');
    const resultCount = document.getElementById('resultCount');
    const pageLabel = document.getElementById('pageLabel');
    const previousPage = document.getElementById('previousPage');
    const nextPage = document.getElementById('nextPage');
    const searchForm = document.getElementById('searchForm');
    const searchInput = document.getElementById('searchInput');
    const searchSort = document.getElementById('searchSort');
    const refreshButton = document.getElementById('refreshButton');
    const accountButton = document.getElementById('accountButton');
    const accountLabel = document.getElementById('accountLabel');
    const contextMenu = document.getElementById('contextMenu');
    const selectionExplain = document.getElementById('selectionExplain');
    const selectionSummarize = document.getElementById('selectionSummarize');
    const selectionCopy = document.getElementById('selectionCopy');
    const profileScrim = document.getElementById('profileScrim');
    const profileName = document.getElementById('profileName');
    const profileBody = document.getElementById('profileBody');
    const profileClose = document.getElementById('profileClose');
    const authScrim = document.getElementById('authScrim');
    const authClose = document.getElementById('authClose');
    const authSubtitle = document.getElementById('authSubtitle');
    const signedOutView = document.getElementById('signedOutView');
    const signedInView = document.getElementById('signedInView');
    const loginForm = document.getElementById('loginForm');
    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');
    const loginButton = document.getElementById('loginButton');
    const authError = document.getElementById('authError');
    const accountAvatar = document.getElementById('accountAvatar');
    const accountName = document.getElementById('accountName');
    const accountStatus = document.getElementById('accountStatus');
    const accountProfile = document.getElementById('accountProfile');
    const logoutButton = document.getElementById('logoutButton');
    const toast = document.getElementById('toast');
    let selectedText = '';
    let toastTimer = 0;
    let activeStory = null;
    let requestGeneration = 0;
    const appClientId = globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function' ? globalThis.crypto.randomUUID() : String(Date.now()) + Math.random();

    function node(tag, className, text) {
      const value = document.createElement(tag);
      if (className) value.className = className;
      if (text !== undefined) value.textContent = String(text);
      return value;
    }
    function formatNumber(value) { return new Intl.NumberFormat('en', { notation:value >= 10000 ? 'compact' : 'standard' }).format(Number(value || 0)); }
    function age(timestamp) {
      const seconds = Math.max(0, Math.floor(Date.now() / 1000 - Number(timestamp || 0)));
      if (seconds < 60) return 'now';
      if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
      if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
      if (seconds < 2592000) return Math.floor(seconds / 86400) + 'd ago';
      if (seconds < 31536000) return Math.floor(seconds / 2592000) + 'mo ago';
      return Math.floor(seconds / 31536000) + 'y ago';
    }
    function showToast(message) {
      window.clearTimeout(toastTimer);
      toast.textContent = message;
      toast.classList.add('show');
      toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2500);
    }
    function renderAccount(value) {
      const configured = Boolean(value && value.configured && value.username);
      const username = configured ? String(value.username) : '';
      const verified = configured && value.verified === true;
      state.account = { configured:configured, username:username, verified:verified };
      accountButton.classList.toggle('signedIn', configured);
      accountButton.setAttribute('aria-label', configured ? 'Hacker News account: ' + username : 'Sign in to Hacker News');
      accountLabel.textContent = configured ? '@' + username : 'Sign in';
      signedOutView.hidden = configured;
      signedInView.hidden = !configured;
      authSubtitle.textContent = configured ? 'Your Hacker News session is stored securely on this device.' : 'Sign in with your Hacker News account.';
      if (!configured) return;
      accountName.textContent = username;
      accountAvatar.textContent = username.slice(0, 1).toUpperCase();
      accountStatus.textContent = verified ? 'Session verified' : 'Session stored · verification unavailable';
      accountStatus.classList.toggle('unverified', !verified);
      accountProfile.href = 'https://news.ycombinator.com/user?id=' + encodeURIComponent(username);
    }
    function setAuthOpen(open) {
      authScrim.hidden = !open;
      accountButton.setAttribute('aria-expanded', String(open));
      authError.textContent = '';
      if (open) window.setTimeout(() => state.account.configured ? authClose.focus() : loginUsername.focus(), 0);
      else accountButton.focus();
    }
    async function loadAccountStatus() {
      try { renderAccount(await call('auth-status', { validate:true })); }
      catch (error) { renderAccount({ configured:false }); showToast(error.message || String(error)); }
    }
    async function call(action, payload) {
      const response = await fetch(API, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ action:action, payload:payload || {} }) });
      const value = await response.json();
      if (!response.ok || (value && typeof value.error === 'string')) throw new Error(value && value.error ? value.error : 'Request failed');
      return value;
    }
    function safeHref(value) {
      try { const url = new URL(String(value)); return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
    }
    function externalLink(label, href, className) {
      const link = node('a', className, label);
      link.href = safeHref(href) || '#';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      return link;
    }
    function loadingRows(count) {
      const wrap = node('div', 'loading');
      for (let index = 0; index < count; index += 1) wrap.append(node('div', 'skeleton'));
      return wrap;
    }
    function renderFeeds() {
      feeds.replaceChildren();
      feeds.append(node('div', 'sectionLabel', 'Browse'));
      feedDefinitions.forEach(definition => {
        const button = node('button', 'feedButton' + (state.mode === 'feed' && state.feed === definition.id ? ' active' : ''));
        button.type = 'button';
        button.dataset.feed = definition.id;
        button.setAttribute('aria-pressed', String(state.mode === 'feed' && state.feed === definition.id));
        button.append(node('span', 'feedIcon', definition.icon));
        const copy = node('span', 'feedText', definition.label);
        copy.append(node('span', 'feedHint', definition.hint));
        button.append(copy);
        button.addEventListener('click', () => { if (!state.loading) void loadFeed(definition.id, 1); });
        feeds.append(button);
      });
      const about = node('div', 'aboutCard');
      about.append(node('strong', '', 'Signal without the noise'));
      about.append(document.createTextNode('Public, read-only access through the official HN API and '));
      about.append(externalLink('HN Search', 'https://hn.algolia.com/', ''));
      about.append(document.createTextNode('.'));
      feeds.append(about);
    }
    function listHeading() {
      if (state.mode === 'search') {
        listTitle.textContent = 'Search';
        listSubtitle.textContent = '“' + state.query + '” · ' + (state.sort === 'date' ? 'newest first' : 'ranked by relevance');
      } else {
        const definition = feedDefinitions.find(item => item.id === state.feed) || feedDefinitions[0];
        listTitle.textContent = definition.title;
        listSubtitle.textContent = definition.subtitle;
      }
    }
    function renderPager(total) {
      pageLabel.textContent = 'Page ' + state.page + ' of ' + state.pages;
      previousPage.disabled = state.loading || state.page <= 1;
      nextPage.disabled = state.loading || state.page >= state.pages;
      resultCount.textContent = total ? formatNumber(total) + ' results' : '';
    }
    function storyMeta(story) {
      const meta = node('span', 'storyMeta');
      meta.append(node('span', '', formatNumber(story.score) + ' points'));
      meta.append(node('span', '', story.by || 'unknown'));
      meta.append(node('span', '', age(story.time)));
      meta.append(node('span', '', formatNumber(story.commentCount) + ' comments'));
      return meta;
    }
    function renderStories() {
      storyList.replaceChildren();
      state.stories.forEach((story, index) => {
        const button = node('button', 'storyCard' + (state.selectedId === story.id ? ' active' : ''));
        button.type = 'button';
        button.dataset.storyId = String(story.id);
        button.append(node('span', 'storyRank', String((state.page - 1) * 30 + index + 1).padStart(2, '0')));
        const body = node('span', 'storyBody');
        const title = node('span', 'storyTitle', story.title);
        if (story.domain) title.append(node('span', 'storyDomain', '(' + story.domain + ')'));
        body.append(title, storyMeta(story));
        button.append(body);
        button.addEventListener('click', () => void openStory(story));
        storyList.append(button);
      });
      if (state.stories.length === 0) {
        const empty = node('div', 'readerEmpty');
        const inner = node('div', 'emptyInner');
        inner.append(node('div', 'emptyMark', '0'), node('h2', '', 'No stories found'), node('p', '', 'Try another search or switch to a different feed.'));
        empty.append(inner);
        storyList.append(empty);
      }
    }
    function renderListError(error) {
      storyList.replaceChildren();
      const box = node('div', 'errorState');
      box.append(node('h2', '', 'Could not load Hacker News'), node('p', '', error.message || String(error)));
      const retry = node('button', '', 'Try again');
      retry.type = 'button'; retry.addEventListener('click', () => void reload()); box.append(retry); storyList.append(box);
    }
    async function loadFeed(feed, page) {
      const generation = ++requestGeneration;
      state.loading = true; state.mode = 'feed'; state.feed = feed; state.page = page; state.query = '';
      state.total = 0; searchInput.value = ''; renderFeeds(); listHeading(); storyList.replaceChildren(loadingRows(16)); renderPager(0);
      try {
        const value = await call('feed', { feed:feed, page:page, limit:30 });
        if (generation !== requestGeneration) return;
        state.stories = Array.isArray(value.stories) ? value.stories : [];
        state.pages = Math.max(1, Number(value.pages || 1)); state.page = Number(value.page || page);
        state.total = Number(value.total || 0); renderStories(); renderPager(state.total);
        if (state.stories.length && !state.stories.some(story => story.id === state.selectedId)) void openStory(state.stories[0]);
      } catch (error) { if (generation === requestGeneration) renderListError(error); }
      finally { if (generation === requestGeneration) { state.loading = false; renderPager(state.total); } }
    }
    async function runSearch(query, page) {
      const trimmed = String(query || '').trim(); if (!trimmed) return;
      const generation = ++requestGeneration;
      state.loading = true; state.mode = 'search'; state.query = trimmed; state.sort = searchSort.value === 'date' ? 'date' : 'relevance'; state.page = page;
      state.total = 0; renderFeeds(); listHeading(); storyList.replaceChildren(loadingRows(16)); renderPager(0);
      try {
        const value = await call('search', { query:trimmed, page:page, sort:state.sort, limit:30 });
        if (generation !== requestGeneration) return;
        state.stories = Array.isArray(value.stories) ? value.stories : [];
        state.pages = Math.max(1, Number(value.pages || 1)); state.page = Number(value.page || page);
        state.total = Number(value.total || 0); renderStories(); renderPager(state.total);
        if (state.stories.length && !state.stories.some(story => story.id === state.selectedId)) void openStory(state.stories[0]);
      } catch (error) { if (generation === requestGeneration) renderListError(error); }
      finally { if (generation === requestGeneration) { state.loading = false; renderPager(state.total); } }
    }
    function setContext(story) {
      void call('set-context', { feed:state.feed, query:state.query, storyId:story ? story.id : 0, storyTitle:story ? story.title : '', storyUrl:story && story.url ? story.url : '' }).catch(() => {});
    }
    function userButton(username) {
      const button = node('button', 'userLink', username || 'unknown');
      button.type = 'button'; button.addEventListener('click', event => { event.stopPropagation(); void showUser(username); });
      return button;
    }
    function detailMeta(story) {
      const meta = node('div', 'detailMeta');
      meta.append(node('span', '', formatNumber(story.score) + ' points'));
      meta.append(userButton(story.by));
      meta.append(node('span', '', age(story.time)));
      meta.append(node('span', '', formatNumber(story.commentCount) + ' comments'));
      return meta;
    }
    function aiPayload(story, selection) {
      return {
        storyId:Number(story.id),
        title:String(story.title || 'Hacker News story'),
        url:String(story.url || ''),
        hnUrl:'https://news.ycombinator.com/item?id=' + Number(story.id),
        selection:String(selection || '').slice(0, 8000)
      };
    }
    function nextRequestId() {
      return globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function' ? globalThis.crypto.randomUUID() : String(Date.now()) + Math.random();
    }
    function runAi(actionId, story, selection) {
      if (!channel) {
        showToast('App conversations are unavailable in this browser.');
        return;
      }
      channel.postMessage({
        source:'deepdeck-app-page', type:'invoke', clientId:appClientId, requestId:nextRequestId(),
        appId:APP_ID, actionId:actionId, payload:aiPayload(story, selection), openSession:true
      });
    }
    function renderStory(story) {
      activeStory = story; readerPane.replaceChildren();
      const article = node('article', 'readerArticle');
      article.append(node('div', 'storyEyebrow', (story.type === 'job' ? 'HN Jobs' : 'Hacker News') + ' · ' + age(story.time)));
      article.append(node('h1', 'storyHeading', story.title));
      if (story.url) {
        const source = node('div', 'storySource');
        source.append(externalLink(story.domain || story.url, story.url, ''));
        article.append(source);
      }
      article.append(detailMeta(story));
      const actions = node('div', 'storyActions');
      if (story.url) actions.append(externalLink('Open source ↗', story.url, 'actionLink'));
      actions.append(externalLink('Open on HN ↗', 'https://news.ycombinator.com/item?id=' + story.id, 'actionLink'));
      const summarize = node('button', 'actionButton primary', 'Summarize'); summarize.type = 'button'; summarize.addEventListener('click', () => runAi('summarize', story, '')); actions.append(summarize);
      const explain = node('button', 'actionButton', 'Explain'); explain.type = 'button'; explain.addEventListener('click', () => runAi('explain', story, '')); actions.append(explain);
      article.append(actions);
      if (story.text) article.append(node('div', 'storyText', story.text));
      const discussion = node('div', 'discussionHead'); discussion.append(node('h2', '', 'Discussion'), node('span', '', formatNumber(story.comments.length) + ' loaded')); article.append(discussion);
      const list = node('div', 'commentList');
      story.comments.forEach(comment => {
        const card = node('article', 'comment' + (comment.dead ? ' dead' : ''));
        card.style.setProperty('--depth', String(Math.min(12, Number(comment.depth || 0))));
        const meta = node('div', 'commentMeta'); meta.append(userButton(comment.by)); meta.append(node('span', '', age(comment.time))); meta.append(node('span', 'commentDepth', '↳ ' + Number(comment.depth || 0)));
        card.append(meta, node('div', 'commentText', comment.text || '[empty]'));
        if (!comment.deleted && comment.text) {
          const footer = node('div', 'commentActions'); const explain = node('button', 'commentAgent', 'Explain with AI →'); explain.type = 'button'; explain.addEventListener('click', () => runAi('explain', story, comment.text)); footer.append(explain); card.append(footer);
        }
        list.append(card);
      });
      if (!story.comments.length) list.append(node('div', 'storyText', 'No comments yet.'));
      article.append(list);
      if (story.commentsTruncated) article.append(node('div', 'truncated', 'This large discussion was capped at 300 comments. Use the Agent tool with a higher limit if needed.'));
      readerPane.append(article);
    }
    async function openStory(summary) {
      state.selectedId = Number(summary.id); renderStories(); activeStory = summary; setContext(summary);
      readerPane.replaceChildren(loadingRows(22)); readerPane.scrollTop = 0;
      try {
        const story = await call('story', { storyId:summary.id, maxComments:300 });
        if (state.selectedId !== Number(summary.id)) return;
        renderStory(story); setContext(story);
      } catch (error) {
        if (state.selectedId !== Number(summary.id)) return;
        const box = node('div', 'errorState'); box.append(node('h2', '', 'Could not open this story'), node('p', '', error.message || String(error)));
        const retry = node('button', '', 'Try again'); retry.type = 'button'; retry.addEventListener('click', () => void openStory(summary)); box.append(retry); readerPane.replaceChildren(box);
      }
    }
    async function showUser(username) {
      if (!username || username === 'unknown' || username === '[deleted]') return;
      profileName.textContent = username; profileBody.replaceChildren(loadingRows(7)); profileScrim.hidden = false;
      try {
        const user = await call('user', { username:username }); profileName.textContent = user.id;
        const stats = node('div', 'profileStats');
        const karma = node('div', 'profileStat'); karma.append(node('b', '', formatNumber(user.karma)), node('span', '', 'Karma'));
        const created = node('div', 'profileStat'); created.append(node('b', '', new Date(Number(user.created || 0) * 1000).getFullYear()), node('span', '', 'Joined'));
        const submitted = node('div', 'profileStat'); submitted.append(node('b', '', formatNumber((user.submitted || []).length) + '+'), node('span', '', 'Recent items'));
        stats.append(karma, created, submitted);
        const body = document.createDocumentFragment(); body.append(stats);
        if (user.about) body.append(node('div', 'profileAbout', user.about));
        body.append(externalLink('View profile on Hacker News ↗', 'https://news.ycombinator.com/user?id=' + encodeURIComponent(user.id), 'profileLink'));
        profileBody.replaceChildren(body);
      } catch (error) { profileBody.replaceChildren(node('div', 'errorState', error.message || String(error))); }
    }
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
    if (channel) window.addEventListener('pagehide', () => channel.close(), { once:true });
    async function reload() { return state.mode === 'search' ? runSearch(state.query, state.page) : loadFeed(state.feed, state.page); }
    function moveSelection(delta) {
      if (!state.stories.length) return;
      const currentIndex = state.stories.findIndex(story => story.id === state.selectedId);
      const nextIndex = Math.min(state.stories.length - 1, Math.max(0, (currentIndex < 0 ? 0 : currentIndex) + delta));
      const story = state.stories[nextIndex]; if (story) { void openStory(story); const card = storyList.querySelector('[data-story-id="' + story.id + '"]'); if (card) card.scrollIntoView({ block:'nearest' }); }
    }
    searchForm.addEventListener('submit', event => { event.preventDefault(); void runSearch(searchInput.value, 1); });
    searchSort.addEventListener('change', () => { if (state.mode === 'search' && state.query) void runSearch(state.query, 1); });
    refreshButton.addEventListener('click', () => void reload());
    accountButton.addEventListener('click', () => setAuthOpen(authScrim.hidden));
    authClose.addEventListener('click', () => setAuthOpen(false));
    authScrim.addEventListener('click', event => { if (event.target === authScrim) setAuthOpen(false); });
    loginForm.addEventListener('submit', async event => {
      event.preventDefault();
      const username = loginUsername.value.trim(); const password = loginPassword.value;
      if (!username || !password) { authError.textContent = 'Enter both your username and password.'; return; }
      loginButton.disabled = true; loginButton.textContent = 'Signing in…'; authError.textContent = '';
      try {
        const value = await call('login', { username:username, password:password });
        loginPassword.value = ''; renderAccount(value); showToast('Signed in as ' + value.username);
      } catch (error) { loginPassword.value = ''; authError.textContent = error.message || String(error); loginPassword.focus(); }
      finally { loginButton.disabled = false; loginButton.textContent = 'Sign in securely'; }
    });
    logoutButton.addEventListener('click', async () => {
      logoutButton.disabled = true; logoutButton.textContent = 'Signing out…';
      try { const value = await call('logout'); renderAccount(value); setAuthOpen(false); showToast(value.warning || 'Signed out of Hacker News'); }
      catch (error) { authError.textContent = error.message || String(error); }
      finally { logoutButton.disabled = false; logoutButton.textContent = 'Sign out'; }
    });
    previousPage.addEventListener('click', () => { if (state.page > 1) void (state.mode === 'search' ? runSearch(state.query, state.page - 1) : loadFeed(state.feed, state.page - 1)); });
    nextPage.addEventListener('click', () => { if (state.page < state.pages) void (state.mode === 'search' ? runSearch(state.query, state.page + 1) : loadFeed(state.feed, state.page + 1)); });
    profileClose.addEventListener('click', () => { profileScrim.hidden = true; });
    profileScrim.addEventListener('click', event => { if (event.target === profileScrim) profileScrim.hidden = true; });
    document.addEventListener('contextmenu', event => {
      const selection = window.getSelection(); const text = selection ? selection.toString().trim() : '';
      if (!text || !activeStory) { contextMenu.hidden = true; return; }
      selectedText = text.slice(0, 8000); event.preventDefault(); contextMenu.hidden = false;
      const width = 178; const height = 114; contextMenu.style.left = Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)) + 'px'; contextMenu.style.top = Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)) + 'px';
    });
    selectionExplain.addEventListener('click', () => { contextMenu.hidden = true; if (activeStory && selectedText) runAi('explain', activeStory, selectedText); });
    selectionSummarize.addEventListener('click', () => { contextMenu.hidden = true; if (activeStory && selectedText) runAi('summarize', activeStory, selectedText); });
    selectionCopy.addEventListener('click', () => { contextMenu.hidden = true; if (selectedText) void navigator.clipboard.writeText(selectedText).then(() => showToast('Selection copied')).catch(() => showToast('Could not copy selection')); });
    document.addEventListener('pointerdown', event => { if (!contextMenu.hidden && !contextMenu.contains(event.target)) contextMenu.hidden = true; });
    document.addEventListener('keydown', event => {
      const target = event.target; const editing = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
      if (event.key === 'Escape') { contextMenu.hidden = true; profileScrim.hidden = true; if (!authScrim.hidden) setAuthOpen(false); return; }
      if (editing) return;
      if (event.key === '/') { event.preventDefault(); searchInput.focus(); }
      else if (event.key.toLowerCase() === 'j') { event.preventDefault(); moveSelection(1); }
      else if (event.key.toLowerCase() === 'k') { event.preventDefault(); moveSelection(-1); }
      else if (event.key.toLowerCase() === 'r') { event.preventDefault(); void reload(); }
    });
    renderAccount({ configured:false }); renderFeeds(); listHeading(); void loadAccountStatus(); void loadFeed('top', 1);
  })();
  </script>
</body>
</html>`
}
