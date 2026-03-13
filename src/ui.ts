export function getMainHTML(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>설비 키워드 기반 정량 분석 PoC</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { sans: ['Noto Sans KR', 'sans-serif'] },
          colors: {
            primary: { 50:'#eff6ff',100:'#dbeafe',200:'#bfdbfe',300:'#93c5fd',400:'#60a5fa',500:'#3b82f6',600:'#2563eb',700:'#1d4ed8',800:'#1e40af',900:'#1e3a8a' },
          }
        }
      }
    }
  </script>
  <style>
    *{box-sizing:border-box}
    body{font-family:'Noto Sans KR',sans-serif}
    @keyframes fadeInUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
    @keyframes shimmer{0%{background-position:-200px 0}100%{background-position:calc(200px+100%) 0}}
    @keyframes checkmark{0%{transform:scale(0)}50%{transform:scale(1.2)}100%{transform:scale(1)}}
    .fade-in-up{animation:fadeInUp .5s ease-out forwards}
    .skeleton{background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%);background-size:200px 100%;animation:shimmer 1.5s infinite;border-radius:4px}
    .step-check{animation:checkmark .3s ease-out forwards}

    .drawer-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:40;opacity:0;transition:opacity .3s;pointer-events:none}
    .drawer-overlay.active{opacity:1;pointer-events:auto}
    .drawer{position:fixed;top:0;right:0;bottom:0;width:min(700px,92vw);background:white;z-index:50;transform:translateX(100%);transition:transform .35s cubic-bezier(.16,1,.3,1);overflow-y:auto;box-shadow:-4px 0 24px rgba(0,0,0,.12)}
    .drawer.open{transform:translateX(0)}

    .data-table{border-collapse:separate;border-spacing:0;width:100%}
    .data-table th{position:sticky;top:0;z-index:10;background:#1e3a8a;color:white;padding:12px 14px;text-align:left;font-size:12px;font-weight:600;white-space:nowrap;letter-spacing:-.01em}
    .data-table td{padding:10px 14px;font-size:13px;border-bottom:1px solid #e5e7eb}
    .data-table tbody tr:hover{background:#eff6ff}
    .data-table tbody tr:nth-child(even){background:#f8fafc}
    .data-table tbody tr:nth-child(even):hover{background:#eff6ff}

    .clickable-count{color:#2563eb;font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
    .clickable-count:hover{color:#1d4ed8}
    .chip{display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:500;background:#dbeafe;color:#1e40af;border:1px solid #bfdbfe}
    .chip-score{font-size:11px;color:#60a5fa;margin-left:2px}
    .insight-card{background:white;border-radius:12px;border:1px solid #e5e7eb;padding:20px;transition:all .2s;box-shadow:0 1px 3px rgba(0,0,0,.04)}
    .insight-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.08);border-color:#93c5fd}
    .case-item{border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:10px;transition:all .2s;background:white}
    .case-item:hover{border-color:#93c5fd;box-shadow:0 2px 8px rgba(0,0,0,.05)}
    .case-expand{max-height:0;overflow:hidden;transition:max-height .3s ease-out}
    .case-expand.open{max-height:500px}

    .search-wrap{position:relative;max-width:600px;margin:0 auto}
    .search-wrap input{width:100%;padding:16px 56px 16px 20px;font-size:16px;border:2px solid #e5e7eb;border-radius:16px;outline:none;transition:all .2s;background:white;box-shadow:0 2px 8px rgba(0,0,0,.04)}
    .search-wrap input:focus{border-color:#3b82f6;box-shadow:0 0 0 4px rgba(59,130,246,.1),0 2px 8px rgba(0,0,0,.04)}
    .search-btn{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:12px;border:none;background:#2563eb;color:white;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;transition:background .2s}
    .search-btn:hover{background:#1d4ed8}
    .search-btn:disabled{background:#93c5fd;cursor:not-allowed}

    .num-positive{color:#059669;font-weight:600}
    .num-rank{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;font-weight:700;font-size:13px}
    .rank-1{background:#fef3c7;color:#92400e}
    .rank-2{background:#e5e7eb;color:#374151}
    .rank-3{background:#fed7aa;color:#9a3412}
    .rank-default{background:#f3f4f6;color:#6b7280}

    .step-item{display:flex;align-items:center;gap:10px;padding:8px 0;font-size:14px;color:#6b7280}
    .step-item.active{color:#2563eb;font-weight:500}
    .step-item.done{color:#059669}
    .step-icon{width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:12px}
    .step-icon.pending{background:#f3f4f6;color:#9ca3af}
    .step-icon.active{background:#dbeafe;color:#2563eb}
    .step-icon.done{background:#dcfce7;color:#16a34a}

    .suggest-chip{display:inline-block;padding:6px 16px;border-radius:20px;font-size:13px;background:#f8fafc;border:1px solid #e2e8f0;color:#475569;cursor:pointer;transition:all .2s}
    .suggest-chip:hover{background:#eff6ff;border-color:#93c5fd;color:#1e40af}
    ::-webkit-scrollbar{width:6px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px}
    ::-webkit-scrollbar-thumb:hover{background:#94a3b8}
  </style>
</head>
<body class="bg-gray-50 min-h-screen">
  <!-- Header -->
  <header class="bg-white border-b border-gray-200 sticky top-0 z-30">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center">
          <i class="fas fa-bolt text-white text-sm"></i>
        </div>
        <div>
          <h1 class="text-base font-bold text-gray-900 leading-tight">설비 키워드 기반 정량 분석</h1>
          <p class="text-xs text-gray-500">에너지 절감 사례 70,000+ 건 기반 PoC</p>
        </div>
      </div>
      <div class="text-xs text-gray-400 hidden sm:block"><i class="fas fa-database mr-1"></i>DB 2024 표준화 v4</div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 sm:px-6 py-8">
    <!-- Search -->
    <section id="search-section" class="mb-8">
      <div class="text-center mb-6">
        <h2 class="text-2xl font-bold text-gray-800 mb-2"><i class="fas fa-search text-primary-500 mr-2"></i>설비 키워드를 입력하세요</h2>
        <p class="text-sm text-gray-500">대상 설비명(한글/영문)을 입력하면 절감액 기준 Top 10 분석이 시작됩니다</p>
      </div>
      <div class="search-wrap">
        <input type="text" id="keyword-input" placeholder="예: 보일러, 펌프, Air Compressor, 조명..." autocomplete="off" />
        <button class="search-btn" id="search-btn" onclick="startAnalysis()"><i class="fas fa-arrow-right"></i></button>
      </div>
      <div class="flex flex-wrap gap-2 justify-center mt-4">
        <span class="suggest-chip" onclick="quickSearch('보일러')">보일러</span>
        <span class="suggest-chip" onclick="quickSearch('펌프')">펌프</span>
        <span class="suggest-chip" onclick="quickSearch('Air Compressor')">Air Compressor</span>
        <span class="suggest-chip" onclick="quickSearch('조명')">조명</span>
        <span class="suggest-chip" onclick="quickSearch('모터')">모터</span>
        <span class="suggest-chip" onclick="quickSearch('열교환기')">열교환기</span>
        <span class="suggest-chip" onclick="quickSearch('칠러')">칠러</span>
        <span class="suggest-chip" onclick="quickSearch('HVAC')">HVAC</span>
      </div>
    </section>

    <!-- Progress -->
    <section id="progress-section" class="hidden mb-8">
      <div class="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm max-w-lg mx-auto">
        <div class="flex items-center gap-3 mb-5">
          <div class="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
            <i class="fas fa-cog fa-spin text-primary-600 text-sm" id="progress-spinner"></i>
          </div>
          <div>
            <h3 class="text-base font-semibold text-gray-800">분석 진행 중</h3>
            <p class="text-xs text-gray-500" id="progress-keyword"></p>
          </div>
        </div>
        <div id="progress-steps">
          <div class="step-item" id="step-1"><div class="step-icon pending"><i class="fas fa-circle text-[8px]"></i></div><span>대상설비 유사도 매칭 중...</span></div>
          <div class="step-item" id="step-2"><div class="step-icon pending"><i class="fas fa-circle text-[8px]"></i></div><span>절감액(평균) 집계 및 Top 10 추출 중...</span></div>
          <div class="step-item" id="step-3"><div class="step-icon pending"><i class="fas fa-circle text-[8px]"></i></div><span>전략적 Insight 생성 중...</span></div>
        </div>
      </div>
    </section>

    <!-- Results -->
    <div id="results-section" class="hidden space-y-8">
      <section id="chips-section" class="fade-in-up" style="opacity:0">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold text-gray-600 mr-1"><i class="fas fa-microchip text-primary-500 mr-1"></i>매칭된 설비:</span>
          <div id="equipment-chips" class="flex flex-wrap gap-2"></div>
        </div>
      </section>

      <section id="table-section" style="opacity:0">
        <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 class="text-base font-bold text-gray-800"><i class="fas fa-trophy text-amber-500 mr-2"></i>절감액(평균) Top 10</h3>
              <p class="text-xs text-gray-500 mt-0.5" id="table-subtitle"></p>
            </div>
            <div class="text-xs text-gray-400"><i class="fas fa-sort-amount-down mr-1"></i>절감액(평균) 내림차순</div>
          </div>
          <div class="overflow-x-auto">
            <table class="data-table" id="top10-table">
              <thead><tr>
                <th>#</th><th>대상설비</th><th>업종</th><th>개선구분</th><th>행위(표준)</th>
                <th class="text-center">사례수</th><th class="text-right">회수기간(년)</th>
                <th class="text-right">투자비(백만)</th><th class="text-right">CO2(tCO2)</th>
                <th class="text-right">절감액(평균,백만)</th>
              </tr></thead>
              <tbody id="top10-body"></tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="insight-section" style="opacity:0">
        <div class="flex items-center gap-2 mb-4">
          <h3 class="text-base font-bold text-gray-800"><i class="fas fa-brain text-purple-500 mr-2"></i>전략적 Insight</h3>
          <span class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full" id="insight-badge">AI 생성</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="insight-cards"></div>
      </section>
    </div>
  </main>

  <!-- Drawer -->
  <div class="drawer-overlay" id="drawer-overlay" onclick="closeDrawer()"></div>
  <div class="drawer" id="drawer">
    <div class="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-base font-bold text-gray-800" id="drawer-title">Drill-down 사례</h3>
          <p class="text-xs text-gray-500 mt-0.5" id="drawer-subtitle"></p>
        </div>
        <button onclick="closeDrawer()" class="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
      </div>
    </div>
    <div class="p-5" id="drawer-content"></div>
  </div>

  <script>
    // ============ STATE ============
    let currentTop10=[], currentKeyword='', isAnalyzing=false;
    const $=id=>document.getElementById(id);
    const ki=$('keyword-input');
    ki.addEventListener('keydown',e=>{if(e.key==='Enter'&&!isAnalyzing)startAnalysis()});

    function quickSearch(kw){ki.value=kw;startAnalysis()}
    function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
    function escapeHtml(s){if(!s)return '';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

    // ============ ANALYSIS ============
    async function startAnalysis(){
      const keyword=ki.value.trim();
      if(!keyword||isAnalyzing)return;
      isAnalyzing=true; currentKeyword=keyword;
      $('search-btn').disabled=true;
      hideAll(); showProgress(keyword);

      try{
        // Step 1
        activateStep(1); await sleep(300);
        const res=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyword})});
        const data=await res.json();
        if(!data.top10||data.top10.length===0){doneStep(1);showNoResults(keyword,data.message);return}
        doneStep(1); currentTop10=data.top10;

        // Step 2
        activateStep(2); await sleep(200);
        renderChips(data.matched_equipment);
        renderTable(data.top10,data.total_filtered_groups);
        doneStep(2);

        // Step 3
        activateStep(3);
        const ir=await fetch('/api/insight',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyword,top10:data.top10})});
        const id2=await ir.json();
        renderInsights(id2.insights||[]);
        doneStep(3);

        $('progress-spinner').className='fas fa-check-circle text-green-600 text-sm';
        $('progress-keyword').textContent='분석 완료!';
        setTimeout(()=>$('progress-section').classList.add('hidden'),1200);
      }catch(err){console.error(err);alert('분석 오류: '+err.message)}
      finally{isAnalyzing=false;$('search-btn').disabled=false}
    }

    // ============ PROGRESS ============
    function showProgress(kw){
      $('progress-section').classList.remove('hidden');
      $('progress-keyword').textContent='"'+kw+'" 분석 중...';
      for(let i=1;i<=3;i++){const s=$('step-'+i);s.className='step-item';s.querySelector('.step-icon').className='step-icon pending';s.querySelector('.step-icon').innerHTML='<i class="fas fa-circle text-[8px]"></i>'}
      $('progress-spinner').className='fas fa-cog fa-spin text-primary-600 text-sm';
    }
    function activateStep(n){const s=$('step-'+n);s.className='step-item active';s.querySelector('.step-icon').className='step-icon active';s.querySelector('.step-icon').innerHTML='<i class="fas fa-spinner fa-spin text-xs"></i>'}
    function doneStep(n){const s=$('step-'+n);s.className='step-item done';s.querySelector('.step-icon').className='step-icon done step-check';s.querySelector('.step-icon').innerHTML='<i class="fas fa-check text-xs"></i>'}
    function hideAll(){$('results-section').classList.add('hidden');['chips-section','table-section','insight-section'].forEach(id=>$(id).style.opacity='0')}

    function showNoResults(kw,msg){
      $('results-section').classList.remove('hidden');
      $('chips-section').style.opacity='1';$('chips-section').className='fade-in-up';
      $('equipment-chips').innerHTML='<span class="text-sm text-gray-500">'+escapeHtml(msg||'결과 없음')+'</span>';
      setTimeout(()=>$('progress-section').classList.add('hidden'),800);
      isAnalyzing=false;$('search-btn').disabled=false;
    }

    // ============ RENDER ============
    function renderChips(matched){
      $('equipment-chips').innerHTML=matched.map(m=>'<span class="chip">'+escapeHtml(m.name)+'<span class="chip-score">'+m.score+'%</span></span>').join('');
      $('results-section').classList.remove('hidden');
      requestAnimationFrame(()=>{$('chips-section').style.opacity='1';$('chips-section').className='fade-in-up'});
    }

    function renderTable(top10,total){
      const tbody=$('top10-body');
      tbody.innerHTML=top10.map(r=>{
        const rc=r.rank<=3?'rank-'+r.rank:'rank-default';
        const ind=(r.업종||'').split('|').filter(Boolean);
        const indStr=ind.slice(0,2).join(', ')+(ind.length>2?' 외'+(ind.length-2):'');
        const b64=btoa(unescape(encodeURIComponent(JSON.stringify({e:r.대상설비,i:r.개선구분,a:r.행위_표준,n:r.사례수}))));
        return '<tr>'+
          '<td><span class="num-rank '+rc+'">'+r.rank+'</span></td>'+
          '<td class="font-medium text-gray-800">'+escapeHtml(r.대상설비)+'</td>'+
          '<td class="text-gray-600 text-xs max-w-[120px] truncate" title="'+escapeHtml(r.업종)+'">'+escapeHtml(indStr)+'</td>'+
          '<td class="text-gray-600 text-xs">'+escapeHtml(r.개선구분)+'</td>'+
          '<td class="font-medium">'+escapeHtml(r.행위_표준)+'</td>'+
          '<td class="text-center"><span class="clickable-count" data-g="'+b64+'" onclick="openDD(this.dataset.g)">'+r.사례수.toLocaleString()+'</span></td>'+
          '<td class="text-right">'+r.투자비회수기간_평균.toFixed(1)+'</td>'+
          '<td class="text-right">'+r.투자비_평균.toFixed(1)+'</td>'+
          '<td class="text-right">'+r.CO2감축량_평균.toFixed(1)+'</td>'+
          '<td class="text-right num-positive text-base">'+r.절감액_평균.toFixed(1)+'</td></tr>'
      }).join('');
      $('table-subtitle').textContent='총 '+total+'개 그룹 중 상위 10개 (키워드: "'+currentKeyword+'")';
      setTimeout(()=>{$('table-section').style.opacity='1';$('table-section').className='fade-in-up'},200);
    }

    function renderInsights(ins){
      const c=$('insight-cards');
      if(!ins||!ins.length){c.innerHTML='<p class="text-gray-500 col-span-2 text-center py-8">인사이트 생성 실패</p>';return}
      const cl=['blue','amber','green','purple'];
      c.innerHTML=ins.map((x,i)=>{
        const co=cl[i%cl.length];
        return '<div class="insight-card fade-in-up" style="animation-delay:'+(i*.12)+'s;opacity:0">'+
          '<div class="flex items-start gap-3 mb-3"><div class="w-9 h-9 rounded-lg bg-'+co+'-100 flex items-center justify-center flex-shrink-0"><i class="'+(x.icon||'fas fa-lightbulb')+' text-'+co+'-600 text-sm"></i></div>'+
          '<h4 class="text-sm font-bold text-gray-800 leading-tight pt-1">'+escapeHtml(x.title)+'</h4></div>'+
          '<p class="text-sm text-gray-700 leading-relaxed mb-3">'+escapeHtml(x.content)+'</p>'+
          '<div class="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2"><i class="fas fa-quote-left mr-1"></i>'+escapeHtml(x.evidence||'')+'</div></div>'
      }).join('');
      setTimeout(()=>{$('insight-section').style.opacity='1';$('insight-section').className='fade-in-up'},400);
    }

    // ============ DRILL-DOWN ============
    function openDD(b64){
      const g=JSON.parse(decodeURIComponent(escape(atob(b64))));
      $('drawer-title').textContent=g.e+' > '+g.a;
      $('drawer-subtitle').textContent=g.i+' | 사례수: '+g.n+'건';
      $('drawer-content').innerHTML='<div class="space-y-3">'+Array(5).fill(0).map(()=>'<div class="case-item"><div class="skeleton h-4 w-3/4 mb-2"></div><div class="skeleton h-3 w-1/2"></div></div>').join('')+'</div>';
      $('drawer').classList.add('open');$('drawer-overlay').classList.add('active');document.body.style.overflow='hidden';
      fetchDD(g.e,g.i,g.a);
    }

    async function fetchDD(eq,im,ac){
      try{
        const r=await fetch('/api/drilldown',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({대상설비:eq,개선구분:im,행위_표준:ac,limit:40})});
        const d=await r.json();
        renderCases(d.cases||[]);
        if(d.cases&&d.cases.length>0)loadSums(d.cases);
      }catch(e){$('drawer-content').innerHTML='<p class="text-red-500 text-center py-8">사례 로드 실패</p>'}
    }

    function renderCases(cases){
      const ct=$('drawer-content');
      if(!cases.length){ct.innerHTML='<p class="text-gray-500 text-center py-8">해당 조건의 사례가 없습니다.</p>';return}
      ct.innerHTML=cases.map((c,i)=>{
        const s=+(c.절감액||0),inv=+(c.투자비||0),co2=+(c.온실가스감축량||0),pb=+(c.투자비회수기간||0);
        return '<div class="case-item">'+
          '<div class="flex items-start justify-between mb-2"><div class="flex-1">'+
          '<div class="text-xs text-primary-600 font-medium mb-1" id="cs-'+i+'"><i class="fas fa-spinner fa-spin mr-1 text-gray-400"></i><span class="text-gray-400">요약 생성 중...</span></div>'+
          '<div class="flex items-center gap-2 flex-wrap">'+
          '<span class="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">'+escapeHtml(c.업종)+'</span>'+
          '<span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">'+escapeHtml(c.진단연도)+'</span>'+
          '</div></div><span class="num-positive text-sm whitespace-nowrap">'+s.toFixed(1)+'백만원</span></div>'+
          '<button onclick="toggleC('+i+')" class="text-xs text-gray-500 hover:text-primary-600 flex items-center gap-1 mt-2"><i class="fas fa-chevron-down text-[10px]" id="ca-'+i+'" style="transition:transform .2s"></i>원문 펼치기</button>'+
          '<div class="case-expand" id="cd-'+i+'"><div class="bg-gray-50 rounded-lg p-3 mt-2 text-xs space-y-1.5">'+
          '<div><span class="text-gray-500 inline-block w-20">개선활동명:</span><span class="text-gray-800 font-medium">'+escapeHtml(c.개선활동명)+'</span></div>'+
          '<div><span class="text-gray-500 inline-block w-20">행위(표준):</span><span>'+escapeHtml(c.행위_표준)+'</span></div>'+
          '<div><span class="text-gray-500 inline-block w-20">개선구분:</span><span>'+escapeHtml(c.개선구분)+'</span></div>'+
          '<div class="flex gap-4 pt-1 border-t border-gray-200 mt-1 flex-wrap">'+
          '<span><i class="fas fa-coins text-amber-500 mr-1"></i>투자비: '+inv.toFixed(1)+'백만</span>'+
          '<span><i class="fas fa-clock text-blue-500 mr-1"></i>회수: '+pb.toFixed(1)+'년</span>'+
          '<span><i class="fas fa-leaf text-green-500 mr-1"></i>CO2: '+co2.toFixed(1)+'tCO2</span></div>'+
          '<div class="flex gap-4 flex-wrap">'+
          '<span><i class="fas fa-fire text-orange-500 mr-1"></i>연료: '+(+(c.에너지절감량_연료||0)).toFixed(1)+'toe</span>'+
          '<span><i class="fas fa-bolt text-yellow-500 mr-1"></i>전력: '+(+(c.에너지절감량_전력||0)).toFixed(1)+'toe</span></div>'+
          '</div></div></div>'
      }).join('');
    }

    function toggleC(i){const d=$('cd-'+i),a=$('ca-'+i);d.classList.toggle('open');a.style.transform=d.classList.contains('open')?'rotate(180deg)':''}

    async function loadSums(cases){
      const bs=10;
      for(let s=0;s<cases.length;s+=bs){
        const batch=cases.slice(s,s+bs);
        try{
          const r=await fetch('/api/summarize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cases:batch})});
          const d=await r.json();
          if(d.summaries)d.summaries.forEach((sm,j)=>{const el=$('cs-'+(s+j));if(el)el.innerHTML='<i class="fas fa-wand-magic-sparkles text-amber-500 mr-1"></i>'+escapeHtml(sm)})
        }catch(e){batch.forEach((c,j)=>{const el=$('cs-'+(s+j));if(el)el.innerHTML='<i class="fas fa-wand-magic-sparkles text-amber-500 mr-1"></i>'+escapeHtml((c.대상설비||'')+' '+(c.행위_표준||'')+'으로 연 '+(c.절감액||0).toFixed(1)+'백만원 절감')})}
      }
    }

    function closeDrawer(){$('drawer').classList.remove('open');$('drawer-overlay').classList.remove('active');document.body.style.overflow=''}
  </script>
</body>
</html>`
}
