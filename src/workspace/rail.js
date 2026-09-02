// 워크스페이스 레일 — 왼쪽 세로 네비. 게임 모드와 렌더 옵션을 한 곳에서 오간다.
// DragonHearts 의 WorkspaceRail 패턴 참고(목록을 한 곳에서만 정의). StreetFighter 는
// 별도 에디터 앱이 없으므로 "모드"는 같은 페이지의 URL 파라미터 변형이다 → 평범한 링크.
//
// base href 가 /street_fighter/ 라 `./${query}` 는 항상 게임 루트 기준으로 풀린다.

const WORKSPACES = [
	{ id: 'game', label: '게임', icon: '🎮', query: '', group: 'play' },
	{ id: 'lobby', label: '온라인 로비', icon: '🌐', query: '?net=lobby', group: 'play' },
	{ id: 'demo', label: '넷 데모', icon: '🤖', query: '?net=hostdemo', group: 'play' },
	{
		id: 'netlag',
		label: '지연 시뮬',
		icon: '🐢',
		query: '?net=hostdemo&latency=80&loss=0.08',
		group: 'play',
	},
	{ id: 'crisp', label: '선명', icon: '✨', query: '?interp=0&blend=0', group: 'render' },
	{ id: 'smooth', label: '보간', icon: '🌊', query: '?interp=1', group: 'render' },
	{ id: 'blur', label: '모션블러', icon: '💫', query: '?blend=0.4', group: 'render' },
	// 툴 — 별도 페이지(page). 게임 모드(query)와 달리 다른 HTML 로 이동.
	{ id: 'sprite', label: '스프라이트 툴', icon: '🎞️', page: 'sprite-editor.html', group: 'tools' },
];

const GROUPS = [
	{ id: 'play', label: '플레이' },
	{ id: 'render', label: '렌더' },
	{ id: 'tools', label: '툴' },
];

// 워크스페이스의 링크 주소(base href /street_fighter/ 기준 상대).
const hrefOf = (w) => `./${w.page ?? w.query ?? ''}`;

const STORAGE_KEY = 'sf-rail-collapsed';

const isCollapsed = () => {
	try {
		return localStorage.getItem(STORAGE_KEY) === '1';
	} catch {
		return false;
	}
};
const setCollapsed = (v) => {
	try {
		localStorage.setItem(STORAGE_KEY, v ? '1' : '0');
	} catch {
		/* 프라이빗 모드 등 — 무시 */
	}
};

// 현재 URL 이 어떤 워크스페이스인지. 툴은 pathname(페이지), 게임 모드는 search(파라미터)로 판별.
const currentId = () => {
	const path = location.pathname;
	const pageHit = WORKSPACES.find((w) => w.page && path.endsWith(w.page));
	if (pageHit) return pageHit.id;
	// 툴 페이지가 아니면(게임 index) search 로 모드 판별.
	const s = location.search;
	const hit = WORKSPACES.find((w) => !w.page && (w.query || '') === s);
	return hit ? hit.id : s === '' ? 'game' : null;
};

const build = () => {
	const rail = document.getElementById('sf-rail');
	if (!rail) return;
	rail.innerHTML = '';
	rail.classList.toggle('collapsed', isCollapsed());

	// 헤더: 로고 + 접기 토글
	const head = document.createElement('div');
	head.className = 'sf-rail-head';
	const brand = document.createElement('span');
	brand.className = 'sf-rail-brand';
	brand.innerHTML = '<b>SF</b><small>workspace</small>';
	const toggle = document.createElement('button');
	toggle.className = 'sf-rail-toggle';
	toggle.type = 'button';
	toggle.setAttribute('aria-label', '레일 접기/펼치기');
	const paintToggle = () => (toggle.textContent = rail.classList.contains('collapsed') ? '»' : '«');
	toggle.addEventListener('click', () => {
		const c = !rail.classList.contains('collapsed');
		rail.classList.toggle('collapsed', c);
		setCollapsed(c);
		paintToggle();
	});
	paintToggle();
	head.append(brand, toggle);
	rail.appendChild(head);

	const active = currentId();
	for (const g of GROUPS) {
		const items = WORKSPACES.filter((w) => w.group === g.id);
		if (!items.length) continue;
		const sec = document.createElement('div');
		sec.className = 'sf-rail-group';
		const lab = document.createElement('div');
		lab.className = 'sf-rail-glabel';
		lab.textContent = g.label;
		sec.appendChild(lab);
		for (const w of items) {
			const a = document.createElement('a');
			a.className = 'sf-rail-item' + (w.id === active ? ' active' : '');
			a.href = hrefOf(w);
			a.title = w.label;
			a.innerHTML = `<span class="ic">${w.icon}</span><span class="tx">${w.label}</span>`;
			sec.appendChild(a);
		}
		rail.appendChild(sec);
	}
};

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', build);
} else {
	build();
}
