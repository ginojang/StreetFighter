// 켄/류 기술 데이터 — docs/moves.md 와 수치를 함께 유지한다.
// 근거 소스: FighterAttackBaseData(constants/fighter.js), fireballVelocity(constants/fireball.js),
// Ryu.js/Ken.js frames·animations, config/controls.js.

export const MOVES_DATA = {
	characterNote:
		'켄과 류는 기술 구성·성능이 100% 동일한 클론입니다 (스프라이트·사운드만 다름). 체력 200.',

	normals: [
		{ name: '약 펀치', damage: 12, command: 'Q', note: '발생 빠름 · 머리 높이' },
		{ name: '중 펀치', damage: 20, command: 'E', note: '점수 효율 최고 (300)' },
		{ name: '강 펀치', damage: 28, command: 'R', note: '리치 최장 펀치' },
		{ name: '약 킥', damage: 12, command: 'F', note: '상단 판정' },
		{ name: '중 킥', damage: 20, command: 'V', note: '리치 전체 최장' },
		{ name: '강 킥', damage: 28, command: 'G', note: '상단 판정 · 넉백 큼' },
	],
	normalsHint:
		'서 있는 상태(기본/걷기)에서만 발동. 앉아 공격·공중 공격은 아직 없음. 히트 시 상대를 밀어내는 넉백: 약 12 / 중 16 / 강 22.',

	specials: [
		{ name: '약 파동권', damage: 12, speed: 150, note: '경직 짧음 (40f)' },
		{ name: '중 파동권', damage: 20, speed: 220, note: '경직 46f' },
		{ name: '강 파동권', damage: 28, speed: 300, note: '탄속 최강 · 경직 60f' },
	],
	specialsHint:
		'입력: ↓ ↘ → + 펀치(약/중/강). 파동권끼리 만나면 상쇄. 약/중/강 펀치 모션 중에 입력하면 캔슬 발동 (기본기 → 파동권 콤보 가능).',

	keys: {
		p1: ['W A S D', 'Q 약P', 'E 중P', 'R 강P', 'F 약K', 'V 중K', 'G 강K'],
		p2: ['↑ ← ↓ →', '/ 약P', 'RCtrl 중P', '. 강P', 'RShift 약K', "' 중K", 'Enter 강K'],
	},
	keysHint:
		'게임패드: 스틱 이동, ✕ 약P □ 중P L1 강P ○ 약K △ 중K R1 강K. (README의 P1=화살표 표기는 코드와 반대 — 코드 기준 1P=류/WASD.)',
};
