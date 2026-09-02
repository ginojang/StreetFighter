import { FRAME_TIME } from '../constants/game.js';

/**
 * 고정 timestep 누산기 (Phase 1).
 *
 * 매 프레임 실제 경과 시간을 누적하고, `fixedDt`(기본 1프레임=1000/60ms)만큼
 * 쌓일 때마다 시뮬 틱 한 번을 돌려야 한다고 알려 준다. 렌더 보간용 위상 `alpha`
 * (0~1, 다음 틱까지의 진행도)도 노출한다 — Phase 2에서 소비.
 *
 * 왜 순수 모듈인가: 게임 루프에서 이 수학만 떼어 내면 DOM 없이 node로 검증할 수 있다.
 * `advance()`는 부작용이 내부 누산기 하나뿐이라 결정적이다.
 *
 * - **스파이럴 방지**: 한 프레임이 아무리 길어도(탭 복귀·GC 멈춤) 누산기를
 *   `fixedDt * maxSteps`로 클램프해 따라잡기 폭주를 막는다.
 * - **60Hz 무회귀**: 프레임 간격이 정확히 fixedDt면 매 프레임 정확히 1틱 →
 *   기존 가변 루프와 동일하게 동작한다.
 */
/** 선형 보간. t=0→a, t=1→b. */
export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * 렌더 보간용 축(axis) 보간 (Phase 2). 직전 틱값 `a`와 현재 틱값 `b` 사이를 위상 `t`로
 * 보간하되, 한 틱 이동폭이 `maxDelta`를 넘으면 **텔레포트로 보고 스냅**(보간 안 함).
 * 라운드 리셋·KO 재배치·화면경계 클램프가 매끄러운 슬라이드로 보이는 것을 막는다.
 */
export const interpAxis = (a, b, t, maxDelta) =>
	Math.abs(b - a) > maxDelta ? b : a + (b - a) * t;

/**
 * 렌더 보간 스왑(Phase 2, DragonHearts RenderInterpBegin/End 대응).
 * `targets`의 `position`을 `previousPosition`↔현재값 사이 보간값으로 바꿔치고 `draw()`를
 * 호출한 뒤 원래 좌표로 되돌린다 — **시뮬 상태는 불변**(그리기 직전 바꿔치고 직후 원복).
 * `previousPosition`이 없는 대상(스폰 직후 등)은 건너뛴다. try/finally라 draw가 던져도 원복.
 */
export const withInterpolatedPositions = (targets, alpha, maxDelta, draw) => {
	const swapped = [];
	for (const target of targets) {
		if (!target?.position || !target.previousPosition) continue;
		const real = target.position;
		swapped.push([target, real]);
		target.position = {
			x: interpAxis(target.previousPosition.x, real.x, alpha, maxDelta),
			y: interpAxis(target.previousPosition.y, real.y, alpha, maxDelta),
		};
	}
	try {
		draw();
	} finally {
		for (const [target, real] of swapped) target.position = real;
	}
};

export const createTimestepper = ({
	fixedDt = FRAME_TIME,
	maxSteps = 5,
	snapTolerance = FRAME_TIME * 0.15,
} = {}) => {
	let accumulator = 0;

	return {
		/**
		 * 이번 프레임의 실제 경과(ms, GAME_SPEED 등 배율을 이미 곱한 값)를 넣으면
		 * 돌려야 할 시뮬 틱 수를 반환한다. 남은 시간은 누산기에 보관돼 다음 프레임으로 이월.
		 */
		advance(elapsedMs) {
			// vsync 타임 스냅: 프레임 간격이 fixedDt의 정수배에 가까우면 정확한 배수로 스냅한다.
			// display ≈ sim rate(예: 60Hz)에서 rAF 타이밍 노이즈(±1~2ms)가 alpha 를 튀게 해
			// 캐릭터가 직전 틱↔현재 틱으로 진동(잔상)하는 것을 막는다. 안 가까우면(144Hz 등) 그대로.
			for (let k = 1; k <= maxSteps; k += 1) {
				if (Math.abs(elapsedMs - k * fixedDt) <= snapTolerance) {
					elapsedMs = k * fixedDt;
					break;
				}
			}

			accumulator += elapsedMs;

			// 스파이럴 방지: 밀린 시간을 maxSteps 틱분으로 제한.
			const ceiling = fixedDt * maxSteps;
			if (accumulator > ceiling) accumulator = ceiling;

			let steps = 0;
			while (accumulator >= fixedDt && steps < maxSteps) {
				accumulator -= fixedDt;
				steps += 1;
			}
			return steps;
		},

		/** 렌더 보간 위상 (0=직전 틱, 1=다음 틱). Phase 2에서 사용. */
		get alpha() {
			return accumulator / fixedDt;
		},

		/** 남은 누산치(ms). 진단용. */
		get pending() {
			return accumulator;
		},

		/** 탭 복귀 등에서 밀린 시간을 버리고 깨끗이 재시작(Phase 4에서 사용). */
		reset() {
			accumulator = 0;
		},
	};
};
