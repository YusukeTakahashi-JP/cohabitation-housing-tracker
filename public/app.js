let DB = { agencies: [], properties: [], proposals: [], email_logs: [], meta: {} };
let currentTab = 'properties';
let currentPropFilter = 'ALL';
let currentAgencyFilter = 'ALL';
let selectedPropertyId = null;
let selectedPdfPage = 1;
let selectedViewingPropId = null;

const yen = (n) => (n === null || n === undefined) ? '-' : Number(n).toLocaleString('ja-JP') + '円';
const man = (n) => (n === null || n === undefined) ? '-' : (Number(n) / 10000).toFixed(1) + '万円';

async function reloadData() {
  const res = await fetch('/api/data');
  DB = await res.json();
  if (!selectedPropertyId && DB.properties.length > 0) {
    selectedPropertyId = DB.properties[0].id;
  }
  if (!selectedViewingPropId && DB.properties.length > 0) {
    selectedViewingPropId = DB.properties[0].id;
  }
  renderAll();
}

function switchTab(tab) {
  currentTab = tab;
  ['properties', 'agencies', 'proposals', 'viewing'].forEach((t) => {
    document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== tab);
    const btn = document.getElementById(`tab-btn-${t}`);
    if (t === tab) {
      btn.classList.add('tab-active');
      btn.classList.remove('text-slate-600');
    } else {
      btn.classList.remove('tab-active');
      btn.classList.add('text-slate-600');
    }
  });
  renderAll();
}

function getProposalsForProperty(propId) {
  return (DB.proposals || []).filter((pr) => pr.property_id === propId);
}

function getMinInitialCost(propId) {
  const prs = getProposalsForProperty(propId);
  if (prs.length === 0) return null;
  return Math.min(...prs.map((p) => p.total_initial_cost_yen));
}

function getAgencyById(agencyId) {
  return (DB.agencies || []).find((a) => a.id === agencyId);
}

function renderAll() {
  document.getElementById('badge-prop-count').textContent = DB.properties.length;
  document.getElementById('badge-agency-count').textContent = DB.agencies.length;
  document.getElementById('badge-proposal-count').textContent = DB.proposals.length;
  renderKpiRow();
  renderProperties();
  renderAgencies();
  renderProposalsTab();
  renderViewingTab();
}

function renderKpiRow() {
  const passCount = DB.properties.filter((p) => p.rule_check_status === 'PASS').length;
  const pdfCount = DB.proposals.filter((pr) => pr.maisoku_pdf).length;
  const wave1Count = DB.agencies.filter((a) => a.wave.includes('第1弾')).length;
  const sRankAgencies = DB.agencies.filter((a) => a.master_rank === 'S' || a.master_rank === 'A').length;
  const minCost = Math.min(...DB.proposals.map((p) => p.total_initial_cost_yen));

  document.getElementById('kpi-row').innerHTML = `
    <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
      <div class="text-xs text-slate-500">登録物件数（業者＋Yumi様）</div>
      <div class="text-2xl font-extrabold text-slate-900 mt-0.5">${DB.properties.length}<span class="text-xs font-normal text-slate-500 ml-1">件</span></div>
      <div class="text-[11px] text-emerald-700 font-medium mt-1">⭕ 必須条件完全クリア: ${passCount}件</div>
    </div>
    <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
      <div class="text-xs text-slate-500">到着マイソク・見積書PDF</div>
      <div class="text-2xl font-extrabold text-blue-600 mt-0.5">${pdfCount}<span class="text-xs font-normal text-slate-500 ml-1">件</span></div>
      <div class="text-[11px] text-slate-500 mt-1">06_storage/housing/ に保存済</div>
    </div>
    <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
      <div class="text-xs text-slate-500">現在の最安初期費用見積</div>
      <div class="text-2xl font-extrabold text-emerald-600 mt-0.5">${yen(minCost)}</div>
      <div class="text-[11px] text-emerald-700 font-medium mt-1">上限80万円に対し -${man(800000 - minCost)} 余裕</div>
    </div>
    <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
      <div class="text-xs text-slate-500">第1弾 送信済不動産会社</div>
      <div class="text-2xl font-extrabold text-slate-900 mt-0.5">${wave1Count}<span class="text-xs font-normal text-slate-500 ml-1">社</span></div>
      <div class="text-[11px] text-slate-500 mt-1">都内14社 ＋ 神奈川6社</div>
    </div>
    <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
      <div class="text-xs text-slate-500">優良判定（S/Aランク）業者</div>
      <div class="text-2xl font-extrabold text-amber-600 mt-0.5">${sRankAgencies}<span class="text-xs font-normal text-slate-500 ml-1">社</span></div>
      <div class="text-[11px] text-amber-700 font-medium mt-1">🌟スタートライン / ⭕タウンハウジング</div>
    </div>
    <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
      <div class="text-xs text-slate-500">水曜定休明けの返信予定</div>
      <div class="text-base font-bold text-slate-800 mt-1">11/19(木) 10:00〜</div>
      <div class="text-[11px] text-slate-500 mt-1">エヌアセット・ストーンズ他17社</div>
    </div>
  `;
}

function setPropFilter(f) {
  currentPropFilter = f;
  document.querySelectorAll('.prop-filter-btn').forEach((btn) => {
    const active = btn.getAttribute('data-filter') === f;
    btn.className = active
      ? 'prop-filter-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-sm'
      : 'prop-filter-btn px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200';
  });
  renderProperties();
}

function renderProperties() {
  const sortMode = document.getElementById('prop-sort')?.value || 'score_desc';
  let list = [...DB.properties].filter((p) => {
    if (currentPropFilter === 'PASS') return p.rule_check_status === 'PASS';
    if (currentPropFilter === 'RELAXED') return p.rule_check_status === 'RELAXED';
    if (currentPropFilter === 'FAIL') return p.rule_check_status === 'FAIL';
    if (currentPropFilter === 'PDF') return getProposalsForProperty(p.id).some((pr) => pr.maisoku_pdf);
    return true;
  });

  list.sort((a, b) => {
    if (sortMode === 'rent_asc') return a.total_monthly_yen - b.total_monthly_yen;
    if (sortMode === 'initial_asc') {
      const ca = getMinInitialCost(a.id) || 9999999;
      const cb = getMinInitialCost(b.id) || 9999999;
      return ca - cb;
    }
    if (sortMode === 'area_desc') return b.area_sqm - a.area_sqm;
    return b.ai_score - a.ai_score;
  });

  if (list.length > 0 && !list.some((p) => p.id === selectedPropertyId)) {
    selectedPropertyId = list[0].id;
  }

  const container = document.getElementById('property-list');
  container.innerHTML = list.map((p) => {
    const isSel = p.id === selectedPropertyId;
    const prs = getProposalsForProperty(p.id);
    const hasPdf = prs.some((pr) => pr.maisoku_pdf);
    const minCost = getMinInitialCost(p.id);
    const ruleBadge = p.rule_check_status === 'PASS'
      ? '<span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">⭕ 必須条件完全クリア</span>'
      : p.rule_check_status === 'RELAXED'
      ? '<span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">⚠️ 緩和条件枠・要確認</span>'
      : '<span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">❌ 必須条件NG</span>';

    return `
      <div onclick="selectProperty('${p.id}')" class="cursor-pointer rounded-2xl p-4 transition border-2 ${isSel ? 'border-blue-600 bg-blue-50/40 shadow-md' : 'border-slate-200 bg-white hover:border-blue-300 shadow-sm'}">
        <div class="flex items-start justify-between gap-2">
          <div class="flex flex-wrap items-center gap-1.5">
            ${ruleBadge}
            ${hasPdf ? '<span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-600 text-white">📄 マイソク・見積PDF有</span>' : ''}
            <span class="px-2 py-0.5 rounded-md text-[11px] bg-slate-100 text-slate-700 font-medium">${p.area_category}</span>
          </div>
          <div class="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-900 text-white text-xs font-extrabold">
            <span>AI</span>
            <span class="text-amber-400 text-sm">${p.ai_score}</span>
            <span class="text-[10px] text-slate-300">点</span>
          </div>
        </div>

        <h3 class="text-base font-extrabold text-slate-900 mt-2">${p.building_name} <span class="text-sm font-semibold text-slate-600">${p.room_number}</span></h3>
        <p class="text-xs text-slate-600 mt-0.5">${p.station_info}</p>

        <div class="grid grid-cols-3 gap-2 mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
          <div>
            <div class="text-[10px] text-slate-500">月額総家賃（管理費込）</div>
            <div class="text-sm font-extrabold ${p.total_monthly_yen <= 170000 ? 'text-slate-900' : 'text-rose-600'}">${yen(p.total_monthly_yen)}</div>
            <div class="text-[10px] text-slate-400">賃${man(p.rent_yen)} + 管${yen(p.management_fee_yen)}</div>
          </div>
          <div>
            <div class="text-[10px] text-slate-500">初期費用見積</div>
            <div class="text-sm font-extrabold ${minCost && minCost <= 800000 ? 'text-emerald-700' : minCost ? 'text-rose-600' : 'text-slate-400'}">
              ${minCost ? yen(minCost) : '未取得'}
            </div>
            <div class="text-[10px] text-slate-400">${prs.length > 0 && prs[0].breakdown.brokerage_fee_yen === 0 ? '🔥仲介手数料0円!' : '上限80万円'}</div>
          </div>
          <div>
            <div class="text-[10px] text-slate-500">間取り・面積・構造</div>
            <div class="text-sm font-extrabold ${p.area_sqm >= 50 ? 'text-slate-900' : 'text-rose-600'}">${p.floor_plan} (${p.area_sqm}㎡)</div>
            <div class="text-[10px] ${p.structure.includes('RC') ? 'text-slate-500' : 'text-rose-600 font-bold'}">${p.structure} / 築${p.age_years}年 / ${p.direction}向</div>
          </div>
        </div>

        ${p.fail_reasons && p.fail_reasons.length > 0 ? `
          <div class="mt-2.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-800 space-y-0.5">
            ${p.fail_reasons.map((r) => `<div>${r}</div>`).join('')}
          </div>
        ` : ''}

        <div class="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2 border-t border-slate-100 text-xs">
          <div class="text-[11px] text-slate-500">情報元: <span class="font-semibold text-slate-700">${p.source_type}</span></div>
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-medium">
              マスター ★${p.master_rating || '-'} / Yumi様 ★${p.partner_rating || '-'}
            </span>
            <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-semibold">${p.status}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  renderPropertyInspector();
}

function selectProperty(id) {
  selectedPropertyId = id;
  selectedPdfPage = 1;
  renderProperties();
}

function setPdfPage(page) {
  selectedPdfPage = page;
  renderPropertyInspector();
}

function renderPropertyInspector() {
  const p = DB.properties.find((x) => x.id === selectedPropertyId);
  const el = document.getElementById('property-inspector');
  if (!p) {
    el.innerHTML = '<div class="p-8 text-center text-slate-400">左のリストから物件を選択してください</div>';
    return;
  }

  const prs = getProposalsForProperty(p.id);
  const mainPr = prs[0] || null;
  const pdfFile = mainPr && mainPr.maisoku_pdf ? mainPr.maisoku_pdf : null;
  const eq = p.equipments || {};

  const checkItem = (label, ok, val) => `
    <div class="p-2 rounded-lg border ${ok ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'} flex items-center justify-between text-xs">
      <span class="font-medium">${label}</span>
      <span class="font-bold">${ok ? '⭕' : '❌'} ${val}</span>
    </div>
  `;

  el.innerHTML = `
    <div class="p-5 border-b border-slate-200 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="flex items-center gap-2 text-xs text-blue-300 font-semibold">
          <span>${p.area_category}</span>
          <span>•</span>
          <span>${p.source_type}</span>
        </div>
        <h2 class="text-xl font-extrabold mt-0.5">${p.building_name} ${p.room_number}</h2>
        <p class="text-xs text-slate-300 mt-0.5">${p.address} ／ ${p.station_info}（豊洲まで約${p.commute_toyosu_min}分）</p>
      </div>
      <div class="flex items-center gap-2">
        ${p.suumo_url ? `<a href="${p.suumo_url}" target="_blank" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition">🔗 SUUMOページを開く</a>` : ''}
        ${pdfFile ? `<a href="/pdfs/${pdfFile}" target="_blank" class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition">📄 PDFを別タブで拡大</a>` : ''}
      </div>
    </div>

    <div class="p-5 space-y-5 max-h-[82vh] overflow-y-auto">
      <!-- Interactive Rating & Status Bar -->
      <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-4 text-xs">
          <div>
            <label class="font-bold text-slate-700 mr-1.5">検討ステータス:</label>
            <select onchange="updatePropertyField('${p.id}', 'status', this.value)" class="border border-slate-300 rounded-lg px-2.5 py-1 bg-white font-bold text-slate-900">
              ${['候補（検討中）', '🔥内見希望（最有力）', '内見予定', '内見済', '見送り候補', '見送り（条件外）'].map((s) => `<option value="${s}" ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="font-bold text-slate-700 mr-1">マスター評価:</label>
            <select onchange="updatePropertyField('${p.id}', 'master_rating', Number(this.value))" class="border border-slate-300 rounded-lg px-2 py-1 bg-white font-bold text-amber-600">
              ${[0,1,2,3,4,5].map((n) => `<option value="${n}" ${p.master_rating === n ? 'selected' : ''}>${n === 0 ? '未評価' : '★'.repeat(n) + ' (' + n + ')'}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="font-bold text-slate-700 mr-1">Yumi様評価:</label>
            <select onchange="updatePropertyField('${p.id}', 'partner_rating', Number(this.value))" class="border border-slate-300 rounded-lg px-2 py-1 bg-white font-bold text-pink-600">
              ${[0,1,2,3,4,5].map((n) => `<option value="${n}" ${p.partner_rating === n ? 'selected' : ''}>${n === 0 ? '未評価' : '★'.repeat(n) + ' (' + n + ')'}</option>`).join('')}
            </select>
          </div>
        </div>
        <span class="text-[11px] text-slate-400">変更すると即座にPKBへ自動保存</span>
      </div>

      <!-- PDF Embedded Viewer (If PDF available) -->
      ${pdfFile ? `
        <div class="rounded-xl border-2 border-blue-200 overflow-hidden bg-slate-800">
          <div class="bg-slate-900 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-white">
            <div class="font-bold flex items-center gap-2">
              <span>📄 スタートライン添付資料 (${pdfFile})</span>
            </div>
            <div class="flex items-center gap-1.5">
              <button onclick="setPdfPage(1)" class="px-3 py-1 rounded-lg font-bold ${selectedPdfPage === 1 ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}">1ページ目: 募集図面（マイソク）</button>
              <button onclick="setPdfPage(2)" class="px-3 py-1 rounded-lg font-bold ${selectedPdfPage === 2 ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}">2ページ目: 初期費用概算見積書</button>
            </div>
          </div>
          <iframe src="/pdfs/${pdfFile}#page=${selectedPdfPage}&view=FitH" class="w-full h-[540px] bg-white"></iframe>
        </div>
      ` : `
        <div class="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
          <div>
            <span class="font-bold">📌 マイソクPDF未取得（Yumi様からのSUUMO共有物件）</span>
            <p class="mt-0.5 text-amber-800">この物件が気になる場合、Sランクの「スタートライン（八木様）」や「タウンハウジング（佐藤様）」に物件名を伝えてマイソクと相見積もりを取り寄せることができます。</p>
          </div>
          ${p.suumo_url ? `<a href="${p.suumo_url}" target="_blank" class="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold whitespace-nowrap ml-3">SUUMOで写真を見る</a>` : ''}
        </div>
      `}

      <!-- AI Diagnosis Section -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
          <h4 class="text-xs font-extrabold text-emerald-900 uppercase tracking-wider mb-2">🌟 AI診断：この物件の強み・メリット</h4>
          <ul class="space-y-1.5 text-xs text-emerald-950 list-disc pl-4">
            ${(p.ai_pros || []).map((x) => `<li>${x}</li>`).join('')}
          </ul>
        </div>
        <div class="p-4 rounded-xl bg-amber-50/70 border border-amber-200">
          <h4 class="text-xs font-extrabold text-amber-900 uppercase tracking-wider mb-2">⚠️ AI診断：懸念点・確認すべきポイント</h4>
          <ul class="space-y-1.5 text-xs text-amber-950 list-disc pl-4">
            ${(p.ai_cons || []).map((x) => `<li>${x}</li>`).join('')}
          </ul>
        </div>
      </div>

      <!-- Initial Cost Proposal Breakdown -->
      ${mainPr ? `
        <div class="p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-2.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h4 class="text-sm font-extrabold text-slate-900">💰 初期費用見積診断（提案元: ${getAgencyById(mainPr.agency_id)?.company_name || mainPr.agency_id}）</h4>
            <div class="text-base font-extrabold ${mainPr.total_initial_cost_yen <= 800000 ? 'text-emerald-700' : 'text-rose-600'}">
              総額 ${yen(mainPr.total_initial_cost_yen)} <span class="text-xs font-normal text-slate-500">（${mainPr.assumed_start_date}）</span>
            </div>
          </div>
          <p class="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200">${mainPr.cost_audit_comment}</p>
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <div class="p-2 rounded bg-slate-50 border"><div class="text-[10px] text-slate-500">敷金</div><div class="font-bold">${yen(mainPr.breakdown.deposit_yen)}</div></div>
            <div class="p-2 rounded bg-slate-50 border"><div class="text-[10px] text-slate-500">礼金</div><div class="font-bold">${yen(mainPr.breakdown.key_money_yen)}</div></div>
            <div class="p-2 rounded ${mainPr.breakdown.brokerage_fee_yen === 0 ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-slate-50 border'}"><div class="text-[10px]">仲介手数料</div><div class="font-extrabold">${yen(mainPr.breakdown.brokerage_fee_yen)}</div></div>
            <div class="p-2 rounded bg-slate-50 border"><div class="text-[10px] text-slate-500">前家賃・日割</div><div class="font-bold">${yen(mainPr.breakdown.advance_rent_yen)}</div></div>
            <div class="p-2 rounded bg-slate-50 border"><div class="text-[10px] text-slate-500">保証会社初回料</div><div class="font-bold">${yen(mainPr.breakdown.guarantee_fee_yen)}</div></div>
          </div>
        </div>
      ` : ''}

      <!-- 03.13 Mandatory & Desired Conditions Checklist -->
      <div class="space-y-2.5">
        <h4 class="text-sm font-extrabold text-slate-900">📋 03.13 必須条件＆希望設備（Tier 1 / Tier 2）適合チェック</h4>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          ${checkItem('月額総家賃 (≦17万)', p.total_monthly_yen <= 170000, yen(p.total_monthly_yen))}
          ${checkItem('専有面積 (≧50㎡)', p.area_sqm >= 50, p.area_sqm + '㎡')}
          ${checkItem('建物構造 (RC/SRC)', p.structure.includes('RC'), p.structure)}
          ${checkItem('築年数 (≦25年)', p.age_years <= 25, '築' + p.age_years + '年 (' + p.built_date + ')')}
          ${checkItem('駅徒歩 (≦15分)', p.walk_minutes <= 15, '徒歩' + p.walk_minutes + '分')}
          ${checkItem('豊洲通勤 (≦60分)', p.commute_toyosu_min <= 60, '約' + p.commute_toyosu_min + '分')}
          ${checkItem('階数 (2階以上)', !p.floor_info.startsWith('1階'), p.floor_info)}
          ${checkItem('向き (北系以外)', !p.direction.includes('北'), p.direction + '向き')}
          ${checkItem('ガス種別 (都市ガス)', p.gas_type === '都市ガス' || p.gas_type === 'オール電化', p.gas_type)}
        </div>
        <div class="flex flex-wrap gap-1.5 pt-1">
          <span class="px-2.5 py-1 rounded-full text-xs font-bold ${eq.bath_dryer ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'bg-slate-100 text-slate-400'}">🔥Tier1: 浴室乾燥機 ${eq.bath_dryer ? '⭕' : 'ー'}</span>
          <span class="px-2.5 py-1 rounded-full text-xs font-bold ${eq.reheating_bath ? 'bg-indigo-50 text-indigo-800 border border-indigo-200' : 'bg-slate-100 text-slate-400'}">Tier2: 追い焚き ${eq.reheating_bath ? '⭕' : 'ー'}</span>
          <span class="px-2.5 py-1 rounded-full text-xs font-bold ${eq.washlet ? 'bg-indigo-50 text-indigo-800 border border-indigo-200' : 'bg-slate-100 text-slate-400'}">Tier2: 温水洗浄便座 ${eq.washlet ? '⭕' : 'ー'}</span>
          <span class="px-2.5 py-1 rounded-full text-xs font-bold ${eq.free_internet ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-400'}">🌐 ネット無料 ${eq.free_internet ? '⭕' : 'ー'}</span>
          <span class="px-2.5 py-1 rounded-full text-xs font-bold ${eq.walk_in_closet ? 'bg-purple-100 text-purple-800 border border-purple-300' : 'bg-slate-100 text-slate-400'}">👗 WIC ${eq.walk_in_closet ? '⭕' : 'ー'}</span>
          <span class="px-2.5 py-1 rounded-full text-xs font-bold ${eq.roof_balcony ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-100 text-slate-400'}">☀️ ルーフバルコニー ${eq.roof_balcony ? '⭕' : 'ー'}</span>
        </div>
      </div>

      <!-- Management, Contract & Notes -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div class="font-bold text-slate-700">🏢 管理会社・管理形態・入居可能日</div>
          <div class="mt-1 text-slate-900 font-medium">${p.management_info}</div>
          <div class="mt-1 text-slate-600">入居時期: <span class="font-bold text-slate-900">${p.available_date}</span></div>
          <div class="mt-1 text-slate-600">洗濯機置場: <span class="font-bold text-slate-900">${p.washer_pan_status}</span></div>
        </div>
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div class="font-bold text-slate-700">📝 契約条件・解約予告・告知事項</div>
          <div class="mt-1 text-slate-800">${p.contract_terms}</div>
          <div class="mt-1 text-slate-600">告知事項: <span class="font-semibold">${p.disclosure_notes}</span></div>
        </div>
      </div>

      <!-- Editable Notes -->
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">✏️ マスター＆Yumi様 物件メモ（フォーカスを外すと自動保存）:</label>
        <textarea onblur="updatePropertyField('${p.id}', 'notes', this.value)" rows="2" class="w-full border border-slate-300 rounded-xl p-2.5 text-xs bg-white">${p.notes || ''}</textarea>
      </div>
    </div>
  `;
}

async function updatePropertyField(id, field, value) {
  const res = await fetch('/api/update_property', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, [field]: value })
  });
  const out = await res.json();
  if (out.ok) {
    DB = out.data;
    flashSyncBadge();
    renderAll();
  }
}

function setAgencyFilter(af) {
  currentAgencyFilter = af;
  document.querySelectorAll('.agency-filter-btn').forEach((btn) => {
    const active = btn.getAttribute('data-af') === af;
    btn.className = active
      ? 'agency-filter-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-sm'
      : 'agency-filter-btn px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200';
  });
  renderAgencies();
}

function renderAgencies() {
  const rankOrder = { S: 1, A: 2, B: 3, C: 4, PENDING: 5, NG: 6 };
  let list = [...DB.agencies].filter((a) => {
    if (currentAgencyFilter === 'WAVE1') return a.wave.includes('第1弾');
    if (currentAgencyFilter === 'REPLIED') return ['S', 'A', 'B', 'C', 'NG'].includes(a.master_rank);
    if (currentAgencyFilter === 'TOKYO') return a.area_group === 'tokyo';
    if (currentAgencyFilter === 'KANAGAWA') return a.area_group === 'kanagawa';
    return true;
  });

  list.sort((a, b) => {
    const ra = rankOrder[a.master_rank] || 9;
    const rb = rankOrder[b.master_rank] || 9;
    if (ra !== rb) return ra - rb;
    return (b.google_reviews || 0) - (a.google_reviews || 0);
  });

  const el = document.getElementById('agency-list');
  el.innerHTML = list.map((a) => `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col justify-between gap-3">
      <div>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-1 rounded-lg text-xs font-extrabold rank-${a.master_rank}">
              ${a.master_rank === 'S' ? '🌟 Sランク（最優良）' : a.master_rank === 'A' ? '⭕ Aランク（優良）' : a.master_rank === 'B' ? '🔺 Bランク（様子見）' : a.master_rank === 'C' ? 'Cランク（微妙）' : a.master_rank === 'NG' ? '❌ NG（除外）' : '⏳ 返信待ち'}
            </span>
            <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${a.area_group === 'tokyo' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}">
              ${a.area_group === 'tokyo' ? '🗼 都内（' + a.station + '）' : '🌉 神奈川（' + a.station + '）'}
            </span>
          </div>
          <div class="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
            <span>Google ★${a.google_rating}</span>
            <span class="text-slate-500 font-normal">(${a.google_reviews}件)</span>
          </div>
        </div>

        <div class="mt-2.5 flex flex-wrap items-baseline justify-between gap-2">
          <h3 class="text-base font-extrabold text-slate-900">${a.company_name} <span class="text-sm font-semibold text-slate-600">${a.branch_name}</span></h3>
          <div class="text-xs text-slate-600">担当: <input type="text" value="${a.agent_name || ''}" onblur="updateAgencyField('${a.id}', 'agent_name', this.value)" class="border-b border-slate-300 px-1 font-bold text-slate-900 w-36 focus:outline-none focus:border-blue-600" /></div>
        </div>

        <!-- 5-Axis Evaluation Controls -->
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
          <div>
            <label class="text-[10px] text-slate-500 block">マスター総合ランク判定</label>
            <select onchange="updateAgencyField('${a.id}', 'master_rank', this.value)" class="mt-0.5 w-full border border-slate-300 rounded px-1.5 py-1 bg-white font-bold">
              ${['S', 'A', 'B', 'C', 'PENDING', 'NG'].map((r) => `<option value="${r}" ${a.master_rank === r ? 'selected' : ''}>${r === 'PENDING' ? 'PENDING (返信待ち)' : r + 'ランク'}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="text-[10px] text-slate-500 block">① 電話なし遵守</label>
            <select onchange="updateAgencyField('${a.id}', 'eval_no_call', this.value)" class="mt-0.5 w-full border border-slate-300 rounded px-1.5 py-1 bg-white font-medium">
              ${['⭕遵守', '❌着信あり', '未確認'].map((v) => `<option value="${v}" ${a.eval_no_call === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="text-[10px] text-slate-500 block">② 来店強要なし（図面先行）</label>
            <select onchange="updateAgencyField('${a.id}', 'eval_no_visit_push', this.value)" class="mt-0.5 w-full border border-slate-300 rounded px-1.5 py-1 bg-white font-medium">
              ${['⭕図面先行', '⭕メール対応快諾', '⚠️来店予約・LINE誘導テンプレ', '❌来店強要', '未確認'].map((v) => `<option value="${v}" ${a.eval_no_visit_push === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="text-[10px] text-slate-500 block">③ レスポンス速度</label>
            <select onchange="updateAgencyField('${a.id}', 'eval_speed', Number(this.value))" class="mt-0.5 w-full border border-slate-300 rounded px-1.5 py-1 bg-white font-medium">
              ${[0,5,4,3,2,1].map((n) => `<option value="${n}" ${a.eval_speed === n ? 'selected' : ''}>${n === 0 ? '未確認' : '★'.repeat(n) + ' (' + n + ')'}</option>`).join('')}
            </select>
          </div>
          <div class="sm:col-span-2">
            <label class="text-[10px] text-slate-500 block">④ 仲介手数料・初期費用スタンス</label>
            <input type="text" value="${a.eval_fee_level || ''}" onblur="updateAgencyField('${a.id}', 'eval_fee_level', this.value)" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1 bg-white font-medium" />
          </div>
        </div>

        <div class="mt-2.5">
          <label class="text-[10px] text-slate-500 font-bold block">やり取り・評価メモ（フォーカスを外すと自動保存）:</label>
          <textarea onblur="updateAgencyField('${a.id}', 'memo', this.value)" rows="2" class="mt-0.5 w-full border border-slate-200 rounded-lg p-2 text-xs bg-white">${a.memo || ''}</textarea>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
        <div class="text-slate-500">
          状態: <span class="font-bold text-slate-800">${a.contact_status}</span> ／ 連絡先: <span class="font-mono text-[11px]">${a.email}</span>
        </div>
        <div class="flex items-center gap-2">
          ${a.form_url ? `<a href="${a.form_url}" target="_blank" class="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium">フォーム</a>` : ''}
          ${a.website_url ? `<a href="${a.website_url}" target="_blank" class="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium">公式HP</a>` : ''}
          ${a.map_url ? `<a href="${a.map_url}" target="_blank" class="px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium">📍Map</a>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

async function updateAgencyField(id, field, value) {
  const res = await fetch('/api/update_agency', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, [field]: value })
  });
  const out = await res.json();
  if (out.ok) {
    DB = out.data;
    flashSyncBadge();
    renderAll();
  }
}

function renderProposalsTab() {
  const el = document.getElementById('proposals-container');
  const rows = DB.proposals.map((pr) => {
    const prop = DB.properties.find((p) => p.id === pr.property_id) || {};
    const ag = getAgencyById(pr.agency_id) || {};
    const b = pr.breakdown || {};
    return `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <span class="px-2.5 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-blue-800">${prop.area_category || ''}</span>
            <h3 class="text-lg font-extrabold text-slate-900 mt-1">${prop.building_name || pr.property_id} ${prop.room_number || ''}</h3>
            <p class="text-xs text-slate-500">見積提示元: <span class="font-bold text-slate-800">${ag.company_name || ''}（${ag.agent_name || ''}）</span> ／ 想定契約日: ${pr.assumed_start_date}</p>
          </div>
          <div class="text-right">
            <div class="text-xs text-slate-500">初期費用見積総額</div>
            <div class="text-2xl font-extrabold ${pr.total_initial_cost_yen <= 800000 ? 'text-emerald-600' : 'text-rose-600'}">${yen(pr.total_initial_cost_yen)}</div>
            ${pr.cuttable_amount_yen > 0 ? `<div class="text-xs font-bold text-amber-700">💡 不要オプション削減後: ${yen(pr.total_initial_cost_yen - pr.cuttable_amount_yen)}</div>` : '<div class="text-xs text-emerald-700 font-semibold">⭕ ボッタクリ項目 0円</div>'}
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-9 gap-2 text-xs">
          <div class="p-2.5 rounded-lg bg-slate-50 border"><div class="text-[10px] text-slate-500">敷金</div><div class="font-bold mt-0.5">${yen(b.deposit_yen)}</div></div>
          <div class="p-2.5 rounded-lg bg-slate-50 border"><div class="text-[10px] text-slate-500">礼金</div><div class="font-bold mt-0.5">${yen(b.key_money_yen)}</div></div>
          <div class="p-2.5 rounded-lg ${b.brokerage_fee_yen === 0 ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-slate-50 border'}"><div class="text-[10px]">仲介手数料</div><div class="font-extrabold mt-0.5">${yen(b.brokerage_fee_yen)}</div></div>
          <div class="p-2.5 rounded-lg bg-slate-50 border"><div class="text-[10px] text-slate-500">前家賃・日割</div><div class="font-bold mt-0.5">${yen(b.advance_rent_yen)}</div></div>
          <div class="p-2.5 rounded-lg bg-slate-50 border"><div class="text-[10px] text-slate-500">保証会社初回料</div><div class="font-bold mt-0.5">${yen(b.guarantee_fee_yen)}</div></div>
          <div class="p-2.5 rounded-lg bg-slate-50 border"><div class="text-[10px] text-slate-500">火災保険料</div><div class="font-bold mt-0.5">${yen(b.insurance_yen)}</div></div>
          <div class="p-2.5 rounded-lg bg-slate-50 border"><div class="text-[10px] text-slate-500">鍵交換代</div><div class="font-bold mt-0.5">${yen(b.key_exchange_yen)}</div></div>
          <div class="p-2.5 rounded-lg bg-slate-50 border"><div class="text-[10px] text-slate-500">サポート料等</div><div class="font-bold mt-0.5">${yen(b.support_fee_yen)}</div></div>
          <div class="p-2.5 rounded-lg ${(b.disinfection_fee_yen + b.other_fee_yen) > 15000 ? 'bg-rose-50 border-rose-300 text-rose-800' : 'bg-slate-50 border'}"><div class="text-[10px]">消毒・消火剤・他</div><div class="font-bold mt-0.5">${yen((b.disinfection_fee_yen || 0) + (b.other_fee_yen || 0))}</div></div>
        </div>

        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800">
          <span class="font-bold">🔍 AI見積監査コメント:</span> ${pr.cost_audit_comment}
        </div>
      </div>
    `;
  }).join('');

  el.innerHTML = `
    <div class="bg-blue-900 text-white p-4 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 class="text-base font-extrabold">💡 初期費用・相見積もりの鉄則（03.13 基準）</h3>
        <p class="text-xs text-blue-200 mt-0.5">他社やSUUMOで見つけた物件でも、Sランクの仲介会社（スタートライン等）に「この物件を御社で仲介してもらえますか？」と持ち込むことで、不要な消臭抗菌代・消火器代をカットし、仲介手数料も0円〜割引にできるケースが多々あります。</p>
      </div>
    </div>
    <div class="space-y-4 mt-4">${rows}</div>
  `;
}

function renderViewingTab() {
  const el = document.getElementById('viewing-container');
  const p = DB.properties.find((x) => x.id === selectedViewingPropId) || DB.properties[0];
  if (!p) return;
  const vc = p.viewing_checklist || {};
  const wOk = Number(vc.washer_width_mm) >= 590 && Number(vc.washer_depth_mm) >= 540 && Number(vc.washer_height_mm) >= 1260;

  el.innerHTML = `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h3 class="text-lg font-extrabold text-slate-900">📏 内見・現地採寸チェックシート（03.13 2.2章準拠）</h3>
          <p class="text-xs text-slate-500">内見当日にスマホ・PCで実測値を入力すると、ドラム式洗濯乾燥機（幅590×奥行540×高1,260mm以上）の設置可否を自動判定して保存します。</p>
        </div>
        <div>
          <label class="text-xs font-bold text-slate-600 mr-2">対象物件を選択:</label>
          <select onchange="selectedViewingPropId=this.value; renderViewingTab();" class="border border-slate-300 rounded-xl px-3 py-2 bg-white text-sm font-bold">
            ${DB.properties.map((x) => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${x.building_name} ${x.room_number}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <!-- Washer Pan Measurement -->
        <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
          <div class="flex items-center justify-between">
            <h4 class="text-sm font-extrabold text-slate-900">① ドラム式洗濯乾燥機 防水パン実測</h4>
            <span class="px-2.5 py-1 rounded-full text-xs font-bold ${wOk ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
              ${wOk ? '⭕ ドラム式設置基準クリア！' : '基準: 幅590×奥行540×高1260mm以上'}
            </span>
          </div>
          <div class="grid grid-cols-3 gap-2 text-xs">
            <div>
              <label class="block text-slate-600 font-medium mb-1">内寸 幅 (mm)</label>
              <input type="number" id="vc-w" value="${vc.washer_width_mm || ''}" placeholder="例: 640" onchange="saveViewingChecklist('${p.id}')" class="w-full border rounded-lg p-2 bg-white font-bold" />
            </div>
            <div>
              <label class="block text-slate-600 font-medium mb-1">内寸 奥行 (mm)</label>
              <input type="number" id="vc-d" value="${vc.washer_depth_mm || ''}" placeholder="例: 640" onchange="saveViewingChecklist('${p.id}')" class="w-full border rounded-lg p-2 bg-white font-bold" />
            </div>
            <div>
              <label class="block text-slate-600 font-medium mb-1">床〜上部棚 高さ (mm)</label>
              <input type="number" id="vc-h" value="${vc.washer_height_mm || ''}" placeholder="例: 1350" onchange="saveViewingChecklist('${p.id}')" class="w-full border rounded-lg p-2 bg-white font-bold" />
            </div>
          </div>
          <p class="text-[11px] text-slate-500">※搬入経路（玄関・洗面所ドアの有効幅が650mm以上あるか）と、水栓（蛇口）の高さもあわせて確認してください。</p>
        </div>

        <!-- Environment & Soundproofing -->
        <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
          <h4 class="text-sm font-extrabold text-slate-900">② 防音性・治安・電車客層・共用部チェック</h4>
          <div>
            <label class="block text-slate-700 font-bold mb-1">隣室・上下階・外の遮音性（壁コンコン・窓閉め時）</label>
            <input type="text" id="vc-sound" value="${vc.soundproofing || ''}" placeholder="例: RC界壁しっかり、窓を閉めれば外の音ほぼ無音" onchange="saveViewingChecklist('${p.id}')" class="w-full border rounded-lg p-2 bg-white" />
          </div>
          <div>
            <label class="block text-slate-700 font-bold mb-1">駅からの道のり・周辺の治安（昼／夜の雰囲気・街灯・坂）</label>
            <input type="text" id="vc-safety" value="${vc.safety_day_night || ''}" placeholder="例: 大通りから1本入った住宅街で静か、コンビニ徒歩2分" onchange="saveViewingChecklist('${p.id}')" class="w-full border rounded-lg p-2 bg-white" />
          </div>
          <div>
            <label class="block text-slate-700 font-bold mb-1">実際に電車に乗っている人の感じ・混雑度</label>
            <input type="text" id="vc-train" value="${vc.train_atmosphere || ''}" placeholder="例: 落ち着いた通勤客が多い" onchange="saveViewingChecklist('${p.id}')" class="w-full border rounded-lg p-2 bg-white" />
          </div>
          <div>
            <label class="block text-slate-700 font-bold mb-1">共用部（ゴミ置場・集合ポスト・駐輪場・掲示板）の管理状態</label>
            <input type="text" id="vc-common" value="${vc.common_area_cleanliness || ''}" placeholder="例: ゴミ置場清潔、騒音注意の張り紙なし" onchange="saveViewingChecklist('${p.id}')" class="w-full border rounded-lg p-2 bg-white" />
          </div>
        </div>
      </div>
    </div>
  `;
}

async function saveViewingChecklist(propId) {
  const vc = {
    washer_width_mm: document.getElementById('vc-w')?.value || '',
    washer_depth_mm: document.getElementById('vc-d')?.value || '',
    washer_height_mm: document.getElementById('vc-h')?.value || '',
    soundproofing: document.getElementById('vc-sound')?.value || '',
    safety_day_night: document.getElementById('vc-safety')?.value || '',
    train_atmosphere: document.getElementById('vc-train')?.value || '',
    common_area_cleanliness: document.getElementById('vc-common')?.value || ''
  };
  await updatePropertyField(propId, 'viewing_checklist', vc);
}

function flashSyncBadge() {
  const b = document.getElementById('sync-badge');
  if (!b) return;
  b.textContent = '✅ PKB JSON & SQLite 自動保存完了！';
  b.className = 'px-2.5 py-1 rounded-full bg-blue-600 text-white font-bold transition';
  setTimeout(() => {
    b.textContent = '● PKB JSON & SQLite 双方向同期中';
    b.className = 'px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium transition';
  }, 2000);
}

window.addEventListener('DOMContentLoaded', reloadData);
