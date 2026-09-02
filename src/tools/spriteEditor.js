// 스프라이트 에디터 (MVP) — 워크스페이스 툴.
// 게임 데이터(Ryu/Ken 의 frames Map, animations)를 그대로 소비한다: 스텁 인자로 파이터를
// 인스턴스화해 .frames / .animations / .image 를 읽는다(update/draw 는 호출 안 함).
//
// frames.get(key) = [ [[x,y,w,h],[ox,oy]], push[4], [head,body,legs], hit[4] ]
//   - 스프라이트 소스 사각형 + 원점(origin)
//   - push/hurt/hit 박스는 origin 기준 오프셋(게임 좌표) → 프리뷰에선 (ox+bx, oy+by)에 그린다.

import { Ryu } from '../entitites/fighters/Ryu.js';
import { Ken } from '../entitites/fighters/Ken.js';
import { FRAME_TIME } from '../constants/game.js';

const stub = () => {};
const stubList = { add: () => {} };

const FIGHTERS = {
	ryu: () => new Ryu(0, stub, stubList),
	ken: () => new Ken(0, stub, stubList),
};

const BOX_COLORS = {
	push: '#3fb6ff', // 파랑
	head: '#4ade80', // 초록(허트)
	body: '#4ade80',
	legs: '#4ade80',
	hit: '#ff5470', // 빨강
};

const state = {
	fighterId: 'ryu',
	fighter: null,
	selectedKey: null,
	anim: null,
	playing: false,
	animIdx: 0,
	animTimer: 0,
	zoom: 3,
	showBoxes: true,
};

const $ = (sel) => document.querySelector(sel);

// ── 파이터 로드 ──
const loadFighter = (id) => {
	state.fighterId = id;
	state.fighter = FIGHTERS[id]();
	state.selectedKey = state.fighter.frames.keys().next().value;
	const animKeys = Object.keys(state.fighter.animations);
	state.anim = animKeys[0] ?? null;
	document
		.querySelectorAll('.se-tab')
		.forEach((b) => b.classList.toggle('active', b.dataset.f === id));
};

// ── 프레임 데이터 헬퍼 ──
const frameDef = (key) => {
	const rec = state.fighter.frames.get(key);
	if (!rec) return null;
	const [[rect, origin], push, hurt, hit] = rec;
	return { rect, origin, push, hurt, hit };
};

// ── 스프라이트시트 뷰 ──
const drawSheet = () => {
	const canvas = $('#se-sheet');
	const img = state.fighter.image;
	const w = img.naturalWidth || img.width || 512;
	const h = img.naturalHeight || img.height || 512;
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	ctx.imageSmoothingEnabled = false;
	ctx.clearRect(0, 0, w, h);
	ctx.fillStyle = '#0b0e14';
	ctx.fillRect(0, 0, w, h);
	ctx.drawImage(img, 0, 0);
	// 프레임 사각형 오버레이
	for (const [key, rec] of state.fighter.frames) {
		const [[[x, y, fw, fh]]] = [rec];
		const sel = key === state.selectedKey;
		ctx.strokeStyle = sel ? '#e8912f' : 'rgba(120,200,255,.45)';
		ctx.lineWidth = sel ? 2 : 1;
		ctx.strokeRect(x + 0.5, y + 0.5, fw - 1, fh - 1);
	}
};

// 스프라이트시트 클릭 → 해당 프레임 선택
const pickFrameAt = (mx, my) => {
	for (const [key, rec] of state.fighter.frames) {
		const [[[x, y, fw, fh]]] = [rec];
		if (mx >= x && mx <= x + fw && my >= y && my <= y + fh) {
			select(key);
			return;
		}
	}
};

// ── 프레임 인스펙터(확대 + 박스) ──
const drawInspector = (key = state.selectedKey) => {
	const canvas = $('#se-frame');
	const d = frameDef(key);
	if (!d) return;
	const z = state.zoom;
	const [x, y, fw, fh] = d.rect;
	const [ox, oy] = d.origin;
	// 캔버스 크기: 프레임 + 원점 기준 여백
	const pad = 24;
	canvas.width = (fw + pad * 2) * z;
	canvas.height = (fh + pad * 2) * z;
	const ctx = canvas.getContext('2d');
	ctx.imageSmoothingEnabled = false;
	ctx.fillStyle = '#0b0e14';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.save();
	ctx.scale(z, z);
	ctx.translate(pad, pad);
	// 스프라이트
	ctx.drawImage(state.fighter.image, x, y, fw, fh, 0, 0, fw, fh);
	if (state.showBoxes) drawBoxes(ctx, d);
	// 원점 십자
	ctx.strokeStyle = '#ffd24a';
	ctx.lineWidth = 1 / z;
	ctx.beginPath();
	ctx.moveTo(ox - 4, oy);
	ctx.lineTo(ox + 4, oy);
	ctx.moveTo(ox, oy - 4);
	ctx.lineTo(ox, oy + 4);
	ctx.stroke();
	ctx.restore();
};

const drawBoxes = (ctx, d) => {
	const [ox, oy] = d.origin;
	const rect = (box, color) => {
		if (!box) return;
		const [bx, by, bw, bh] = box;
		if (!bw && !bh) return;
		ctx.strokeStyle = color;
		ctx.globalAlpha = 0.9;
		ctx.lineWidth = 1;
		ctx.strokeRect(ox + bx, oy + by, bw, bh);
		ctx.globalAlpha = 0.12;
		ctx.fillStyle = color;
		ctx.fillRect(ox + bx, oy + by, bw, bh);
		ctx.globalAlpha = 1;
	};
	rect(d.push, BOX_COLORS.push);
	if (Array.isArray(d.hurt)) {
		rect(d.hurt[0], BOX_COLORS.head);
		rect(d.hurt[1], BOX_COLORS.body);
		rect(d.hurt[2], BOX_COLORS.legs);
	}
	rect(d.hit, BOX_COLORS.hit);
};

// ── 인스펙터 텍스트 ──
const renderMeta = () => {
	const d = frameDef(state.selectedKey);
	const meta = $('#se-meta');
	if (!d) {
		meta.innerHTML = '';
		return;
	}
	const fmt = (a) => (Array.isArray(a) ? `[${a.join(', ')}]` : '—');
	meta.innerHTML = `
		<div class="se-row"><span>frame</span><b>${state.selectedKey}</b></div>
		<div class="se-row"><span>rect [x,y,w,h]</span><b>${fmt(d.rect)}</b></div>
		<div class="se-row"><span>origin [x,y]</span><b>${fmt(d.origin)}</b></div>
		<div class="se-row"><span class="c-push">push</span><b>${fmt(d.push)}</b></div>
		<div class="se-row"><span class="c-hurt">hurt·head</span><b>${fmt(d.hurt?.[0])}</b></div>
		<div class="se-row"><span class="c-hurt">hurt·body</span><b>${fmt(d.hurt?.[1])}</b></div>
		<div class="se-row"><span class="c-hurt">hurt·legs</span><b>${fmt(d.hurt?.[2])}</b></div>
		<div class="se-row"><span class="c-hit">hit</span><b>${fmt(d.hit)}</b></div>`;
};

// ── 프레임 목록 ──
const renderList = () => {
	const list = $('#se-list');
	list.innerHTML = '';
	for (const key of state.fighter.frames.keys()) {
		const b = document.createElement('button');
		b.className = 'se-key' + (key === state.selectedKey ? ' active' : '');
		b.textContent = key;
		b.addEventListener('click', () => select(key));
		list.appendChild(b);
	}
};

// ── 애니메이션 선택/재생 ──
const renderAnimSelect = () => {
	const sel = $('#se-anim');
	sel.innerHTML = '';
	for (const name of Object.keys(state.fighter.animations)) {
		const o = document.createElement('option');
		o.value = name;
		o.textContent = `${name} (${state.fighter.animations[name].length})`;
		sel.appendChild(o);
	}
	sel.value = state.anim ?? '';
};

let rafId = 0;
let lastT = 0;
const playLoop = (t) => {
	if (!state.playing) return;
	const dt = t - lastT;
	lastT = t;
	state.animTimer -= dt;
	const seq = state.fighter.animations[state.anim] || [];
	if (state.animTimer <= 0 && seq.length) {
		state.animIdx = (state.animIdx + 1) % seq.length;
		const [key, delay] = seq[state.animIdx];
		state.selectedKey = key;
		state.animTimer = Math.max(1, Math.abs(delay || 1)) * FRAME_TIME;
		drawInspector(key);
		$('#se-playinfo').textContent = `${state.animIdx + 1}/${seq.length} · ${key}`;
	}
	rafId = requestAnimationFrame(playLoop);
};
const startPlay = () => {
	if (!state.anim) return;
	state.playing = true;
	state.animIdx = -1;
	state.animTimer = 0;
	lastT = performance.now();
	cancelAnimationFrame(rafId);
	rafId = requestAnimationFrame(playLoop);
	$('#se-play').textContent = '■ 정지';
};
const stopPlay = () => {
	state.playing = false;
	cancelAnimationFrame(rafId);
	$('#se-play').textContent = '▶ 재생';
	drawInspector();
	renderMeta();
};

// ── 선택 ──
const select = (key) => {
	state.selectedKey = key;
	drawSheet();
	drawInspector();
	renderMeta();
	document
		.querySelectorAll('.se-key')
		.forEach((b) => b.classList.toggle('active', b.textContent === key));
};

// ── 초기화 ──
const rerenderAll = () => {
	drawSheet();
	drawInspector();
	renderMeta();
	renderList();
	renderAnimSelect();
};

const init = () => {
	// 파이터 탭
	document.querySelectorAll('.se-tab').forEach((b) =>
		b.addEventListener('click', () => {
			stopPlay();
			loadFighter(b.dataset.f);
			rerenderAll();
		})
	);
	// 스프라이트시트 클릭
	const sheet = $('#se-sheet');
	sheet.addEventListener('click', (e) => {
		const r = sheet.getBoundingClientRect();
		const mx = ((e.clientX - r.left) / r.width) * sheet.width;
		const my = ((e.clientY - r.top) / r.height) * sheet.height;
		pickFrameAt(Math.round(mx), Math.round(my));
	});
	// 애니 선택/재생
	$('#se-anim').addEventListener('change', (e) => {
		stopPlay();
		state.anim = e.target.value;
	});
	$('#se-play').addEventListener('click', () =>
		state.playing ? stopPlay() : startPlay()
	);
	// 박스 토글
	$('#se-boxes').addEventListener('change', (e) => {
		state.showBoxes = e.target.checked;
		drawInspector();
	});
	// 줌
	$('#se-zoom').addEventListener('input', (e) => {
		state.zoom = Number(e.target.value);
		drawInspector();
	});

	loadFighter('ryu');
	// 이미지가 아직 안 실렸으면 로드 후 렌더
	const img = state.fighter.image;
	if (img && !img.complete) img.addEventListener('load', rerenderAll, { once: true });
	rerenderAll();
};

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}
