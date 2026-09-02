// 렌더 세팅 공유 상태 — 게임 루프와 세팅 UI 가 같은 값을 본다(실시간 반영).
// 우선순위: URL 파라미터(있으면 선호로 저장) → localStorage 저장값 → 기본값.
// 기본은 **보간 ON**(사용자 선호). interp: 'auto'|'on'|'off', blend: 0..0.8.

const KEY_INTERP = 'sf-interp';
const KEY_BLEND = 'sf-blend';

const clampBlend = (n) => (Number.isFinite(n) ? Math.max(0, Math.min(0.8, n)) : 0);
const read = (k) => {
	try {
		return localStorage.getItem(k);
	} catch {
		return null;
	}
};
const write = (k, v) => {
	try {
		localStorage.setItem(k, v);
	} catch {
		/* 프라이빗 모드 등 — 무시 */
	}
};

// 과거값('1'/'0')과 새 모드 문자열 모두 허용.
const normInterp = (s) =>
	s === '1' || s === 'on'
		? 'on'
		: s === '0' || s === 'off'
		? 'off'
		: s === 'auto'
		? 'auto'
		: null;

const params = new URLSearchParams(location.search);

let interpMode = (() => {
	const p = normInterp(params.get('interp'));
	if (p) {
		write(KEY_INTERP, p);
		return p;
	}
	return normInterp(read(KEY_INTERP)) ?? 'on'; // 기본 '보간'(on)
})();

let blendAmount = (() => {
	const pv = params.get('blend');
	if (pv !== null) {
		const v = clampBlend(parseFloat(pv));
		write(KEY_BLEND, String(v));
		return v;
	}
	const s = read(KEY_BLEND);
	return s !== null ? clampBlend(parseFloat(s)) : 0;
})();

export const renderSettings = {
	get interpMode() {
		return interpMode;
	},
	get blendAmount() {
		return blendAmount;
	},
	setInterp(mode) {
		interpMode = normInterp(mode) ?? 'auto';
		write(KEY_INTERP, interpMode);
	},
	setBlend(v) {
		blendAmount = clampBlend(typeof v === 'number' ? v : parseFloat(v));
		write(KEY_BLEND, String(blendAmount));
	},
	reset() {
		this.setInterp('on'); // 기본 보간
		this.setBlend(0);
	},
};
