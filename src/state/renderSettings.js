// 렌더 세팅 공유 상태 — 게임 루프와 세팅 UI 가 같은 값을 본다(실시간 반영).
// 우선순위: URL 파라미터(있으면 선호로 저장) → localStorage 저장값 → 기본값.
// 기본은 **보간 ON**(사용자 선호). interp: 'auto'|'on'|'off', blend: 0..0.8.

const KEY_INTERP = 'sf-interp';
const KEY_BLEND = 'sf-blend';
const KEY_SMOOTH = 'sf-smooth';

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

// 불리언 파라미터('1'/'0'/'on'/'off'/'true'/'false').
const normBool = (s) =>
	s === '1' || s === 'on' || s === 'true'
		? true
		: s === '0' || s === 'off' || s === 'false'
		? false
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

// 픽셀 스무딩. 기본 ON(사용자 선호, 2026-09-04) — 이동 잔상(LCD sample-and-hold)을
// 공간축으로 마스킹. Uljima6 M0 실측: 정수배율(우리 snap)+상시 smooth 조합이 최적.
let smooth = (() => {
	const p = normBool(params.get('smooth'));
	if (p !== null) {
		write(KEY_SMOOTH, p ? '1' : '0');
		return p;
	}
	const s = normBool(read(KEY_SMOOTH));
	return s !== null ? s : true; // 기본 ON
})();

export const renderSettings = {
	get interpMode() {
		return interpMode;
	},
	get blendAmount() {
		return blendAmount;
	},
	get smooth() {
		return smooth;
	},
	setInterp(mode) {
		interpMode = normInterp(mode) ?? 'auto';
		write(KEY_INTERP, interpMode);
	},
	setBlend(v) {
		blendAmount = clampBlend(typeof v === 'number' ? v : parseFloat(v));
		write(KEY_BLEND, String(blendAmount));
	},
	setSmooth(v) {
		smooth = !!v;
		write(KEY_SMOOTH, smooth ? '1' : '0');
	},
	reset() {
		this.setInterp('on'); // 기본 보간
		this.setBlend(0);
		this.setSmooth(true); // 기본 스무딩 ON
	},
};
