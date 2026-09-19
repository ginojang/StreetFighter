// 기술 목록 오버레이 — 켄/류 무브 데이터를 한 곳(movesData)에서 정의하고 렌더.
// docs/moves.md 와 같은 수치를 공유한다(단일 소스는 movesData — 문서 갱신 시 여기도 맞출 것).

import { MOVES_DATA } from './movesData.js';

let el = null;

const style = `
.sf-mv-back{position:fixed;inset:0;z-index:60;background:rgba(6,8,12,.66);
 display:flex;align-items:center;justify-content:center;
 font-family:system-ui,-apple-system,"Malgun Gothic",sans-serif;}
.sf-mv{width:min(600px,94vw);max-height:86vh;display:flex;flex-direction:column;
 background:#151925;border:1px solid #2a3140;border-radius:14px;
 box-shadow:0 20px 60px rgba(0,0,0,.5);overflow:hidden;color:#d6dde6;}
.sf-mv-h{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;
 border-bottom:1px solid #262c3b;flex:none;}
.sf-mv-h b{font-size:15px;} .sf-mv-h span{font-size:11px;color:#e8912f;letter-spacing:.08em;text-transform:uppercase;}
.sf-mv-x{background:#1b2130;border:1px solid #2c3242;color:#9caab8;width:28px;height:28px;
 border-radius:7px;cursor:pointer;font-size:15px;line-height:1;}
.sf-mv-x:hover{color:#fff;}
.sf-mv-b{padding:16px 18px;overflow-y:auto;}
.sf-mv-sec{margin-bottom:18px;}
.sf-mv-lab{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#6f7a89;margin-bottom:8px;}
.sf-mv-note{font-size:11.5px;color:#9caab8;margin-bottom:8px;line-height:1.5;}
.sf-mv-grid{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:0;font-size:12.5px;
 border:1px solid #262c3b;border-radius:9px;overflow:hidden;}
.sf-mv-grid>*{padding:7px 10px;border-bottom:1px solid #202633;}
.sf-mv-grid>*:nth-child(3n+1){background:#1a1f2c;color:#e8edf4;font-weight:600;}
.sf-mv-grid>.hd{background:#12151d;color:#6f7a89;font-size:10px;letter-spacing:.08em;
 text-transform:uppercase;font-weight:600;}
.sf-mv-grid .num{font-family:"IBM Plex Mono",monospace;color:#e8912f;}
.sf-mv-grid .sub{display:block;font-size:10px;color:#6f7a89;font-weight:400;margin-top:1px;}
.sf-mv-hint{font-size:11px;color:#6f7a89;margin-top:8px;line-height:1.55;}
.sf-mv-keys{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;}
.sf-mv-keys>div{border:1px solid #262c3b;border-radius:9px;padding:10px 12px;background:#1a1f2c;}
.sf-mv-keys b{display:block;font-size:12px;color:#e8912f;margin-bottom:6px;}
.sf-mv-keys kbd{display:inline-block;background:#222839;border:1px solid #333b4f;
 border-bottom-width:2px;border-radius:5px;padding:1px 6px;margin:1px 2px 1px 0;
 font-family:"IBM Plex Mono",monospace;font-size:11px;color:#c3cdd8;}
.sf-mv-f{display:flex;justify-content:flex-end;padding:12px 18px;flex:none;
 border-top:1px solid #262c3b;background:#12151d;}
.sf-mv-done{background:#e8912f;border:none;color:#1a1206;font-weight:700;border-radius:8px;
 padding:8px 18px;cursor:pointer;font-size:13px;}
`;

const injectStyle = () => {
	if (document.getElementById('sf-mv-style')) return;
	const s = document.createElement('style');
	s.id = 'sf-mv-style';
	s.textContent = style;
	document.head.appendChild(s);
};

// 셀 하나. v: 본문, sub: 보조설명, num: 강조 수치, hd: 헤더 행.
const cell = (v, cls = '') => {
	if (v == null) return `<div></div>`;
	const sub = v.sub ? `<span class="sub">${v.sub}</span>` : '';
	return `<div class="${cls}">${v.text ?? v}${sub}</div>`;
};

const grid = (cols, rows) => {
	const head = cols.map((c) => cell(c, 'hd')).join('');
	const body = rows.map((r) => r.map((c) => cell(c, typeof c === 'object' ? c.cls ?? '' : '')).join('')).join('');
	return `<div class="sf-mv-grid" style="grid-template-columns:${cols.map((c) => c.w ?? '1fr').join(' ')}">${head}${body}</div>`;
};

const kbdList = (keys) => keys.map((k) => `<kbd>${k}</kbd>`).join('');

const render = () => {
	const d = MOVES_DATA;
	const normRows = d.normals.map((m) => [
		{ text: m.name, sub: m.note },
		{ text: String(m.damage), cls: 'num' },
		{ text: m.command, cls: 'num' },
	]);
	const specRows = d.specials.map((m) => [
		{ text: m.name, sub: m.note },
		{ text: String(m.damage), cls: 'num' },
		{ text: m.speed, cls: 'num' },
	]);

	return `
	<div class="sf-mv" role="dialog" aria-label="기술 목록">
		<div class="sf-mv-h"><b>기술 목록 <span>move list</span></b>
			<button class="sf-mv-x" aria-label="닫기">✕</button></div>
		<div class="sf-mv-b">
			<div class="sf-mv-note">${d.characterNote}</div>

			<div class="sf-mv-sec">
				<div class="sf-mv-lab">기본기 — 서서만 발동 (데미지 / 커맨드 1P)</div>
				${grid([{ text: '기술', w: '1.6fr' }, { text: '데미지', w: '.7fr' }, { text: '커맨드', w: '.9fr' }], normRows)}
				<div class="sf-mv-hint">${d.normalsHint}</div>
			</div>

			<div class="sf-mv-sec">
				<div class="sf-mv-lab">필살기 — 파동권 (데미지 / 탄속)</div>
				${grid([{ text: '기술', w: '1.6fr' }, { text: '데미지', w: '.7fr' }, { text: '탄속 px/s', w: '.9fr' }], specRows)}
				<div class="sf-mv-hint">${d.specialsHint}</div>
			</div>

			<div class="sf-mv-sec">
				<div class="sf-mv-lab">조작</div>
				<div class="sf-mv-keys">
					<div><b>1P · 류 (좌측)</b>${kbdList(d.keys.p1)}</div>
					<div><b>2P · 켄 (우측)</b>${kbdList(d.keys.p2)}</div>
				</div>
				<div class="sf-mv-hint">${d.keysHint}</div>
			</div>
		</div>
		<div class="sf-mv-f"><button class="sf-mv-done">닫기</button></div>
	</div>`;
};

export const openMoves = () => {
	if (el) return; // 이미 열림
	injectStyle();
	const back = document.createElement('div');
	back.className = 'sf-mv-back';
	back.innerHTML = render();

	const close = () => {
		back.remove();
		el = null;
	};
	el = back;

	back.addEventListener('click', (e) => {
		if (e.target === back) close();
	});
	back.querySelector('.sf-mv-x').addEventListener('click', close);
	back.querySelector('.sf-mv-done').addEventListener('click', close);

	document.body.appendChild(back);
};
