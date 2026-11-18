let DB = { agencies: [], properties: [], proposals: [], email_logs: [], meta: {} };
let currentTab = 'properties';
let currentPropFilter = 'ALL';
let currentAgencyFilter = 'ALL';
let selectedPropertyId = null;
let selectedImageMode = 'maisoku'; // 'maisoku' or 'estimate'
let selectedRightSubTab = 'ai'; // 'ai' | 'rules' | 'cost' | 'contract'
let selectedViewingPropId = null;

const yen = (n) => (n === null || n === undefined) ? '-' : Number(n).toLocaleString('ja-JP') + '円';
const man = (n) => (n === null || n === undefined) ? '-' : (Number(n) / 10000).toFixed(1) + '万';

let isStaticHost = false;

async function reloadData() {
  try {
    const res = await fetch('./api/data');
    if (!res.ok) throw new Error('Static host');
    DB = await res.json();
    isStaticHost = false;
  } catch (e) {
    const res = await fetch('./data/housing_db.json?t=' + Date.now());
    DB = await res.json();
    isStaticHost = true;
    applyLocalOverrides();
    const b = document.getElementById('sync-badge');
    if (b) b.textContent = '📱 iPad/Web閲覧モード';
  }
  if (!selectedPropertyId && DB.properties.length > 0) {
    selectedPropertyId = DB.properties[0].id;
  }
  if (!selectedViewingPropId && DB.properties.length > 0) {
    selectedViewingPropId = DB.properties[0].id;
  }
  renderAll();
}

function applyLocalOverrides() {
  try {
    const propOverrides = JSON.parse(localStorage.getItem('housing_prop_overrides') || '{}');
    DB.properties.forEach((p) => {
      if (propOverrides[p.id]) Object.assign(p, propOverrides[p.id]);
    });
    const agOverrides = JSON.parse(localStorage.getItem('housing_ag_overrides') || '{}');
    DB.agencies.forEach((a) => {
      if (agOverrides[a.id]) Object.assign(a, agOverrides[a.id]);
    });
  } catch (e) {}
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

function openImageModal(src) {
  const modal = document.getElementById('image-modal');
  const img = document.getElementById('image-modal-src');
  img.src = src;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeImageModal() {
  const modal = document.getElementById('image-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeImageModal();
});

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
  const kpiEl = document.getElementById('kpi-row');
  if (!kpiEl) return;
  const passCount = DB.properties.filter((p) => p.rule_check_status === 'PASS').length;
  const pdfCount = DB.proposals.filter((pr) => pr.maisoku_pdf).length;
  const wave1Count = DB.agencies.filter((a) => a.wave.includes('第1弾')).length;
  const sRankAgencies = DB.agencies.filter((a) => a.master_rank === 'S' || a.master_rank === 'A').length;
  const minCost = Math.min(...DB.proposals.map((p) => p.total_initial_cost_yen));

  kpiEl.innerHTML = `
    <div class="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
      <div class="text-[11px] text-slate-500">登録物件数</div>
      <div class="text-lg font-extrabold text-slate-900">${DB.properties.length}件 <span class="text-xs font-semibold text-emerald-700">(⭕合格 ${passCount}件)</span></div>
    </div>
    <div class="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
      <div class="text-[11px] text-slate-500">到着マイソク・見積書</div>
      <div class="text-lg font-extrabold text-blue-600">${pdfCount}件</div>
    </div>
    <div class="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
      <div class="text-[11px] text-slate-500">最安初期費用見積</div>
      <div class="text-lg font-extrabold text-emerald-600">${yen(minCost)}</div>
    </div>
    <div class="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
      <div class="text-[11px] text-slate-500">第1弾 送信済業者</div>
      <div class="text-lg font-extrabold text-slate-900">${wave1Count}社 <span class="text-[11px] font-normal text-slate-500">(都内14+神奈川6)</span></div>
    </div>
    <div class="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
      <div class="text-[11px] text-slate-500">優良判定（S/Aランク）</div>
      <div class="text-lg font-extrabold text-amber-600">${sRankAgencies}社</div>
    </div>
    <div class="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
      <div class="text-[11px] text-slate-500">水曜定休明けの返信</div>
      <div class="text-xs font-bold text-slate-800 mt-1">11/19(木) 10:00〜順次</div>
    </div>
  `;
}

function setPropFilter(f) {
  currentPropFilter = f;
  renderProperties();
}

function selectProperty(id) {
  selectedPropertyId = id;
  selectedImageMode = 'maisoku';
  renderProperties();
}

function setImageMode(mode) {
  selectedImageMode = mode;
  renderPropertyWorkspace();
}

function setRightSubTab(sub) {
  selectedRightSubTab = sub;
  renderPropertyWorkspace();
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

  // Render Single-Row Compact Property Pills
  const strip = document.getElementById('property-strip');
  strip.innerHTML = list.map((p) => {
    const isSel = p.id === selectedPropertyId;
    const prs = getProposalsForProperty(p.id);
    const hasPdf = prs.some((pr) => pr.maisoku_pdf);
    const dot = p.rule_check_status === 'PASS' ? '⭕' : p.rule_check_status === 'RELAXED' ? '⚠️' : '❌';

    return `
      <button onclick="selectProperty('${p.id}')" class="shrink-0 rounded-lg px-2.5 py-1.5 transition border text-left flex items-center gap-2 ${isSel ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800'}">
        <span class="text-xs font-extrabold">${dot} ${p.building_name}</span>
        <span class="text-[11px] ${isSel ? 'text-blue-100' : 'text-slate-500'}">${man(p.total_monthly_yen)} / ${p.area_sqm}㎡</span>
        ${hasPdf ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-bold ${isSel ? 'bg-white text-blue-700' : 'bg-blue-100 text-blue-800'}">マイソク</span>` : ''}
      </button>
    `;
  }).join('');

  renderPropertyWorkspace();
}

function renderPropertyWorkspace() {
  const p = DB.properties.find((x) => x.id === selectedPropertyId);
  const el = document.getElementById('property-workspace');
  if (!p) {
    el.innerHTML = '<div class="p-8 text-center text-slate-400">上のバーから物件を選択してください</div>';
    return;
  }

  const prs = getProposalsForProperty(p.id);
  const mainPr = prs[0] || null;
  const pdfFile = mainPr && mainPr.maisoku_pdf ? mainPr.maisoku_pdf : null;
  const hasMaisokuPdf = Boolean(pdfFile);
  const eq = p.equipments || {};

  const currentImgFile = selectedImageMode === 'estimate'
    ? (p.estimate_image || p.maisoku_image)
    : (p.maisoku_image || p.estimate_image);
  const currentImgUrl = currentImgFile ? `./images/${currentImgFile}` : '';

  const labelBtn1 = hasMaisokuPdf ? '🖼️ 1. 募集図面（マイソク）' : '📐 1. 間取り図';
  const labelBtn2 = hasMaisokuPdf ? '🧾 2. 初期費用概算見積書' : '🏢 2. 建物外観';

  const checkPill = (label, ok, val) => `
    <div class="px-2.5 py-1.5 rounded-lg border ${ok ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' : 'bg-rose-50 border-rose-300 text-rose-900'} flex items-center justify-between text-xs">
      <span class="text-slate-500 text-[11px]">${label}</span>
      <span class="font-extrabold">${ok ? '⭕' : '❌'} ${val}</span>
    </div>
  `;

  // Build Right Sub-Tab Content
  let rightTabHtml = '';
  if (selectedRightSubTab === 'ai') {
    rightTabHtml = `
      <div class="space-y-2.5">
        ${p.fail_reasons && p.fail_reasons.length > 0 ? `
          <div class="p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-xs text-rose-900 space-y-1">
            <div class="font-extrabold">🚨 必須条件・緩和条件の判定理由:</div>
            ${p.fail_reasons.map((r) => `<div>・${r}</div>`).join('')}
          </div>
        ` : ''}

        <div class="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200">
          <h4 class="text-xs font-extrabold text-emerald-900 mb-1.5">🌟 AI診断：この物件の強み・おすすめ理由</h4>
          <ul class="space-y-1 text-xs text-emerald-950 list-disc pl-4 leading-snug">
            ${(p.ai_pros || []).map((x) => `<li>${x}</li>`).join('')}
          </ul>
        </div>

        <div class="p-3 rounded-xl bg-amber-50/80 border border-amber-200">
          <h4 class="text-xs font-extrabold text-amber-900 mb-1.5">⚠️ AI診断：懸念点・確認すべきポイント</h4>
          <ul class="space-y-1 text-xs text-amber-950 list-disc pl-4 leading-snug">
            ${(p.ai_cons || []).map((x) => `<li>${x}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
  } else if (selectedRightSubTab === 'rules') {
    rightTabHtml = `
      <div class="space-y-2.5">
        <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
          <span class="font-bold text-slate-600">間取り・居室詳細:</span>
          <span class="font-extrabold text-slate-900 ml-1">${p.layout_detail}</span>
        </div>

        <div class="grid grid-cols-3 gap-1.5">
          ${checkPill('家賃≦17万', p.total_monthly_yen <= 170000, man(p.total_monthly_yen) + '円')}
          ${checkPill('面積≧50㎡', p.area_sqm >= 50, p.area_sqm + '㎡')}
          ${checkPill('RC/SRC造', p.structure.includes('RC'), p.structure)}
          ${checkPill('築25年以内', p.age_years <= 25, '築' + p.age_years + '年')}
          ${checkPill('徒歩≦15分', p.walk_minutes <= 15, '歩' + p.walk_minutes + '分')}
          ${checkPill('豊洲≦60分', p.commute_toyosu_min <= 60, '約' + p.commute_toyosu_min + '分')}
          ${checkPill('2階以上', !p.floor_info.startsWith('1階'), p.floor_info)}
          ${checkPill('北向き不可', !p.direction.includes('北'), p.direction + '向')}
          ${checkPill('都市ガス', p.gas_type === '都市ガス' || p.gas_type === 'オール電化', p.gas_type)}
        </div>

        <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
          <div class="text-xs font-extrabold text-slate-700">希望設備（Tier 1 / Tier 2）チェック:</div>
          <div class="flex flex-wrap gap-1.5">
            <span class="px-2.5 py-1 rounded-lg text-xs font-bold ${eq.bath_dryer ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'bg-white text-slate-400 border'}">🔥Tier1: 浴室乾燥機 ${eq.bath_dryer ? '⭕' : 'ー'}</span>
            <span class="px-2.5 py-1 rounded-lg text-xs font-bold ${eq.reheating_bath ? 'bg-indigo-50 text-indigo-800 border border-indigo-200' : 'bg-white text-slate-400 border'}">追い焚き ${eq.reheating_bath ? '⭕' : 'ー'}</span>
            <span class="px-2.5 py-1 rounded-lg text-xs font-bold ${eq.washlet ? 'bg-indigo-50 text-indigo-800 border border-indigo-200' : 'bg-white text-slate-400 border'}">温水洗浄便座 ${eq.washlet ? '⭕' : 'ー'}</span>
            <span class="px-2.5 py-1 rounded-lg text-xs font-bold ${eq.free_internet ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-white text-slate-400 border'}">ネット無料 ${eq.free_internet ? '⭕' : 'ー'}</span>
            <span class="px-2.5 py-1 rounded-lg text-xs font-bold ${eq.walk_in_closet ? 'bg-purple-100 text-purple-800 border border-purple-300' : 'bg-white text-slate-400 border'}">WIC ${eq.walk_in_closet ? '⭕' : 'ー'}</span>
            <span class="px-2.5 py-1 rounded-lg text-xs font-bold ${eq.roof_balcony ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-white text-slate-400 border'}">ルーフバルコニー ${eq.roof_balcony ? '⭕' : 'ー'}</span>
          </div>
        </div>

        <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
          <div><span class="font-bold text-slate-500">所在地:</span> ${p.address}</div>
          <div><span class="font-bold text-slate-500">洗濯機置場:</span> <span class="font-bold text-slate-900">${p.washer_pan_status}</span>（基準: 幅590×奥行540×高1260mm以上）</div>
        </div>
      </div>
    `;
  } else if (selectedRightSubTab === 'cost') {
    if (mainPr) {
      const b = mainPr.breakdown || {};
      rightTabHtml = `
        <div class="space-y-2.5 text-xs">
          <div class="p-3 rounded-xl bg-slate-900 text-white flex items-center justify-between">
            <div>
              <div class="text-[11px] text-slate-400">見積提示元: ${getAgencyById(mainPr.agency_id)?.company_name || ''}</div>
              <div class="font-bold text-xs text-slate-200 mt-0.5">${mainPr.assumed_start_date}</div>
            </div>
            <div class="text-right">
              <div class="text-[10px] text-slate-400">初期費用概算総額</div>
              <div class="text-xl font-extrabold ${mainPr.total_initial_cost_yen <= 800000 ? 'text-emerald-400' : 'text-rose-400'}">${yen(mainPr.total_initial_cost_yen)}</div>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-1.5">
            <div class="p-2 rounded-lg bg-slate-50 border"><div class="text-[10px] text-slate-500">敷金</div><div class="font-bold mt-0.5">${yen(b.deposit_yen)}</div></div>
            <div class="p-2 rounded-lg bg-slate-50 border"><div class="text-[10px] text-slate-500">礼金</div><div class="font-bold mt-0.5">${yen(b.key_money_yen)}</div></div>
            <div class="p-2 rounded-lg ${b.brokerage_fee_yen === 0 ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-slate-50 border'}"><div class="text-[10px]">仲介手数料</div><div class="font-extrabold mt-0.5">${yen(b.brokerage_fee_yen)}</div></div>
            <div class="p-2 rounded-lg bg-slate-50 border"><div class="text-[10px] text-slate-500">前家賃＋日割</div><div class="font-bold mt-0.5">${yen(b.advance_rent_yen)}</div></div>
            <div class="p-2 rounded-lg bg-slate-50 border"><div class="text-[10px] text-slate-500">保証会社初回料</div><div class="font-bold mt-0.5">${yen(b.guarantee_fee_yen)}</div></div>
            <div class="p-2 rounded-lg bg-slate-50 border"><div class="text-[10px] text-slate-500">火災保険料(2年)</div><div class="font-bold mt-0.5">${yen(b.insurance_yen)}</div></div>
            <div class="p-2 rounded-lg bg-slate-50 border"><div class="text-[10px] text-slate-500">鍵交換代</div><div class="font-bold mt-0.5">${yen(b.key_exchange_yen)}</div></div>
            <div class="p-2 rounded-lg bg-slate-50 border"><div class="text-[10px] text-slate-500">サポート料等</div><div class="font-bold mt-0.5">${yen(b.support_fee_yen)}</div></div>
            <div class="p-2 rounded-lg ${(b.disinfection_fee_yen + b.other_fee_yen) > 15000 ? 'bg-rose-50 border-rose-300 text-rose-800' : 'bg-slate-50 border'}"><div class="text-[10px]">消毒・消火剤・他</div><div class="font-bold mt-0.5">${yen((b.disinfection_fee_yen || 0) + (b.other_fee_yen || 0))}</div></div>
          </div>

          <div class="p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-slate-800 leading-snug">
            <div class="font-extrabold text-blue-900 mb-1">🔍 AI見積書ボッタクリ診断:</div>
            ${mainPr.cost_audit_comment}
          </div>
        </div>
      `;
    } else {
      rightTabHtml = `
        <div class="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
          <div class="font-extrabold">📌 初期費用見積書はまだ取得していません（SUUMO共有物件）</div>
          <p>基本的な敷金・礼金条件: <span class="font-bold">${p.contract_terms}</span></p>
          <p>この物件の見積書が必要な場合は、Sランクの「スタートライン（八木様）」または「タウンハウジング（佐藤様）」へ物件名を伝えて初期費用見積書をご依頼ください。</p>
        </div>
      `;
    }
  } else if (selectedRightSubTab === 'contract') {
    rightTabHtml = `
      <div class="space-y-2.5 text-xs">
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
          <div><span class="font-bold text-slate-500">管理会社・管理形態:</span> <span class="font-bold text-slate-900">${p.management_info}</span></div>
          <div><span class="font-bold text-slate-500">入居可能時期:</span> <span class="font-bold text-slate-900">${p.available_date}</span></div>
          <div><span class="font-bold text-slate-500">契約・解約・更新条件:</span> <span class="text-slate-900">${p.contract_terms}</span></div>
          <div><span class="font-bold text-slate-500">告知事項・特記事項:</span> <span class="text-slate-900">${p.disclosure_notes}</span></div>
        </div>

        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <label class="font-extrabold text-slate-700 block">✏️ マスター＆Yumi様 物件メモ（フォーカスを外すと自動保存）:</label>
          <textarea
            onblur="updatePropertyField('${p.id}', 'notes', this.value)"
            rows="4"
            placeholder="気になる点、パートナーの感想、不動産会社への確認結果などを自由に記入..."
            class="w-full border border-slate-300 rounded-lg p-2.5 text-xs bg-white font-medium"
          >${p.notes || ''}</textarea>
        </div>
      </div>
    `;
  }

  el.innerHTML = `
    <!-- Top Compact Property Title Bar -->
    <div class="px-3 sm:px-4 py-2.5 lg:py-2 bg-slate-900 text-white shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div class="flex flex-wrap items-center gap-1.5 sm:gap-2.5 min-w-0">
        <span class="px-2 py-0.5 rounded text-[11px] font-extrabold shrink-0 ${p.rule_check_status === 'PASS' ? 'bg-emerald-500 text-white' : p.rule_check_status === 'RELAXED' ? 'bg-amber-400 text-slate-950' : 'bg-rose-600 text-white'}">
          ${p.rule_check_status === 'PASS' ? '⭕ 必須条件クリア' : p.rule_check_status === 'RELAXED' ? '⚠️ 緩和条件枠' : '❌ 条件NG'}
        </span>
        <h2 class="text-sm sm:text-base font-extrabold">${p.building_name} <span class="text-blue-300">${p.room_number}</span></h2>
        <span class="text-[11px] sm:text-xs text-slate-300 block sm:inline w-full sm:w-auto">📍 ${p.station_info}（豊洲へ約${p.commute_toyosu_min}分）</span>
      </div>

      <!-- Inline Evaluation & External Links -->
      <div class="flex flex-wrap items-center gap-1.5 text-xs shrink-0">
        <select onchange="updatePropertyField('${p.id}', 'status', this.value)" class="rounded px-2 py-1 lg:py-0.5 bg-slate-800 text-white font-bold border border-slate-600">
          ${['候補（検討中）', '🔥内見希望（最有力）', '内見予定', '内見済', '見送り候補', '見送り（条件外）'].map((s) => `<option value="${s}" ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <select onchange="updatePropertyField('${p.id}', 'master_rating', Number(this.value))" class="rounded px-1.5 py-1 lg:py-0.5 bg-slate-800 text-amber-400 font-bold border border-slate-600">
          ${[0,1,2,3,4,5].map((n) => `<option value="${n}" ${p.master_rating === n ? 'selected' : ''}>自分:${n === 0 ? '-' : '★'.repeat(n)}</option>`).join('')}
        </select>
        <select onchange="updatePropertyField('${p.id}', 'partner_rating', Number(this.value))" class="rounded px-1.5 py-1 lg:py-0.5 bg-slate-800 text-pink-400 font-bold border border-slate-600">
          ${[0,1,2,3,4,5].map((n) => `<option value="${n}" ${p.partner_rating === n ? 'selected' : ''}>Yumi:${n === 0 ? '-' : '★'.repeat(n)}</option>`).join('')}
        </select>
        ${pdfFile ? `<a href="./pdfs/${pdfFile}" target="_blank" class="px-2 py-1 lg:py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold">📄元PDF</a>` : ''}
        ${p.suumo_url ? `<a href="${p.suumo_url}" target="_blank" class="px-2 py-1 lg:py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold">🔗SUUMO</a>` : ''}
      </div>
    </div>

    <!-- Responsive Body: Mobile/Portrait Tablet = Stacked & Natural Scroll / Desktop (lg+) = Side-by-Side 1-Screen Fit -->
    <div class="flex-1 lg:min-h-0 grid grid-cols-1 lg:grid-cols-12">
      <!-- LEFT (7 COLS on lg, full width on mobile): MAISOKU / ESTIMATE IMAGE -->
      <div class="lg:col-span-7 lg:h-full lg:min-h-0 bg-slate-100/80 border-b lg:border-b-0 lg:border-r border-slate-200 p-2 sm:p-2.5 flex flex-col gap-2">
        <!-- Image Toggle Buttons -->
        <div class="flex flex-wrap items-center justify-between gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-sm shrink-0">
          <div class="flex items-center gap-1.5">
            <button onclick="setImageMode('maisoku')" class="px-2.5 sm:px-3 py-1.5 lg:py-1 rounded-lg text-xs font-extrabold transition ${selectedImageMode === 'maisoku' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">
              ${labelBtn1}
            </button>
            <button onclick="setImageMode('estimate')" class="px-2.5 sm:px-3 py-1.5 lg:py-1 rounded-lg text-xs font-extrabold transition ${selectedImageMode === 'estimate' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">
              ${labelBtn2}
            </button>
          </div>
          <button onclick="openImageModal('${currentImgUrl}')" class="px-2.5 py-1.5 lg:py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition">
            🔍 拡大
          </button>
        </div>

        <!-- Auto-Fit Image Box -->
        <div class="lg:flex-1 lg:min-h-0 bg-white rounded-xl border border-slate-200 shadow-sm p-1.5 sm:p-2 flex items-center justify-center overflow-hidden">
          ${currentImgUrl ? `
            <img
              src="${currentImgUrl}"
              alt="${p.building_name}"
              onclick="openImageModal('${currentImgUrl}')"
              title="タップ・クリックで全画面拡大"
              class="w-full lg:w-auto max-w-full max-h-[58vh] max-h-[58dvh] lg:max-h-full object-contain cursor-zoom-in rounded"
            />
          ` : `
            <div class="text-slate-400 text-xs py-12">画像がありません</div>
          `}
        </div>
      </div>

      <!-- RIGHT (5 COLS on lg, full width below image on mobile): COMPACT KPI HEADER + 4 SUB-TABS -->
      <div class="lg:col-span-5 lg:h-full lg:min-h-0 bg-white p-3 flex flex-col gap-2.5">
        <!-- Compact 3-Column Numbers Banner -->
        <div class="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-900 text-white shrink-0">
          <div>
            <div class="text-[10px] text-slate-400">月額総家賃（管理費込）</div>
            <div class="text-sm sm:text-base font-extrabold text-white">${yen(p.total_monthly_yen)}</div>
            <div class="text-[10px] text-slate-300">賃 ${man(p.rent_yen)} + 管 ${yen(p.management_fee_yen)}</div>
          </div>
          <div>
            <div class="text-[10px] text-slate-400">初期費用概算見積</div>
            <div class="text-sm sm:text-base font-extrabold ${mainPr && mainPr.total_initial_cost_yen <= 800000 ? 'text-emerald-400' : 'text-amber-300'}">
              ${mainPr ? yen(mainPr.total_initial_cost_yen) : '未取得'}
            </div>
            <div class="text-[10px] text-slate-300">${mainPr && mainPr.breakdown.brokerage_fee_yen === 0 ? '🔥仲介0円・敷0円!' : '上限80万円'}</div>
          </div>
          <div>
            <div class="text-[10px] text-slate-400">間取り・面積・AI評価</div>
            <div class="text-sm sm:text-base font-extrabold text-amber-400">${p.floor_plan} (${p.area_sqm}㎡)</div>
            <div class="text-[10px] text-slate-300">${p.structure} / 築${p.age_years}年 / AI ${p.ai_score}点</div>
          </div>
        </div>

        <!-- 4 Sub-Tab Buttons for Right Panel -->
        <div class="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0 text-xs">
          <button onclick="setRightSubTab('ai')" class="py-2 lg:py-1.5 px-1.5 rounded-lg transition text-center ${selectedRightSubTab === 'ai' ? 'subtab-active shadow-sm' : 'text-slate-600 hover:bg-white font-semibold'}">
            🤖 AI診断
          </button>
          <button onclick="setRightSubTab('rules')" class="py-2 lg:py-1.5 px-1.5 rounded-lg transition text-center ${selectedRightSubTab === 'rules' ? 'subtab-active shadow-sm' : 'text-slate-600 hover:bg-white font-semibold'}">
            📋 条件・設備
          </button>
          <button onclick="setRightSubTab('cost')" class="py-2 lg:py-1.5 px-1.5 rounded-lg transition text-center ${selectedRightSubTab === 'cost' ? 'subtab-active shadow-sm' : 'text-slate-600 hover:bg-white font-semibold'}">
            💰 初期費用
          </button>
          <button onclick="setRightSubTab('contract')" class="py-2 lg:py-1.5 px-1.5 rounded-lg transition text-center ${selectedRightSubTab === 'contract' ? 'subtab-active shadow-sm' : 'text-slate-600 hover:bg-white font-semibold'}">
            ✏️ 契約・メモ
          </button>
        </div>

        <!-- Sub-Tab Body Area -->
        <div class="lg:flex-1 lg:min-h-0 lg:overflow-y-auto pr-0.5 pb-4 lg:pb-0">
          ${rightTabHtml}
        </div>
      </div>
    </div>
  `;
}

async function updatePropertyField(id, field, value) {
  if (isStaticHost) {
    const p = DB.properties.find((x) => x.id === id);
    if (p) p[field] = value;
    const propOverrides = JSON.parse(localStorage.getItem('housing_prop_overrides') || '{}');
    propOverrides[id] = Object.assign(propOverrides[id] || {}, { [field]: value });
    localStorage.setItem('housing_prop_overrides', JSON.stringify(propOverrides));
    flashSyncBadge();
    renderAll();
    return;
  }
  const res = await fetch('./api/update_property', {
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
      ? 'agency-filter-btn px-3 py-1 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-sm'
      : 'agency-filter-btn px-3 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200';
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
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5 flex flex-col justify-between gap-2.5">
      <div>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <span class="px-2 py-0.5 rounded-lg text-xs font-extrabold rank-${a.master_rank}">
              ${a.master_rank === 'S' ? '🌟 Sランク（最優良）' : a.master_rank === 'A' ? '⭕ Aランク（優良）' : a.master_rank === 'B' ? '🔺 Bランク（様子見）' : a.master_rank === 'C' ? 'Cランク（微妙）' : a.master_rank === 'NG' ? '❌ NG（除外）' : '⏳ 返信待ち'}
            </span>
            <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${a.area_group === 'tokyo' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}">
              ${a.area_group === 'tokyo' ? '🗼 ' + a.station : '🌉 ' + a.station}
            </span>
          </div>
          <div class="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
            <span>★${a.google_rating}</span>
            <span class="text-slate-500 font-normal">(${a.google_reviews}件)</span>
          </div>
        </div>

        <div class="mt-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 class="text-sm font-extrabold text-slate-900">${a.company_name} <span class="text-xs font-semibold text-slate-600">${a.branch_name}</span></h3>
          <div class="text-xs text-slate-600">担当: <input type="text" value="${a.agent_name || ''}" onblur="updateAgencyField('${a.id}', 'agent_name', this.value)" class="border-b border-slate-300 px-1 font-bold text-slate-900 w-32 focus:outline-none focus:border-blue-600" /></div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-2 p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs">
          <div>
            <label class="text-[10px] text-slate-500 block">マスター総合ランク</label>
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
            <label class="text-[10px] text-slate-500 block">② 来店強要なし</label>
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

        <div class="mt-2">
          <textarea onblur="updateAgencyField('${a.id}', 'memo', this.value)" rows="2" class="w-full border border-slate-200 rounded-lg p-1.5 text-xs bg-white">${a.memo || ''}</textarea>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-100 text-xs">
        <div class="text-slate-500 truncate">
          状態: <span class="font-bold text-slate-800">${a.contact_status}</span>
        </div>
        <div class="flex items-center gap-1.5">
          ${a.form_url ? `<a href="${a.form_url}" target="_blank" class="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium">フォーム</a>` : ''}
          ${a.website_url ? `<a href="${a.website_url}" target="_blank" class="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium">HP</a>` : ''}
          ${a.map_url ? `<a href="${a.map_url}" target="_blank" class="px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium">📍Map</a>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

async function updateAgencyField(id, field, value) {
  if (isStaticHost) {
    const a = DB.agencies.find((x) => x.id === id);
    if (a) a[field] = value;
    const agOverrides = JSON.parse(localStorage.getItem('housing_ag_overrides') || '{}');
    agOverrides[id] = Object.assign(agOverrides[id] || {}, { [field]: value });
    localStorage.setItem('housing_ag_overrides', JSON.stringify(agOverrides));
    flashSyncBadge();
    renderAll();
    return;
  }
  const res = await fetch('./api/update_agency', {
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
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2.5">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div>
            <span class="px-2 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-blue-800">${prop.area_category || ''}</span>
            <h3 class="text-base font-extrabold text-slate-900 mt-1">${prop.building_name || pr.property_id} ${prop.room_number || ''}</h3>
            <p class="text-xs text-slate-500">見積提示元: <span class="font-bold text-slate-800">${ag.company_name || ''}（${ag.agent_name || ''}）</span> ／ 想定契約日: ${pr.assumed_start_date}</p>
          </div>
          <div class="text-right">
            <div class="text-xs text-slate-500">初期費用見積総額</div>
            <div class="text-xl font-extrabold ${pr.total_initial_cost_yen <= 800000 ? 'text-emerald-600' : 'text-rose-600'}">${yen(pr.total_initial_cost_yen)}</div>
            ${pr.cuttable_amount_yen > 0 ? `<div class="text-xs font-bold text-amber-700">💡 不要オプション削減後: ${yen(pr.total_initial_cost_yen - pr.cuttable_amount_yen)}</div>` : '<div class="text-xs text-emerald-700 font-semibold">⭕ ボッタクリ項目 0円</div>'}
          </div>
        </div>

        <div class="grid grid-cols-3 sm:grid-cols-9 gap-1.5 text-xs">
          <div class="p-2 rounded-lg bg-slate-50 border"><div class="text-[10px] text-slate-500">敷金</div><div class="font-bold mt-0.5">${yen(b.deposit_yen)}</div></div>
          <div class="p-2 rounded-lg bg-slate-50 border"><div class="text-[10px] text-slate-500">礼金</div><div class="font-bold mt-0.5">${yen(b.key_money_yen)}</div></div>
          <div class="p-2 rounded-lg ${b.brokerage_fee_yen === 0 ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-slate-50 border'}"><div class="text-[10px]">仲介手数料</div><div class="font-extrabold mt-0.5">${yen(b.brokerage_fee_yen)}</div></div>
          <div class="p-2 rounded-lg bg-slate-50 border"><div class="text-[10px] text-slate-500">前家賃・日割</div><div class="font-bold mt-0.5">${yen(b.advance_rent_yen)}</div></div>
          <div class="p-2 rounded-lg bg-slate-50 border"><div class="text-[10px] text-slate-500">保証会社初回料</div><div class="font-bold mt-0.5">${yen(b.guarantee_fee_yen)}</div></div>
          <div class="p-2 rounded-lg bg-slate-50 border"><div class="text-[10px] text-slate-500">火災保険料</div><div class="font-bold mt-0.5">${yen(b.insurance_yen)}</div></div>
          <div class="p-2 rounded-lg bg-slate-50 border"><div class="text-[10px] text-slate-500">鍵交換代</div><div class="font-bold mt-0.5">${yen(b.key_exchange_yen)}</div></div>
          <div class="p-2 rounded-lg bg-slate-50 border"><div class="text-[10px] text-slate-500">サポート料等</div><div class="font-bold mt-0.5">${yen(b.support_fee_yen)}</div></div>
          <div class="p-2 rounded-lg ${(b.disinfection_fee_yen + b.other_fee_yen) > 15000 ? 'bg-rose-50 border-rose-300 text-rose-800' : 'bg-slate-50 border'}"><div class="text-[10px]">消毒・消火剤・他</div><div class="font-bold mt-0.5">${yen((b.disinfection_fee_yen || 0) + (b.other_fee_yen || 0))}</div></div>
        </div>

        <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800">
          <span class="font-bold">🔍 AI見積監査コメント:</span> ${pr.cost_audit_comment}
        </div>
      </div>
    `;
  }).join('');

  el.innerHTML = `<div class="space-y-3">${rows}</div>`;
}

function renderViewingTab() {
  const el = document.getElementById('viewing-container');
  const p = DB.properties.find((x) => x.id === selectedViewingPropId) || DB.properties[0];
  if (!p) return;
  const vc = p.viewing_checklist || {};
  const wOk = Number(vc.washer_width_mm) >= 590 && Number(vc.washer_depth_mm) >= 540 && Number(vc.washer_height_mm) >= 1260;

  el.innerHTML = `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h3 class="text-base font-extrabold text-slate-900">📏 内見・現地採寸チェックシート（03.13 2.2章準拠）</h3>
          <p class="text-xs text-slate-500">内見当日に実測値を入力すると、ドラム式洗濯乾燥機（幅590×奥行540×高1,260mm以上）の設置可否を自動判定して保存します。</p>
        </div>
        <div>
          <label class="text-xs font-bold text-slate-600 mr-2">対象物件:</label>
          <select onchange="selectedViewingPropId=this.value; renderViewingTab();" class="border border-slate-300 rounded-xl px-3 py-1.5 bg-white text-xs font-bold">
            ${DB.properties.map((x) => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${x.building_name} ${x.room_number}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>

        <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
          <h4 class="text-sm font-extrabold text-slate-900">② 防音性・治安・電車客層・共用部チェック</h4>
          <div>
            <label class="block text-slate-700 font-bold mb-0.5">隣室・上下階・外の遮音性（壁コンコン・窓閉め時）</label>
            <input type="text" id="vc-sound" value="${vc.soundproofing || ''}" placeholder="例: RC界壁しっかり、窓を閉めれば外の音ほぼ無音" onchange="saveViewingChecklist('${p.id}')" class="w-full border rounded-lg p-1.5 bg-white" />
          </div>
          <div>
            <label class="block text-slate-700 font-bold mb-0.5">駅からの道のり・周辺の治安（昼／夜の雰囲気・街灯・坂）</label>
            <input type="text" id="vc-safety" value="${vc.safety_day_night || ''}" placeholder="例: 大通りから1本入った住宅街で静か" onchange="saveViewingChecklist('${p.id}')" class="w-full border rounded-lg p-1.5 bg-white" />
          </div>
          <div>
            <label class="block text-slate-700 font-bold mb-0.5">実際に電車に乗っている人の感じ・混雑度</label>
            <input type="text" id="vc-train" value="${vc.train_atmosphere || ''}" placeholder="例: 落ち着いた通勤客が多い" onchange="saveViewingChecklist('${p.id}')" class="w-full border rounded-lg p-1.5 bg-white" />
          </div>
          <div>
            <label class="block text-slate-700 font-bold mb-0.5">共用部（ゴミ置場・集合ポスト・駐輪場・掲示板）の管理状態</label>
            <input type="text" id="vc-common" value="${vc.common_area_cleanliness || ''}" placeholder="例: ゴミ置場清潔、騒音注意の張り紙なし" onchange="saveViewingChecklist('${p.id}')" class="w-full border rounded-lg p-1.5 bg-white" />
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
  b.textContent = '✅ 保存完了';
  b.className = 'px-2 py-0.5 rounded-full bg-blue-600 text-white font-bold transition hidden md:inline';
  setTimeout(() => {
    b.textContent = '● PKB同期中';
    b.className = 'px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium transition hidden md:inline';
  }, 2000);
}

const PASSCODE_HASH = '46d38c91112f502480fc578dcf959c52a54a77f532273f8000830e2d90805008';

async function sha256Hex(str) {
  const buf = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function checkPasscodeGate() {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return true;
  if (localStorage.getItem('housing_unlocked_hash') === PASSCODE_HASH) return true;
  const gate = document.getElementById('passcode-gate');
  if (gate) {
    gate.classList.remove('hidden');
    gate.classList.add('flex');
    const inp = document.getElementById('passcode-input');
    if (inp) {
      inp.focus();
      inp.onkeydown = (e) => { if (e.key === 'Enter') unlockPasscode(); };
    }
  }
  return false;
}

async function unlockPasscode() {
  const val = (document.getElementById('passcode-input')?.value || '').trim();
  const h = await sha256Hex(val);
  if (h === PASSCODE_HASH) {
    localStorage.setItem('housing_unlocked_hash', PASSCODE_HASH);
    const gate = document.getElementById('passcode-gate');
    if (gate) {
      gate.classList.add('hidden');
      gate.classList.remove('flex');
    }
    reloadData();
  } else {
    document.getElementById('passcode-err')?.classList.remove('hidden');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  if (checkPasscodeGate()) {
    reloadData();
  }
});
