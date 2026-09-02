// 렌더 세팅 오버레이 — 선명/보간/모션블러를 한 곳에서. renderSettings 를 실시간 갱신(저장 포함).
// 게임 루프가 renderSettings 를 매 프레임 읽으므로 변경이 즉시 반영된다(새로고침 불필요).

import { renderSettings } from '../state/renderSettings.js';

let el = null;

const INTERP_OPTS = [
	{ v: 'on', label: '보간', desc: '틱 사이를 채워 매끄럽게 (기본)' },
	{ v: 'auto', label: '자동', desc: '주사율 감지 — 60Hz면 끔, 그 이상 켬' },
	{ v: 'off', label: '선명', desc: '보간 없음 · 지연 0 · 칼같이' },
];

const style = `
.sf-set-back{position:fixed;inset:0;z-index:60;background:rgba(6,8,12,.66);
 display:flex;align-items:center;justify-content:center;
 font-family:system-ui,-apple-system,"Malgun Gothic",sans-serif;}
.sf-set{width:min(420px,92vw);background:#151925;border:1px solid #2a3140;border-radius:14px;
 box-shadow:0 20px 60px rgba(0,0,0,.5);overflow:hidden;color:#d6dde6;}
.sf-set-h{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;
 border-bottom:1px solid #262c3b;}
.sf-set-h b{font-size:15px;} .sf-set-h span{font-size:11px;color:#e8912f;letter-spacing:.08em;text-transform:uppercase;}
.sf-set-x{background:#1b2130;border:1px solid #2c3242;color:#9caab8;width:28px;height:28px;
 border-radius:7px;cursor:pointer;font-size:15px;line-height:1;}
.sf-set-x:hover{color:#fff;}
.sf-set-b{padding:18px;}
.sf-set-sec{margin-bottom:20px;}
.sf-set-lab{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#6f7a89;margin-bottom:10px;}
.sf-seg{display:flex;gap:6px;}
.sf-seg button{flex:1;background:#1b2130;border:1px solid #2a3140;color:#c3cdd8;border-radius:9px;
 padding:10px 6px;cursor:pointer;text-align:center;transition:.12s;}
.sf-seg button b{display:block;font-size:13.5px;}
.sf-seg button small{display:block;font-size:9.5px;color:#6f7a89;margin-top:3px;line-height:1.2;}
.sf-seg button:hover{border-color:#3a4257;}
.sf-seg button.on{background:#2a2015;border-color:color-mix(in srgb,#e8912f 45%,transparent);}
.sf-seg button.on b{color:#e8912f;}
.sf-set-blur{display:flex;align-items:center;gap:12px;}
.sf-set-blur input[type=range]{flex:1;accent-color:#e8912f;}
.sf-set-blur .val{font-family:"IBM Plex Mono",monospace;font-size:13px;color:#e8912f;min-width:34px;text-align:right;}
.sf-set-note{font-size:11.5px;color:#6f7a89;margin-top:8px;line-height:1.5;}
.sf-set-f{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;
 border-top:1px solid #262c3b;background:#12151d;}
.sf-set-reset{background:none;border:1px solid #2c3242;color:#9caab8;border-radius:8px;padding:8px 14px;cursor:pointer;font-size:12.5px;}
.sf-set-reset:hover{color:#fff;border-color:#3a4257;}
.sf-set-done{background:#e8912f;border:none;color:#1a1206;font-weight:700;border-radius:8px;padding:8px 18px;cursor:pointer;font-size:13px;}
`;

const injectStyle = () => {
	if (document.getElementById('sf-set-style')) return;
	const s = document.createElement('style');
	s.id = 'sf-set-style';
	s.textContent = style;
	document.head.appendChild(s);
};

const paintInterp = () => {
	if (!el) return;
	el.querySelectorAll('.sf-seg button').forEach((b) =>
		b.classList.toggle('on', b.dataset.v === renderSettings.interpMode)
	);
};

export const openSettings = () => {
	if (el) return; // 이미 열림
	injectStyle();
	const back = document.createElement('div');
	back.className = 'sf-set-back';
	back.innerHTML = `
	<div class="sf-set" role="dialog" aria-label="렌더 세팅">
		<div class="sf-set-h"><b>렌더 세팅 <span>quality</span></b>
			<button class="sf-set-x" aria-label="닫기">✕</button></div>
		<div class="sf-set-b">
			<div class="sf-set-sec">
				<div class="sf-set-lab">이동 보간</div>
				<div class="sf-seg">
					${INTERP_OPTS.map(
						(o) => `<button data-v="${o.v}"><b>${o.label}</b><small>${o.desc}</small></button>`
					).join('')}
				</div>
			</div>
			<div class="sf-set-sec" style="margin-bottom:4px">
				<div class="sf-set-lab">모션블러 (LCD 잔상 마스킹)</div>
				<div class="sf-set-blur">
					<input type="range" min="0" max="0.8" step="0.05" value="${renderSettings.blendAmount}">
					<span class="val">${renderSettings.blendAmount.toFixed(2)}</span>
				</div>
				<div class="sf-set-note">3D 게임의 모션블러처럼 이동체를 부드럽게. 0 = 끔(선명).</div>
			</div>
		</div>
		<div class="sf-set-f">
			<button class="sf-set-reset">기본값(보간)</button>
			<button class="sf-set-done">완료</button>
		</div>
	</div>`;

	const close = () => {
		back.remove();
		el = null;
	};
	el = back;

	back.addEventListener('click', (e) => {
		if (e.target === back) close();
	});
	back.querySelector('.sf-set-x').addEventListener('click', close);
	back.querySelector('.sf-set-done').addEventListener('click', close);

	back.querySelectorAll('.sf-seg button').forEach((b) =>
		b.addEventListener('click', () => {
			renderSettings.setInterp(b.dataset.v);
			paintInterp();
		})
	);

	const range = back.querySelector('input[type=range]');
	const val = back.querySelector('.val');
	range.addEventListener('input', () => {
		renderSettings.setBlend(parseFloat(range.value));
		val.textContent = renderSettings.blendAmount.toFixed(2);
	});

	back.querySelector('.sf-set-reset').addEventListener('click', () => {
		renderSettings.reset();
		paintInterp();
		range.value = renderSettings.blendAmount;
		val.textContent = renderSettings.blendAmount.toFixed(2);
	});

	document.body.appendChild(back);
	paintInterp();
};
