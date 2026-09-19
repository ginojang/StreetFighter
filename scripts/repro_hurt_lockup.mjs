/**
 * [FIXED] "한쪽 파이터가 랜덤하게 히트를 등록하지 않는다" 버그의 결정적 재현 + 수정 검증.
 *
 * 수정(Fighter.js): handleAttackInit가 attackStruck를 재무장(공중 피격 거부로
 * 갇힌 플래그가 다음 공격 시작 시 해제), updateAttackBoxCollided 루프의
 * return→continue(BODY/LEGS-only 겹침도 등록).
 *
 * DOM/오디오/Image를 스텁하고 실제 게임 모듈(Ken/Ryu/Fighter 상태머신)을 node에서
 * 그대로 구동한다. 게임 입력은 넷플레이 시임(Netplay seam)인 applyRemoteInput으로
 * 주입한다(원본 파이프라인을 건드리지 않는 주입점).
 *
 * 시나리오(수정 전 버그 역사):
 *  Phase 1 — 공중 피격: B(Ryu)가 jumpUp인 동안 A(Ken)의 공격이 겹치면 데미지는
 *            들어가지만(onAttackHit 호출) HURT 진입은 validFrom 위반으로 거부된다.
 *            거부와 무관하게 A.attackStruck = true가 이미 소비된다(수정 후에도
 *            데미지·거부는 동일 — 상태 데이터 설계 그대로).
 *  Phase 2 — 잠금(수정으로 소멸): B가 착지 후 웅크리기만 해도(IDLE 우회) A의 새
 *            공격은 init에서 재무장되어 정상 등록된다.
 *  Phase 3 — IDLE 경유 해제(jugaad)도 여전히 동작한다.
 *  Phase 4 — BODY/LEGS만 겹치는 공격도 continue 덕에 등록된다.
 *
 * 직접 실행(진단 출력): node scripts/repro_hurt_lockup.mjs
 * 회귀 캐너리: tests/entities/hurtLockupRegression.test.mjs 가 reproduce()를 import 해 사용.
 */

// ── DOM 스텁 (게임 모듈 import 전에 설치) ────────────────────────────────
const fakeAudio = () => ({
	paused: true,
	currentTime: 0,
	ended: false,
	readyState: 4,
	HAVE_CURRENT_DATA: 2,
	volume: 1,
	play() {
		this.paused = false;
		return Promise.resolve();
	},
	pause() {
		this.paused = true;
	},
});
globalThis.document ??= { getElementById: () => fakeAudio() };
globalThis.Image ??= class {};
globalThis.navigator ??= { getGamepads: () => [] };
globalThis.window ??= { addEventListener() {}, removeEventListener() {} };
globalThis.location ??= { search: '' };
globalThis.localStorage ??= { getItem: () => null, setItem() {} };

const { Ken, Ryu } = await import('../src/entitites/fighters/index.js');
const { applyRemoteInput } = await import('../src/engine/InputHandler.js');
const { CONTROL_BIT } = await import('../src/net/InputCodec.js');
const { Control } = await import('../src/constants/controls.js');
const { FighterState } = await import('../src/constants/fighter.js');
const { boxOverlap, getActualBoxDimensions } = await import(
	'../src/utils/collisions.js'
);
const { SCENE_WIDTH } = await import('../src/constants/stage.js');

export const reproduce = () => {
	// 'Illegal move' 로그 캡처 (changeState가 console.log로 남기는 거부 기록).
	// 도중 예외로 새어나가지 않도록 finally에서 원복한다.
	const illegal = [];
	const origLog = console.log;
	console.log = (...args) => {
		const s = args.join(' ');
		if (s.startsWith('Illegal move')) illegal.push(s);
		else origLog(...args);
	};

	const notes = [];
	const note = (msg) => notes.push(msg);

	try {
		// ── 시뮬 기반 인프라 ────────────────────────────────────────────
		const FRAME = 1000 / 60;
		let t = 0;
		let tickCount = 0;
		const now = () => ({ secondsPassed: FRAME / 1000, previous: t });

		const bitsOf = (...cs) => cs.reduce((m, c) => m | CONTROL_BIT[c], 0);
		const setInput = (playerId, ...cs) =>
			applyRemoteInput(playerId, bitsOf(...cs));

		const hits = [];
		const onAttackHit = (time, playerId, opponentId, position, strength) => {
			hits.push({ atTick: tickCount, attacker: playerId, strength });
		};

		const entities = { entitiesList: [], add() {}, remove() {} };
		const a = new Ken(0, onAttackHit, entities); // 왼쪽, 오른쪽을 봄(direction=1)
		const b = new Ryu(1, onAttackHit, entities); // 오른쪽, 왼쪽을 봄(direction=-1)
		a.opponent = b;
		b.opponent = a;

		// 카메라 스텁: 실제 Camera처럼 두 파이터 중간을 따라감(경계 클램프만 회피 목적).
		const camera = { position: { x: 0, y: 0 } };

		const runTicks = (n, { holdAirborne = false, after = null } = {}) => {
			for (let i = 0; i < n; i += 1) {
				tickCount += 1;
				t += FRAME;
				const time = now();

				camera.position.x =
					(a.position.x + b.position.x) / 2 - SCENE_WIDTH / 2;

				a.update(time, camera);
				b.update(time, camera);

				if (holdAirborne) {
					b.position.y = 150;
					b.velocity.y = 0;
				}
				after?.(time);
			}
		};

		/** A의 현재 히트박스(활성 프레임)에 B의 head 허트박스가 정확히 겹치도록 B를 배치. */
		const overlapVictimHeadWithHitbox = () => {
			const hit = getActualBoxDimensions(a.position, a.direction, a.boxes.hit);
			if (hit.width <= 0 || hit.height <= 0) return false;
			const [hx, hy, hw, hh] = b.boxes.hurt.head;
			const headOff = getActualBoxDimensions(
				{ x: 0, y: 0 },
				b.direction,
				{ x: hx, y: hy, width: hw, height: hh }
			);
			b.position.x = hit.x + hit.width / 2 - (headOff.x + headOff.width / 2);
			b.position.y = hit.y + hit.height / 2 - (headOff.y + headOff.height / 2);
			return boxOverlap(hit, {
				x: b.position.x + headOff.x,
				y: b.position.y + headOff.y,
				width: headOff.width,
				height: headOff.height,
			});
		};

		const aAttackActive = () =>
			a.boxes.hit.width > 0 && a.boxes.hit.height > 0;
		const state = (f) => f.currentState;
		const summary = (label) =>
			`[${label}] tick=${tickCount} A=${state(a)} B=${state(b)} ` +
			`A.attackStruck=${a.attackStruck} hits=${hits.length}`;

		// ── Phase 1: B 점프 → A 약 펀치가 공중에서 겹친다 ─────────────────
		setInput(1, Control.UP);
		runTicks(1);
		setInput(1);
		runTicks(6, { holdAirborne: true }); // JUMP_START 애니 소진 → JUMP_UP 진입

		a.changeState(FighterState.LIGHT_PUNCH, now());

		let struckInAir = false;
		for (let i = 0; i < 30 && !struckInAir; i += 1) {
			runTicks(1, {
				holdAirborne: true,
				after: () => {
					if (state(b) === FighterState.JUMP_UP && aAttackActive())
						overlapVictimHeadWithHitbox();
				},
			});
			if (hits.length > 0) struckInAir = true;
		}
		if (!struckInAir) {
			for (let i = 0; i < 20 && !struckInAir; i += 1) {
				runTicks(1, {
					holdAirborne: true,
					after: () => {
						if (state(b) === FighterState.JUMP_UP && aAttackActive())
							overlapVictimHeadWithHitbox();
					},
				});
				if (hits.length > 0) struckInAir = true;
			}
		}

		note(summary('Phase1 공중 피격'));
		const attackStruckAfterAirHit = a.attackStruck === true;
		const hitsAfterAirStrike = hits.length; // 이 시점 스냅샷(이후 페이즈에서 히트 추가됨)
		const bStillAirborne =
			state(b) === FighterState.JUMP_UP || state(b) === FighterState.JUMP_LAND;

		// 핵심: 거부된 히트 직후 B가 착지할 때 DOWN을 홀드 → JUMP_LAND → CROUCH_DOWN
		// → CROUCH. IDLE을 한 번도 거치지 않는다 → 재무장 경로가 사라진다.
		setInput(1, Control.DOWN);
		runTicks(30); // A의 공격 종료(IDLE 복귀) + B의 착지·크라우치 정착

		// ── Phase 2: B 웅크리기 유지 → A의 새 공격은 전부 무시 ────────────
		runTicks(20);
		note(summary('Phase2 B 크라우치 정착'));

		const attemptAttack = (attackState, maxTicks = 40) => {
			if (state(a) !== FighterState.IDLE) runTicks(20);
			a.changeState(attackState, now());
			const hitsBefore = hits.length;
			for (let i = 0; i < maxTicks; i += 1) {
				runTicks(1, {
					after: () => {
						if (aAttackActive()) overlapVictimHeadWithHitbox();
					},
				});
			}
			runTicks(20); // 공격 종료 → IDLE 복귀
			return hits.length - hitsBefore;
		};

		const locked1 = attemptAttack(FighterState.MEDIUM_PUNCH);
		const locked2 = attemptAttack(FighterState.HEAVY_KICK);
		note(summary('Phase2 잠금 확인'));
		const bAvoidsIdle = [
			FighterState.CROUCH,
			FighterState.CROUCH_DOWN,
			FighterState.CROUCH_UP,
		].includes(state(b));
		const attackStruckStillTrue = a.attackStruck === true;

		// ── Phase 3: B가 DOWN 해제 → IDLE 경유 → jugaad로 잠금 해제 ───────
		setInput(1);
		runTicks(30); // CROUCH_UP → IDLE
		note(summary('Phase3 B IDLE 도달'));
		const bReachedIdle = state(b) === FighterState.IDLE;
		const attackStruckReleased = a.attackStruck === false;

		const recovered = attemptAttack(FighterState.MEDIUM_PUNCH);
		note(summary('Phase3 회복 확인'));

		// ── Phase 4: return-vs-continue — BODY만 겹치면 영원히 미스 ─────────
		runTicks(30);
		if (state(b) !== FighterState.IDLE) runTicks(30);
		if (state(a) !== FighterState.IDLE) runTicks(30);
		note(summary('Phase4 시작'));

		a.position.x = 380;
		a.position.y = 218;
		a.direction = 1;
		b.position.x = 424;
		b.position.y = 218;

		const absBox = (fighter, box) =>
			getActualBoxDimensions(fighter.position, fighter.direction, box);
		const bodyAbs = absBox(b, {
			x: b.boxes.hurt.body[0],
			y: b.boxes.hurt.body[1],
			width: b.boxes.hurt.body[2],
			height: b.boxes.hurt.body[3],
		});
		const headAbs = absBox(b, {
			x: b.boxes.hurt.head[0],
			y: b.boxes.hurt.head[1],
			width: b.boxes.hurt.head[2],
			height: b.boxes.hurt.head[3],
		});
		const legsAbs = absBox(b, {
			x: b.boxes.hurt.legs[0],
			y: b.boxes.hurt.legs[1],
			width: b.boxes.hurt.legs[2],
			height: b.boxes.hurt.legs[3],
		});

		const R = {
			x: bodyAbs.x + 4,
			y: bodyAbs.y + 4,
			width: Math.max(2, bodyAbs.width - 8),
			height: Math.max(2, bodyAbs.height - 8),
		};
		const rectOverlap = (r1, r2) =>
			r1.x < r2.x + r2.width &&
			r1.x + r1.width > r2.x &&
			r1.y < r2.y + r2.height &&
			r1.y + r1.height > r2.y;
		const rOnlyBody =
			rectOverlap(R, bodyAbs) &&
			!rectOverlap(R, headAbs) &&
			!rectOverlap(R, legsAbs);

		a.changeState(FighterState.MEDIUM_PUNCH, now());
		const hitsBeforeBody = hits.length;
		a.boxes.hit = {
			x: R.x - a.position.x,
			y: R.y - a.position.y,
			width: R.width,
			height: R.height,
		};
		a.updateAttackBoxCollided(now());
		const bodyOnlyHits = hits.length - hitsBeforeBody;

		// 대조군: BODY 히트가 같은 공격 인스턴스의 플래그를 소비했으므로,
		// HEAD 측정은 “새 공격 시작”을 모델링해야 한다 — 실제 수정 경로인
		// handleAttackInit 재무장을 그대로 호출한다.
		a.handleAttackInit();
		const hitsBeforeHead = hits.length;
		const Rh = {
			x: headAbs.x + 2,
			y: headAbs.y + 2,
			width: Math.max(2, headAbs.width - 4),
			height: Math.max(2, headAbs.height - 4),
		};
		a.boxes.hit = {
			x: Rh.x - a.position.x,
			y: Rh.y - a.position.y,
			width: Rh.width,
			height: Rh.height,
		};
		a.updateAttackBoxCollided(now());
		const headControlHits = hits.length - hitsBeforeHead;

		return {
			struckInAir,
			hitsDuringAirHit: hitsAfterAirStrike === 1,
			illegalMoveLogged: illegal.some(
				(s) => s.includes('jumpUp') && s.includes('hurtHead')
			),
			bStillAirborne,
			attackStruckAfterAirHit,
			bAvoidsIdle,
			locked1,
			locked2,
			attackStruckStillTrue,
			bReachedIdle,
			attackStruckReleased,
			recovered,
			rOnlyBody,
			bodyOnlyHits,
			headControlHits,
			illegal,
			notes,
		};
	} finally {
		console.log = origLog;
	}
};

// ── 직접 실행 시 진단 출력 ────────────────────────────────────────────────
const isDirectRun = () => {
	try {
		return (
			process.argv[1] &&
			import.meta.url === new URL(`file://${process.argv[1]}`).href
		);
	} catch {
		return false;
	}
};

if (isDirectRun()) {
	const r = reproduce();
	const check = (name, cond) =>
		console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
	for (const n of r.notes) console.log(n);

	check('P1: 공중에서 데미지는 들어감(onAttackHit 호출)', r.struckInAir && r.hitsDuringAirHit);
	check('P1: HURT 진입은 거부됨 — Illegal move 로그 존재(상태 데이터 설계 그대로)', r.illegalMoveLogged);
	check('P1: B는 여전히 점프 상태', r.bStillAirborne);
	check('P1: 거부 직후 A.attackStruck는 소비됨(true) — 다음 공격 init에서 재무장', r.attackStruckAfterAirHit);
	check('P2(수정): 중공격 — IDLE 우회 중에도 히트 등록', r.locked1 >= 1);
	check('P2(수정): 강킥 — IDLE 우회 중에도 히트 등록', r.locked2 >= 1);
	check('P3: B IDLE 도달', r.bReachedIdle);
	check('P3: IDLE 경유 해제(jugaad: handleIdleInit)도 여전히 동작', r.attackStruckReleased);
	check('P3: 같은 중공격이 히트 등록', r.recovered >= 1);
	check('P4 전제: R은 BODY와만 겹침', r.rOnlyBody);
	check('P4(수정): BODY만 겹쳐도 히트 등록(return→continue)', r.bodyOnlyHits >= 1);
	check('P4 대조: HEAD 겹침이면 히트 등록 1회(중복 없음)', r.headControlHits === 1);

	console.log('\n=== Illegal move 로그 ===');
	for (const s of r.illegal) console.log('  ' + s);
}
