import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	lerp,
	interpAxis,
	withInterpolatedPositions,
	createTimestepper,
} from '../../src/engine/FixedTimestep.js';
import { FRAME_TIME } from '../../src/constants/game.js';

const DT = FRAME_TIME; // 1000/60

test('lerp: t=0→a, t=1→b, 중간값 보간', () => {
	assert.equal(lerp(0, 10, 0), 0);
	assert.equal(lerp(0, 10, 1), 10);
	assert.equal(lerp(0, 10, 0.5), 5);
	assert.equal(lerp(-4, 4, 0.25), -2);
});

test('interpAxis: 정상 이동은 선형 보간', () => {
	assert.equal(interpAxis(100, 110, 0.5, 30), 105);
	assert.equal(interpAxis(100, 130, 0.5, 30), 115);
});

test('interpAxis: 한 틱 이동폭이 maxDelta 초과면 텔레포트로 스냅(보간 안 함)', () => {
	assert.equal(interpAxis(100, 200, 0.5, 30), 200); // 라운드 리셋 등
	assert.equal(interpAxis(0, 400, 0.9, 30), 400);
});

test('interpAxis: 이동폭이 정확히 maxDelta면 경계 포함 — 보간', () => {
	assert.equal(interpAxis(100, 130, 0.5, 30), 115);
});

test('withInterpolatedPositions: draw 창 안에서만 좌표가 보간값으로 교체된다', () => {
	const target = { position: { x: 100, y: 50 }, previousPosition: { x: 90, y: 50 } };
	let seen;
	withInterpolatedPositions([target], 0.5, 30, () => {
		seen = { ...target.position };
	});
	assert.deepEqual(seen, { x: 95, y: 50 }); // 보간값
	assert.deepEqual(target.position, { x: 100, y: 50 }); // 시뮬 상태 불변(원복)
});

test('withInterpolatedPositions: draw가 던져도 좌표는 반드시 원복된다', () => {
	const target = { position: { x: 100, y: 50 }, previousPosition: { x: 0, y: 50 } };
	assert.throws(() =>
		withInterpolatedPositions([target], 0.5, 30, () => {
			throw new Error('draw failed');
		})
	);
	assert.deepEqual(target.position, { x: 100, y: 50 });
});

test('withInterpolatedPositions: previousPosition 없는 대상(스폰 직후)은 건너뛴다', () => {
	const spawned = { position: { x: 10, y: 10 } }; // previousPosition 없음
	let called = false;
	withInterpolatedPositions([spawned], 0.5, 30, () => {
		called = true;
		assert.deepEqual(spawned.position, { x: 10, y: 10 }); // 스왑 안 됨
	});
	assert.ok(called);
});

test('withInterpolatedPositions: 텔레포트(틱당 >maxDelta)는 현재 좌표로 그린다', () => {
	const target = { position: { x: 400, y: 50 }, previousPosition: { x: 100, y: 50 } };
	let seen;
	withInterpolatedPositions([target], 0.5, 30, () => {
		seen = target.position.x;
	});
	assert.equal(seen, 400);
});

test('timestepper: 60Hz 정밀 프레임 — 매 프레임 정확히 1틱, 잔여 0', () => {
	const s = createTimestepper();
	assert.equal(s.advance(DT), 1);
	assert.equal(s.pending, 0);
	assert.equal(s.advance(DT), 1);
});

test('timestepper: 서브프레임 누산 — 못 미치면 0틱, 쌓이면 1틱', () => {
	const s = createTimestepper({ fixedDt: DT });
	assert.equal(s.advance(10), 0);
	assert.ok(s.alpha > 0.59 && s.alpha < 0.61);
	assert.equal(s.advance(10), 1); // 누산 20 ≥ 16.67
	assert.ok(s.pending > 3.3 && s.pending < 3.4); // 20 - 16.67
});

test('timestepper: vsync 스냅 — 프레임 간격이 fixedDt 정수배 근처면 정확히 배수로', () => {
	// DT의 90%(60Hz 디스플레이의 rAF 노이즈 범위) → 1틱 스냅, alpha=0
	const a = createTimestepper();
	assert.equal(a.advance(DT * 0.9), 1);
	assert.equal(a.pending, 0);
	// 1.032×DT도 스냅
	const b = createTimestepper();
	assert.equal(b.advance(DT * 1.032), 1);
	assert.equal(b.pending, 0);
	// 허용오차 밖(예: 144Hz의 40ms)은 그대로 — 2틱 + 잔여
	const c = createTimestepper();
	assert.equal(c.advance(40), 2);
	assert.ok(c.alpha > 0.39 && c.alpha < 0.41);
});

test('timestepper: 스파이럴 방지 — 아무리 길어도 maxSteps(기본 5)틱 이하로 클램프', () => {
	// 주: fixedDt=1000/60의 부동소수점 표현 때문에 극단적 클램프(ceiling=maxSteps*dt)
	// 에서는 5*dt-4*dt 비교가 1ulp 미만으로 떨어져 4틱이 나을 수 있다. 방치(스파이럴
	// 방지 목적에는 등가) — 이 테스트는 '틱 수가 maxSteps를 넘지 않는다'를 고정한다.
	const s = createTimestepper();
	const steps = s.advance(10000);
	assert.ok(steps >= 4 && steps <= 5, `4..5 범위여야 함, 실제 ${steps}`);
	assert.ok(s.advance(10000) <= 5); // 밀린 시간은 계속 버림 — 폭주 없음
});

test('timestepper: maxSteps 커스텀', () => {
	const s = createTimestepper({ maxSteps: 2 });
	assert.equal(s.advance(1000), 2);
});

test('timestepper: 잔여 이월 — 남은 누산치가 다음 프레임 틱으로 이어진다', () => {
	const s = createTimestepper();
	assert.equal(s.advance(25), 1); // 잔여 ~8.33
	assert.equal(s.advance(9), 1); // 8.33 + 9 ≥ 16.67
});

test('timestepper: reset — 밀린 누산치를 버리고 재시작', () => {
	const s = createTimestepper();
	s.advance(30); // 1틱, 잔여 ~13.33
	s.reset();
	assert.equal(s.pending, 0);
	assert.equal(s.alpha, 0);
	assert.equal(s.advance(5), 0);
});
